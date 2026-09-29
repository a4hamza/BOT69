const antiDelete = require('../../lib/antiDelete');
const safety = require('../../lib/safety');
const moderator = require('../../lib/groupModerator');

module.exports = {
  name: 'antidelete',
  aliases: ['antidelet', 'antidel', 'antirevoke', 'antidelgroup', 'antideletegroup', 'antidelgrp', 'antirevokegroup'],
  category: 'admin',
  description: 'Enable, disable or check stealth Anti-Delete for Private DMs and Group chats',
  usage: '.antidelete [on/off/status] | .antidelgroup [on/off/status]',
  async execute({ sock, msg, from, sender, isGroup, groupMetadata, args, commandName }) {
    const isOwner = safety.isOwner(sender) || msg.key.fromMe;
    const isAdmin = isGroup && moderator.isGroupAdmin(sender, groupMetadata, msg);
    const cmd = (commandName || '').toLowerCase();
    const firstArg = args[0]?.toLowerCase();
    const secondArg = args[1]?.toLowerCase();

    // Check if targeting group anti-delete: via .antidelgroup command OR .antidelete group <action>
    const isGroupCmd = cmd.includes('group') || cmd.includes('grp') || firstArg === 'group' || firstArg === 'gc';
    const action = (firstArg === 'group' || firstArg === 'gc') ? secondArg : firstArg;

    if (isGroupCmd) {
      if (!isOwner && !isAdmin) {
        return sock.sendMessage(from, {
          text: '⛔ *Access Denied!*\nOnly the Bot Owner or Group Admins can configure Group Anti-Delete.'
        }, { quoted: msg });
      }

      if (action === 'on' || action === 'enable' || action === '1') {
        antiDelete.setGroupEnabled(true);
        return sock.sendMessage(from, {
          text: '🛡️ *Group Anti-Delete Enabled!* 🟢\n\nAll deleted messages from group chats will be recovered stealthily and delivered directly to the bot owner\'s private inbox (DM).\n_No notifications or alerts are sent into the group._'
        }, { quoted: msg });
      }

      if (action === 'off' || action === 'disable' || action === '0') {
        antiDelete.setGroupEnabled(false);
        return sock.sendMessage(from, {
          text: '⚠️ *Group Anti-Delete Disabled!* 🔴\nDeleted messages from group chats will not be captured.'
        }, { quoted: msg });
      }

      if (action === 'toggle') {
        antiDelete.setGroupEnabled(!antiDelete.isGroupEnabled());
        const newStatus = antiDelete.isGroupEnabled() ? '🟢 *ENABLED* (Sent to Private DM)' : '🔴 *DISABLED*';
        return sock.sendMessage(from, {
          text: `🛡️ *Group Anti-Delete Status:* ${newStatus}`
        }, { quoted: msg });
      }

      // Default for group: Show status
      const status = antiDelete.isGroupEnabled() ? '🟢 *ENABLED* (Stealth Owner DM)' : '🔴 *DISABLED*';
      return sock.sendMessage(from, {
        text: `🛡️ *Group Anti-Delete Status:* ${status}\n\n• Use \`.antidelgroup on\` to activate for groups.\n• Use \`.antidelgroup off\` to deactivate for groups.\n\n_Note: For private direct messages, use \`.antidelete on/off\`._`
      }, { quoted: msg });
    }

    // Otherwise, handle Private Anti-Delete (.antidelete on/off/toggle)
    if (action === 'on' || action === 'enable' || action === '1') {
      if (!isOwner) {
        return sock.sendMessage(from, {
          text: '⛔ *Access Denied!*\nOnly the bot owner can configure Anti-Delete.'
        }, { quoted: msg });
      }
      antiDelete.setPrivateEnabled(true);
      return sock.sendMessage(from, {
        text: '🛡️ *Private Chat Anti-Delete Enabled!* 🟢\n\nAll deleted messages in private chats (DMs) will be caught stealthily and sent directly to your inbox.\n_Note: For group chats, use `.antidelgroup on`._'
      }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      if (!isOwner) {
        return sock.sendMessage(from, {
          text: '⛔ *Access Denied!*\nOnly the bot owner can configure Anti-Delete.'
        }, { quoted: msg });
      }
      antiDelete.setPrivateEnabled(false);
      return sock.sendMessage(from, {
        text: '⚠️ *Private Chat Anti-Delete Disabled!* 🔴\nDeleted messages from private DMs will not be recovered.'
      }, { quoted: msg });
    }

    if (action === 'toggle') {
      if (!isOwner) {
        return sock.sendMessage(from, {
          text: '⛔ *Access Denied!*\nOnly the bot owner can configure Anti-Delete.'
        }, { quoted: msg });
      }
      antiDelete.setPrivateEnabled(!antiDelete.isPrivateEnabled());
      const newStatus = antiDelete.isPrivateEnabled() ? '🟢 *ENABLED*' : '🔴 *DISABLED*';
      return sock.sendMessage(from, {
        text: `🛡️ *Private Anti-Delete Status:* ${newStatus}`
      }, { quoted: msg });
    }

    // Default: Show full status for both Private DM and Group
    const privStatus = antiDelete.isPrivateEnabled() ? '🟢 *ENABLED* (Private DM)' : '🔴 *DISABLED*';
    const grpStatus = antiDelete.isGroupEnabled() ? '🟢 *ENABLED* (Sent to DM)' : '🔴 *DISABLED*';

    await sock.sendMessage(from, {
      text: `🛡️ *VIRUS ANTI-DELETE STATUS:*\n\n` +
            `• *Private Chats (DM):* ${privStatus}\n` +
            `• *Group Chats (GC):* ${grpStatus}\n\n` +
            `_Control Commands:_\n` +
            `• \`.antidelete on / off\` - Toggle for private messages\n` +
            `• \`.antidelgroup on / off\` - Toggle for group messages\n\n` +
            `📌 _All recovered deleted messages arrive directly in your private DM inbox without alerting other users._`
    }, { quoted: msg });
  }
};
