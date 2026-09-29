/**
 * BOT69 (Identity: VIRUS) WhatsApp Bot Configuration
 * Owner: BOT 69
 */

module.exports = {
  // Bot Information & Identity
  botName: process.env.BOT_NAME || 'VIRUS',
  ownerName: process.env.OWNER_NAME || 'BOT 69',
  ownerNumbers: process.env.OWNER_NUMBER 
    ? [process.env.OWNER_NUMBER.replace(/[^0-9]/g, '')] 
    : ['923116469820'], // Default fallback (auto-assigned dynamically to whoever pairs the bot)
  prefix: '.', // Default prefix
  prefixes: ['.', ',', '!', '#', '/'], // Supported prefixes: .menu, ,menu, !menu, #menu, /menu
  sessionDir: './auth_info_baileys',

  // Web Dashboard Settings (HYEHOST / Pterodactyl / Silly Development compatibility)
  port: process.env.PORT || process.env.SERVER_PORT || 8080,

  // Group Moderation & Anti-Spam Thresholds
  antiSpam: {
    enabled: true,
    
    // Sticker Spam Rules:
    // 5th rapid sticker = Warning
    // 6th rapid sticker = Auto-Kick from GC
    stickerWarningThreshold: 5,
    stickerKickThreshold: 6,
    stickerTimeWindowMs: 15000, // 15 seconds window

    // Message Spam Rules:
    // 5th same/repeated message = Warning
    // 6th same/repeated message = Auto-Kick from GC
    messageWarningThreshold: 5,
    messageKickThreshold: 6,
    messageTimeWindowMs: 12000, // 12 seconds window

    // Admins and Bot Owner are permanently immune
    adminImmunity: true,
  },

  // Game Checker Settings
  gameChecker: {
    cacheTtlSeconds: 300, // Cache account lookups for 5 minutes
  },

  // Group Welcome & Goodbye Notifications
  welcome: {
    enabled: true, // Enabled by default
  },

  // Anti-Delete & View Once Defaults
  antiDelete: {
    groupEnabled: true,   // Controlled by .antidelgroup on/off
    privateEnabled: true  // Controlled by .antidelete on/off
  },

  // Auto View Once Delivery to Private Inbox
  autoViewOnce: {
    enabled: true // Silently catches View-Once and sends to private inbox
  }
};
