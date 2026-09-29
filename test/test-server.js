/**
 * Integration Test for Express Web Server & API Endpoints
 */

const assert = require('assert');
const config = require('../config');
const { server } = require('../index');

async function testServer() {
  console.log('🌐 Testing Web Server and API Endpoints...');
  const baseUrl = `http://localhost:${config.port}`;
  await new Promise(r => setTimeout(r, 1000));

  // 1. Test /api/status
  const statusRes = await fetch(`${baseUrl}/api/status`);
  assert.strictEqual(statusRes.status, 200, 'Status endpoint should return 200');
  const statusData = await statusRes.json();
  assert(statusData.botName === 'VIRUS' || statusData.botName === 'VIRUZ', 'Bot name should be VIRUS');
  console.log('  ✅ GET /api/status verified.');

  // 2. Test /api/test-game for Mobile Legends
  const mlRes = await fetch(`${baseUrl}/api/test-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'ml', query: '1114917746 13486' })
  });
  assert.strictEqual(mlRes.status, 200, 'Test-game endpoint should return 200');
  const mlData = await mlRes.json();
  assert(mlData.success === true, 'Response success should be true');
  assert(mlData.formattedText.includes('Mobile Legends') || mlData.formattedText.includes('MOBILE LEGENDS'), 'Formatted text should contain Mobile Legends');
  console.log('  ✅ POST /api/test-game (.ml) verified.');

  // 3. Test /api/test-game rejects removed games (Genshin, PUBG, etc.)
  const giRes = await fetch(`${baseUrl}/api/test-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'genshin', query: '700012345' })
  });
  assert.strictEqual(giRes.status, 400, 'Genshin should return 400 unsupported');
  console.log('  ✅ POST /api/test-game (.genshin) correctly rejected as unsupported.');

  const pubgRes = await fetch(`${baseUrl}/api/test-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'pubg', query: '5123456789' })
  });
  assert.strictEqual(pubgRes.status, 400, 'PUBG should return 400 unsupported');
  console.log('  ✅ POST /api/test-game (.pubg) correctly rejected as unsupported.');

  // 4. Test Web Dashboard HTML static serving
  const pageRes = await fetch(`${baseUrl}/`);
  assert.strictEqual(pageRes.status, 200, 'Root HTML page should return 200');
  const pageHtml = await pageRes.text();
  assert(pageHtml.includes('VIRUS') || pageHtml.includes('VIRUZ'), 'HTML should contain VIRUS title');
  assert(pageHtml.includes('Link Bot to Your WhatsApp'), 'HTML should contain pairing portal');
  console.log('  ✅ Static Webpage (index.html) serving verified.');

  console.log('\n🎉 ALL WEB SERVER INTEGRATION TESTS PASSED! 🎉\n');
  if (server) server.close();
  process.exit(0);
}

testServer().catch(err => {
  console.error('❌ Server test failure:', err);
  if (server) server.close();
  process.exit(1);
});
