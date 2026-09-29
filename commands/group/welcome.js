const welcomeHandler = require('../../lib/welcomeHandler');
const moderator = require('../../lib/groupModerator');

module.exports = {
  name: 'welcome',
  aliases: ['setwelcome', 'welcomemsg', 'autogoodbye'],
  category: 'group',
  description: 'Toggle auto welcome and goodbye notifications in group chat',
  usage: '.welcome [on/off]',
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
        text: '⛔ *Access Denied!*\nOnly Group Admins can configure Welcome & Goodbye notifications.'
      }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
      welcomeHandler.setGroupStatus(from, true);
      return sock.sendMessage(from, {
        text: '✅ *Auto Welcome & Goodbye Enabled!*\nThe bot will now automatically welcome new members and say goodbye when someone leaves or is kicked.'
      }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      welcomeHandler.setGroupStatus(from, false);
      return sock.sendMessage(from, {
        text: '⚠️ *Auto Welcome & Goodbye Disabled!*\nNo welcome or goodbye messages will be sent in this group.'
      }, { quoted: msg });
    }

    const currentStatus = welcomeHandler.isEnabled(from) ? '🟢 *ENABLED*' : '🔴 *DISABLED*';
    await sock.sendMessage(from, {
      text: `🔔 *Group Welcome & Goodbye Status:* ${currentStatus}\n\n• Use \`.welcome on\` to enable.\n• Use \`.welcome off\` to disable.`
    }, { quoted: msg });
  }
};
