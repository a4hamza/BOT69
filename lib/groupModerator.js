/**
 * Atlas-MD Group Chat Moderator
 * Features:
 * - Sticker spam: 3rd sticker = Warning, 4th sticker = Auto-kick
 * - Message spam: 4th repeat = Warning, 5th repeat = Auto-kick
 * - Admin Immunity: Admins are NEVER warned or kicked for spam
 * - Admin Protection: No one can kick admins
 * - Admin exclusive commands (.kick, .add)
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const safety = require('./safety');
const welcomeHandler = require('./welcomeHandler');

const SETTINGS_FILE = path.join(__dirname, '../group_settings.json');

class GroupModerator {
  constructor() {
    // Trackers: Map<key, state>
    // key = `${groupId}:${senderJid}`
    this.stickerTracker = new Map();
    this.messageTracker = new Map();
    this.warnTracker = new Map();
    this.maxWarnings = 6;

    // Group toggle states
    this.botDisabledGroups = new Set();
    this.ttsDisabledGroups = new Set();
    this.loadGroupSettings();

    // Auto-clean stale spam trackers every 15 minutes to guarantee zero memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.stickerTracker.entries()) {
        if (now - (v.lastTime || 0) > 1800000) this.stickerTracker.delete(k);
      }
      for (const [k, v] of this.messageTracker.entries()) {
        if (now - (v.lastTime || 0) > 1800000) this.messageTracker.delete(k);
      }
    }, 900000).unref();
  }

  /**
   * Load persisted group toggle settings
   */
  loadGroupSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        if (Array.isArray(data.botDisabledGroups)) {
          this.botDisabledGroups = new Set(data.botDisabledGroups);
        }
        if (Array.isArray(data.ttsDisabledGroups)) {
          this.ttsDisabledGroups = new Set(data.ttsDisabledGroups);
        }
      }
    } catch (e) {}
  }

  /**
   * Save group toggle settings to disk
   */
  saveGroupSettings() {
    try {
      const data = {
        botDisabledGroups: Array.from(this.botDisabledGroups),
        ttsDisabledGroups: Array.from(this.ttsDisabledGroups)
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }

  /**
   * Check if bot is enabled in a specific group
   */
  isBotEnabledInGroup(groupId) {
    if (!groupId) return true;
    return !this.botDisabledGroups.has(groupId);
  }

  /**
   * Enable or disable bot in a specific group
   */
  setBotEnabledInGroup(groupId, enabled) {
    if (!groupId) return;
    if (enabled) {
      this.botDisabledGroups.delete(groupId);
    } else {
      this.botDisabledGroups.add(groupId);
    }
    this.saveGroupSettings();
  }

  /**
   * Check if TTS is enabled in a specific group
   */
  isTtsEnabled(groupId) {
    if (!groupId) return true;
    return !this.ttsDisabledGroups.has(groupId);
  }

  /**
   * Enable or disable TTS in a specific group
   */
  setTtsEnabled(groupId, enabled) {
    if (!groupId) return;
    if (enabled) {
      this.ttsDisabledGroups.delete(groupId);
    } else {
      this.ttsDisabledGroups.add(groupId);
    }
    this.saveGroupSettings();
  }

  /**
   * Helper to normalize JID
   */
  cleanJid(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0] + '@s.whatsapp.net';
  }

  /**
   * Check if a JID is a group admin or bot owner
   * @param {string} jid
   * @param {object} groupMetadata
   * @param {object|boolean} [msgOrFromMe]
   * @returns {boolean}
   */
  isGroupAdmin(jid, groupMetadata, msgOrFromMe) {
    // Direct fromMe check (bot account / linked devices)
    if (msgOrFromMe === true || msgOrFromMe?.key?.fromMe === true) {
      return true;
    }

    // Collect all candidate identifiers for this sender
    const candidateJids = new Set();
    if (jid) candidateJids.add(String(jid));
    if (msgOrFromMe?.key?.participant) candidateJids.add(String(msgOrFromMe.key.participant));
    if (msgOrFromMe?.participant) candidateJids.add(String(msgOrFromMe.participant));

    if (candidateJids.size === 0) return false;

    // Check bot owner permissions via safety manager or config
    for (const cand of candidateJids) {
      if (safety.isOwner(cand)) return true;
      const clean = this.cleanJid(cand);
      const digits = cand.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (config.ownerNumbers && config.ownerNumbers.some(num => {
        const cleanOwner = num.replace(/[^0-9]/g, '');
        return digits === cleanOwner || (clean && clean.includes(cleanOwner));
      })) {
        return true;
      }
    }

    // Collect all digits and resolve any LIDs
    const senderDigitsSet = new Set();
    for (const cand of candidateJids) {
      const digits = cand.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (digits) {
        senderDigitsSet.add(digits);
        // Attempt LID-to-phone mapping
        try {
          if (welcomeHandler.globalLidMap && welcomeHandler.globalLidMap.has(digits)) {
            senderDigitsSet.add(welcomeHandler.globalLidMap.get(digits));
          }
        } catch (e) {}
        try {
          const antiDelete = require('./antiDelete');
          if (antiDelete.lidMap && antiDelete.lidMap.has(digits)) {
            senderDigitsSet.add(antiDelete.lidMap.get(digits));
          }
        } catch (e) {}
      }
    }

    // Check owner with any resolved digits
    if (config.ownerNumbers) {
      for (const d of senderDigitsSet) {
        if (config.ownerNumbers.some(num => num.replace(/[^0-9]/g, '') === d)) {
          return true;
        }
      }
    }

    // If metadata is missing after owner check, cannot verify group participants
    if (!groupMetadata || !Array.isArray(groupMetadata.participants)) return false;

    // Check if user is the group creator / owner
    const creatorJid = groupMetadata.owner || groupMetadata.ownerJid || groupMetadata.subjectOwner || groupMetadata.creation_owner;
    if (creatorJid) {
      const creatorDigits = creatorJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (creatorDigits && senderDigitsSet.has(creatorDigits)) {
        return true;
      }
    }

    // Filter all admin participants in the group
    const adminParticipants = groupMetadata.participants.filter(p => {
      if (!p) return false;
      const adminVal = String(p.admin || p.role || '').toLowerCase();
      return (
        adminVal === 'admin' ||
        adminVal === 'superadmin' ||
        p.admin === true ||
        p.isAdmin === true ||
        p.isSuperAdmin === true ||
        p.is_admin === true
      );
    });

    for (const p of adminParticipants) {
      const pIdDigits = (p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      const pJidDigits = p.jid ? p.jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
      const pPhoneDigits = (p.phoneNumber || p.pn) ? String(p.phoneNumber || p.pn).replace(/[^0-9]/g, '') : '';
      const pLidDigits = p.lid ? p.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';

      const pDigits = [pIdDigits, pJidDigits, pPhoneDigits, pLidDigits].filter(Boolean);

      // Check direct digits match
      for (const pd of pDigits) {
        if (senderDigitsSet.has(pd)) return true;
        // Check reverse LID lookup for participant
        try {
          if (welcomeHandler.globalLidMap && welcomeHandler.globalLidMap.has(pd)) {
            if (senderDigitsSet.has(welcomeHandler.globalLidMap.get(pd))) return true;
          }
        } catch (e) {}
        try {
          const antiDelete = require('./antiDelete');
          if (antiDelete.lidMap && antiDelete.lidMap.has(pd)) {
            if (senderDigitsSet.has(antiDelete.lidMap.get(pd))) return true;
          }
        } catch (e) {}
      }
    }

    return false;
  }

  /**
   * Check if the bot itself is an admin in the group
   * @param {object} sock
   * @param {object} groupMetadata
   * @returns {boolean}
   */
  isBotAdmin(sock, groupMetadata) {
    if (!sock || !groupMetadata || !Array.isArray(groupMetadata.participants)) return false;
    const botCandidateDigits = new Set();

    const botId = sock.user?.id || '';
    if (botId) {
      const d = botId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (d) botCandidateDigits.add(d);
    }
    const botLid = sock.user?.lid || sock.authState?.creds?.me?.lid || '';
    if (botLid) {
      const d = botLid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      if (d) botCandidateDigits.add(d);
    }

    // Reverse lookup for bot's LID
    for (const d of Array.from(botCandidateDigits)) {
      try {
        if (welcomeHandler.globalLidMap && welcomeHandler.globalLidMap.has(d)) {
          botCandidateDigits.add(welcomeHandler.globalLidMap.get(d));
        }
      } catch (e) {}
      try {
        const antiDelete = require('./antiDelete');
        if (antiDelete.lidMap && antiDelete.lidMap.has(d)) {
          botCandidateDigits.add(antiDelete.lidMap.get(d));
        }
      } catch (e) {}
    }

    return groupMetadata.participants.some(p => {
      if (!p) return false;
      const adminVal = String(p.admin || p.role || '').toLowerCase();
      const isAdmin = (
        adminVal === 'admin' ||
        adminVal === 'superadmin' ||
        p.admin === true ||
        p.isAdmin === true ||
        p.isSuperAdmin === true ||
        p.is_admin === true
      );
      if (!isAdmin) return false;

      const pIdDigits = (p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      const pJidDigits = p.jid ? p.jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
      const pLidDigits = p.lid ? p.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
      const pPhoneDigits = (p.phoneNumber || p.pn) ? String(p.phoneNumber || p.pn).replace(/[^0-9]/g, '') : '';

      return [pIdDigits, pJidDigits, pLidDigits, pPhoneDigits].some(d => d && botCandidateDigits.has(d));
    });
  }

  /**
   * Resolve target user JID from message context (quoted, mentioned, or args)
   * Handles LIDs, phone numbers, and various message types.
   * @param {object} msg
   * @param {string[]} args
   * @param {object} [groupMetadata]
   * @returns {{ targetJid: string|null, isQuoted: boolean, isMentioned: boolean, rawTarget: string|null }}
   */
  resolveTarget(msg, args = [], groupMetadata = null) {
    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo ||
      msg?.message?.imageMessage?.contextInfo ||
      msg?.message?.videoMessage?.contextInfo ||
      msg?.message?.stickerMessage?.contextInfo ||
      msg?.message?.documentMessage?.contextInfo ||
      msg?.message?.audioMessage?.contextInfo ||
      msg?.message?.contactMessage?.contextInfo;

    const quoted = contextInfo?.participant;
    const mentioned = contextInfo?.mentionedJid?.[0];
    let rawTarget = null;
    let isQuoted = false;
    let isMentioned = false;

    if (quoted) {
      rawTarget = quoted;
      isQuoted = true;
    } else if (mentioned) {
      rawTarget = mentioned;
      isMentioned = true;
    } else if (args && args.length > 0) {
      const clean = args[0].replace(/[^0-9]/g, '');
      if (clean.length >= 7) {
        rawTarget = `${clean}@s.whatsapp.net`;
      } else if (groupMetadata?.participants && Array.isArray(groupMetadata.participants)) {
        // Search by username or display name
        const searchTerm = args.join(' ').replace(/^@/, '').trim().toLowerCase();
        if (searchTerm.length >= 2) {
          const match = groupMetadata.participants.find(p => {
            const name = (p.name || p.notify || '').toLowerCase();
            return name && (name === searchTerm || name.includes(searchTerm));
          });
          if (match) {
            rawTarget = match.id || match.jid;
          }
        }
      }
    }

    if (!rawTarget) {
      return { targetJid: null, isQuoted: false, isMentioned: false, rawTarget: null };
    }

    let targetJid = rawTarget;

    // Resolve LID if target is an LID
    if (rawTarget.endsWith('@lid')) {
      const rawDigits = rawTarget.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
      let resolvedPhone = null;

      try {
        if (welcomeHandler.globalLidMap && welcomeHandler.globalLidMap.has(rawDigits)) {
          resolvedPhone = welcomeHandler.globalLidMap.get(rawDigits);
        }
      } catch (e) {}

      if (!resolvedPhone) {
        try {
          const antiDelete = require('./antiDelete');
          if (antiDelete.lidMap && antiDelete.lidMap.has(rawDigits)) {
            resolvedPhone = antiDelete.lidMap.get(rawDigits);
          }
        } catch (e) {}
      }

      if (!resolvedPhone && groupMetadata?.participants) {
        const p = groupMetadata.participants.find(part => {
          if (!part) return false;
          const pLid = part.lid ? part.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
          const pId = part.id ? part.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
          return pLid === rawDigits || pId === rawDigits;
        });
        if (p && p.id && !p.id.endsWith('@lid')) {
          resolvedPhone = p.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        } else if (p && (p.phoneNumber || p.pn)) {
          resolvedPhone = String(p.phoneNumber || p.pn).replace(/[^0-9]/g, '');
        }
      }

      if (resolvedPhone) {
        targetJid = `${resolvedPhone}@s.whatsapp.net`;
      }
    }

    return { targetJid, isQuoted, isMentioned, rawTarget };
  }

  /**
   * Handle incoming sticker in a group
   * Rule: 4th sticker spam = Warning, 5th = Auto-kick
   */
  async handleStickerSpam(sock, groupId, senderJid, groupMetadata) {
    if (!config.antiSpam.enabled) return;

    // RULE: Admin Immunity - Don't kick admin for spam
    if (this.isGroupAdmin(senderJid, groupMetadata)) {
      return;
    }

    const key = `${groupId}:${this.cleanJid(senderJid)}`;
    const now = Date.now();
    const tracker = this.stickerTracker.get(key) || { count: 0, lastTime: 0 };

    if (now - tracker.lastTime <= config.antiSpam.stickerTimeWindowMs) {
      tracker.count += 1;
    } else {
      tracker.count = 1;
    }
    tracker.lastTime = now;
    this.stickerTracker.set(key, tracker);

    // Resolve accurate international phone number (never raw LID digits)
    let senderPhone = null;
    try {
      senderPhone = welcomeHandler.resolvePhoneNumber(senderJid, groupMetadata, groupId);
    } catch (e) {}
    if (!senderPhone || senderPhone === 'Unknown') {
      try {
        const antiDelete = require('./antiDelete');
        senderPhone = antiDelete.resolvePhoneNumber(senderJid, false, groupMetadata, sock);
      } catch (e) {}
    }
    if (!senderPhone || senderPhone === 'Unknown' || senderPhone.endsWith('lid')) {
      senderPhone = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    }

    const senderTag = `@${senderPhone}`;
    const mentionJid = senderJid.endsWith('@s.whatsapp.net') ? senderJid : `${senderPhone}@s.whatsapp.net`;

    // 5th sticker: WARNING
    if (tracker.count === config.antiSpam.stickerWarningThreshold) {
      const warningText = `⚠️ *[STICKER SPAM WARNING]*\n\nHey ${senderTag} (+${senderPhone}), you have sent ${tracker.count} stickers rapidly!\n🛑 *Warning (${tracker.count}/${config.antiSpam.stickerKickThreshold})* — Please stop spamming stickers!\n*Next sticker will result in an immediate KICK from the group.*`;
      await sock.sendMessage(groupId, {
        text: warningText,
        mentions: [mentionJid]
      });
    }

    // 6th sticker: AUTO KICK
    if (tracker.count >= config.antiSpam.stickerKickThreshold) {
      try {
        welcomeHandler.recordKick(groupId, senderJid, sock.user?.id);
        await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
        this.stickerTracker.delete(key);
        
        const kickText = `🚫 *[AUTO KICK - STICKER SPAM]*\n\n${senderTag} (+${senderPhone}) has exceeded the sticker spam limit (${config.antiSpam.stickerKickThreshold} stickers) and has been automatically kicked from the group.`;
        await sock.sendMessage(groupId, {
          text: kickText,
          mentions: [mentionJid]
        });
      } catch (err) {
        console.error(`[Moderator] Failed to auto-kick ${senderJid} for sticker spam:`, err.message);
      }
    }
  }

  /**
   * Handle incoming message in a group
   * Rule: 5th same/repeated message = Warning, 6th = Auto-kick
   */
  async handleMessageSpam(sock, groupId, senderJid, text, groupMetadata) {
    if (!config.antiSpam.enabled || !text) return;

    // RULE: Admin Immunity - Don't kick admin for spam
    if (this.isGroupAdmin(senderJid, groupMetadata)) {
      return;
    }

    const cleanText = text.trim().toLowerCase();
    if (cleanText.length < 2) return; // Ignore single characters

    const key = `${groupId}:${this.cleanJid(senderJid)}`;
    const now = Date.now();
    const tracker = this.messageTracker.get(key) || { count: 0, lastText: '', lastTime: 0 };

    const isSameText = (tracker.lastText === cleanText);
    const isWithinWindow = (now - tracker.lastTime <= config.antiSpam.messageTimeWindowMs);

    if (isSameText && isWithinWindow) {
      tracker.count += 1;
    } else {
      tracker.count = 1;
      tracker.lastText = cleanText;
    }
    tracker.lastTime = now;
    this.messageTracker.set(key, tracker);

    // Resolve accurate international phone number (never raw LID digits)
    let senderPhone = null;
    try {
      senderPhone = welcomeHandler.resolvePhoneNumber(senderJid, groupMetadata, groupId);
    } catch (e) {}
    if (!senderPhone || senderPhone === 'Unknown') {
      try {
        const antiDelete = require('./antiDelete');
        senderPhone = antiDelete.resolvePhoneNumber(senderJid, false, groupMetadata, sock);
      } catch (e) {}
    }
    if (!senderPhone || senderPhone === 'Unknown' || senderPhone.endsWith('lid')) {
      senderPhone = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    }

    const senderTag = `@${senderPhone}`;
    const mentionJid = senderJid.endsWith('@s.whatsapp.net') ? senderJid : `${senderPhone}@s.whatsapp.net`;

    // 5th repeated message: WARNING
    if (tracker.count === config.antiSpam.messageWarningThreshold) {
      const warningText = `⚠️ *[MESSAGE SPAM WARNING]*\n\nHey ${senderTag} (+${senderPhone}), you are repeating the same message!\n🛑 *Warning (${tracker.count}/${config.antiSpam.messageKickThreshold})* — Please stop spamming duplicate messages!\n*Next spam message will result in an immediate KICK from the group.*`;
      await sock.sendMessage(groupId, {
        text: warningText,
        mentions: [mentionJid]
      });
    }

    // 6th repeated message: AUTO KICK
    if (tracker.count >= config.antiSpam.messageKickThreshold) {
      try {
        welcomeHandler.recordKick(groupId, senderJid, sock.user?.id);
        await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');
        this.messageTracker.delete(key);

        const kickText = `🚫 *[AUTO KICK - MESSAGE SPAM]*\n\n${senderTag} (+${senderPhone}) has been automatically kicked from the group for sending duplicate messages ${config.antiSpam.messageKickThreshold} times.`;
        await sock.sendMessage(groupId, {
          text: kickText,
          mentions: [mentionJid]
        });
      } catch (err) {
        console.error(`[Moderator] Failed to auto-kick ${senderJid} for message spam:`, err.message);
      }
    }
  }

  /**
   * Verify if target user can be kicked
   * Rule: No one can kick admins
   */
  canKickUser(targetJid, botJid, groupMetadata) {
    const cleanTarget = this.cleanJid(targetJid);
    const cleanBot = this.cleanJid(botJid);

    if (cleanTarget === cleanBot) {
      return { allowed: false, reason: '❌ I cannot kick myself!' };
    }

    if (this.isGroupAdmin(cleanTarget, groupMetadata)) {
      return { allowed: false, reason: '🛡️ *Admin Protection:* No one can kick an Admin! Admins are strictly protected.' };
    }

    return { allowed: true };
  }

  /**
   * Verify if target user can be warned
   * Rule: Admins can warn each other and regular members, but users cannot warn themselves and bot cannot warn itself.
   */
  canWarnUser(targetJid, botJid, groupMetadata, senderJid) {
    const cleanTarget = this.cleanJid(targetJid);
    const cleanBot = this.cleanJid(botJid);

    if (cleanTarget === cleanBot) {
      return { allowed: false, reason: '❌ I cannot warn myself!' };
    }

    if (senderJid && cleanTarget === this.cleanJid(senderJid)) {
      return { allowed: false, reason: '❌ You cannot warn yourself!' };
    }

    return { allowed: true };
  }

  /**
   * Add an admin warning for a user in a group
   * @param {string} groupId
   * @param {string} targetJid
   * @param {string} adminJid
   * @param {string} adminName
   * @param {string} reason
   * @returns {{ count: number, max: number, isMax: boolean, warning: object }}
   */
  addWarning(groupId, targetJid, adminJid, adminName, reason) {
    const key = `${groupId}:${this.cleanJid(targetJid)}`;
    const tracker = this.warnTracker.get(key) || { count: 0, warnings: [] };

    const warningEntry = {
      adminJid: this.cleanJid(adminJid),
      adminName: adminName || 'Admin',
      reason: reason || 'Rule violation / Inappropriate behavior',
      timestamp: Date.now()
    };

    tracker.count += 1;
    tracker.warnings.push(warningEntry);
    this.warnTracker.set(key, tracker);

    return {
      count: tracker.count,
      max: this.maxWarnings,
      isMax: tracker.count >= this.maxWarnings,
      warning: warningEntry
    };
  }

  /**
   * Get warning count and history for a user in a group
   */
  getWarnings(groupId, targetJid) {
    const key = `${groupId}:${this.cleanJid(targetJid)}`;
    const tracker = this.warnTracker.get(key) || { count: 0, warnings: [] };
    return { count: tracker.count, max: this.maxWarnings, warnings: tracker.warnings };
  }

  /**
   * Reset all warnings for a user in a group
   */
  resetWarnings(groupId, targetJid) {
    const key = `${groupId}:${this.cleanJid(targetJid)}`;
    const previous = this.warnTracker.get(key);
    const count = previous ? previous.count : 0;
    this.warnTracker.delete(key);
    return count;
  }

  /**
   * Reset spam tracking (both sticker spam and message spam) and warnings for a user in a group
   * @param {string} groupId
   * @param {string} targetJid
   * @returns {{ stickerCount: number, messageCount: number, warnCount: number }}
   */
  resetSpam(groupId, targetJid) {
    const cleanTarget = this.cleanJid(targetJid);
    const targetDigits = targetJid ? targetJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';

    let stickerCount = 0;
    let messageCount = 0;
    let warnCount = 0;

    const directKey = `${groupId}:${cleanTarget}`;
    if (this.stickerTracker.has(directKey)) {
      stickerCount = Math.max(stickerCount, this.stickerTracker.get(directKey).count || 0);
      this.stickerTracker.delete(directKey);
    }
    if (this.messageTracker.has(directKey)) {
      messageCount = Math.max(messageCount, this.messageTracker.get(directKey).count || 0);
      this.messageTracker.delete(directKey);
    }
    if (this.warnTracker.has(directKey)) {
      warnCount = Math.max(warnCount, this.warnTracker.get(directKey).count || 0);
      this.warnTracker.delete(directKey);
    }

    if (targetDigits) {
      for (const k of Array.from(this.stickerTracker.keys())) {
        if (k.startsWith(`${groupId}:`) && k.includes(targetDigits)) {
          stickerCount = Math.max(stickerCount, this.stickerTracker.get(k).count || 0);
          this.stickerTracker.delete(k);
        }
      }
      for (const k of Array.from(this.messageTracker.keys())) {
        if (k.startsWith(`${groupId}:`) && k.includes(targetDigits)) {
          messageCount = Math.max(messageCount, this.messageTracker.get(k).count || 0);
          this.messageTracker.delete(k);
        }
      }
      for (const k of Array.from(this.warnTracker.keys())) {
        if (k.startsWith(`${groupId}:`) && k.includes(targetDigits)) {
          warnCount = Math.max(warnCount, this.warnTracker.get(k).count || 0);
          this.warnTracker.delete(k);
        }
      }
    }

    return { stickerCount, messageCount, warnCount };
  }
}

module.exports = new GroupModerator();
