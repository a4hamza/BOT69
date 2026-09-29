/**
 * Atlas-MD Utility Functions
 */

// Country to Flag emoji dictionary
const COUNTRY_FLAGS = {
  // Names
  indonesia: '🇮🇩 Indonesia',
  philippines: '🇵🇭 Philippines',
  malaysia: '🇲🇾 Malaysia',
  singapore: '🇸🇬 Singapore',
  thailand: '🇹🇭 Thailand',
  vietnam: '🇻🇳 Vietnam',
  brazil: '🇧🇷 Brazil',
  unitedstates: '🇺🇸 United States',
  usa: '🇺🇸 United States',
  russia: '🇷🇺 Russia',
  turkey: '🇹🇷 Turkey',
  india: '🇮🇳 India',
  pakistan: '🇵🇰 Pakistan',
  bangladesh: '🇧🇩 Bangladesh',
  japan: '🇯🇵 Japan',
  southkorea: '🇰🇷 South Korea',
  korea: '🇰🇷 South Korea',
  mexico: '🇲🇽 Mexico',
  germany: '🇩🇪 Germany',
  france: '🇫🇷 France',
  unitedkingdom: '🇬🇧 United Kingdom',
  uk: '🇬🇧 United Kingdom',
  egypt: '🇪🇬 Egypt',
  saudiarabia: '🇸🇦 Saudi Arabia',
  saudi: '🇸🇦 Saudi Arabia',
  uae: '🇦🇪 United Arab Emirates',
  china: '🇨🇳 China',
  taiwan: '🇹🇼 Taiwan',
  hongkong: '🇭🇰 Hong Kong',
  argentina: '🇦🇷 Argentina',
  colombia: '🇨🇴 Colombia',
  chile: '🇨🇱 Chile',
  peru: '🇵🇪 Peru',
  canada: '🇨🇦 Canada',
  spain: '🇪🇸 Spain',
  italy: '🇮🇹 Italy',
  morocco: '🇲🇦 Morocco',
  algeria: '🇩🇿 Algeria',
  iraq: '🇮🇶 Iraq',
  global: '🌐 Global / International',
  // ISO-2 Codes
  id: '🇮🇩 Indonesia',
  ph: '🇵🇭 Philippines',
  my: '🇲🇾 Malaysia',
  sg: '🇸🇬 Singapore',
  th: '🇹🇭 Thailand',
  vn: '🇻🇳 Vietnam',
  br: '🇧🇷 Brazil',
  us: '🇺🇸 United States',
  ru: '🇷🇺 Russia',
  tr: '🇹🇷 Turkey',
  in: '🇮🇳 India',
  pk: '🇵🇰 Pakistan',
  bd: '🇧🇩 Bangladesh',
  jp: '🇯🇵 Japan',
  kr: '🇰🇷 South Korea',
  mx: '🇲🇽 Mexico',
  de: '🇩🇪 Germany',
  fr: '🇫🇷 France',
  gb: '🇬🇧 United Kingdom',
  eg: '🇪🇬 Egypt',
  sa: '🇸🇦 Saudi Arabia',
  ae: '🇦🇪 United Arab Emirates',
  cn: '🇨🇳 China',
  tw: '🇹🇼 Taiwan',
  hk: '🇭🇰 Hong Kong',
  ar: '🇦🇷 Argentina',
  co: '🇨🇴 Colombia',
  cl: '🇨🇱 Chile',
  pe: '🇵🇪 Peru',
  ca: '🇨🇦 Canada',
  es: '🇪🇸 Spain',
  it: '🇮🇹 Italy',
  iq: '🇮🇶 Iraq'
};

/**
 * Get country with flag emoji
 * @param {string} countryName 
 * @returns {string}
 */
function getCountryWithFlag(countryName) {
  if (!countryName) return '🌐 Global Server';
  const clean = countryName.toLowerCase().replace(/[^a-z]/g, '');
  if (COUNTRY_FLAGS[clean]) return COUNTRY_FLAGS[clean];
  
  // Partial search
  for (const [key, value] of Object.entries(COUNTRY_FLAGS)) {
    if (key.length > 2 && (clean.includes(key) || key.includes(clean))) {
      return value;
    }
  }
  return `🚩 ${countryName}`;
}

/**
 * Extract just flag emoji
 */
function getCountryFlag(countryName) {
  const full = getCountryWithFlag(countryName);
  const match = full.match(/[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF]+/);
  return match ? match[0] : '🚩';
}

/**
 * Format active status with tick or cross mark
 * @param {boolean} isAvailableOrActive 
 * @param {string} activeText 
 * @param {string} inactiveText 
 * @returns {string}
 */
function formatStatus(isAvailableOrActive, activeText = 'Active / Available', inactiveText = 'Not Available / Unsubscribed') {
  return isAvailableOrActive ? `✅ ${activeText}` : `❌ ${inactiveText}`;
}

/**
 * VIRUZ signature fancy box wrapper
 * @param {string} title 
 * @param {string} body 
 * @param {string} footer 
 * @returns {string}
 */
function atlasBox(title, body, footer = 'VIRUZ • WHATSAPP BOT') {
  return `╭───『 *${title.toUpperCase()}* 』───╮\n${body}\n╰───『 *${footer}* 』───╯`;
}

/**
 * Format seconds to readable duration
 * @param {number} seconds 
 * @returns {string}
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
}

module.exports = {
  getCountryWithFlag,
  getCountryFlag,
  formatStatus,
  atlasBox,
  viruzBox: atlasBox,
  formatUptime,
};
