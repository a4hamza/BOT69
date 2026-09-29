/**
 * Atlas-MD Web Dashboard & Pairing Client Script
 */

window.setPhonePrefix = function(prefix) {
  const phoneInput = document.getElementById('phoneInput');
  phoneInput.value = prefix;
  phoneInput.focus();
};

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const pairForm = document.getElementById('pairForm');
  const phoneInput = document.getElementById('phoneInput');
  const getPairBtn = document.getElementById('getPairBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnText = document.getElementById('btnText');
  const codeDisplayArea = document.getElementById('codeDisplayArea');
  const pairingCodeVal = document.getElementById('pairingCodeVal');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const copyNotice = document.getElementById('copyNotice');
  const inlineError = document.getElementById('inlineError');
  const connectedArea = document.getElementById('connectedArea');
  const connectedNumber = document.getElementById('connectedNumber');

  // Game Simulator Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const gameQueryInput = document.getElementById('gameQueryInput');
  const runGameCheckBtn = document.getElementById('runGameCheckBtn');
  const gameSpinner = document.getElementById('gameSpinner');
  const gameOutput = document.getElementById('gameOutput');
  const sampleBtn = document.getElementById('sampleBtn');

  let activeGame = 'ml';

  const GAME_SAMPLES = {
    ml: { query: '1114917746 13486', placeholder: 'Enter ID and Zone (e.g. 1114917746 13486)' },
    genshin: { query: '700012345', placeholder: 'Enter Genshin UID (e.g. 700012345)' },
    hok: { query: '1234567890', placeholder: 'Enter HOK Player ID (e.g. 1234567890)' }
  };

  function showError(msg) {
    inlineError.textContent = msg;
    inlineError.classList.remove('hidden');
    setTimeout(() => {
      inlineError.classList.add('hidden');
    }, 5000);
  }

  // 1. Status Polling
  async function pollStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      statusBadge.className = 'status-badge ' + data.status;

      if (data.status === 'connected') {
        statusText.textContent = 'Connected';
        connectedArea.classList.remove('hidden');
        connectedNumber.textContent = `+${data.user?.id || 'Active'}`;
        codeDisplayArea.classList.add('hidden');
      } else if (data.status === 'waiting_pair') {
        statusText.textContent = 'Pairing Active';
        if (data.pairingCode) {
          pairingCodeVal.textContent = data.pairingCode;
          codeDisplayArea.classList.remove('hidden');
        }
      } else if (data.status === 'connecting') {
        statusText.textContent = 'Connecting...';
      } else {
        statusText.textContent = 'Disconnected';
      }
    } catch (err) {
      statusBadge.className = 'status-badge disconnected';
      statusText.textContent = 'Server Offline';
    }
  }

  pollStatus();
  setInterval(pollStatus, 3000);

  // 2. Request Pairing Code
  pairForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    inlineError.classList.add('hidden');

    const phoneNumber = phoneInput.value.trim().replace(/[^0-9]/g, '');
    if (!phoneNumber || phoneNumber.length < 8) {
      showError('Please enter a valid phone number with country code (e.g. 923001234567).');
      return;
    }

    btnSpinner.classList.remove('hidden');
    btnText.textContent = 'Requesting Code...';
    getPairBtn.disabled = true;

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      const data = await res.json();

      if (data.success && data.pairingCode) {
        pairingCodeVal.textContent = data.pairingCode;
        codeDisplayArea.classList.remove('hidden');
        codeDisplayArea.scrollIntoView({ behavior: 'smooth' });
      } else {
        showError(data.message || 'Failed to generate pairing code. Please verify your phone number.');
      }
    } catch (err) {
      showError('Network error connecting to the bot server.');
    } finally {
      btnSpinner.classList.add('hidden');
      btnText.textContent = 'Get Pairing Code';
      getPairBtn.disabled = false;
    }
  });

  // 3. Copy Code
  copyCodeBtn.addEventListener('click', () => {
    const raw = pairingCodeVal.textContent.replace(/[^A-Za-z0-9]/g, '');
    navigator.clipboard.writeText(raw).then(() => {
      copyNotice.classList.remove('hidden');
      setTimeout(() => copyNotice.classList.add('hidden'), 2500);
    });
  });

  // 4. Game Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGame = btn.dataset.game;

      const sample = GAME_SAMPLES[activeGame];
      gameQueryInput.value = sample.query;
      gameQueryInput.placeholder = sample.placeholder;
      sampleBtn.textContent = sample.query;
    });
  });

  sampleBtn.addEventListener('click', () => {
    gameQueryInput.value = sampleBtn.textContent;
    runGameCheckBtn.click();
  });

  // 5. Test Game Checker via Web API
  runGameCheckBtn.addEventListener('click', async () => {
    const query = gameQueryInput.value.trim();
    if (!query) return;

    gameSpinner.classList.remove('hidden');
    runGameCheckBtn.disabled = true;
    gameOutput.textContent = '⏳ Querying game database and subscription status...';

    try {
      const res = await fetch('/api/test-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: activeGame, query })
      });
      const data = await res.json();

      if (data.success && data.formattedText) {
        gameOutput.textContent = data.formattedText;
      } else {
        gameOutput.textContent = `❌ Error: ${data.message || 'Failed to fetch game information.'}`;
      }
    } catch (err) {
      gameOutput.textContent = `❌ Network request failed: ${err.message}`;
    } finally {
      gameSpinner.classList.add('hidden');
      runGameCheckBtn.disabled = false;
    }
  });

  // Auto trigger sample run on load for immediate preview
  setTimeout(() => {
    runGameCheckBtn.click();
  }, 500);
});
