/**
 * VIRUZ TTS State Manager
 * Controls whether TTS is enabled or disabled per group chat or globally.
 * Persists settings to tts_state.json.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../tts_state.json');

class TTSStateManager {
  constructor() {
    this.chatStates = {}; // { [chatJid]: boolean }
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        this.chatStates = JSON.parse(raw);
      }
    } catch (e) {
      this.chatStates = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.chatStates, null, 2), 'utf8');
    } catch (e) {
      console.error('[TTSState] Failed to save tts_state.json:', e.message);
    }
  }

  /**
   * Check if TTS is enabled for a given chat.
   * Defaults to true if not explicitly disabled.
   * @param {string} chatJid
   * @returns {boolean}
   */
  isTtsEnabled(chatJid) {
    if (!chatJid) return true;
    if (typeof this.chatStates[chatJid] === 'boolean') {
      return this.chatStates[chatJid];
    }
    return true;
  }

  /**
   * Set TTS enabled/disabled for a given chat.
   * @param {string} chatJid
   * @param {boolean} enabled
   */
  setTtsEnabled(chatJid, enabled) {
    if (!chatJid) return;
    this.chatStates[chatJid] = Boolean(enabled);
    this.save();
  }
}

module.exports = new TTSStateManager();
