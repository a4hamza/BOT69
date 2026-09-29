const moderator = require('../../lib/groupModerator');
const config = require('../../config');
const safety = require('../../lib/safety');
const { atlasBox } = require('../../lib/utils');

module.exports = {
  name: 'resetspam',
  aliases: ['resertspam', 'resert', 'restspam', 'clearspam', 'unspam', 'clearwarn', 'resetspams'],
  category: 'group',
  description: 'Reset sticker spam, message spam warning limits and official warnings for a group member',
  usage: '.resetspam @user | .resetspam <number> | .resetspam <name> | (reply with .resetspam)',
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

    // Admin exclusive command check (with fresh metadata fetch retry)
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
        text: '⛔ *Access Denied!*\nThe `.resetspam` command is exclusively reserved for Group Admins.'
      }, { quoted: msg });
    }

    // Resolve target user using universal resolution (quoted message, mention, phone number, or name)
    const resolved = moderator.resolveTarget(msg, args, groupMetadata);
    const targetJid = resolved.targetJid;

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: '❌ *Missing Target User!*\nPlease mention `@user`, reply to their message, or specify their phone number or name.\n\n*Usage:*\n• `.resetspam @user` - Reset user\'s spam limits & warnings\n• `.resetspam 923001234567` - Reset by phone number\n• `.resetspam <name>` - Reset by participant name\n• Reply to any message with `.resetspam`'
      }, { quoted: msg });
    }

    const targetPhone = targetJid.split('@')[0].split(':')[0];
    const adminPhone = sender.split('@')[0].split(':')[0];
    const adminName = (msg.pushName || '').trim();
    const adminDisplay = adminName ? `${adminName} (@${adminPhone})` : `@${adminPhone}`;

    // Fast in-memory reset of sticker spam, message spam, and warnings (0% CPU/RAM load)
    const result = moderator.resetSpam(from, targetJid);

    const body = `
👤 *Target Member:* @${targetPhone}
👮‍♂️ *Reset By (Admin):* ${adminDisplay}

🧹 *Spam Limits & History Cleared:*
• 🎨 Sticker Spam Limit: Reset (was ${result.stickerCount}/${config.antiSpam.stickerKickThreshold})
• 💬 Message Spam Limit: Reset (was ${result.messageCount}/${config.antiSpam.messageKickThreshold})
• ⚠️ Group Warnings: Reset to [ 0 / ${moderator.maxWarnings} ] (cleared ${result.warnCount})

✅ All spam limits & warnings for @${targetPhone} have been completely reset!
`.trim();

    const output = atlasBox('SPAM LIMITS RESET', body, 'VIRUZ • GROUP MODERATION');

    // Anti-GhostTag Protection: ONLY mention the specific target user and admin, NEVER tag the whole group
    const sentMsg = await sock.sendMessage(from, {
      text: output,
      mentions: [targetJid, sender]
    }, { quoted: msg });

    if (sentMsg?.key?.id) {
      safety.markSentByBot(sentMsg.key.id);
    }
  }
};
