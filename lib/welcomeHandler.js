/**
 * VIRUZ Auto-Welcome & Goodbye Handler
 * Handles group participant updates (join, leave, kick)
 * Features:
 * - Auto-welcome when someone joins the GC with exact phone mention and friendly message
 * - Auto-goodbye when someone leaves or is kicked, showing correct phone number and who kicked them
 * - Full resolution of WhatsApp LIDs (@lid) into real international phone numbers (+92300...)
 * - Group roster memory caching to accurately identify departing members even after they are removed
 */

const { atlasBox } = require('./utils');
const config = require('../config');

class WelcomeHandler {
  constructor() {
    // Set of group IDs where welcome/goodbye is disabled: Set<groupId>
    this.disabledGroups = new Set();

    // Cache of recent admin/bot kicks: Map<`${groupId}:${phoneOrLid}`, { adminJid, time }>
    this.recentKicks = new Map();

    // Group roster cache: Map<groupId, Map<cleanLidOrPhone, { phone: string, name: string }>>
    this.groupRosterCache = new Map();

    // Global LID to phone mapping: Map<cleanLid, string>
    this.globalLidMap = new Map();
  }

  /**
   * Helper: Clean JID or string down to pure digits
   * @param {string} str 
   * @returns {string}
   */
  cleanDigits(str) {
    if (!str || typeof str !== 'string') return '';
    return str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  }

  /**
   * Helper: Validate international phone number digits
   * Must be 7 to 15 digits (ITU-T E.164) and not start with 120363 (WhatsApp group/channel ID)
   * @param {string} num 
   * @returns {boolean}
   */
  isValidPhoneNumber(num) {
    return typeof num === 'string' && num.length >= 7 && num.length <= 15 && !num.startsWith('120363');
  }

  /**
   * Ingest and cache group metadata to map all members' LIDs to real phone numbers
   * @param {string} groupId 
   * @param {object} metadata 
   */
  cacheGroupMetadata(groupId, metadata) {
    if (!groupId || !metadata) return;
    if (!this.groupRosterCache.has(groupId)) {
      this.groupRosterCache.set(groupId, new Map());
    }
    const roster = this.groupRosterCache.get(groupId);

    // Sync with antiDelete mapping dictionary if available
    let antiDelete = null;
    try { antiDelete = require('./antiDelete'); } catch (e) {}

    if (metadata.participants && Array.isArray(metadata.participants)) {
      for (const p of metadata.participants) {
        const phone = this.extractPhoneFromParticipant(p);
        const name = p.name || p.notify || '';
        if (phone) {
          const cleanLid = p.lid ? this.cleanDigits(p.lid) : (p.id?.endsWith('@lid') ? this.cleanDigits(p.id) : null);
          const cleanId = p.id ? this.cleanDigits(p.id) : null;
          const cleanJid = p.jid ? this.cleanDigits(p.jid) : null;

          if (cleanLid) {
            roster.set(cleanLid, { phone, name });
            this.globalLidMap.set(cleanLid, phone);
            if (antiDelete?.recordLidMapping) antiDelete.recordLidMapping(cleanLid, phone, name);
          }
          if (cleanId && cleanId !== phone) {
            roster.set(cleanId, { phone, name });
            this.globalLidMap.set(cleanId, phone);
            if (antiDelete?.recordLidMapping) antiDelete.recordLidMapping(cleanId, phone, name);
          }
          if (cleanJid && cleanJid !== phone) {
            roster.set(cleanJid, { phone, name });
            this.globalLidMap.set(cleanJid, phone);
            if (antiDelete?.recordLidMapping) antiDelete.recordLidMapping(cleanJid, phone, name);
          }
          roster.set(phone, { phone, name });
        }
      }
    }
  }

