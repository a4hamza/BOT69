/**
 * VIRUZ Anti-Delete Engine (Stealth Private Mode)
 * Caches incoming messages and silently forwards any revoked/deleted messages
 * directly to the bot owner's private inbox with 100% accurate phone numbers,
 * sender names, chat details, and the exact recovered content.
 */

const fs = require('fs');
const path = require('path');
const messageStore = require('./messageStore');
const { atlasBox } = require('./utils');
const safety = require('./safety');
const config = require('../config');

const STATE_FILE = path.join(__dirname, '../antidelete_state.json');

/**
 * Recursively unwrap ephemeral, view-once, document-caption, and edit wrappers
 */
function unwrapMessage(m) {
  if (!m) return null;
  let curr = m;
  while (
    curr.ephemeralMessage?.message ||
    curr.deviceSentMessage?.message ||
    curr.viewOnceMessage?.message ||
    curr.viewOnceMessageV2?.message ||
    curr.viewOnceMessageV2Extension?.message ||
    curr.documentWithCaptionMessage?.message ||
    curr.editedMessage?.message?.protocolMessage?.editedMessage ||
    curr.protocolMessage?.editedMessage
  ) {
    curr = curr.ephemeralMessage?.message ||
           curr.deviceSentMessage?.message ||
           curr.viewOnceMessage?.message ||
           curr.viewOnceMessageV2?.message ||
           curr.viewOnceMessageV2Extension?.message ||
           curr.documentWithCaptionMessage?.message ||
           curr.editedMessage?.message?.protocolMessage?.editedMessage ||
           curr.protocolMessage?.editedMessage;
  }
  return curr;
}

