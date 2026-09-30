/**
 * BOT69 (Identity: VIRUS) WhatsApp Bot & Web Pairing Server
 * Multi-Device WhatsApp Bot with MLBB Account Checker, Urdu/Anime TTS,
 * Auto-Kick Spam Moderation, Stealth Anti-Delete & View-Once, and Web Portal.
 * Owner: BOT 69
 */

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (
    msg.includes('MessageCounterError') ||
    msg.includes('Session error') ||
    msg.includes('Key used already or never filled') ||
    msg.includes('Bad MAC') ||
    msg.includes('No matching sessions found')
  ) {
    return;
  }
  console.log('[System Handled Exception]:', msg);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (
    msg.includes('MessageCounterError') ||
    msg.includes('Session error') ||
    msg.includes('Key used already or never filled') ||
    msg.includes('Bad MAC') ||
    msg.includes('No matching sessions found')
  ) {
    return;
  }
  console.log('[System Handled Rejection]:', msg);
});

// ── HYEHOST / Container Universal Dependency & Long Self-Healing ──
const fs = require('fs');
const path = require('path');

function copyDirRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) {}
  }
  try {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursiveSync(srcPath, destPath);
      } else {
        try { fs.copyFileSync(srcPath, destPath); } catch (e) {}
      }
    }
  } catch (e) {}
}

function healLongPackage() {
  const vendorLong = path.join(__dirname, 'vendor', 'long');
  if (!fs.existsSync(vendorLong)) return;

  const targets = [
    path.join(__dirname, 'node_modules', 'long'),
    path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'long'),
    path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'node_modules', 'long')
  ];

  for (const target of targets) {
    if (!fs.existsSync(path.join(target, 'index.js'))) {
      copyDirRecursiveSync(vendorLong, target);
    }
  }
}

// 1. Initial heal before module resolution
healLongPackage();

