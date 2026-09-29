const { atlasBox } = require('../../lib/utils');
const config = require('../../config');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'meni', 'menú', 'list', 'alive'],
  category: 'general',
  description: 'Show full bot menu and list of available commands',
  usage: '.menu',
  async execute({ sock, msg, from }) {
    const p = config.prefix;

    const body = `
👋 *Welcome to VIRUS WhatsApp Bot (BOT 69)*
👑 *Owner:* ${config.ownerName}
⚡ Lightweight • Ultra Fast • Anti-Ban Protected
Prefixes: \`${p}\` (also supports \`,\` \`!\` \`#\` \`/\`)

🎮 *MOBILE LEGENDS ACCOUNT CHECKER:*
• \`${p}ml <account_id> <zone_id>\` - Live MLBB account info (Nickname, Server ID, Player ID, exact Country Flag 🇮🇩 🇵🇰 🇵🇭 🇲🇾, Region & Status)
  _Example:_ \`${p}ml 1114917746 13486\` or \`${p}ml 1114917746(13486)\`

🎙️ *AUTHENTIC TTS & CHARACTER VOICES:*
• \`${p}sara <msg>\` - Sara (Authentic Pakistani Urdu & English Girl 🧕)
• \`${p}gul <msg>\` - Gul (Soft Expressive Urdu Girl 🌸)
• \`${p}asad <msg>\` - Asad (Authentic Pakistani Urdu Male 🧔)
• \`${p}loli <msg>\` - Anya / Cute Anime Loli 🌸
• \`${p}goku <msg>\` - Son Goku (Super Saiyan 💥)
• \`${p}gojo <msg>\` - Satoru Gojo (The Honored One 🤞)
• \`${p}sukuna <msg>\` - Ryomen Sukuna (King of Curses 🩸)
• \`${p}ben10 <msg>\` - Ben Tennyson (Classic 2005 ⌚)
• \`${p}naruto <msg>\` - Naruto Uzumaki (Seventh Hokage 🍥)
• \`${p}tts <voice> <msg>\` - Speak in any voice style
• \`${p}tts list\` - View all 20+ available anime & languages
• \`${p}tts [on/off]\` - Toggle TTS in group (Admins only)

🛡️ *GROUP MODERATION (Admins Only):*
• \`${p}warn @user [reason]\` - Issue formal warning to member
• \`${p}warn reset @user\` - Reset warning count for user
• \`${p}resetspam @user\` - Reset user's spam limit (or \`.reset spam\`)
• \`${p}kick @user\` - Remove member from group (Admins protected)
• \`${p}add <phone>\` - Add member by phone number
• \`${p}mute\` - Close group chat (admins only send)
• \`${p}unmute\` - Open group chat for all members
• \`${p}welcome [on/off]\` - Toggle auto welcome & goodbye
• \`${p}groupinfo\` - Group settings and active thresholds

⚙️ *AUTOMATIC ANTI-SPAM SYSTEM:*
• *Message Spam:* 5 same messages = Warning ⚠️ | 6th = Auto-Kick 🚫
• *Sticker Spam:* 5 rapid stickers = Warning ⚠️ | 6th = Auto-Kick 🚫
• *Mentions:* Mentions ONLY the user by real phone number (No mass ping!)
• *Admins:* 100% Protected (Never warned or kicked for spam)

🔒 *STEALTH ANTI-DELETE & AUTO VIEW-ONCE:*
• *Auto View-Once:* View-Once media is captured silently and delivered to your private DM!
• \`${p}viewonce\` (or \`${p}vv\`) - Manual reply to download View-Once media
• \`${p}antidelgroup [on/off]\` - Toggle group deleted message recovery to owner DM
• \`${p}antidelete [on/off]\` - Toggle private deleted message recovery to owner DM
• *Stealth Delivery:* No alerts sent in chat; delivered directly to your inbox.

ℹ️ *BOT UTILITIES:*
• \`${p}bot [on/off]\` - Enable / disable bot in current group
• \`${p}ping\` - Check bot response speed and latency
• \`${p}info\` - Bot system status and owner details
• \`${p}menu\` - Open this command menu
`.trim();

    const output = atlasBox('VIRUS • BOT 69 MENU', body, 'VIRUS • BOT 69');
    await sock.sendMessage(from, { text: output }, { quoted: msg });
  }
};
