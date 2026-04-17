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
  document.getElementById('raise-input').addEventListener('input', () => {
    const sl  = document.getElementById('raise-slider');
    const inp = document.getElementById('raise-input');
    const v   = Math.max(+sl.min, Math.min(+sl.max, +inp.value || +sl.min));
    sl.value = v;
    document.getElementById('raise-label-btn').textContent = `$${v}`;
  });

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
    // seat1-row..seat9-row: show when num is large enough (same rule for both modes)
    for (let i = 1; i <= 9; i++) {
      document.getElementById(`seat${i}-row`).style.display = num >= i + 1 ? 'flex' : 'none';
    }
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
      configs = Array.from({ length: numPlayers }, (_, i) => {
        const playerKey = document.getElementById(`player${i}`).value;
        const player    = PLAYERS[playerKey]();
        const type      = document.getElementById(`robot${i}`).value;
        return { type, skill: player.skill, label: player.name };
      });
    } else {
      const humanSkill = document.getElementById('player-human').value;
      configs = [
        { type: 'human', skill: humanSkill === 'none' ? null : humanSkill, label: 'You' },
        ...Array.from({ length: numPlayers - 1 }, (_, i) => {
          const idx       = i + 1;
          const playerKey = document.getElementById(`player${idx}`).value;
          const player    = PLAYERS[playerKey]();
          const type      = document.getElementById(`robot${idx}`).value;
          return { type, skill: player.skill, label: player.name };
        }),
      ];
    }

    const initSeed = initSeedInput.value.trim();
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game').style.display  = 'flex';

    const hasHuman = configs.some(c => c.type === 'human');
    if (!hasHuman) document.getElementById('action-area').style.display = 'none';

    playerCardsVisible = new Array(numPlayers).fill(false);
    viewingHandIdx = -1;

    const blindBets    = document.getElementById('opt-blinds').checked;
    const startingChips = Math.max(100, +document.getElementById('opt-starting-chips').value || 5000);
    G = new Game(configs, { blindBets, startingChips });
    if (initSeed !== '') G.pendingNextSeed = initSeed;
    render();
    G.run();
  });
});