class AntiDeleteManager {
  constructor() {
    this.groupEnabled = true;   // Group anti-delete enabled by default
    this.privateEnabled = true; // Private DM anti-delete enabled by default

    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (typeof data.groupEnabled === 'boolean') {
          this.groupEnabled = data.groupEnabled;
        }
        if (typeof data.privateEnabled === 'boolean') {
          this.privateEnabled = data.privateEnabled;
        }
        if (typeof data.enabled === 'boolean') {
          if (typeof data.groupEnabled !== 'boolean') this.groupEnabled = data.enabled;
          if (typeof data.privateEnabled !== 'boolean') this.privateEnabled = data.enabled;
        }
      }
    } catch (e) {}

    // Deduplicate handled revokes within 60s
    this.handledRevokes = new Set();

    // In-memory mappings: LID user -> Phone Number
    this.lidMap = new Map();

    // In-memory group metadata cache (1 hour TTL)
    this.groupMetadataCache = new Map();

    // Ring-buffer to strictly cap cached media buffers in RAM (prevents HYEHOST OOM hangs)
    this.mediaCacheKeys = [];
    this.MAX_MEDIA_CACHE = 30;
  }

  saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        groupEnabled: this.groupEnabled,
        privateEnabled: this.privateEnabled
      }, null, 2));
    } catch (e) {}
  }

  isGroupEnabled() {
    return this.groupEnabled;
  }

  setGroupEnabled(val) {
    this.groupEnabled = !!val;
    this.saveState();
  }

  isPrivateEnabled() {
    return this.privateEnabled;
  }

  setPrivateEnabled(val) {
    this.privateEnabled = !!val;
    this.saveState();
  }

  isEnabled() {
    return this.groupEnabled || this.privateEnabled;
  }

  setEnabled(val) {
    this.groupEnabled = !!val;
    this.privateEnabled = !!val;
    this.saveState();
  }

  /**
   * Learn a mapping from LID to Phone Number and Name
   */
  recordLidMapping(lid, phoneJid, name) {
    if (!lid || !phoneJid) return;
    const cleanLid = lid.split('@')[0].split(':')[0];
    const cleanPhone = phoneJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

    if (cleanLid && cleanPhone && cleanPhone.length >= 7 && cleanPhone.length <= 15 && !cleanPhone.startsWith('120363')) {
      this.lidMap.set(cleanLid, { phone: cleanPhone, name: name || '' });
    }
  }

  /**
   * Ingest contacts batch from Baileys contacts events
   */
  learnContacts(contacts) {
    if (!contacts || !Array.isArray(contacts)) return;
    for (const c of contacts) {
      if (c.lid && (c.id || c.jid)) {
        this.recordLidMapping(c.lid, c.id || c.jid, c.name || c.notify);
      }
    }
  }

  /**
   * Cache group metadata and learn all participant LIDs
   */
  cacheGroupMetadata(groupId, metadata) {
    if (!groupId || !metadata) return;
    this.groupMetadataCache.set(groupId, { data: metadata, time: Date.now() });

    if (metadata.participants && Array.isArray(metadata.participants)) {
      for (const p of metadata.participants) {
        if (p.lid && p.id && p.id.endsWith('@s.whatsapp.net')) {
          this.recordLidMapping(p.lid, p.id, p.name || p.notify);
        }
        if (p.lid && p.jid && p.jid.endsWith('@s.whatsapp.net')) {
          this.recordLidMapping(p.lid, p.jid, p.name || p.notify);
        }
      }
    }
  }

  /**
   * Retrieve group metadata with memory caching
   */
  async getGroupMetadata(sock, groupId) {
    if (!sock?.groupMetadata || !groupId || !groupId.endsWith('@g.us')) return null;

    const cached = this.groupMetadataCache.get(groupId);
    if (cached && (Date.now() - cached.time < 3600000)) {
      return cached.data;
    }

    try {
      const meta = await sock.groupMetadata(groupId);
      if (meta) {
        this.cacheGroupMetadata(groupId, meta);
        return meta;
      }
    } catch (e) {
      if (cached) return cached.data;
    }
    return null;
  }

  /**
   * Resolve a WhatsApp JID or LID into an exact real phone number
   * Strictly guarantees that:
   * - Real phone numbers (phone@s.whatsapp.net) are extracted cleanly
   * - Anonymous LIDs (@lid) are cross-referenced to find the user's real phone
   * - Group JIDs (@g.us) are NEVER returned as phone numbers
   * - Unresolved LIDs are NEVER returned as phone numbers (returns 'Unknown')
   */
  resolvePhoneNumber(jid, isFromMe, groupMetadata, sock, key) {
    // 1. If it was sent or deleted by the bot / bot owner
    if (isFromMe) {
      if (sock?.user?.id) {
        return sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      }
      return safety.getOwnerJid().split('@')[0].replace(/[^0-9]/g, '');
    }

    // 2. Direct check on WAMessageKey for participantPn or senderPn
    if (key?.participantPn) {
      const pn = key.participantPn.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (pn && pn.length >= 7 && pn.length <= 15) return pn;
    }
    if (key?.senderPn) {
      const pn = key.senderPn.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (pn && pn.length >= 7 && pn.length <= 15) return pn;
    }

    if (!jid) return 'Unknown';

    // Group JIDs (@g.us) are NEVER phone numbers
    if (jid.endsWith('@g.us')) return 'Unknown';

    // 3. Direct phone JID: phone@s.whatsapp.net
    if (jid.endsWith('@s.whatsapp.net')) {
      const num = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (num && num.length >= 7 && num.length <= 15 && !num.startsWith('120363')) {
        return num;
      }
    }

    // 4. In-memory LID dictionary lookup
    const cleanUser = jid.split('@')[0].split(':')[0];
    if (this.lidMap.has(cleanUser)) {
      const mapped = this.lidMap.get(cleanUser);
      const num = (mapped.phone || mapped).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (num && num.length >= 7 && num.length <= 15) {
        return num;
      }
    }

    // 5. Cross-reference groupMetadata participants
    if (groupMetadata?.participants) {
      for (const p of groupMetadata.participants) {
        const pLid = (p.lid || '').split('@')[0].split(':')[0];
        const pId = (p.id || '').split('@')[0].split(':')[0];
        const pJid = (p.jid || '').split('@')[0].split(':')[0];

        if (pLid === cleanUser || pId === cleanUser || pJid === cleanUser) {
          const candidate = [p.jid, p.id].find(x => x && x.endsWith('@s.whatsapp.net'));
          if (candidate) {
            const num = candidate.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (num && num.length >= 7 && num.length <= 15) {
              this.recordLidMapping(cleanUser, num, p.name || p.notify);
              return num;
            }
          }
        }
      }
    }

    // 6. Strict guard: If jid is a LID, NEVER return its internal ID as a phone number!
    if (jid.endsWith('@lid')) {
      return 'Unknown';
    }

    // 7. General fallback only for standard international phone strings (7 to 15 digits)
    if (cleanUser.length >= 7 && cleanUser.length <= 15 && !cleanUser.startsWith('120363')) {
      return cleanUser;
    }

    return 'Unknown';
  }

  /**
   * Determine target inboxes:
   * Always sends directly to the bot owner's personal WhatsApp DM
   */
  getTargetInboxes(sock) {
    const inboxes = new Set();

    // 1. Connected bot user itself (Message Yourself chat)
    if (sock?.user?.id) {
      const botPhone = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      if (botPhone && botPhone.length >= 7 && botPhone.length <= 15) {
        inboxes.add(`${botPhone}@s.whatsapp.net`);
      }
    }

    // 2. Configured owner numbers (ensure bot owner's personal phone always receives)
    for (const num of config.ownerNumbers || []) {
      const clean = (num || '').replace(/[^0-9]/g, '');
      if (clean && clean.length >= 7 && clean.length <= 15) {
        inboxes.add(`${clean}@s.whatsapp.net`);
      }
    }

    const ownerJid = safety.getOwnerJid();
    if (ownerJid) {
      inboxes.add(ownerJid);
    }

    return Array.from(inboxes);
  }

  /**
   * Send message payload to all target owner inboxes
   */
  async sendToTargets(sock, messagePayload) {
    const targets = this.getTargetInboxes(sock);
    for (const target of targets) {
      try {
        const res = await sock.sendMessage(target, messagePayload);
        if (res?.key?.id) {
          messageStore.set(res.key.id, res);
          messageStore.set(`${target}_${res.key.id}`, res);
        }
      } catch (err) {
        console.error(`[AntiDelete] Failed to deliver to ${target}:`, err.message);
      }
    }
  }

  /**
   * Pre-cache lightweight media buffer asynchronously in RAM as soon as message arrives.
   * Strictly caps memory to avoid HYEHOST server hangs or OOM crashes.
   */
  async precacheMedia(msgId, content) {
    try {
      let type = null;
      let mediaMsg = null;

      // Precache lightweight media types (Photos, Short Videos, Stickers, Voice Notes)
      if (content.imageMessage) {
        type = 'image';
        mediaMsg = content.imageMessage;
      } else if (content.videoMessage) {
        type = 'video';
        mediaMsg = content.videoMessage;
      } else if (content.audioMessage) {
        type = 'audio';
        mediaMsg = content.audioMessage;
      } else if (content.stickerMessage) {
        type = 'sticker';
        mediaMsg = content.stickerMessage;
      }

      if (!type || !mediaMsg) return;

      // Skip files exceeding 3.5MB to protect HYEHOST RAM
      const fileLength = Number(mediaMsg.fileLength || 0);
      if (fileLength > 3.5 * 1024 * 1024) return;

      const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
      const stream = await downloadContentFromMessage(mediaMsg, type);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > 3.5 * 1024 * 1024) break;
      }

      const cached = messageStore.get(msgId);
      if (cached && buffer.length > 0) {
        cached._mediaBuffer = buffer;
        cached._mediaType = type;

        // Maintain strict FIFO buffer cap (max 30 media buffers in memory)
        this.mediaCacheKeys.push(msgId);
        if (this.mediaCacheKeys.length > this.MAX_MEDIA_CACHE) {
          const oldestId = this.mediaCacheKeys.shift();
          const oldMsg = messageStore.get(oldestId);
          if (oldMsg) {
            delete oldMsg._mediaBuffer;
            delete oldMsg._mediaType;
          }
        }
      }
    } catch (e) {
      // Non-blocking pre-cache catch
    }
  }

  /**
   * Store incoming message in memory for recovery
   */
  storeMessage(msg) {
    if (!msg || !msg.key || !msg.key.id || !msg.message) return;

    const unwrapped = unwrapMessage(msg.message);
    const protoMsg = msg.message.protocolMessage ||
      unwrapped?.protocolMessage ||
      msg.message.ephemeralMessage?.message?.protocolMessage;
    if (protoMsg) return; // Don't store revoke packets as regular messages

    messageStore.set(msg.key.id, msg);

    // Learn participant phone mapping from WAMessageKey if present
    if (msg.key.participant && (msg.key.participantPn || msg.key.senderPn)) {
      this.recordLidMapping(msg.key.participant, msg.key.participantPn || msg.key.senderPn, msg.pushName);
    }

    // Pre-cache lightweight media content in memory immediately while CDN link is alive
    if (
      unwrapped?.imageMessage ||
      unwrapped?.videoMessage ||
      unwrapped?.audioMessage ||
      unwrapped?.stickerMessage
    ) {
      this.precacheMedia(msg.key.id, unwrapped).catch(() => {});
    }
  }

  /**
   * Handle when a message is revoked / deleted from messages.upsert
   */
  async handleRevoke(sock, msg) {
    if (!this.isEnabled() || !sock) return;

    const unwrapped = unwrapMessage(msg.message);
    const protocolMsg = msg.message?.protocolMessage ||
      unwrapped?.protocolMessage ||
      msg.message?.ephemeralMessage?.message?.protocolMessage;
    if (!protocolMsg) return;

    const isRevoke = protocolMsg.type === 0 ||
      protocolMsg.type === '0' ||
      protocolMsg.type === 'REVOKE' ||
      protocolMsg.type === 5 ||
      (!protocolMsg.type && protocolMsg.key?.id && !protocolMsg.editedMessage && !protocolMsg.ephemeralExpiration);
    if (!isRevoke) return;

    const revokedId = protocolMsg.key?.id;
    if (!revokedId) return;

    const remoteJid = msg.key.remoteJid || protocolMsg.key?.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    if (isGroup && !this.isGroupEnabled()) return;
    if (!isGroup && !this.isPrivateEnabled()) return;

    const deleterJid = msg.key.participant || protocolMsg.key?.participant || msg.key.remoteJid;

    await this.recoverAndForward(sock, { revokedId, remoteJid, deleterJid, msg, protocolMsg });
  }

  /**
   * Handle when a message is revoked / deleted from messages.update
   */
  async handleRevokeUpdate(sock, update) {
    if (!this.isEnabled() || !sock) return;

    const revokedId = update.key?.id;
    if (!revokedId) return;

    const remoteJid = update.key.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    if (isGroup && !this.isGroupEnabled()) return;
    if (!isGroup && !this.isPrivateEnabled()) return;

    const deleterJid = update.update?.key?.participant || update.key.participant || remoteJid;

    await this.recoverAndForward(sock, { revokedId, remoteJid, deleterJid, update });
  }

  /**
   * Handle automatic silent capture of View-Once messages and deliver to owner's private inbox
   */
  async handleAutoViewOnce(sock, msg) {
    if (!sock || !msg || !msg.message) return;
    if (msg.key?.fromMe) return; // Don't capture our own sent messages

    const msgId = msg.key?.id;
    if (!msgId) return;

    if (!this.handledViewOnce) {
      this.handledViewOnce = new Set();
    }
    if (this.handledViewOnce.has(msgId)) return;

    // Check if the message contains view-once content
    const rawMsg = msg.message;
    const viewOnceWrapper = rawMsg.viewOnceMessage ||
      rawMsg.viewOnceMessageV2 ||
      rawMsg.viewOnceMessageV2Extension ||
      rawMsg.ephemeralMessage?.message?.viewOnceMessage ||
      rawMsg.ephemeralMessage?.message?.viewOnceMessageV2 ||
      rawMsg.ephemeralMessage?.message?.viewOnceMessageV2Extension;

    const inner = viewOnceWrapper?.message || rawMsg;
    const imageMsg = inner.imageMessage?.viewOnce ? inner.imageMessage : (viewOnceWrapper?.message?.imageMessage || null);
    const videoMsg = inner.videoMessage?.viewOnce ? inner.videoMessage : (viewOnceWrapper?.message?.videoMessage || null);
    const audioMsg = inner.audioMessage?.viewOnce ? inner.audioMessage : (viewOnceWrapper?.message?.audioMessage || null);

    if (!imageMsg && !videoMsg && !audioMsg) return;

    this.handledViewOnce.add(msgId);
    setTimeout(() => this.handledViewOnce.delete(msgId), 60000);

    const from = msg.key.remoteJid || '';
    const isGroup = from.endsWith('@g.us');
    let chatTitle = isGroup ? 'Group Chat' : 'Direct Message (DM)';
    let groupMetadata = null;

    if (isGroup) {
      groupMetadata = await this.getGroupMetadata(sock, from);
      if (groupMetadata?.subject) chatTitle = groupMetadata.subject;
    }

    const rawSenderJid = msg.key.participant || from;
    const senderPhone = this.resolvePhoneNumber(rawSenderJid, false, groupMetadata, sock, msg.key);
    const senderName = msg.pushName || '';
    const senderDisplay = senderPhone !== 'Unknown' 
      ? (senderName ? `${senderName} (+${senderPhone})` : `+${senderPhone}`)
      : (senderName || 'User');

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    console.log(`[ViewOnce] 🔓 Silently auto-capturing view-once media from ${senderDisplay} in "${chatTitle}"...`);

    try {
      const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');

      if (imageMsg) {
        let buffer = msg._mediaBuffer;
        if (!buffer) {
          const stream = await downloadContentFromMessage(imageMsg, 'image');
          buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        }

        const caption = imageMsg.caption || '';
        const body = `👥 *Chat:* ${chatTitle}\n👤 *Sender:* ${senderDisplay}\n🕒 *Time:* ${timeStr}\n📸 *Type:* View-Once Photo${caption ? `\n💬 *Caption:* ${caption}` : ''}\n\n🔒 _Delivered silently to your private inbox._`;
        const output = atlasBox('🔓 AUTO VIEW-ONCE CAPTURED', body, 'BOT 69 • STEALTH MEDIA');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, {
            image: buffer,
            caption: output
          });
        }
        return;
      }

      if (videoMsg) {
        let buffer = msg._mediaBuffer;
        if (!buffer) {
          const stream = await downloadContentFromMessage(videoMsg, 'video');
          buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        }

        const caption = videoMsg.caption || '';
        const body = `👥 *Chat:* ${chatTitle}\n👤 *Sender:* ${senderDisplay}\n🕒 *Time:* ${timeStr}\n🎬 *Type:* View-Once Video${caption ? `\n💬 *Caption:* ${caption}` : ''}\n\n🔒 _Delivered silently to your private inbox._`;
        const output = atlasBox('🔓 AUTO VIEW-ONCE CAPTURED', body, 'BOT 69 • STEALTH MEDIA');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, {
            video: buffer,
            caption: output
          });
        }
        return;
      }

      if (audioMsg) {
        let buffer = msg._mediaBuffer;
        if (!buffer) {
          const stream = await downloadContentFromMessage(audioMsg, 'audio');
          buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        }

        const body = `👥 *Chat:* ${chatTitle}\n👤 *Sender:* ${senderDisplay}\n🕒 *Time:* ${timeStr}\n🎤 *Type:* View-Once Voice Note\n\n🔒 _Delivered silently to your private inbox._`;
        const output = atlasBox('🔓 AUTO VIEW-ONCE CAPTURED', body, 'BOT 69 • STEALTH MEDIA');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, { text: output });
          await this.sendToTargets(sock, {
            audio: buffer,
            mimetype: audioMsg.mimetype || 'audio/mp4',
            ptt: true
          });
        }
        return;
      }
    } catch (err) {
      console.error('[ViewOnce] Error recovering view-once media:', err.message);
    }
  }

  /**
   * Core recovery & forward engine:
   * Retrieves original message from messageStore and forwards to owner DM with full fidelity.
   */
  async recoverAndForward(sock, { revokedId, remoteJid, deleterJid, msg, update, protocolMsg }) {
    if (!this.isEnabled() || !sock || !revokedId) return;

    // Deduplicate: prevent double forwarding
    if (this.handledRevokes.has(revokedId)) return;
    this.handledRevokes.add(revokedId);
    setTimeout(() => this.handledRevokes.delete(revokedId), 60000);

    // Look up original message
    let originalMsg = messageStore.get({ id: revokedId, remoteJid }) || messageStore.get(revokedId);
    if (!originalMsg) {
      // Microsecond race condition fallback: wait 500ms and retry
      await new Promise(r => setTimeout(r, 500));
      originalMsg = messageStore.get({ id: revokedId, remoteJid }) || messageStore.get(revokedId);
    }
    if (!originalMsg) {
      console.log(`[AntiDelete] Message ${revokedId} not found in cache (may have been sent before bot started).`);
      return;
    }

    const from = originalMsg.key?.remoteJid || remoteJid;
    const isGroup = from.endsWith('@g.us');

    // Separate group vs private chat toggle
    if (isGroup && !this.isGroupEnabled()) {
      return;
    }
    if (!isGroup && !this.isPrivateEnabled()) {
      return;
    }
    let chatTitle = isGroup ? 'Group Chat' : 'Direct Message (DM)';
    let groupMetadata = null;

    if (isGroup) {
      groupMetadata = await this.getGroupMetadata(sock, from);
      if (groupMetadata?.subject) chatTitle = groupMetadata.subject;
    }

    // ── Accurate Phone Number & Name Resolution ──
    const isFromMe = msg?.key?.fromMe || update?.key?.fromMe || false;
    const rawDeleterJid = msg?.key?.participant || deleterJid || originalMsg.key?.participant || from;
    const deleterPhone = this.resolvePhoneNumber(rawDeleterJid, isFromMe, groupMetadata, sock, msg?.key || update?.key);
    const deleterName = msg?.pushName || (isFromMe ? 'You' : '');

    const rawSenderJid = originalMsg.key?.participant || originalMsg.participant || rawDeleterJid;
    const originalSenderPhone = this.resolvePhoneNumber(rawSenderJid, originalMsg.key?.fromMe || false, groupMetadata, sock, originalMsg.key);
    const originalSenderName = originalMsg.pushName || '';

    const isDifferentPerson = originalSenderPhone !== 'Unknown' && deleterPhone !== 'Unknown' && originalSenderPhone !== deleterPhone;
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Format Person Header Cleanly
    let personHeader = '';
    if (deleterPhone !== 'Unknown' && deleterName) {
      personHeader = `👤 *Deleted By:* ${deleterName}\n📱 *Phone Number:* +${deleterPhone}`;
    } else if (deleterPhone !== 'Unknown') {
      personHeader = `👤 *Deleted By:* +${deleterPhone}\n📱 *Phone Number:* +${deleterPhone}`;
    } else if (deleterName) {
      personHeader = `👤 *Deleted By:* ${deleterName}`;
    } else {
      personHeader = `👤 *Deleted By:* Group Member`;
    }

    if (isDifferentPerson) {
      const senderText = originalSenderName
        ? `${originalSenderName} (+${originalSenderPhone})`
        : `+${originalSenderPhone}`;
      personHeader += `\n✍️ *Original Sender:* ${senderText}`;
    }

    const content = unwrapMessage(originalMsg.message);
    if (!content) return;

    console.log(`[AntiDelete] 🗑️ Silently recovering message deleted by ${deleterPhone} in "${chatTitle}"...`);

    // ── 1. Text-Only Message ──
    const hasMedia = !!(content.imageMessage || content.videoMessage || content.audioMessage || content.stickerMessage || content.documentMessage);
    const text = content.conversation ||
      content.extendedTextMessage?.text ||
      content.protocolMessage?.editedMessage?.conversation ||
      content.protocolMessage?.editedMessage?.extendedTextMessage?.text;

    if (text && !hasMedia) {
      const body = `
👥 *Chat:* ${chatTitle}
${personHeader}
🕒 *Time Deleted:* ${timeStr}
📝 *Type:* Text Message

💬 *Deleted Message:*
${text}
`.trim();

      const output = atlasBox('🗑️ ANTI-DELETE RECOVERED', body, 'VIRUZ • PRIVATE INBOX');
      await this.sendToTargets(sock, {
        text: output,
        mentions: rawDeleterJid && !rawDeleterJid.endsWith('@lid') ? [rawDeleterJid] : []
      });
      return;
    }

    // ── 2. Media Message (Image, Video, Audio, Sticker, Document) ──
    try {
      const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');

      // Photo / Image
      if (content.imageMessage) {
        let buffer = originalMsg._mediaBuffer;
        if (!buffer) {
          try {
            const stream = await downloadContentFromMessage(content.imageMessage, 'image');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          } catch (e) {
            if (content.imageMessage.jpegThumbnail) {
              buffer = Buffer.from(content.imageMessage.jpegThumbnail);
            }
          }
        }

        const captionText = content.imageMessage.caption || '';
        const body = `👥 *Chat:* ${chatTitle}\n${personHeader}\n🕒 *Time Deleted:* ${timeStr}\n🖼️ *Type:* Photo / Image${captionText ? `\n📸 *Caption:* ${captionText}` : ''}`;
        const output = atlasBox('🗑️ ANTI-DELETE RECOVERED PHOTO', body, 'VIRUZ • PRIVATE INBOX');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, {
            image: buffer,
            caption: output,
            mentions: rawDeleterJid && !rawDeleterJid.endsWith('@lid') ? [rawDeleterJid] : []
          });
          return;
        }
      }

      // Video Message
      if (content.videoMessage) {
        let buffer = originalMsg._mediaBuffer;
        if (!buffer) {
          try {
            const stream = await downloadContentFromMessage(content.videoMessage, 'video');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          } catch (e) {
            if (content.videoMessage.jpegThumbnail) {
              buffer = Buffer.from(content.videoMessage.jpegThumbnail);
            }
          }
        }

        const captionText = content.videoMessage.caption || '';
        const body = `👥 *Chat:* ${chatTitle}\n${personHeader}\n🕒 *Time Deleted:* ${timeStr}\n🎬 *Type:* Video${captionText ? `\n🎥 *Caption:* ${captionText}` : ''}`;
        const output = atlasBox('🗑️ ANTI-DELETE RECOVERED VIDEO', body, 'VIRUZ • PRIVATE INBOX');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, {
            video: buffer,
            caption: output,
            mentions: rawDeleterJid && !rawDeleterJid.endsWith('@lid') ? [rawDeleterJid] : []
          });
          return;
        }
      }

      // Audio / Voice Note Message
      if (content.audioMessage) {
        let buffer = originalMsg._mediaBuffer;
        if (!buffer) {
          try {
            const stream = await downloadContentFromMessage(content.audioMessage, 'audio');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          } catch (e) {}
        }

        const body = `👥 *Chat:* ${chatTitle}\n${personHeader}\n🕒 *Time Deleted:* ${timeStr}\n🎤 *Type:* Voice Note / Audio`;
        const output = atlasBox('🗑️ ANTI-DELETE RECOVERED AUDIO', body, 'VIRUZ • PRIVATE INBOX');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, { text: output });
          await this.sendToTargets(sock, {
            audio: buffer,
            mimetype: content.audioMessage.mimetype || 'audio/mp4',
            ptt: true
          });
          return;
        }
      }

      // Sticker Message
      if (content.stickerMessage) {
        let buffer = originalMsg._mediaBuffer;
        if (!buffer) {
          try {
            const stream = await downloadContentFromMessage(content.stickerMessage, 'sticker');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          } catch (e) {}
        }

        const body = `👥 *Chat:* ${chatTitle}\n${personHeader}\n🕒 *Time Deleted:* ${timeStr}\n🎨 *Type:* Sticker`;
        const output = atlasBox('🗑️ ANTI-DELETE RECOVERED STICKER', body, 'VIRUZ • PRIVATE INBOX');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, { text: output });
          await this.sendToTargets(sock, { sticker: buffer });
          return;
        }
      }

      // Document / File Message
      if (content.documentMessage) {
        let buffer = originalMsg._mediaBuffer;
        if (!buffer) {
          try {
            const stream = await downloadContentFromMessage(content.documentMessage, 'document');
            buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          } catch (e) {}
        }

        const fileName = content.documentMessage.fileName || 'document';
        const body = `👥 *Chat:* ${chatTitle}\n${personHeader}\n🕒 *Time Deleted:* ${timeStr}\n📄 *Type:* Document / File (${fileName})`;
        const output = atlasBox('🗑️ ANTI-DELETE RECOVERED FILE', body, 'VIRUZ • PRIVATE INBOX');

        if (buffer && buffer.length > 0) {
          await this.sendToTargets(sock, {
            document: buffer,
            fileName,
            mimetype: content.documentMessage.mimetype,
            caption: output
          });
          return;
        }
      }
    } catch (err) {
      console.error('[AntiDelete] Error recovering media:', err.message);
    }

    // ── 3. Other Message Types (Contacts, Locations, Polls, Fallback) ──
    let itemType = 'Message';
    let extraDetail = '';

    if (content.contactMessage) {
      itemType = 'Contact Card';
      extraDetail = `👤 *Contact Name:* ${content.contactMessage.displayName || 'Unknown'}`;
    } else if (content.locationMessage) {
      itemType = 'Location Pin';
      extraDetail = `📍 *Location:* ${content.locationMessage.name || content.locationMessage.address || `${content.locationMessage.degreesLatitude}, ${content.locationMessage.degreesLongitude}`}`;
    } else if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) {
      const poll = content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3;
      itemType = 'Poll';
      extraDetail = `📊 *Poll Question:* ${poll.name}\n📋 *Options:* ${(poll.options || []).map(o => o.optionName).join(', ')}`;
    } else if (content.imageMessage) {
      itemType = 'Photo / Image';
      if (content.imageMessage.caption) extraDetail = `📸 *Caption:* ${content.imageMessage.caption}`;
    } else if (content.videoMessage) {
      itemType = 'Video';
      if (content.videoMessage.caption) extraDetail = `🎥 *Caption:* ${content.videoMessage.caption}`;
    } else if (content.audioMessage) {
      itemType = 'Voice Note / Audio';
    } else if (content.stickerMessage) {
      itemType = 'Sticker';
    } else if (content.documentMessage) {
      itemType = `Document (${content.documentMessage.fileName || 'file'})`;
    }

    const fallbackBody = `
👥 *Chat:* ${chatTitle}
${personHeader}
🕒 *Time Deleted:* ${timeStr}
📎 *Deleted Item:* ${itemType}
${extraDetail ? `\n${extraDetail}` : ''}
`.trim();

    const output = atlasBox('🗑️ ANTI-DELETE RECOVERED', fallbackBody, 'VIRUZ • PRIVATE INBOX');
    await this.sendToTargets(sock, {
      text: output,
      mentions: rawDeleterJid && !rawDeleterJid.endsWith('@lid') ? [rawDeleterJid] : []
    });
  }
}

const managerInstance = new AntiDeleteManager();
managerInstance.resolvePhoneNumber = managerInstance.resolvePhoneNumber.bind(managerInstance);
module.exports = managerInstance;
module.exports.unwrapMessage = unwrapMessage;
module.exports.AntiDeleteManager = AntiDeleteManager;
