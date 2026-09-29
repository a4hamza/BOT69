/**
 * Bot On/Off Master Switch — Group Admins & Owner
 * .bot on  — Enable all bot features
 * .bot off — Disable all bot features
 */

const safety = require('../../lib/safety');
const moderator = require('../../lib/groupModerator');
const { getAizenAuthenticBuffer } = require('../../lib/heroVoices');

module.exports = {
  name: 'bot',
  aliases: ['viruz', 'switch', 'power'],
  category: 'admin',
  description: 'Turn the bot on or off (Group Admins & Owner)',
  usage: '.bot [on/off]',
  async execute({ sock, msg, from, sender, isGroup, groupMetadata, args }) {
    if (isGroup && (!groupMetadata || !Array.isArray(groupMetadata.participants) || groupMetadata.participants.length === 0) && typeof sock.groupMetadata === 'function') {
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (e) {}
    }

    const isOwner = safety.isOwner(sender) || msg.key.fromMe;
    let isAdmin = isGroup && moderator.isGroupAdmin(sender, groupMetadata, msg);
    if (!isOwner && !isAdmin && isGroup && typeof sock.groupMetadata === 'function') {
      try {
        const freshMeta = await sock.groupMetadata(from);
        if (freshMeta && Array.isArray(freshMeta.participants) && freshMeta.participants.length > 0) {
          groupMetadata = freshMeta;
          const groupMetadataCache = require('../../lib/groupMetadataCache');
          groupMetadataCache.set(from, freshMeta);
          isAdmin = moderator.isGroupAdmin(sender, groupMetadata, msg);
        }
      } catch (e) {}
    }

    if (!isOwner && !isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ *Access Denied!*\nOnly Group Admins and the Bot Owner can turn the bot on or off.'
      }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
      safety.setBotEnabled(true);
      const textMsg = await sock.sendMessage(from, {
        text: '✅ *VIRUZ Bot is now ONLINE!*\nAll commands, moderation, and features are active.'
      }, { quoted: msg });

      // Send authentic Aizen startup voice note response
      try {
        const aizenAudio = getAizenAuthenticBuffer();
        if (aizenAudio) {
          await sock.sendMessage(from, {
            audio: aizenAudio,
            mimetype: 'audio/mpeg',
            fileName: 'aizen_startup.mp3'
          }, { quoted: msg });
        }
      } catch (audioErr) {
        console.warn('[Bot On] Failed to send Aizen startup voice note:', audioErr.message);
      }

      return textMsg;
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      safety.setBotEnabled(false);
      return sock.sendMessage(from, {
        text: '🔴 *VIRUZ Bot is now OFFLINE!*\nAll commands are temporarily disabled.\nGroup Admins or the Owner can re-enable the bot anytime with `.bot on`.'
      }, { quoted: msg });
    }

    // No argument — show current status
    const status = safety.isBotEnabled() ? '🟢 *ONLINE*' : '🔴 *OFFLINE*';
    await sock.sendMessage(from, {
      text: `🤖 *VIRUZ Bot Status:* ${status}\n\n• Use \`.bot on\` to enable.\n• Use \`.bot off\` to disable.\n\n_Available to Group Admins and the Bot Owner._`
    }, { quoted: msg });
  }
};
