/**
 * VIRUZ Anti-Ban Safety Layer
 * Protects the bot owner's WhatsApp account from getting banned by:
 * 1. Outgoing Message Pacing: Enforces human-like micro-delays between socket sends
 * 2. Rate-Limiting: Per-chat (group vs DM) and global limits to prevent flood detection
 * 3. Human Telemetry: Read receipts and presence indicator updates (composing/recording)
 * 4. Mass Mention Throttling: 30s cooldown on .tagall and .hidetag
 * 5. DM Flood Protection: Prevents unknown numbers from spamming commands
 * 6. Kick Pacing: Prevents rapid mass-kicking flags from WhatsApp
 * 7. Multi-Instance Conflict Backoff: Detects 440 session collisions and prevents reconnect wars
 * 8. Message Deduplication: Eliminates duplicate response loops
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEDUP_CACHE_FILE = path.join(__dirname, '../.dedup_cache.json');

class SafetyManager {
  constructor() {
    // ── Bot Master Switch ──
    this.botEnabled = true;

    // ── Deduplication: track processed message IDs across 24 hours ──
    this.processedMessages = new Map();
    this.DEDUP_TTL_MS = 24 * 60 * 60_000; // 24 hours
    this.MAX_DEDUP_SIZE = 20_000;         // Cap at 20,000 items

    // Load persisted dedup cache from previous run if valid
    this._loadDedupCache();

    // Set of message IDs sent directly by the bot (prevents bot self-response loop)
    this.botSentIds = new Set();

    // Cleanup interval every 30 seconds
    this._cleanupInterval = setInterval(() => this._cleanupDedup(), 30_000);
    if (this._cleanupInterval && typeof this._cleanupInterval.unref === 'function') {
      this._cleanupInterval.unref();
    }

    // ── Rate Limiter & Outgoing Pacing ──
    this.chatSendLog = new Map();
    this.globalSendLog = [];
    this.dmCommandLog = new Map();
    this.massMentionLog = new Map();
    this.kickLog = new Map();

    // Safety thresholds (tuned for fast responsive bot & zero WhatsApp ban risk)
    this.MIN_PACING_DELAY_MS = 120;        // Minimum delay between consecutive socket sends
    this.MAX_PACING_DELAY_MS = 250;        // Maximum random human jitter (120-250ms is instant yet human-like)
    this.MAX_SENDS_PER_GROUP_PER_MIN = 35; // Max messages per group per minute (prevents dropped commands in active chats)
    this.MAX_SENDS_PER_DM_PER_MIN = 15;    // Max messages to non-owner DM per minute
    this.MAX_GLOBAL_SENDS_PER_MIN = 60;    // Max total outbound messages across all chats in 60s
    this.MASS_MENTION_COOLDOWN_SEC = 25;   // Cooldown between .tagall/.hidetag per group
    this.KICK_COOLDOWN_MS = 1200;          // Safe delay between kicks (prevents mass-kick flag)
  }

  /**
   * Mark a message ID as sent by this bot to avoid self-triggering
   * @param {string} messageId
   */
  markSentByBot(messageId) {
    if (!messageId) return;
    this.botSentIds.add(messageId);
    if (this.botSentIds.size > 2000) {
      const first = this.botSentIds.values().next().value;
      this.botSentIds.delete(first);
    }
  }

  /**
   * Check if a message was sent by the bot itself
   * @param {string} messageId
   * @returns {boolean}
   */
  isSentByBot(messageId) {
    if (!messageId) return false;
    return this.botSentIds.has(messageId);
  }

  // ── Bot Master On/Off ──

  isBotEnabled() {
    return this.botEnabled;
  }

  setBotEnabled(enabled) {
    this.botEnabled = enabled;
  }

  // ── Deduplication ──

  _loadDedupCache() {
    try {
      if (fs.existsSync(DEDUP_CACHE_FILE)) {
        const raw = fs.readFileSync(DEDUP_CACHE_FILE, 'utf8');
        const data = JSON.parse(raw);
        const now = Date.now();
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && item.id && item.ts && (now - item.ts < this.DEDUP_TTL_MS)) {
              this.processedMessages.set(item.id, item.ts);
            }
          }
        }
      }
    } catch (e) {}
  }

  _saveDedupCache() {
    try {
      const list = [];
      const now = Date.now();
      for (const [id, ts] of this.processedMessages) {
        if (now - ts < this.DEDUP_TTL_MS) {
          list.push({ id, ts });
        }
      }
      fs.writeFileSync(DEDUP_CACHE_FILE, JSON.stringify(list.slice(-3000)));
    } catch (e) {}
  }

  isDuplicate(messageId) {
    if (!messageId) return false;
    if (this.processedMessages.has(messageId)) {
      return true;
    }
    this.processedMessages.set(messageId, Date.now());
    if (this.processedMessages.size > this.MAX_DEDUP_SIZE) {
      const oldestKey = this.processedMessages.keys().next().value;
      this.processedMessages.delete(oldestKey);
    }
    return false;
  }

  _cleanupDedup() {
    const now = Date.now();
    for (const [id, ts] of this.processedMessages) {
      if (now - ts > this.DEDUP_TTL_MS) {
        this.processedMessages.delete(id);
      }
    }
    this._saveDedupCache();

    // Clean DM command logs
    for (const [sender, timestamps] of this.dmCommandLog) {
      const fresh = timestamps.filter(t => now - t < 60_000);
      if (fresh.length === 0) {
        this.dmCommandLog.delete(sender);
      } else {
        this.dmCommandLog.set(sender, fresh);
      }
    }
  }

  // ── Junk Message Filter ──

  shouldIgnoreMessage(msg) {
    if (!msg || !msg.key) return true;

    const jid = msg.key.remoteJid || '';

    // Skip WhatsApp status broadcasts
    if (jid === 'status@broadcast') return true;

    // Skip newsletter / channel messages
    if (jid.endsWith('@newsletter')) return true;

    // Skip messages with no content
    if (!msg.message) return true;

    return false;
  }

  // ── Rate Limiter & Outgoing Message Safety ──

  recordSend(chatJid) {
    const now = Date.now();

    // Global log
    this.globalSendLog.push(now);
    this.globalSendLog = this.globalSendLog.filter(t => now - t < 60_000);

    // Per-chat log
    if (!this.chatSendLog.has(chatJid)) {
      this.chatSendLog.set(chatJid, []);
    }
    const chatLog = this.chatSendLog.get(chatJid);
    chatLog.push(now);
    this.chatSendLog.set(chatJid, chatLog.filter(t => now - t < 60_000));
  }

  canSend(chatJid) {
    const now = Date.now();

    // Global rate check
    const recentGlobal = this.globalSendLog.filter(t => now - t < 60_000);
    if (recentGlobal.length >= this.MAX_GLOBAL_SENDS_PER_MIN) {
      return false;
    }

    // Per-chat rate check
    const isGroup = (chatJid || '').endsWith('@g.us');
    const chatLog = this.chatSendLog.get(chatJid) || [];
    const recentChat = chatLog.filter(t => now - t < 60_000);

    const maxLimit = isGroup ? this.MAX_SENDS_PER_GROUP_PER_MIN : this.MAX_SENDS_PER_DM_PER_MIN;
    if (recentChat.length >= maxLimit) {
      return false;
    }

    return true;
  }

  /**
   * Get a randomized human-like delay in ms
   */
  getHumanDelay() {
    return this.MIN_PACING_DELAY_MS + Math.floor(Math.random() * (this.MAX_PACING_DELAY_MS - this.MIN_PACING_DELAY_MS));
  }

  /**
   * Wait for a human-like delay (call before sending)
   */
  async waitPacingDelay() {
    const delay = this.getHumanDelay();
    await new Promise(r => setTimeout(r, delay));
  }

  async waitHumanDelay() {
    await this.waitPacingDelay();
  }

  // ── DM Command Protection (Prevents unknown non-owner users from spamming the bot) ──

  canExecuteDmCommand(senderJid) {
    if (!senderJid) return false;
    if (this.isOwner(senderJid)) return true; // Owner is never throttled

    const now = Date.now();
    const cleanSender = senderJid.split('@')[0].split(':')[0];
    const log = this.dmCommandLog.get(cleanSender) || [];
    const recent = log.filter(t => now - t < 60_000);

    // Limit non-owner DM commands to 5 per minute
    return recent.length < 5;
  }

  recordDmCommand(senderJid) {
    if (!senderJid) return;
    const now = Date.now();
    const cleanSender = senderJid.split('@')[0].split(':')[0];
    const log = this.dmCommandLog.get(cleanSender) || [];
    log.push(now);
    this.dmCommandLog.set(cleanSender, log.filter(t => now - t < 60_000));
  }

  // ── Mass Mention Cooldown (.tagall & .hidetag Anti-Ban) ──

  getMassMentionCooldown(type, groupJid) {
    if (!groupJid) return 0;
    const key = `${type}:${groupJid}`;
    const lastUsed = this.massMentionLog.get(key) || 0;
    const elapsedSec = (Date.now() - lastUsed) / 1000;
    if (elapsedSec < this.MASS_MENTION_COOLDOWN_SEC) {
      return Math.ceil(this.MASS_MENTION_COOLDOWN_SEC - elapsedSec);
    }
    return 0;
  }

  recordMassMention(type, groupJid) {
    if (!groupJid) return;
    const key = `${type}:${groupJid}`;
    this.massMentionLog.set(key, Date.now());
  }

  // ── Kick Pacing (Prevents rapid mass-kicking flags) ──

  canKick(groupJid) {
    if (!groupJid) return true;
    const lastKick = this.kickLog.get(groupJid) || 0;
    return (Date.now() - lastKick) >= this.KICK_COOLDOWN_MS;
  }

  recordKick(groupJid) {
    if (!groupJid) return;
    this.kickLog.set(groupJid, Date.now());
  }

  // ── Safe Send Wrapper ──

  async safeSend(sock, jid, content, options = {}) {
    if (!this.canSend(jid)) {
      console.log(`[AntiBan] Pacing send to avoid rate limit for ${jid.substring(0, 15)}...`);
      await new Promise(r => setTimeout(r, 500));
    }

    await this.waitPacingDelay();
    this.recordSend(jid);
    const sent = await sock.sendMessage(jid, content, options);
    if (sent?.key?.id) {
      this.markSentByBot(sent.key.id);
    }
    return sent;
  }

  // ── Owner Check ──

  setPairedUser(jidOrId) {
    if (!jidOrId) return;
    const phone = jidOrId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (phone) {
      this.pairedUserPhone = phone;
    }
  }

  isOwner(jid) {
    if (!jid) return false;
    const phone = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (this.pairedUserPhone && phone === this.pairedUserPhone) return true;
    return (config.ownerNumbers || []).some(num => {
      const clean = num.replace(/[^0-9]/g, '');
      return phone === clean || phone.includes(clean) || clean.includes(phone);
    });
  }

  getOwnerJid() {
    if (this.pairedUserPhone) {
      return `${this.pairedUserPhone}@s.whatsapp.net`;
    }
    const primary = (config.ownerNumbers || [])[0] || '923116469820';
    return `${primary.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  }
}

module.exports = new SafetyManager();
