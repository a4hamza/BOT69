/**
 * Atlas-MD Command Loader and Dispatcher
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const safety = require('./safety');
const groupModerator = require('./groupModerator');
const groupMetadataCache = require('./groupMetadataCache');

class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.executedMessageIds = new Set();
    this.loadCommands();
  }

  /**
   * Recursively read and load command files
   */
  loadCommands() {
    const commandsDir = path.join(__dirname, '..', 'commands');
    if (!fs.existsSync(commandsDir)) return;

    const categories = fs.readdirSync(commandsDir);
    for (const cat of categories) {
      const catPath = path.join(commandsDir, cat);
      if (fs.statSync(catPath).isDirectory()) {
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
          try {
            const command = require(path.join(catPath, file));
            if (command.name && typeof command.execute === 'function') {
              this.commands.set(command.name.toLowerCase(), command);
              if (Array.isArray(command.aliases)) {
                for (const alias of command.aliases) {
                  this.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
                }
              }
            }
          } catch (err) {
            console.error(`[CommandHandler] Failed to load command ${file}:`, err);
          }
        }
      }
    }
    console.log(`[CommandHandler] Loaded ${this.commands.size} commands (${this.aliases.size} aliases).`);
  }

  /**
   * Find command by name or alias
   */
  getCommand(cmdName) {
    const clean = (cmdName || '').toLowerCase();
    if (this.commands.has(clean)) {
      return this.commands.get(clean);
    }
    if (this.aliases.has(clean)) {
      const realName = this.aliases.get(clean);
      return this.commands.get(realName);
    }
    return null;
  }

  /**
   * Check if text starts with any valid prefix
   */
  getPrefix(text) {
    if (!text || typeof text !== 'string') return null;
    const prefixes = config.prefixes || ['.', ',', '!', '#', '/'];
    for (const p of prefixes) {
      if (text.startsWith(p)) {
        // Guard: Don't treat repeated punctuation like '..' or '///' as a command prefix
        if (text.startsWith(p + p)) return null;
        // Guard: Must have command content after prefix
        const remainder = text.slice(p.length).trim();
        if (!remainder) return null;
        return p;
      }
    }
    return null;
  }

  /**
   * Recursively unwrap deviceSentMessage, ephemeral, and viewOnce wrappers
   */
  unwrapMessage(m) {
    if (!m) return {};
    let curr = m;
    while (
      curr.ephemeralMessage?.message ||
      curr.deviceSentMessage?.message ||
      curr.viewOnceMessage?.message ||
      curr.viewOnceMessageV2?.message ||
      curr.viewOnceMessageV2Extension?.message ||
      curr.documentWithCaptionMessage?.message ||
      curr.editedMessage?.message?.protocolMessage?.editedMessage
    ) {
      curr = curr.ephemeralMessage?.message ||
             curr.deviceSentMessage?.message ||
             curr.viewOnceMessage?.message ||
             curr.viewOnceMessageV2?.message ||
             curr.viewOnceMessageV2Extension?.message ||
             curr.documentWithCaptionMessage?.message ||
             curr.editedMessage?.message?.protocolMessage?.editedMessage;
    }
    return curr;
  }

  /**
   * Process message and execute command if prefixed or standalone keyword
   */
  async handleMessage(sock, msg) {
    if (!msg.message) return false;

    // Secondary execution lock: Never re-execute a message that has already executed a command
    if (msg.key?.id && this.executedMessageIds.has(msg.key.id)) {
      return false;
    }

    const rawFrom = msg.key.remoteJid || '';
    const isGroup = rawFrom.endsWith('@g.us');
    const from = (isGroup || !rawFrom.includes(':'))
      ? rawFrom
      : rawFrom.split(':')[0] + '@s.whatsapp.net';

    let sender = from;
    if (isGroup) {
      if (msg.key.fromMe) {
        sender = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : (msg.key.participant || from);
      } else {
        sender = msg.key.participant || msg.participant || from;
      }
    } else if (msg.key.fromMe) {
      sender = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : from;
    }

    // Extract text content from unwrapped message types (supports deviceSentMessage & disappearing chats)
    const unwrapped = this.unwrapMessage(msg.message);
    const text = (
      unwrapped.conversation ||
      unwrapped.extendedTextMessage?.text ||
      unwrapped.imageMessage?.caption ||
      unwrapped.videoMessage?.caption ||
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''
    ).trim();

    if (!text) return false;

    let cmdName = null;
    let args = [];

    const matchedPrefix = this.getPrefix(text);
    if (matchedPrefix) {
      args = text.slice(matchedPrefix.length).trim().split(/\s+/);
      cmdName = args.shift().toLowerCase();

      // Normalize multi-word commands e.g. '.reset spam' or '.resert spam' -> 'resetspam'
      if ((cmdName === 'reset' || cmdName === 'resert' || cmdName === 'clear') && args[0]?.toLowerCase() === 'spam') {
        cmdName = 'resetspam';
        args.shift();
      }
    } else {
      // Also check if user typed standalone keyword like 'menu', 'meni', 'help'
      const words = text.split(/\s+/);
      const firstWord = words[0].toLowerCase();
      if (firstWord === 'menu' || firstWord === 'meni' || firstWord === 'help') {
        cmdName = firstWord;
        args = words.slice(1);
      } else {
        return false;
      }
    }

    const command = this.getCommand(cmdName);
    if (!command) return false;

    console.log(`[CommandHandler] Executing command: '${cmdName}' from ${sender} (isGroup: ${isGroup}, fromMe: ${msg.key.fromMe})`);

    let groupMetadata = null;
    if (isGroup) {
      try {
        groupMetadata = await groupMetadataCache.getGroupMetadata(sock, from);
      } catch (e) {}

      // Fallback: If cache returned null or empty participants, attempt direct fetch from socket
      if ((!groupMetadata || !Array.isArray(groupMetadata.participants) || groupMetadata.participants.length === 0) && typeof sock.groupMetadata === 'function') {
        try {
          groupMetadata = await sock.groupMetadata(from);
          if (groupMetadata && Array.isArray(groupMetadata.participants) && groupMetadata.participants.length > 0) {
            groupMetadataCache.set(from, groupMetadata);
          }
        } catch (e) {}
      }
    }

    // If bot is disabled in this group, only allow .bot command from admins/owner
    if (isGroup && !groupModerator.isBotEnabledInGroup(from)) {
      const isBotPowerCmd = cmdName === 'bot' || cmdName === 'viruz' || cmdName === 'switch' || cmdName === 'power';
      if (!isBotPowerCmd) {
        return false;
      }
    }

    // Anti-Ban Protection: Prevent unknown users from flooding commands in DMs
    if (!isGroup && !msg.key.fromMe && !safety.isOwner(sender)) {
      if (!safety.canExecuteDmCommand(sender)) {
        await sock.sendMessage(from, {
          text: '⏳ *Anti-Ban Rate Limit:*\nYou are sending commands too quickly in private chat. Please wait a minute.'
        }, { quoted: msg });
        return false;
      }
      safety.recordDmCommand(sender);
    }

    // Anti-Ban Telemetry: Simulate real WhatsApp client read receipt (non-blocking in background)
    if (typeof sock.readMessages === 'function' && msg.key && !msg.key.fromMe) {
      try {
        sock.readMessages([msg.key]).catch(() => {});
      } catch (e) {}
    }

    const botJid = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : '';

    try {
      await command.execute({
        sock,
        msg,
        from,
        sender,
        isGroup,
        groupMetadata,
        botJid,
        args,
        text,
        commandName: cmdName
      });
      if (msg.key?.id) {
        this.executedMessageIds.add(msg.key.id);
        if (this.executedMessageIds.size > 20_000) {
          const oldest = this.executedMessageIds.values().next().value;
          this.executedMessageIds.delete(oldest);
        }
      }
      return true;
    } catch (err) {
      console.error(`[CommandHandler] Error executing command ${cmdName}:`, err);
      await sock.sendMessage(from, {
        text: `⚠️ *Command Error (${cmdName}):* ${err.message}`
      }, { quoted: msg });
      return true;
    }
  }
}

module.exports = new CommandHandler();
