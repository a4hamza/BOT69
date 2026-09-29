/**
 * Baileys WhatsApp Connection Manager with Anti-Ban Safety & Dedup
 */

const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const messageStore = require('./messageStore');
const config = require('../config');
const commandHandler = require('./commandHandler');
const moderator = require('./groupModerator');
const antiDelete = require('./antiDelete');
const welcomeHandler = require('./welcomeHandler');
const safety = require('./safety');
const groupMetadataCache = require('./groupMetadataCache');

// Filter noisy libsignal internal decryption warnings, MessageCounterError, and session dumps during automatic re-sync
const _origConsoleError = console.error;
console.error = (...args) => {
  const combined = args.map(a => (typeof a === 'string' ? a : (a?.message || a?.stack || a?.toString?.() || ''))).join(' ');
  if (
    combined.includes('Failed to decrypt message with any known session') ||
    combined.includes('Session error:') ||
    combined.includes('MessageCounterError') ||
    combined.includes('Key used already or never filled') ||
    combined.includes('Bad MAC') ||
    combined.includes('No matching sessions found for message') ||
    combined.includes('SessionError: No matching sessions found')
  ) {
    return;
  }
  _origConsoleError.apply(console, args);
};

const _origConsoleWarn = console.warn;
console.warn = (...args) => {
  const combined = args.map(a => (typeof a === 'string' ? a : (a?.message || a?.stack || a?.toString?.() || ''))).join(' ');
  if (
    combined.includes('Closing open session in favor of incoming prekey bundle') ||
    combined.includes('cachedGroupMetadata in sendMessage are deprecated') ||
    combined.includes('Session error:') ||
    combined.includes('MessageCounterError') ||
    combined.includes('Key used already or never filled')
  ) {
    return;
  }
  _origConsoleWarn.apply(console, args);
};

const _origConsoleInfo = console.info;
console.info = (...args) => {
  const combined = args.map(a => (typeof a === 'string' ? a : (a?.message || a?.stack || a?.toString?.() || ''))).join(' ');
  if (
    combined.includes('Closing session:') ||
    combined.includes('Opening session:') ||
    combined.includes('Removing old closed session:')
  ) {
    return;
  }
  _origConsoleInfo.apply(console, args);
};

let baileysModule = null;
async function loadBaileys() {
  if (!baileysModule) {
    baileysModule = await import('@whiskeysockets/baileys');
  }
  return baileysModule;
}

/**
 * Accurately extract timestamp from any Baileys message representation
 * (number, Long object with .toNumber() or .low, string, etc.)
 */
