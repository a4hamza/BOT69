const moderator = require('../../lib/groupModerator');
const safety = require('../../lib/safety');
const { atlasBox } = require('../../lib/utils');

module.exports = {
  name: 'tagall',
  aliases: [], // Removed 'everyone' and 'all' to prevent accidental mass tagging
  category: 'group',
  description: 'Broadcast announcement with group roster (no background ghost-tagging)',
  usage: '.tagall [announcement_message]',
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
        text: '⛔ *Access Denied!*\nOnly Group Admins can use this command.'
      }, { quoted: msg });
    }

    // Anti-Ban Cooldown: Limit announcements to once every 30s per group (bypass for bot host / owner)
    const cooldownSec = safety.getMassMentionCooldown('tagall', from);
    if (cooldownSec > 0 && !msg.key.fromMe && !safety.isOwner(sender)) {
      return sock.sendMessage(from, {
        text: `⏳ *Anti-Ban Cooldown:*\nPlease wait ${cooldownSec}s before using .tagall again to protect the bot from WhatsApp restrictions.`
      }, { quoted: msg });
    }
    safety.recordMassMention('tagall', from);

    const subject = groupMetadata?.subject || 'Group';
    const participants = groupMetadata?.participants || [];
    const customMsg = args.join(' ') || 'Attention everyone!';

    const body = `📢 *Announcement:* ${customMsg}\n👥 *Group:* ${subject}\n📊 *Total Members:* ${participants.length}`;
    const output = atlasBox(`ANNOUNCEMENT • ${subject}`, body);
    await sock.sendMessage(from, { text: output }, { quoted: msg });
  }
};
