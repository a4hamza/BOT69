const moderator = require('../../lib/groupModerator');
const welcomeHandler = require('../../lib/welcomeHandler');
const { atlasBox } = require('../../lib/utils');

module.exports = {
  name: 'warn',
  aliases: ['warning', 'warnuser', 'resetwarn', 'unwarn'],
  category: 'group',
  description: 'Warn a group member with admin attribution (Shows Admin Name, auto-kicks at 6 warnings)',
  usage: '.warn @user [reason] | .warn reset @user',
  async execute({ sock, msg, from, isGroup, sender, groupMetadata, botJid, args, commandName }) {
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
        text: '⛔ *Access Denied!*\nThe `.warn` command is exclusively reserved for Group Admins.'
      }, { quoted: msg });
    }

    const isResetCommand = (commandName === 'resetwarn' || commandName === 'unwarn' || args[0]?.toLowerCase() === 'reset' || args[0]?.toLowerCase() === 'clear');

    // Filter args if 'reset' or 'clear' was passed as first argument
    const effectiveArgs = (args[0]?.toLowerCase() === 'reset' || args[0]?.toLowerCase() === 'clear')
      ? args.slice(1)
      : args;

    // Determine target user using universal resolution (quoted message, mention, or typed number)
    const resolved = moderator.resolveTarget(msg, effectiveArgs, groupMetadata);
    const targetJid = resolved.targetJid;
    const quoted = resolved.isQuoted;

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: '❌ *Usage Error!*\nPlease mention `@user` or reply to their message to warn.\n\n*Commands:*\n• `.warn @user [reason]` - Issue a warning\n• `.warn reset @user` - Reset user warnings'
      }, { quoted: msg });
    }

    const targetPhone = targetJid.split('@')[0].split(':')[0];
    const adminPhone = sender.split('@')[0].split(':')[0];
    const adminName = (msg.pushName || '').trim();
    const adminDisplay = adminName ? `${adminName} (@${adminPhone})` : `@${adminPhone}`;

    // ── Subcommand: RESET WARNINGS & SPAM ──
    if (isResetCommand) {
      const resetResult = moderator.resetSpam(from, targetJid);
      const previousCount = resetResult.warnCount;
      const resetBody = `
👤 *User:* @${targetPhone}
👮‍♂️ *Reset By (Admin):* ${adminDisplay}
🔄 *Status:* Warnings and spam limits cleared (was ${previousCount}/${moderator.maxWarnings} warns).
✅ User warning count has been reset to [ 0 / ${moderator.maxWarnings} ].
`.trim();

      const output = atlasBox('WARNINGS RESET', resetBody, 'VIRUZ • GROUP MODERATION');
      return sock.sendMessage(from, {
        text: output,
        mentions: [targetJid, sender]
      }, { quoted: msg });
    }

    // ── Check if target can be warned (Admins can warn each other, bot/self protected) ──
    const check = moderator.canWarnUser(targetJid, botJid, groupMetadata, sender);
    if (!check.allowed) {
      return sock.sendMessage(from, { text: check.reason }, { quoted: msg });
    }

    // Extract reason
    let reason = '';
    if (quoted) {
      reason = effectiveArgs.join(' ').trim();
    } else {
      // Exclude mention or number argument
      reason = effectiveArgs.slice(1).join(' ').trim();
    }
    if (!reason) {
      reason = 'Rule violation / Inappropriate behavior';
    }

    // Check if target is an Admin (Admins are NEVER kicked by warnings)
    const isTargetAdmin = moderator.isGroupAdmin(targetJid, groupMetadata);

    // Add warning
    const result = moderator.addWarning(from, targetJid, sender, adminName, reason);

    // ── Max Warning (6th or higher) ──
    if (result.isMax || result.count >= result.max) {
      // RULE: Admins can warn each other, but CAN NEVER be kicked automatically or by warnings!
      if (isTargetAdmin) {
        const adminImmunityBody = `
👤 *Warned Admin:* @${targetPhone} 🛡️
👮‍♂️ *Issued By (Admin):* ${adminDisplay}
📝 *Reason:* ${reason}
🛑 *Warning Level:* [ ${result.count} / ${result.max} ] — LIMIT REACHED
🛡️ *Action Taken:* Admin Protection Active! Admins can give warnings to each other, but can NEVER be kicked automatically or removed by warnings.
`.trim();

        const output = atlasBox('⚠️ ADMIN WARNING LIMIT (IMMUNITY)', adminImmunityBody, 'VIRUZ • GROUP MODERATION');
        return sock.sendMessage(from, {
          text: output,
          mentions: [targetJid, sender]
        }, { quoted: msg });
      }

      // NORMAL MEMBERS: Auto-kick once warning limit is reached
      let kickSuccess = false;
      try {
        welcomeHandler.recordKick(from, targetJid, sender);
        await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
        moderator.resetWarnings(from, targetJid);
        kickSuccess = true;
      } catch (err) {
        console.error(`[Warn Command] Failed to kick ${targetJid}:`, err.message);
      }

      const kickActionText = kickSuccess
        ? `User has reached ${result.max} warnings and has been automatically kicked from the group.`
        : `User reached ${result.max} warnings (Auto-kick failed: Ensure bot has Admin rights!).`;

      const finalBody = `
👤 *Warned User:* @${targetPhone}
👮‍♂️ *Issued By (Admin):* ${adminDisplay}
📝 *Reason:* ${reason}
🛑 *Warning Level:* [ ${result.count} / ${result.max} ] — LIMIT EXCEEDED
🚪 *Action Taken:* ${kickActionText}
`.trim();

      const output = atlasBox('FINAL WARNING & AUTO-KICK', finalBody, 'VIRUZ • GROUP MODERATION');
      return sock.sendMessage(from, {
        text: output,
        mentions: [targetJid, sender]
      }, { quoted: msg });
    }

    // ── Warnings below limit (1st to 5th) ──
    const remaining = Math.max(0, result.max - result.count);
    let noticeText = '';
    let targetLabel = `@${targetPhone}`;

    if (isTargetAdmin) {
      targetLabel = `@${targetPhone} 🛡️ (Admin)`;
      noticeText = `Admin warning issued. You have ${remaining} warning${remaining !== 1 ? 's' : ''} until limit is reached. Note: Admins can warn each other, but will never be kicked automatically.`;
    } else {
      noticeText = `You have ${remaining} warning${remaining > 1 ? 's' : ''} remaining. Reaching ${result.max} warnings will result in an immediate KICK from the group!`;
    }

    const warnBody = `
👤 *Warned User:* ${targetLabel}
👮‍♂️ *Issued By (Admin):* ${adminDisplay}
📝 *Reason:* ${reason}
🛑 *Warning Level:* [ ${result.count} / ${result.max} ]
⚠️ *Notice:* ${noticeText}
`.trim();

    const output = atlasBox(`⚠️ ADMIN WARNING (${result.count}/${result.max})`, warnBody, 'VIRUZ • GROUP MODERATION');
    return sock.sendMessage(from, {
      text: output,
      mentions: [targetJid, sender]
    }, { quoted: msg });
  }
};
