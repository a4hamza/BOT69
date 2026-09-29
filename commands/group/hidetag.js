const moderator = require('../../lib/groupModerator');
const safety = require('../../lib/safety');

module.exports = {
  name: 'hidetag',
  aliases: ['htag'], // Removed 'tag' to prevent accidental background ghost-tagging
  category: 'group',
  description: 'Send a clean group announcement without background mass-tagging',
  usage: '.hidetag <message>',
  async execute({ sock, msg, from, isGroup, sender, groupMetadata, args }) {
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
        text: '⛔ *Access Denied!*\nOnly Group Admins can use hidetag.'
      }, { quoted: msg });
    }

    // Anti-Ban Cooldown: Limit announcements to once every 30s per group (bypass for bot host / owner)
    const cooldownSec = safety.getMassMentionCooldown('hidetag', from);
    if (cooldownSec > 0 && !msg.key.fromMe && !safety.isOwner(sender)) {
      return sock.sendMessage(from, {
        text: `⏳ *Anti-Ban Cooldown:*\nPlease wait ${cooldownSec}s before using .hidetag again to protect the bot from WhatsApp restrictions.`
      }, { quoted: msg });
    }
    safety.recordMassMention('hidetag', from);

    const text = args.join(' ') || '📢 Group Notification';
    // Deliver message cleanly WITHOUT silent background mass mentions
    await sock.sendMessage(from, { text });
  }
};
