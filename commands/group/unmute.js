const moderator = require('../../lib/groupModerator');

module.exports = {
  name: 'unmute',
  aliases: ['opengroup', 'open'],
  category: 'group',
  description: 'Unmute group chat so all members can send messages',
  usage: '.unmute',
  async execute({ sock, msg, from, isGroup, sender, groupMetadata }) {
    if (!isGroup) {
      return sock.sendMessage(from, { text: '❌ This command can only be used in group chats!' }, { quoted: msg });
    }

    // Ensure we have valid groupMetadata with participants
    if ((!groupMetadata || !Array.isArray(groupMetadata.participants) || groupMetadata.participants.length === 0) && typeof sock.groupMetadata === 'function') {
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (e) {}
    }

    // Verify sender is admin (with automatic fresh fetch retry in case of recent promotions)
    let isAdmin = moderator.isGroupAdmin(sender, groupMetadata, msg);
    if (!isAdmin && typeof sock.groupMetadata === 'function') {
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

    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ *Access Denied!*\nOnly Group Admins can unmute the group.'
      }, { quoted: msg });
    }

    // Attempt to unmute group directly via WhatsApp API
    try {
      await sock.groupSettingUpdate(from, 'not_announcement');
      return sock.sendMessage(from, {
        text: '🔓 *Group Unmuted!*\nAll members can now send messages.'
      }, { quoted: msg });
    } catch (err) {
      const errMsg = (err.message || '').toLowerCase();
      const statusCode = err.output?.statusCode || err.status || 0;
      if (errMsg.includes('not-authorized') || errMsg.includes('forbidden') || errMsg.includes('401') || errMsg.includes('403') || statusCode === 401 || statusCode === 403) {
        return sock.sendMessage(from, {
          text: '⚠️ *Action Failed: Bot is not an Admin!*\nPlease promote the bot to Group Admin so it can change group settings.'
        }, { quoted: msg });
      }
      return sock.sendMessage(from, {
        text: `❌ *Failed to unmute group:* ${err.message}`
      }, { quoted: msg });
    }
  }
};
