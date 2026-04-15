'use strict';

// ── Player registry (populated by players/*.js) ───────────────────────────
const PLAYERS = {
  wm:      () => window.PlayerWM,
  thief:   () => window.PlayerThief,
  neumann: () => window.PlayerNeumann,
};

window.addEventListener('DOMContentLoaded', () => {

  // ── In-game controls ─────────────────────────────────────────────────────

  // Per-player show-cards buttons
  document.querySelectorAll('.btn-show-cards').forEach(btn => {
    btn.addEventListener('click', () => {
      const seat = +btn.dataset.seat;
      if (!G) return;
      playerCardsVisible[seat] = !playerCardsVisible[seat];
      render();
    });
  });

  // Leave buttons (one listener each, wired by data-seat)
  document.querySelectorAll('.btn-leave').forEach(btn => {
    btn.addEventListener('click', () => {
      const seat = +btn.dataset.seat;
      if (!G) return;
      const p = G.players[seat];
      if (!p || p.isHuman || p.eliminated) return;
      p.wantsToLeave = !p.wantsToLeave;
      render();
    });
  });

  // Human betting buttons
  document.getElementById('btn-fold').addEventListener('click', () => {
    if (resolveHuman) { const r = resolveHuman; resolveHuman = null; r({ action: 'fold' }); }
  });
  document.getElementById('btn-call').addEventListener('click', () => {
    if (resolveHuman) { const r = resolveHuman; resolveHuman = null; r({ action: 'call' }); }
  });
  document.getElementById('btn-raise').addEventListener('click', () => {
    document.getElementById('raise-box').style.display = 'flex';
  });
  document.getElementById('btn-confirm-raise').addEventListener('click', () => {
    if (resolveHuman) {
      const amount = +document.getElementById('raise-slider').value;
      const r = resolveHuman; resolveHuman = null; r({ action: 'raise', amount });
    }
  });
  document.getElementById('raise-slider').addEventListener('input', syncRaiseLabel);

  // Next-hand panel
  document.getElementById('btn-next-hand').addEventListener('click', () => {
    if (resolveNextHand) {
      const seedVal = document.getElementById('next-seed-input').value.trim();
      if (G) G.pendingNextSeed = seedVal;
      const r = resolveNextHand; resolveNextHand = null; r();
    }
  });
  document.getElementById('btn-dice').addEventListener('click', () => {
    document.getElementById('next-seed-input').value = String(randomSeed());
  });

  // Next-street button
  document.getElementById('btn-next-street').addEventListener('click', () => {
    if (resolveNextStreet) { const r = resolveNextStreet; resolveNextStreet = null; r(); }
  });

  // Log hand selector
  document.getElementById('log-hand-select').addEventListener('change', e => {
    viewingHandIdx = +e.target.value; render();
  });

  // ── Console ──────────────────────────────────────────────────────────────

  const consolePanel  = document.getElementById('console-panel');
  const consoleHandle = document.getElementById('console-handle');
  const CONSOLE_MIN = 28, CONSOLE_MAX = 500;
  let conDragging = false, conStartY = 0, conStartH = 0;

  consoleHandle.addEventListener('mousedown', e => {
    conDragging = true; conStartY = e.clientY; conStartH = consolePanel.offsetHeight;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!conDragging) return;
    const newH = Math.max(CONSOLE_MIN, Math.min(CONSOLE_MAX, conStartH - (e.clientY - conStartY)));
    consolePanel.style.height = newH + 'px';
  });
  document.addEventListener('mouseup', () => { conDragging = false; });

  document.getElementById('console-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    handleConsoleCmd(e.target.value);
    e.target.value = '';
  });

  // ── Setup screen ─────────────────────────────────────────────────────────

  // Settings panel toggle
  document.getElementById('btn-settings').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    document.getElementById('btn-settings').textContent = open ? '⚙ Settings ▲' : '⚙ Settings';
  });

  // Mode toggle (human / spectate) + player count
  const modeHuman       = document.getElementById('mode-human');
  const modeSpectate    = document.getElementById('mode-spectate');
  const seat0Row        = document.getElementById('seat0-row');
  const seat0Label      = document.querySelector('.seat0-human-label');
  const numPlayersSelect = document.getElementById('opt-num-players');

  function refreshSeats() {
    const sp  = modeSpectate.checked;
    const num = +numPlayersSelect.value;
    seat0Row.style.display   = sp ? 'flex' : 'none';
    seat0Label.style.display = sp ? 'none' : 'flex';
    // In human mode: seats 1..3 are robots (indices 1-3); show up to num-1 of them.
    // In spectate mode: seats 0..3 are robots; seat0-row handled above, show seats 1..num-1.
    document.getElementById('seat1-row').style.display = num >= 2 ? 'flex' : 'none';
    document.getElementById('seat2-row').style.display = num >= 3 ? 'flex' : 'none';
    document.getElementById('seat3-row').style.display = num >= 4 ? 'flex' : 'none';
  }
  modeHuman.addEventListener('change', refreshSeats);
  modeSpectate.addEventListener('change', refreshSeats);
  numPlayersSelect.addEventListener('change', refreshSeats);
  refreshSeats();

  // Initial-seed dice roll
  const initSeedInput = document.getElementById('init-seed-input');
  document.getElementById('btn-init-dice').addEventListener('click', () => {
    initSeedInput.value = String(randomSeed());
  });

  // ── Start game ────────────────────────────────────────────────────────────
  document.getElementById('btn-start').addEventListener('click', () => {
    const spectate  = modeSpectate.checked;
    const numPlayers = +numPlayersSelect.value;
    let configs;

    if (spectate) {
      configs = [0, 1, 2, 3].map(i => {
        if (i >= numPlayers) return { type: 'empty', skill: null, label: '' };
        const playerKey = document.getElementById(`player${i}`).value;
        const player    = PLAYERS[playerKey]();
        const type      = document.getElementById(`robot${i}`).value;
        return { type, skill: player.skill, label: player.name };
      });
    } else {
      const humanSkill = document.getElementById('player-human').value;
      configs = [
        { type: 'human', skill: humanSkill === 'none' ? null : humanSkill, label: 'You' },
        ...[1, 2, 3].map(i => {
          if (i >= numPlayers) return { type: 'empty', skill: null, label: '' };
          const playerKey = document.getElementById(`player${i}`).value;
          const player    = PLAYERS[playerKey]();
          const type      = document.getElementById(`robot${i}`).value;
          return { type, skill: player.skill, label: player.name };
        }),
      ];
    }

    const initSeed = initSeedInput.value.trim();
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game').style.display  = 'flex';

    const hasHuman = configs.some(c => c.type === 'human');
    if (!hasHuman) document.getElementById('action-area').style.display = 'none';

    playerCardsVisible = [false, false, false, false];
    viewingHandIdx = -1;

    const blindBets = document.getElementById('opt-blinds').checked;
    G = new Game(configs, { blindBets });
    if (initSeed !== '') G.pendingNextSeed = initSeed;
    render();
    G.run();
  });
});