  /**
   * Extract phone digits directly from a Baileys participant object
   * @param {object} p 
   * @returns {string|null}
   */
  extractPhoneFromParticipant(p) {
    if (!p) return null;

    // 1. Check p.jid (In Baileys LID mode, p.jid is NormalizedUser(attrs.phone_number) e.g. "923001234567@s.whatsapp.net")
    if (p.jid && p.jid.endsWith('@s.whatsapp.net')) {
      const num = this.cleanDigits(p.jid);
      if (this.isValidPhoneNumber(num)) return num;
    }

    // 2. Check p.phoneNumber or p.pn
    if (p.phoneNumber || p.pn) {
      const num = this.cleanDigits(p.phoneNumber || p.pn);
      if (this.isValidPhoneNumber(num)) return num;
    }

    // 3. Check p.id if it is a phone JID
    if (p.id && p.id.endsWith('@s.whatsapp.net')) {
      const num = this.cleanDigits(p.id);
      if (this.isValidPhoneNumber(num)) return num;
    }

    // 4. Check globalLidMap or antiDelete.lidMap
    const cleanLid = (p.lid || (p.id?.endsWith('@lid') ? p.id : '')).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (cleanLid) {
      if (this.globalLidMap.has(cleanLid)) return this.globalLidMap.get(cleanLid);
      try {
        const antiDelete = require('./antiDelete');
        if (antiDelete?.lidMap?.has(cleanLid)) {
          const mapped = antiDelete.lidMap.get(cleanLid);
          const num = (mapped.phone || mapped).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          if (this.isValidPhoneNumber(num)) return num;
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Check if welcome/goodbye is enabled for a group
   * @param {string} groupId 
   * @returns {boolean}
   */
  isEnabled(groupId) {
    if (config.welcome && config.welcome.enabled === false) return false;
    return !this.disabledGroups.has(groupId);
  }

  /**
   * Set status for a specific group
   * @param {string} groupId 
   * @param {boolean} enabled 
   * @returns {boolean}
   */
  setGroupStatus(groupId, enabled) {
    if (enabled) {
      this.disabledGroups.delete(groupId);
    } else {
      this.disabledGroups.add(groupId);
    }
    return this.isEnabled(groupId);
  }

  /**
   * Record a kick action to properly attribute who kicked whom
   * @param {string} groupId 
   * @param {string} targetJid 
   * @param {string} adminJid 
   */
  recordKick(groupId, targetJid, adminJid) {
    if (!groupId || !targetJid) return;
    const rawTarget = this.cleanDigits(targetJid);
    const phone = this.resolvePhoneNumber(targetJid, null, groupId);
    const data = { adminJid, time: Date.now() };

    if (rawTarget) this.recentKicks.set(`${groupId}:${rawTarget}`, data);
    if (phone && phone !== rawTarget) this.recentKicks.set(`${groupId}:${phone}`, data);

    // Clean up cache after 30 seconds
    setTimeout(() => {
      if (rawTarget) this.recentKicks.delete(`${groupId}:${rawTarget}`);
      if (phone && phone !== rawTarget) this.recentKicks.delete(`${groupId}:${phone}`);
    }, 30000);
  }

  /**
   * Resolve a WhatsApp JID or LID into an exact real phone number
   * Strictly guarantees:
   * - Phone numbers are returned as clean international digits (e.g. '923001234567')
   * - LIDs are cross-referenced against group cache, metadata, and anti-delete dictionary
   * - Raw LIDs or group IDs are NEVER returned as phone numbers (returns '' if unresolvable)
   * @param {string} jid 
   * @param {object|null} groupMetadata 
   * @param {string|null} groupId 
   * @returns {string}
   */
  resolvePhoneNumber(jid, groupMetadata = null, groupId = null) {
    if (!jid || typeof jid !== 'string') return '';
    if (jid.endsWith('@g.us')) return '';

    // 1. Direct phone JID (e.g. 923001234567@s.whatsapp.net or 923001234567:0@s.whatsapp.net)
    if (jid.endsWith('@s.whatsapp.net')) {
      const clean = this.cleanDigits(jid);
      if (this.isValidPhoneNumber(clean)) return clean;
    }

    const cleanUser = this.cleanDigits(jid);
    if (!cleanUser) return '';

    // 2. Query global LID dictionary
    if (this.globalLidMap.has(cleanUser)) {
      const num = this.globalLidMap.get(cleanUser);
      if (this.isValidPhoneNumber(num)) return num;
    }

    // 3. Query antiDelete.lidMap
    try {
      const antiDelete = require('./antiDelete');
      if (antiDelete?.lidMap?.has(cleanUser)) {
        const mapped = antiDelete.lidMap.get(cleanUser);
        const num = (mapped.phone || mapped).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (this.isValidPhoneNumber(num)) {
          this.globalLidMap.set(cleanUser, num);
          return num;
        }
      }
    } catch (e) {}

    // 4. Query group roster cache for this specific group
    const targetGroupId = groupId || groupMetadata?.id;
    if (targetGroupId && this.groupRosterCache.has(targetGroupId)) {
      const roster = this.groupRosterCache.get(targetGroupId);
      if (roster.has(cleanUser)) {
        const entry = roster.get(cleanUser);
        if (this.isValidPhoneNumber(entry.phone)) return entry.phone;
      }
    }

    // 5. Cross-reference groupMetadata participants if provided
    if (groupMetadata && Array.isArray(groupMetadata.participants)) {
      for (const p of groupMetadata.participants) {
        const pLid = p.lid ? this.cleanDigits(p.lid) : '';
        const pId = p.id ? this.cleanDigits(p.id) : '';
        const pJid = p.jid ? this.cleanDigits(p.jid) : '';

        if (pLid === cleanUser || pId === cleanUser || pJid === cleanUser) {
          const phone = this.extractPhoneFromParticipant(p);
          if (phone) {
            this.globalLidMap.set(cleanUser, phone);
            if (targetGroupId) {
              if (!this.groupRosterCache.has(targetGroupId)) {
                this.groupRosterCache.set(targetGroupId, new Map());
              }
              this.groupRosterCache.get(targetGroupId).set(cleanUser, { phone, name: p.name || p.notify || '' });
            }
            return phone;
          }
        }
      }
    }

    // 6. Search across all other cached group rosters
    for (const [gid, roster] of this.groupRosterCache.entries()) {
      if (roster.has(cleanUser)) {
        const entry = roster.get(cleanUser);
        if (this.isValidPhoneNumber(entry.phone)) {
          this.globalLidMap.set(cleanUser, entry.phone);
          return entry.phone;
        }
      }
    }

    // 7. Strict Guard: If it's a LID format, NEVER return the internal LID as a phone number!
    if (jid.endsWith('@lid')) {
      return '';
    }

    // 8. Fallback only if cleanUser is already a valid international phone number
    if (this.isValidPhoneNumber(cleanUser)) {
      return cleanUser;
    }

    return '';
  }

  /**
   * Backwards compatible alias for resolvePhoneNumber
   */
  extractPhoneNumber(jid, groupMetadata = null, groupId = null) {
    return this.resolvePhoneNumber(jid, groupMetadata, groupId);
  }

  /**
   * Generate welcome message payload
   * @param {string} phone 
   * @param {string} groupName 
   * @returns {{ text: string, mentions: string[] }}
   */
  buildWelcomeMessage(phone, groupName) {
    const mentions = [];
    let memberDisplay = '';
    let welcomeGreeting = '';

    if (phone) {
      const mentionJid = `${phone}@s.whatsapp.net`;
      mentions.push(mentionJid);
      welcomeGreeting = `👋 Welcome to the group @${phone}!`;
      memberDisplay = `📱 *Member:* +${phone}`;
    } else {
      welcomeGreeting = `👋 Welcome to the group!`;
      memberDisplay = `📱 *Member:* New Member`;
    }

    const body = `
${welcomeGreeting}

🎉 Glad to have you join *${groupName}*!
${memberDisplay}
📜 Please read the group description & follow group rules.
✨ Be respectful and enjoy your stay!
`.trim();

    const text = atlasBox('WELCOME TO THE GROUP', body, 'VIRUZ • AUTO WELCOME');
    return { text, mentions };
  }

  /**
   * Generate goodbye message payload (voluntary leave or kicked)
   * @param {string} phone 
   * @param {string} groupName 
   * @param {boolean} isKicked 
   * @param {string|null} kickerPhone 
   * @param {boolean} isBotKicker 
   * @returns {{ text: string, mentions: string[] }}
   */
  buildGoodbyeMessage(phone, groupName, isKicked = false, kickerPhone = null, isBotKicker = false) {
    const mentions = [];
    let goodbyeGreeting = '';
    let memberDisplay = '';

    if (phone) {
      mentions.push(`${phone}@s.whatsapp.net`);
      goodbyeGreeting = `👋 Goodbye @${phone}!`;
      memberDisplay = `@${phone} (+${phone})`;
    } else {
      goodbyeGreeting = `👋 Goodbye!`;
      memberDisplay = `Group Member`;
    }

    let body = '';
    let title = 'GOODBYE FROM GROUP';

    if (isKicked) {
      title = 'MEMBER REMOVED';
      let kickerDisplay = '';
      if (isBotKicker) {
        kickerDisplay = '🤖 VIRUZ Auto-Moderator';
      } else if (kickerPhone) {
        kickerDisplay = `@${kickerPhone} (+${kickerPhone})`;
        mentions.push(`${kickerPhone}@s.whatsapp.net`);
      } else {
        kickerDisplay = 'Group Admin';
      }

      body = `
${goodbyeGreeting}

🚪 *Kicked Member:* ${memberDisplay}
👑 *Removed By:* ${kickerDisplay}
📍 *Group:* *${groupName}*

Farewell and best of luck ahead! ✨
`.trim();
    } else {
      body = `
${goodbyeGreeting}

🚶 *Member Left:* ${memberDisplay}
📍 *Group:* *${groupName}*

We are sad to see you leave. Take care! ✨
`.trim();
    }

    const text = atlasBox(title, body, 'VIRUZ • AUTO GOODBYE');
    return { text, mentions };
  }

  /**
   * Process group-participants.update event from Baileys
   * @param {object} sock 
   * @param {object} update 
   */
  async handleParticipantUpdate(sock, { id, author, participants, action }) {
    if (!this.isEnabled(id)) return;
    if (!participants || !Array.isArray(participants) || participants.length === 0) return;

    const botJid = sock.user?.id;
    const botPhone = this.resolvePhoneNumber(botJid);

    // ── 1. ACTION: REMOVE (User leaves or is kicked) ──
    if (action === 'remove') {
      // Step A: Resolve leaving participants from existing cached roster BEFORE refreshing group metadata
      const resolvedParticipants = participants.map(p => ({
        jid: p,
        phone: this.resolvePhoneNumber(p, null, id)
      }));

      // Step B: Fetch current metadata for subject and update roster
      let groupMetadata = null;
      try {
        groupMetadata = await sock.groupMetadata(id);
        if (groupMetadata) {
          this.cacheGroupMetadata(id, groupMetadata);
        }
      } catch (e) {}

      const groupName = groupMetadata?.subject || 'the group';

      for (const item of resolvedParticipants) {
        let phone = item.phone;
        // If not resolved from cache, try resolving with fresh groupMetadata
        if (!phone) {
          phone = this.resolvePhoneNumber(item.jid, groupMetadata, id);
        }

        // Skip goodbye for the bot itself
        if (botPhone && phone === botPhone) continue;

        const rawParticipant = this.cleanDigits(item.jid);
        const key1 = `${id}:${phone}`;
        const key2 = `${id}:${rawParticipant}`;
        const recordedKick = this.recentKicks.get(key1) || this.recentKicks.get(key2);

        let isKicked = false;
        let kickerPhone = null;
        let isBotKicker = false;

        if (recordedKick) {
          isKicked = true;
          kickerPhone = this.resolvePhoneNumber(recordedKick.adminJid, groupMetadata, id);
          isBotKicker = botPhone && kickerPhone === botPhone;
          this.recentKicks.delete(key1);
          this.recentKicks.delete(key2);
        } else if (author && this.cleanDigits(author) !== rawParticipant && (!phone || this.cleanDigits(author) !== phone)) {
          isKicked = true;
          kickerPhone = this.resolvePhoneNumber(author, groupMetadata, id);
          isBotKicker = botPhone && kickerPhone === botPhone;
        }

        const payload = this.buildGoodbyeMessage(phone, groupName, isKicked, kickerPhone, isBotKicker);
        await sock.sendMessage(id, {
          text: payload.text,
          mentions: payload.mentions
        });

        // Clean up leaving member from this group's roster
        if (this.groupRosterCache.has(id)) {
          const roster = this.groupRosterCache.get(id);
          if (rawParticipant) roster.delete(rawParticipant);
          if (phone) roster.delete(phone);
        }
      }
      return;
    }

    // ── 2. ACTION: ADD (User joins or is added) ──
    if (action === 'add') {
      let groupMetadata = null;
      try {
        groupMetadata = await sock.groupMetadata(id);
        if (groupMetadata) {
          this.cacheGroupMetadata(id, groupMetadata);
        }
      } catch (e) {}

      const groupName = groupMetadata?.subject || 'the group';

      for (const participant of participants) {
        const phone = this.resolvePhoneNumber(participant, groupMetadata, id);

        // Skip welcoming the bot itself
        if (botPhone && phone === botPhone) continue;

        const payload = this.buildWelcomeMessage(phone, groupName);
        await sock.sendMessage(id, {
          text: payload.text,
          mentions: payload.mentions
        });
      }
      return;
    }
  }
}

module.exports = new WelcomeHandler();
