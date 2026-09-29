const { atlasBox } = require('../../lib/utils');
const config = require('../../config');

module.exports = {
  name: 'groupinfo',
  aliases: ['gcinfo', 'infogroup'],
  category: 'group',
  description: 'View group details, admin list, and active anti-spam rules',
  usage: '.groupinfo',
  async execute({ sock, msg, from, isGroup, groupMetadata }) {
    if (!isGroup) {
      return sock.sendMessage(from, { text: '❌ This command can only be used in group chats!' }, { quoted: msg });
    }

    // Ensure we have valid groupMetadata with participants
    if ((!groupMetadata || !Array.isArray(groupMetadata.participants) || groupMetadata.participants.length === 0) && typeof sock.groupMetadata === 'function') {
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (e) {}
    }

    const subject = groupMetadata?.subject || 'Group Chat';
    const groupId = groupMetadata?.id || from;
    const participants = groupMetadata?.participants || [];
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true);

    const body = `
👥 *Group Name:* ${subject}
🆔 *Group ID:* ${groupId}
👑 *Total Members:* ${participants.length}
🛡️ *Admins:* ${admins.length}

🛡️ *ACTIVE MODERATION RULES:*
• *Sticker Spam:* Warning at ${config.antiSpam.stickerWarningThreshold} | Kick at ${config.antiSpam.stickerKickThreshold}
• *Message Spam:* Warning at ${config.antiSpam.messageWarningThreshold} | Kick at ${config.antiSpam.messageKickThreshold}
• *Admin Protection:* ✅ Admins can warn each other but can NEVER be kicked automatically
• *Exclusive Commands:* .kick, .warn, .tagall, .hidetag, .mute, .unmute
`.trim();

    const output = atlasBox('GROUP INFORMATION', body);
    await sock.sendMessage(from, { text: output }, { quoted: msg });
  }
};
