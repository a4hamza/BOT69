module.exports = {
  name: 'ping',
  aliases: ['speed', 'p'],
  category: 'general',
  description: 'Check bot response latency',
  usage: '.ping',
  async execute({ sock, msg, from }) {
    const start = Date.now();
    const sent = await sock.sendMessage(from, { text: '⚡ _Pinging..._' }, { quoted: msg });
    const latency = Date.now() - start;
    await sock.sendMessage(from, {
      text: `🚀 *Pong!* \`${latency}ms\`\nStatus: *VIRUZ is Online & Active*`
    }, { quoted: sent });
  }
};