function extractMessageTimestamp(msg) {
  if (!msg) return 0;
  const ts = msg.messageTimestamp;
  if (!ts) return 0;
  let raw = 0;
  if (typeof ts === 'number') {
    raw = ts;
  } else if (typeof ts.toNumber === 'function') {
    raw = ts.toNumber();
  } else if (typeof ts.low === 'number') {
    raw = ts.low;
  } else if (typeof ts === 'string') {
    raw = parseInt(ts, 10) || 0;
  } else if (typeof ts.toString === 'function') {
    raw = parseInt(ts.toString(), 10) || 0;
  } else {
    raw = Number(ts) || 0;
  }
  if (!raw || isNaN(raw) || raw <= 0) return 0;
  // If already in milliseconds (> 100 billion), return as is; otherwise convert seconds to ms
  return raw > 1e11 ? raw : raw * 1000;
}

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting_pair' | 'connected'
    this.pairingCode = null;
    this.qrCodeBase64 = null;
    this.connectedUser = null;
    this.reconnectTimer = null;
    this.isStarting = false;
    this.bootTime = Date.now();
    this.connectedAt = 0;
  }

  /**
   * Start or restart the Baileys socket ensuring single active connection
   */
  async start() {
    if (this.isStarting) {
      console.log('[Baileys] Socket is already starting, skipping redundant start.');
      return this.sock;
    }
    this.isStarting = true;

    // Clean up any previous socket instance
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }

    try {
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore,
        Browsers,
        proto
      } = await loadBaileys();

      const authFolder = path.resolve(config.sessionDir);
      if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      let version = [2, 3000, 1043857760];
      try {
        const v = await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        if (v && v.version) version = v.version;
      } catch (e) {}

      console.log(`[Baileys] Connecting to WhatsApp Web (v${version.join('.')})...`);

      // NodeCache for tracking message retries (prevents retry loop and decrypt failures)
      const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });

      this.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        msgRetryCounterCache,
        retryRequestDelayMs: 250,
        getMessage: async (key) => {
          if (!key) return undefined;
          const protoMsg = messageStore.getMessageProto(key);
          return protoMsg || undefined;
        },
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: false,  // Reduced activity — anti-ban
        syncFullHistory: false,
        markOnlineOnConnect: false,  // Don't mark online — anti-ban
        defaultQueryTimeoutMs: 60000,
        maxMsgRetryCount: 5,
        keepAliveIntervalMs: 30000
      });

      // ── CRITICAL FIX: Intercept retry receipts on WebSocket to fix Baileys 'remoteJid: undefined' bug ──
      // In WhatsApp Multi-Device, when a recipient phone requests a retry for a message sent to self / DM,
      // Baileys sets remoteJid = attrs.recipient, which is undefined in DM receipts.
      // This causes relayMessage(undefined) to fail and leaves the recipient's WhatsApp permanently stuck
      // at "Waiting for this message. This may take a while."
      // By setting node.attrs.recipient from our messageStore cache or attrs.from before Baileys processes it,
      // Baileys correctly resolves the target JID and successfully re-encrypts the retry message to the phone!
      if (this.sock.ws && typeof this.sock.ws.prependListener === 'function') {
        this.sock.ws.prependListener('CB:receipt', (node) => {
          try {
            if (node?.attrs?.type === 'retry') {
              if (!node.attrs.recipient) {
                const msgId = node.attrs.id;
                let target = null;
                if (msgId) {
                  const stored = messageStore.get(msgId);
                  if (stored?.key?.remoteJid) {
                    target = stored.key.remoteJid;
                  }
                }
                if (!target) {
                  target = node.attrs.participant || node.attrs.from;
                }
                if (target) {
                  node.attrs.recipient = target;
                }
              }
            }
          } catch (e) {}
        });
      }

      // Safety Net: Wrap relayMessage to prevent any undefined JID dispatch during retries
      const rawRelayMessage = this.sock.relayMessage.bind(this.sock);
      this.sock.relayMessage = async (jid, message, options = {}) => {
        let targetJid = jid;
        if (!targetJid || targetJid === '@s.whatsapp.net' || targetJid.startsWith('@')) {
          if (options?.messageId) {
            const cached = messageStore.get(options.messageId);
            if (cached?.key?.remoteJid) {
              targetJid = cached.key.remoteJid;
            }
          }
          if (!targetJid || targetJid === '@s.whatsapp.net' || targetJid.startsWith('@')) {
            targetJid = options?.participant?.jid || (this.sock.user?.id ? this.sock.user.id.split(':')[0] + '@s.whatsapp.net' : null);
          }
        }
        return rawRelayMessage(targetJid || jid, message, options);
      };

      // Wrap sendMessage with Anti-Ban Pacing & Human Presence Simulation
      const rawSendMessage = this.sock.sendMessage.bind(this.sock);
      this.sock.sendMessage = async (jid, content, options = {}) => {
        // ── Strict Group Mention Safety Filter (Anti-GhostTag) ──
        // Rule: Never tag all group members or broadcast background ghost-pings!
        // Only legitimate single-user mentions are permitted (welcome, goodbye, warn, kick, add, anti-spam, manual tags).
        // If content.mentions or contextInfo.mentionedJid has > 3 members, strip it to prevent disturbing group members.
        if (typeof jid === 'string' && jid.endsWith('@g.us') && content) {
          if (Array.isArray(content.mentions) && content.mentions.length > 3) {
            console.warn(`[Anti-GhostTag Guard] Blocked mass mentions (${content.mentions.length} members) in group ${jid}. Stripping mass pings.`);
            content.mentions = [];
          }
          if (content.contextInfo && Array.isArray(content.contextInfo.mentionedJid) && content.contextInfo.mentionedJid.length > 3) {
            console.warn(`[Anti-GhostTag Guard] Blocked mass contextInfo.mentionedJid (${content.contextInfo.mentionedJid.length} members) in group ${jid}. Stripping mass pings.`);
            content.contextInfo.mentionedJid = [];
          }
        }

        const cleanJid = (typeof jid === 'string' && jid.includes(':') && !jid.endsWith('@g.us'))
          ? jid.split(':')[0] + '@s.whatsapp.net'
          : jid;

        // 1. Natural Human Presence Simulation (non-blocking in background)
        if (typeof this.sock.sendPresenceUpdate === 'function') {
          try {
            const isAudio = !!(content.audio || (typeof content.mimetype === 'string' && content.mimetype.includes('audio')));
            this.sock.sendPresenceUpdate(isAudio ? 'recording' : 'composing', cleanJid).catch(() => {});
          } catch (e) {}
        }

        // 2. Anti-Ban Human Micro-Delay (paces consecutive socket sends to avoid machine-gun burst detection)
        await safety.waitPacingDelay();

        // 3. Dispatch message through socket (with fallback if self-quote is rejected by server)
        let result;
        try {
          result = await rawSendMessage(cleanJid, content, options);
        } catch (sendErr) {
          if (options && options.quoted) {
            const fallbackOptions = { ...options };
            delete fallbackOptions.quoted;
            result = await rawSendMessage(cleanJid, content, fallbackOptions);
          } else {
            throw sendErr;
          }
        }

        // 4. Return presence to paused (non-blocking in background)
        if (typeof this.sock.sendPresenceUpdate === 'function') {
          try {
            this.sock.sendPresenceUpdate('paused', cleanJid).catch(() => {});
          } catch (e) {}
        }

        // 5. Cache proto for retry requests & mark sent by bot
        if (result && result.key?.id) {
          messageStore.set(result.key.id, result);
          if (cleanJid) {
            messageStore.set(`${cleanJid}_${result.key.id}`, result);
          }
          safety.markSentByBot(result.key.id);
        }
        safety.recordSend(cleanJid);

        return result;
      };

      this.sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeBase64 = await QRCode.toDataURL(qr);
          } catch (e) {}
        }

        if (connection === 'connecting') {
          this.status = 'connecting';
          console.log('[Baileys] Connection status: Connecting...');
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.connectedAt = Date.now();
          this.pairingCode = null;
          this.qrCodeBase64 = null;
          this.connectedUser = this.sock.user;
          safety.setPairedUser(this.sock.user?.id);
          const userIdentifier = this.sock.user?.name || this.sock.user?.id?.split(':')[0] || 'Bot';
          console.log(`[Baileys] ✅ Connected successfully as: ${userIdentifier}`);

          // Pre-warm group participant rosters for accurate phone resolution (welcome/goodbye/anti-delete/moderation)
          if (typeof this.sock.groupFetchAllParticipating === 'function') {
            this.sock.groupFetchAllParticipating().then(groups => {
              for (const [id, g] of Object.entries(groups || {})) {
                if (id) {
                  antiDelete.cacheGroupMetadata(id, g);
                  welcomeHandler.cacheGroupMetadata(id, g);
                  groupMetadataCache.set(id, g);
                }
              }
            }).catch(() => {});
          }
        }

        if (connection === 'close') {
          this.status = 'disconnected';
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
          const isConflict = statusCode === DisconnectReason?.connectionReplaced || statusCode === 440;
          console.log(`[Baileys] Connection closed. StatusCode: ${statusCode}, LoggedOut: ${isLoggedOut}, Conflict: ${isConflict}`);

          if (isConflict) {
            console.log('\n⚠️ ======================================================');
            console.log('⚠️ [ANTI-BAN WARNING]: SESSION CONFLICT DETECTED (Status 440)!');
            console.log('⚠️ Another instance (e.g. HYEHOST or local) is running with this same WhatsApp session.');
            console.log('⚠️ Running 2 instances simultaneously can get your WhatsApp number banned.');
            console.log('⚠️ Please stop one of the instances. Reconnecting in 30 seconds...');
            console.log('======================================================\n');
            if (!this.reconnectTimer) {
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.start().catch(err => console.error('[Baileys] Reconnect error:', err.message));
              }, 30000);
            }
            return;
          }

          if (!isLoggedOut) {
            if (!this.reconnectTimer) {
              // Longer delay on reconnect to avoid ban — 8 seconds
              console.log('[Baileys] Reconnecting in 8 seconds...');
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.start().catch(err => console.error('[Baileys] Reconnect error:', err.message));
              }, 8000);
            }
          } else {
            console.log('[Baileys] Device was logged out. Session files need to be re-paired.');
            try {
              fs.rmSync(authFolder, { recursive: true, force: true });
            } catch (e) {}
          }
        }
      });

      // Handle incoming messages
      this.sock.ev.on('messages.upsert', async (chatUpdate) => {
        // Pre-store all messages for anti-delete and retry requests
        if (chatUpdate.messages) {
          for (const m of chatUpdate.messages) {
            if (m?.message) {
              antiDelete.storeMessage(m);
              if (!m.key?.fromMe) {
                antiDelete.handleAutoViewOnce(this.sock, m).catch(() => {});
              }
            }
          }
        }

        // CRITICAL GUARD: Only live messages with type === 'notify' should execute commands!
        // When reconnecting or during chat sync, Baileys emits type === 'append' for historical messages.
        // Historical messages must NEVER trigger commands or moderation!
        if (chatUpdate.type !== 'notify') {
          return;
        }

        const messages = chatUpdate.messages || [];
        for (const msg of messages) {
          if (!msg || !msg.message) continue;
          if (!msg.key?.id) continue;

          // ── 1. Synchronous Early Dedup: block duplicate delivery immediately ──
          if (safety.isDuplicate(msg.key.id)) {
            continue;
          }

          // Process each message independently without blocking other messages in the batch
          (async () => {
            try {
              // ── 2. Guard: Never process messages sent directly by this bot ──
              if (safety.isSentByBot(msg.key.id)) {
                return;
              }

              // ── 3. Protocol Message Guard (Revokes, Edits, Ephemeral Timers) ──
              const unwrapped = antiDelete.unwrapMessage ? antiDelete.unwrapMessage(msg.message) : null;
              const protocolMsg = msg.message.protocolMessage ||
                unwrapped?.protocolMessage ||
                msg.message.ephemeralMessage?.message?.protocolMessage ||
                msg.message.viewOnceMessage?.message?.protocolMessage;
              
              if (protocolMsg) {
                const isRevoke = protocolMsg.type === 0 ||
                  protocolMsg.type === '0' ||
                  protocolMsg.type === 'REVOKE' ||
                  protocolMsg.type === 5 ||
                  (!protocolMsg.type && protocolMsg.key?.id && !protocolMsg.editedMessage && !protocolMsg.ephemeralExpiration);

                if (isRevoke) {
                  await antiDelete.handleRevoke(this.sock, msg);
                }
                // Message edits, pin updates, reactions, or ephemeral timer changes must NEVER execute commands!
                return;
              }

              // ── 4. Ignore Reactions ──
              if (msg.message.reactionMessage) {
                return;
              }

              // ── 5. Safety: skip junk messages (statuses, newsletters) ──
              if (safety.shouldIgnoreMessage(msg)) return;

              // ── 6. Anti-Delete: Store message in memory for recovery ──
              antiDelete.storeMessage(msg);

              // ── 7. Stale Backlog Guard: Strictly drop messages sent before connection or older than 25s ──
              const msgTs = extractMessageTimestamp(msg);
              if (msgTs <= 0) {
                // Untimestamped messages cannot be verified as live incoming messages. Drop!
                return;
              }

              const now = Date.now();
              const age = now - msgTs;

              // Live messages arrive within 1-4 seconds. Drop anything older than 25 seconds!
              if (age > 25_000) {
                return;
              }

              // Forward clock skew protection (> 15s in the future)
              if (age < -15_000) {
                return;
              }

              // Drop messages sent before the bot's current socket connection opened
              const connectionThreshold = (this.connectedAt || this.bootTime) - 5_000;
              if (msgTs < connectionThreshold) {
                return;
              }

            // ── Safety: if bot is turned OFF, skip command processing ──
            // (anti-delete still works, but only .bot from Admin/Owner re-enables it)
            if (!safety.isBotEnabled()) {
              const unwrapped = antiDelete.unwrapMessage ? antiDelete.unwrapMessage(msg.message) : msg.message;
              const text = (
                unwrapped?.conversation ||
                unwrapped?.extendedTextMessage?.text ||
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text || ''
              ).trim();
              const prefixes = config.prefixes || ['.', ',', '!', '#', '/'];
              const isCmd = prefixes.some(p => text.startsWith(p));
              if (isCmd) {
                const withoutPrefix = text.slice(1).trim().split(/\s+/);
                const cmdWord = withoutPrefix[0]?.toLowerCase();
                if (cmdWord === 'bot' || cmdWord === 'viruz' || cmdWord === 'switch' || cmdWord === 'power') {
                  const isOwner = msg.key.fromMe || safety.isOwner(msg.key.participant || msg.key.remoteJid);
                  let canTurnOn = isOwner;
                  if (!canTurnOn && msg.key.remoteJid.endsWith('@g.us')) {
                    try {
                      const meta = await groupMetadataCache.getGroupMetadata(this.sock, msg.key.remoteJid);
                      canTurnOn = moderator.isGroupAdmin(msg.key.participant || msg.participant || msg.key.remoteJid, meta, msg);
                    } catch (e) {}
                  }
                  if (canTurnOn) {
                    await commandHandler.handleMessage(this.sock, msg);
                  }
                }
              }
              return;
            }

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            let sender = from;
            if (isGroup) {
              if (msg.key.fromMe) {
                sender = this.sock.user?.id ? this.sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : (msg.key.participant || from);
              } else {
                sender = msg.key.participant || msg.participant || from;
              }
            } else if (msg.key.fromMe) {
              sender = this.sock.user?.id ? this.sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : from;
            }

            // Group Moderation & Anti-Spam (Sticker & Message)
            // Only track regular members in groups, skip fromMe and admins
            if (isGroup && !msg.key.fromMe) {
              let groupMetadata = null;
              try {
                groupMetadata = await groupMetadataCache.getGroupMetadata(this.sock, from);
              } catch (e) {}

              // 1. Check for Sticker Spam (4 warn, 5 kick)
              if (msg.message.stickerMessage) {
                await moderator.handleStickerSpam(this.sock, from, sender, groupMetadata);
              }

              // 2. Check for Repeated Message Spam (5 warn, 6 kick)
              const textContent = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';

              const prefixes = config.prefixes || ['.', ',', '!', '#', '/'];
              const isCmd = prefixes.some(p => textContent.startsWith(p));
              if (textContent && !isCmd) {
                await moderator.handleMessageSpam(this.sock, from, sender, textContent, groupMetadata);
              }
            }

            // Execute WhatsApp bot commands
            await commandHandler.handleMessage(this.sock, msg);

          } catch (err) {
            console.error('[Baileys] Error handling message:', err.message);
          }
        })().catch(() => {});
      }
    });

      // ── Anti-Delete: Catch revokes emitted via messages.update ──
      this.sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
          try {
            const isRevokeUpdate = update.update?.messageStubType === 68 ||
              update.update?.messageStubType === 'REVOKE' ||
              (update.update?.message === null && update.key?.id);

            if (isRevokeUpdate && update.key?.id) {
              await antiDelete.handleRevokeUpdate(this.sock, update);
            }
          } catch (err) {
            console.error('[AntiDelete] messages.update error:', err.message);
          }
        }
      });

      // Handle group participant updates (Auto-welcome & Auto-goodbye / kick)
      this.sock.ev.on('group-participants.update', async (update) => {
        try {
          if (update?.id) groupMetadataCache.invalidate(update.id);
          if (!safety.isBotEnabled()) return;
          await welcomeHandler.handleParticipantUpdate(this.sock, update);
        } catch (err) {
          console.error('[Baileys] Error handling participant update:', err.message);
        }
      });

      // Maintain LID to real phone number mapping from contacts & groups
      this.sock.ev.on('contacts.upsert', (contacts) => {
        try { antiDelete.learnContacts(contacts); } catch (e) {}
      });
      this.sock.ev.on('contacts.update', (updates) => {
        try { antiDelete.learnContacts(updates); } catch (e) {}
      });
      this.sock.ev.on('groups.upsert', (groups) => {
        try {
          for (const g of groups) {
            if (g.id) {
              antiDelete.cacheGroupMetadata(g.id, g);
              welcomeHandler.cacheGroupMetadata(g.id, g);
              groupMetadataCache.set(g.id, g);
            }
          }
        } catch (e) {}
      });
      this.sock.ev.on('groups.update', (updates) => {
        try {
          for (const g of updates) {
            if (g.id) {
              antiDelete.cacheGroupMetadata(g.id, g);
              welcomeHandler.cacheGroupMetadata(g.id, g);
              groupMetadataCache.set(g.id, g);
            }
          }
        } catch (e) {}
      });

      return this.sock;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Request pairing code dynamically from web dashboard or auto-pairing
   */
  async requestNewPairingCode(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    this.pairingCode = null;

    console.log(`[Baileys] 📲 Requesting pairing code for +${cleanNumber}...`);

    const authFolder = path.resolve(config.sessionDir);
    const isRegistered = this.sock?.authState?.creds?.registered;

    // If socket is already registered to a different account, wipe session to allow pairing new number
    if (isRegistered) {
      console.log('[Baileys] Device was already registered. Clearing session for fresh pairing...');
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }
      try {
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
      } catch (e) {}
    }

    // Ensure socket is created and running
    if (!this.sock) {
      await this.start();
    }

    // Dynamic wait for WebSocket connection (poll ws.isOpen with up to 30s timeout)
    const startTime = Date.now();
    const timeoutMs = 30000;
    while (!this.sock?.ws?.isOpen) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Connection to WhatsApp Web server timed out. Please check container network or retry.');
      }
      // If socket closed or crashed while connecting, re-trigger start()
      if (this.sock?.ws?.isClosed) {
        console.log('[Baileys] Socket was closed during connection. Restarting...');
        await this.start();
      }
      await new Promise(r => setTimeout(r, 400));
    }

    // Buffer for noise handshake and companion registration readiness
    await new Promise(r => setTimeout(r, 600));

    try {
      console.log(`[Baileys] Socket ready! Requesting pairing code from WhatsApp for +${cleanNumber}...`);
      const code = await this.sock.requestPairingCode(cleanNumber);
      this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
      this.status = 'waiting_pair';
      console.log(`\n======================================================`);
      console.log(`📲 YOUR WHATSAPP PAIRING CODE:`);
      console.log(`👉  ${this.pairingCode}`);
      console.log(``);
      console.log(`1. Open WhatsApp on your phone`);
      console.log(`2. Tap Settings (or 3 dots) > Linked Devices`);
      console.log(`3. Tap "Link a device" > "Link with phone number instead"`);
      console.log(`4. Enter this 8-digit code: ${this.pairingCode}`);
      console.log(`======================================================\n`);
      return this.pairingCode;
    } catch (err) {
      console.error('[Baileys] First pairing attempt error:', err.message);

      // If failed, do one clean reset and retry
      try {
        console.log('[Baileys] Performing clean reset and retry...');
        if (this.sock) {
          try {
            this.sock.ev.removeAllListeners();
            this.sock.end(undefined);
          } catch (e) {}
          this.sock = null;
        }
        try {
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
        } catch (e) {}

        await this.start();
        const retryStart = Date.now();
        while (!this.sock?.ws?.isOpen) {
          if (Date.now() - retryStart > 25000) break;
          await new Promise(r => setTimeout(r, 400));
        }
        await new Promise(r => setTimeout(r, 600));

        if (this.sock?.ws?.isOpen) {
          const retryCode = await this.sock.requestPairingCode(cleanNumber);
          this.pairingCode = retryCode?.match(/.{1,4}/g)?.join('-') || retryCode;
          this.status = 'waiting_pair';
          console.log(`\n======================================================`);
          console.log(`📲 YOUR WHATSAPP PAIRING CODE (RETRY):`);
          console.log(`👉  ${this.pairingCode}`);
          console.log(`======================================================\n`);
          return this.pairingCode;
        }
      } catch (retryErr) {
        console.error('[Baileys] Retry pairing code error:', retryErr.message);
      }
      throw err;
    }
  }
}

module.exports = new WhatsAppClient();
