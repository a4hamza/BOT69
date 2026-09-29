const moderator = require('../../lib/groupModerator');
const welcomeHandler = require('../../lib/welcomeHandler');
const safety = require('../../lib/safety');

module.exports = {
  name: 'kick',
  aliases: ['remove', 'ban'],
  category: 'group',
  description: 'Kick a member from the group (Admin exclusive, Admins protected)',
  usage: '.kick @user (or reply to user message)',
  async execute({ sock, msg, from, isGroup, sender, groupMetadata, botJid, args }) {
    if (!isGroup) {
      return sock.sendMessage(from, { text: '❌ This command can only be used in group chats!' }, { quoted: msg });
    }

    // Ensure we have valid groupMetadata with participants
    if ((!groupMetadata || !Array.isArray(groupMetadata.participants) || groupMetadata.participants.length === 0) && typeof sock.groupMetadata === 'function') {
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (e) {}
    }

    // REQUIREMENT: Admin exclusive command (with automatic fresh fetch retry in case of recent promotions)
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
        text: '⛔ *Access Denied!*\nThe `.kick` command is exclusively reserved for Group Admins.'
      }, { quoted: msg });
    }

    // Determine target user using universal resolution (quoted message, mention, or typed number)
    const resolved = moderator.resolveTarget(msg, args, groupMetadata);
    const targetJid = resolved.targetJid;

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: '❌ *Usage Error!*\nPlease mention `@user` or reply to their message to kick.\n*Example:* `.kick @user`'
      }, { quoted: msg });
    }

    // REQUIREMENT: Check if target can be kicked (Admins protected, no one can kick admins)
    const check = moderator.canKickUser(targetJid, botJid, groupMetadata);
    if (!check.allowed) {
      return sock.sendMessage(from, { text: check.reason }, { quoted: msg });
    }

    // Anti-Ban Pacing: Limit consecutive kicks
    if (!safety.canKick(from) && !msg.key.fromMe) {
      return sock.sendMessage(from, {
        text: '⏳ *Anti-Ban Pacing:*\nPlease wait a moment before kicking another member to protect the bot account.'
      }, { quoted: msg });
    }
    safety.recordKick(from);

    try {
      welcomeHandler.recordKick(from, targetJid, sender);
      await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
      if (!welcomeHandler.isEnabled(from)) {
        await sock.sendMessage(from, {
          text: `🚪 *Member Kicked!*\nSuccessfully removed @${targetJid.split('@')[0]} from the group.`,
          mentions: [targetJid]
        }, { quoted: msg });
      }
    } catch (err) {
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('not-authorized') || errMsg.includes('forbidden') || errMsg.includes('401') || errMsg.includes('403')) {
        await sock.sendMessage(from, {
          text: '⚠️ *Failed to kick:* Bot is not an Admin in this group! Please promote the bot to Admin.'
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, {
          text: `❌ *Failed to kick:* ${err.message}\n(Make sure the bot has Admin rights in this group!)`
        }, { quoted: msg });
      }
    }
  }
};
