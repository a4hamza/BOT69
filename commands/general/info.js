const os = require('os');
const { atlasBox, formatUptime } = require('../../lib/utils');
const config = require('../../config');
const antiDelete = require('../../lib/antiDelete');

module.exports = {
  name: 'info',
  aliases: ['botinfo', 'status'],
  category: 'general',
  description: 'View system and bot operational status',
  usage: '.info',
  async execute({ sock, msg, from }) {
    const uptime = formatUptime(process.uptime());
    const ramUsed = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const antiDeleteStatus = antiDelete.isEnabled() ? '🟢 Active (Stealth Inbox)' : '🔴 Disabled';

    const body = `
🤖 *Bot Name:* ${config.botName}
👑 *Developer:* ${config.ownerName}
⏱️ *Uptime:* ${uptime}
💾 *RAM Footprint:* ${ramUsed} MB / ${totalRam} GB
⚡ *Host Load:* Optimized (Zero-Lag Memory Caching)
🛡️ *Anti-Delete:* ${antiDeleteStatus}
🎮 *Supported Games:* Mobile Legends: Bang Bang
🎙️ *Voice Engine:* Voicevox Anime Studio (Authentic)
`.trim();

    const output = atlasBox('SYSTEM & BOT STATUS', body);
    await sock.sendMessage(from, { text: output }, { quoted: msg });
  }
};
