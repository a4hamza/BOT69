/**
 * VIRUZ Unified Message Store
 * Caches both incoming and outgoing messages with their cryptographic proto payloads.
 * Solves the WhatsApp Multi-Device "Waiting for this message. This may take a while" issue
 * by enabling Baileys to re-encrypt and fulfill retry requests (getMessage).
 */

const NodeCache = require('node-cache');

class MessageStore {
  constructor() {
    // Retain up to 3,000 message reference keys for 4 hours (14,400s)
    // Uses lightweight JS object pointers (<15MB RAM) strictly capped for HYEHOST free tier
    this.cache = new NodeCache({ stdTTL: 14400, checkperiod: 300, maxKeys: 3000, useClones: false });
  }

  /**
   * Store incoming or outgoing message with multi-key indexing
   * @param {string} id - Message ID
   * @param {object} msg - Full Baileys message object or proto
   */
  set(id, msg) {
    if (!id || !msg) return;

    const idsToStore = new Set([id]);
    if (msg.key?.id) idsToStore.add(msg.key.id);

    const remoteJid = msg.key?.remoteJid;
    const cleanJid = (remoteJid && remoteJid.includes(':') && !remoteJid.endsWith('@g.us'))
      ? remoteJid.split(':')[0] + '@s.whatsapp.net'
      : remoteJid;

    const participant = msg.key?.participant || msg.participant;
    const cleanPart = (participant && participant.includes(':') && !participant.endsWith('@g.us'))
      ? participant.split(':')[0] + '@s.whatsapp.net'
      : participant;

    for (const msgId of idsToStore) {
      this.cache.set(msgId, msg);

      if (remoteJid) {
        this.cache.set(`${remoteJid}_${msgId}`, msg);
        if (cleanJid && cleanJid !== remoteJid) {
          this.cache.set(`${cleanJid}_${msgId}`, msg);
        }
      }

      if (participant) {
        this.cache.set(`${participant}_${msgId}`, msg);
        if (cleanPart && cleanPart !== participant) {
          this.cache.set(`${cleanPart}_${msgId}`, msg);
        }
      }
    }
  }

  /**
   * Retrieve message by ID or key object
   * @param {string|object} key - Message ID string or Baileys key object
   * @returns {object|null}
   */
  get(key) {
    if (!key) return null;
    const id = typeof key === 'string' ? key : key.id;
    if (!id) return null;

    let found = this.cache.get(id);
    if (found) return found;

    if (typeof key === 'object') {
      if (key.remoteJid) {
        found = this.cache.get(`${key.remoteJid}_${id}`);
        if (!found && key.remoteJid.includes(':') && !key.remoteJid.endsWith('@g.us')) {
          const cleanJid = key.remoteJid.split(':')[0] + '@s.whatsapp.net';
          found = this.cache.get(`${cleanJid}_${id}`);
        }
      }
      if (!found && key.participant) {
        found = this.cache.get(`${key.participant}_${id}`);
        if (!found && key.participant.includes(':') && !key.participant.endsWith('@g.us')) {
          const cleanPart = key.participant.split(':')[0] + '@s.whatsapp.net';
          found = this.cache.get(`${cleanPart}_${id}`);
        }
      }
    }

    if (!found) {
      // Suffix search across composite keys as fallback
      const allKeys = this.cache.keys();
      for (let i = allKeys.length - 1; i >= 0; i--) {
        const k = allKeys[i];
        if (k.endsWith(`_${id}`)) {
          found = this.cache.get(k);
          if (found) break;
        }
      }
    }

    return found || null;
  }

  /**
   * Extract the clean proto.Message payload needed for getMessage retries.
   * Unwraps any deviceSentMessage or ephemeral wrappers to prevent double-wrapping
   * by Baileys relayMessage, guaranteeing that client devices decrypt cleanly.
   * @param {string|object} key
   * @returns {object|undefined}
   */
  getMessageProto(key) {
    const found = this.get(key);
    if (!found) return null;

    let raw = found.message || found;
    if (!raw || typeof raw !== 'object') return null;

    // Recursively unwrap wrappers so Baileys does not double-wrap on retry relay
    let depth = 0;
    while (
      depth < 10 &&
      (raw.deviceSentMessage?.message ||
       raw.ephemeralMessage?.message ||
       raw.viewOnceMessage?.message ||
       raw.viewOnceMessageV2?.message ||
       raw.viewOnceMessageV2Extension?.message ||
       raw.documentWithCaptionMessage?.message ||
       raw.editedMessage?.message?.protocolMessage?.editedMessage)
    ) {
      raw = raw.deviceSentMessage?.message ||
            raw.ephemeralMessage?.message ||
            raw.viewOnceMessage?.message ||
            raw.viewOnceMessageV2?.message ||
            raw.viewOnceMessageV2Extension?.message ||
            raw.documentWithCaptionMessage?.message ||
            raw.editedMessage?.message?.protocolMessage?.editedMessage;
      depth++;
    }

    // Verify raw has actual message content fields
    const valid = raw.conversation ||
      raw.extendedTextMessage ||
      raw.imageMessage ||
      raw.videoMessage ||
      raw.audioMessage ||
      raw.stickerMessage ||
      raw.documentMessage ||
      raw.contactMessage ||
      raw.locationMessage ||
      raw.pollCreationMessage ||
      raw.pollCreationMessageV2 ||
      raw.pollCreationMessageV3 ||
      raw.protocolMessage ||
      raw.reactionMessage;

    return valid ? raw : null;
  }

  /**
   * Clear cache
   */
  flush() {
    this.cache.flushAll();
  }
}

module.exports = new MessageStore();
