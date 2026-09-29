const { checkMobileLegends, parseMLBBInput } = require('../../lib/gameChecker');
const safety = require('../../lib/safety');

module.exports = {
  name: 'ml',
  aliases: ['mlbb', 'mobilelegends'],
  category: 'games',
  description: 'Check Mobile Legends account username, server, country with exact flag, and status',
  usage: '.ml <account_id> <zone_id>',
  async execute({ sock, msg, from, args }) {
    const rawInput = args.join(' ');
    const { id, zone } = parseMLBBInput(rawInput);

    if (!id || !zone) {
      const sent = await sock.sendMessage(from, {
        text: '❌ *Usage Error!*\nPlease provide both Account ID and Server/Zone ID.\n*Format:* `.ml <account_id> <zone_id>`\n*Example:* `.ml 1114917746 13486`'
      }, { quoted: msg });
      if (sent?.key?.id) safety.markSentByBot(sent.key.id);
      return;
    }

    const sentWait = await sock.sendMessage(from, { text: '🔍 _Fetching Mobile Legends account info..._' }, { quoted: msg });
    if (sentWait?.key?.id) safety.markSentByBot(sentWait.key.id);

    try {
      const result = await checkMobileLegends(id, zone);
      const sentRes = await sock.sendMessage(from, { text: result }, { quoted: msg });
      if (sentRes?.key?.id) safety.markSentByBot(sentRes.key.id);
    } catch (err) {
      const sentErr = await sock.sendMessage(from, { text: `❌ ${err.message}` }, { quoted: msg });
      if (sentErr?.key?.id) safety.markSentByBot(sentErr.key.id);
    }
  }
};