// 2. Check if dependencies are installed in container
try {
  require.resolve('express');
  require.resolve('@whiskeysockets/baileys');
} catch (depErr) {
  console.log('\n📦 [HYEHOST Auto-Installer] Dependencies missing in container! Running npm install...');
  const { execSync } = require('child_process');
  try {
    execSync('npm install --omit=dev --no-audit --no-fund', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ [HYEHOST Auto-Installer] All packages installed successfully!\n');
  } catch (installErr) {
    console.error('❌ [HYEHOST Auto-Installer] Auto-install failed:', installErr.message);
  }
  // Re-heal after npm install
  healLongPackage();
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const config = require('./config');
const waClient = require('./lib/baileys');
const { checkMobileLegends } = require('./lib/gameChecker');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 24/7 Keep-Alive Engine ──
let keepAliveTimer = null;
let detectedPublicUrl = process.env.APP_URL || null;

function startKeepAlive(url) {
  if (keepAliveTimer || !url) return;
  detectedPublicUrl = url.replace(/\/+$/, '');
  console.log(`[KeepAlive] 🟢 Starting 24/7 self-ping loop for: ${detectedPublicUrl}`);

  keepAliveTimer = setInterval(async () => {
    try {
      const pingUrl = `${detectedPublicUrl}/api/status`;
      await axios.get(pingUrl, { timeout: 5000 });
      console.log(`[KeepAlive] ✅ Ping successful (${new Date().toLocaleTimeString()})`);
    } catch (err) {
      // Non-blocking log
    }
  }, 300000);
}

if (process.env.ENABLE_KEEP_ALIVE === 'true' && process.env.APP_URL) {
  startKeepAlive(process.env.APP_URL);
}

// 1. Connection Status API
app.get('/api/status', (req, res) => {
  res.json({
    status: waClient.status,
    pairingCode: waClient.pairingCode,
    hasQr: !!waClient.qrCodeBase64,
    user: waClient.connectedUser ? {
      name: waClient.connectedUser.name || 'VIRUS Bot',
      id: waClient.connectedUser.id?.split(':')[0],
    } : null,
    botName: config.botName,
    ownerName: config.ownerName,
    prefix: config.prefix,
  });
});

// 2. Request WhatsApp Pairing Code
app.post('/api/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanNumber.length < 9) {
    return res.status(400).json({ success: false, message: 'Invalid phone number length. Include country code.' });
  }

  try {
    console.log(`[Web API] Generating pairing code for +${cleanNumber}...`);
    const code = await waClient.requestNewPairingCode(cleanNumber);
    if (code) {
      res.json({ success: true, pairingCode: code });
    } else {
      res.status(500).json({ success: false, message: 'Failed to generate code in time. Please retry.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Get QR Code data
app.get('/api/qr', (req, res) => {
  if (waClient.qrCodeBase64) {
    res.json({ success: true, qr: waClient.qrCodeBase64 });
  } else {
    res.json({ success: false, message: 'No QR code currently active.' });
  }
});

// 4. Test Game Account Checker directly from web page
app.post('/api/test-game', async (req, res) => {
  const { game, query } = req.body;
  if (!game || !query) {
    return res.status(400).json({ success: false, message: 'Game type and query ID are required.' });
  }

  try {
    let result = '';
    const cleanQuery = query.trim();

    const g = game.toLowerCase();
    if (g === 'ml' || g === 'mlbb' || g === 'mobilelegends') {
      const parts = cleanQuery.split(/\s+/);
      result = await checkMobileLegends(parts[0], parts[1]);
    } else {
      return res.status(400).json({ success: false, message: 'Only Mobile Legends (.ml) is supported.' });
    }

    res.json({ success: true, formattedText: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Get Session Backup Data (for permanent cloud persistence across container reinstalls)
app.get('/api/session-backup', (req, res) => {
  try {
    const sessionData = waClient.getSessionData();
    const isConnected = !!(waClient.sock?.authState?.creds?.registered);
    res.json({
      success: true,
      connected: isConnected,
      hasBackup: !!sessionData,
      sessionData: sessionData || null,
      message: sessionData
        ? 'Session backup available. Optional: set this as SESSION_DATA environment variable in Deplexo to guarantee 100% permanence even if disk is completely wiped.'
        : 'No session backup available yet. Connect your bot first.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start Express Server
const server = app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 BOT 69 • VIRUS WHATSAPP BOT DASHBOARD`);
  console.log(`🌐 Server running on Port: ${config.port}`);
  console.log(`📱 PTERODACTYL HOSTS (Address Disabled):`);
  console.log(`👉 Simply type your phone number below & hit Enter to pair!`);
  console.log(`👉 Example: 923116469820`);
  console.log(`======================================================\n`);
  
  // Start Baileys in background
  waClient.start().then(() => {
    const targetNumber = process.env.PAIR_NUMBER || process.env.PHONE_NUMBER || config.ownerNumbers?.[0];
    if (targetNumber && !waClient.sock?.authState?.creds?.registered) {
      const clean = targetNumber.replace(/[^0-9]/g, '');
      console.log(`[Auto-Pair] Requesting pairing code for +${clean}...`);
      setTimeout(() => {
        waClient.requestNewPairingCode(clean).catch(err => {
          console.error('[Auto-Pair Error]:', err.message);
        });
      }, 2500);
    }
  }).catch(err => {
    console.error('[Baileys Startup Error]:', err.message);
    console.log('[Baileys Startup Note] Waiting for pairing code request from web portal.');
  });

  if (process.env.APP_URL) {
    startKeepAlive(process.env.APP_URL);
  }

  // Direct Pterodactyl Console Pairing: allows pairing without public web URL
  if (process.stdin) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk) => {
      const text = chunk.toString().trim();
      if (!text) return;

      const match = text.match(/^(?:pair\s+)?(?:\+)?(\d{9,16})$/i);
      if (match) {
        const cleanNumber = match[1];
        console.log(`\n[Console Pairing] Requesting pairing code for +${cleanNumber}...`);
        try {
          await waClient.requestNewPairingCode(cleanNumber);
        } catch (err) {
          console.error('[Console Pairing Error]:', err.message);
        }
        return;
      }

      if (text.toLowerCase() === 'pair' || text.toLowerCase() === 'help') {
        console.log(`\n======================================================`);
        console.log(`💡 PTERODACTYL CONSOLE PAIRING:`);
        console.log(`Type your phone number (with country code) and press Enter:`);
        console.log(`👉 Example: 923116469820`);
        console.log(`👉 Or: pair 923116469820`);
        console.log(`======================================================\n`);
      }
    });
  }
});

module.exports = { app, server };
