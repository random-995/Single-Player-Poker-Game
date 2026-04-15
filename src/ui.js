'use strict';

// ── Human action buttons ──────────────────────────────────────────────────
function waitForHuman() { return new Promise(r => { resolveHuman = r; }); }

function showButtons(callAmt, currentBet, lastRaise, myChips, myBetRound) {
  document.getElementById('action-area').classList.add('active');
  const isFree = callAmt <= 0;
  document.getElementById('btn-fold').style.display = isFree ? 'none' : '';
  document.getElementById('btn-call').textContent   = isFree ? 'Check' : `Call  $${callAmt}`;
  const minR = currentBet + lastRaise, maxR = myChips + myBetRound;
  const canR = myChips > callAmt && minR <= maxR;
  document.getElementById('btn-raise').style.display = canR ? '' : 'none';
  document.getElementById('raise-box').style.display = 'none';
  if (canR) {
    const sl = document.getElementById('raise-slider');
    sl.min = minR; sl.max = maxR; sl.value = Math.min(minR * 2, maxR);
    syncRaiseLabel();
  }
}

function hideButtons() {
  document.getElementById('action-area').classList.remove('active');
  document.getElementById('raise-box').style.display = 'none';
}

function syncRaiseLabel() {
  const v = `$${document.getElementById('raise-slider').value}`;
  document.getElementById('raise-label').textContent     = v;
  document.getElementById('raise-label-btn').textContent = v;
}

// ── Next-street button ────────────────────────────────────────────────────
function waitForNextStreet() { return new Promise(r => { resolveNextStreet = r; }); }
function showNextStreetBtn()  { document.getElementById('btn-next-street').style.display = ''; }
function hideNextStreetBtn()  { document.getElementById('btn-next-street').style.display = 'none'; }

// ── Next-hand panel ───────────────────────────────────────────────────────
function showNextHandPanel() {
  document.getElementById('next-hand-panel').style.display = 'flex';
  updateSeedDisplay(randomSeed());
}
function hideNextHandPanel() {
  document.getElementById('next-hand-panel').style.display = 'none';
}
function updateSeedDisplay(seed) {
  const el = document.getElementById('next-seed-input');
  if (el) el.value = seed !== undefined ? String(seed) : '';
}

// ── Log selector ──────────────────────────────────────────────────────────
function updateLogSelector() {
  if (!G) return;
  const sel = document.getElementById('log-hand-select');
  if (!sel) return;
  sel.innerHTML = '';
  G.allHandLogs.forEach((h, i) => {
    const opt     = document.createElement('option');
    opt.value     = i;
    opt.textContent = h.handNum > 0 ? `Hand #${h.handNum}` : 'Game End';
    if (i === viewingHandIdx) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Console notebook ──────────────────────────────────────────────────────
function consolePrint(text, cls = '') {
  const nb  = document.getElementById('console-notebook');
  const div = document.createElement('div');
  div.className   = 'console-line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  nb.appendChild(div);
  nb.scrollTop = nb.scrollHeight;
}

// ── Tarot deck ────────────────────────────────────────────────────────────
const TAROT_MAJOR = [
  'The Fool','The Magician','The High Priestess','The Empress','The Emperor',
  'The Hierophant','The Lovers','The Chariot','Strength','The Hermit',
  'Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
  'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World',
];
const TAROT_MINOR = (() => {
  const suits = ['Wands','Cups','Swords','Pentacles'];
  const ranks = ['Ace','2','3','4','5','6','7','8','9','10','Page','Knight','Queen','King'];
  const cards = [];
  for (const suit of suits)
    for (const rank of ranks)
      cards.push(`${rank} of ${suit}`);
  return cards;
})();
const TAROT_DECK = [...TAROT_MAJOR, ...TAROT_MINOR];

function handleConsoleCmd(raw) {
  const val = raw.trim();
  if (!val) return;

  // Score command: show winning probability for all or a specific player
  // Usage: "score" or "score <name>"
  if (val.toLowerCase() === 'score' || val.toLowerCase().startsWith('score ')) {
    if (!G) { consolePrint('No game running.', 'result'); return; }
    const withCards = G.players.filter(p => !p.eliminated && p.hand.length > 0);
    if (!withCards.length) { consolePrint('No cards dealt yet.', 'result'); return; }

    const arg = val.slice(6).trim().toLowerCase();
    const target = arg
      ? withCards.find(p => p.name.toLowerCase() === arg)
      : null;
    if (arg && !target) {
      consolePrint(`No player named "${val.slice(6).trim()}".`, 'result'); return;
    }

    // Compute each player's perceived equity independently (they can't see opponents' cards)
    const active = withCards.filter(p => !p.folded);
    const numOpponents = Math.max(1, active.length - 1);
    const perceivedEquities = {};
    if (window.computePerceivedEquity) {
      for (const p of active) {
        perceivedEquities[p.id] = window.computePerceivedEquity(p.hand, G.board, numOpponents);
      }
    }

    const printRow = p => {
      if (p.folded) {
        consolePrint(`${p.name}: — [folded]`, 'result');
      } else {
        const eq = perceivedEquities[p.id];
        const pct = eq != null ? (eq * 100).toFixed(1) : '?';
        consolePrint(`${p.name}: ${pct}%`, 'result');
      }
    };

    consolePrint('── Win Probability ──', 'result');
    if (target) {
      printRow(target);
    } else {
      for (const p of withCards) printRow(p);
    }
    consolePrint('─────────────────────', 'result');
    return;
  }

  // Prediction calculation command
  if (val.toLowerCase() === 'prediction') {
    if (!G) { consolePrint('No game running.', 'result'); return; }
    const human = G.players.find(p => p.isHuman);
    if (!human || human.skill !== 'prediction') {
      consolePrint('You do not have the Prediction skill.', 'result');
    } else if (!G.humanCanPredict) {
      consolePrint('Prediction is only available during the turn betting round.', 'result');
    } else {
      const res = G.doHumanPrediction();
      if (res) {
        consolePrint(`Peeked card: ${res.card}  (1 of ${res.N} hidden)`, 'result');
        consolePrint(`Weighted strength: ${(res.weighted * 100).toFixed(1)}%`, 'result');
      }
    }
    return;
  }

  // Swap command
  if (val.toLowerCase() === 'swap') {
    if (!G) { consolePrint('No game running.', 'result'); return; }
    const human = G.players.find(p => p.isHuman);
    if (!human || human.skill !== 'swap') {
      consolePrint('You do not have the Swap skill.', 'result');
    } else if (!G.doHumanSwap()) {
      consolePrint('Cannot swap now.', 'result');
    } else {
      consolePrint('Swap used.', 'result');
    }
    return;
  }

  // Tarot command: "tarot" or "tarot N"
  const tm = val.match(/^tarot(?:\s+(\d+))?$/i);
  if (tm) {
    const n = Math.min(Math.max(1, tm[1] ? +tm[1] : 1), 10);
    const deck = [...TAROT_DECK];
    consolePrint(`── Tarot draw (${n}) ──`, 'result');
    for (let i = 0; i < n; i++) {
      const idx      = Math.floor(Math.random() * deck.length);
      const card     = deck.splice(idx, 1)[0];
      const reversed = Math.random() < 0.5;
      consolePrint(`  ${card}${reversed ? '  (reversed)' : ''}`, 'result');
    }
    return;
  }

  // Dice command: NdM  (e.g. 1d10, 2d6)
  const m = val.match(/^(\d+)d(\d+)$/i);
  if (m) {
    const n    = Math.min(Math.max(1, +m[1]), 100);
    const f    = Math.max(2, +m[2]);
    const rolls = [];
    let sum    = 0;
    for (let i = 0; i < n; i++) { const r = Math.floor(Math.random() * f) + 1; rolls.push(r); sum += r; }
    const detail = n > 1 ? rolls.join('+') + '=' + sum : String(sum);
    consolePrint(`[${val.toLowerCase()}=${detail}]`, 'result');
  } else {
    consolePrint(val);
  }
}

// ── Card rendering ────────────────────────────────────────────────────────
function cardHTML(card, faceDown = false) {
  if (faceDown) return `<div class="card back"><div class="back-inner"></div></div>`;
  const col = SUIT_COLOR[card.suit] || '#111';
  return `<div class="card face" style="color:${col}">
    <span class="cr top">${card.rank}</span>
    <span class="cs">${card.suit}</span>
    <span class="cr bot">${card.rank}</span>
  </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────
function render() {
  if (!G) return;

  document.getElementById('street-label').textContent = STREET_LABEL[G.street] || '';
  document.getElementById('pot-label').textContent    = G.pot > 0 ? `Pot  $${G.pot}` : '';

  // Board
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  for (let i = 0; i < 5; i++)
    boardEl.innerHTML += G.board[i] ? cardHTML(G.board[i]) : '<div class="card placeholder"></div>';

  // Player rows
  for (let i = 0; i < 4; i++) {
    const p  = G.players[i];
    const el = document.getElementById(`prow-${i}`);
    if (!el) continue;

    el.className = 'prow'
      + (p.folded && !p.eliminated ? ' folded'    : '')
      + (p.eliminated              ? ' eliminated' : '')
      + (G.actor === i             ? ' acting'     : '')
      + (p.allIn && !p.folded      ? ' allin'      : '');

    el.querySelector('.prow-name').textContent  = p.name;
    el.querySelector('.prow-chips').textContent = p.eliminated ? '—' : `$${p.chips.toLocaleString()}`;

    const betEl = el.querySelector('.prow-bet');
    if (p.betRound > 0) {
      betEl.textContent = `Bet  $${p.betRound}`; betEl.className = 'prow-bet';
    } else if (p.result) {
      betEl.textContent = p.result;
      betEl.className   = p.resultWon ? 'prow-bet prow-result-win' : 'prow-bet prow-result';
    } else {
      betEl.textContent = ''; betEl.className = 'prow-bet';
    }

    // Dealer / blind badges
    const isD  = i === G.dealerSeat;
    const isSB = !isD && i === G.nextSeat(G.dealerSeat);
    const isBB = !isD && !isSB && i === G.nextSeat(G.nextSeat(G.dealerSeat));
    el.querySelector('.prow-badges').innerHTML =
      (isD  ? '<span class="badge d">D</span>'   : '') +
      (isSB ? '<span class="badge sb">SB</span>' : '') +
      (isBB ? '<span class="badge bb">BB</span>' : '');

    // Cards: shown if human, showdown, or per-player toggle
    const handEl = el.querySelector('.prow-cards');
    const showCards = p.isHuman || G.showdown || playerCardsVisible[i];
    if (p.hand.length === 0) {
      handEl.innerHTML = '';
    } else if (showCards) {
      handEl.innerHTML = p.hand.map(c => cardHTML(c)).join('');
    } else if (!p.folded) {
      handEl.innerHTML = cardHTML(null, true) + cardHTML(null, true);
    } else {
      handEl.innerHTML = '<span class="mucked">folded</span>';
    }

    // Show-cards button (hidden for human seat and eliminated)
    const showBtn = el.querySelector('.btn-show-cards');
    if (showBtn) {
      showBtn.style.display = (!p.isHuman && !p.eliminated) ? '' : 'none';
      showBtn.textContent = playerCardsVisible[i] ? 'Hide' : 'Show';
    }

    // Leave button
    const leaveBtn = el.querySelector('.btn-leave');
    if (leaveBtn) {
      leaveBtn.style.display = (!p.isHuman && !p.eliminated) ? '' : 'none';
      leaveBtn.classList.toggle('pending', p.wantsToLeave);
    }
  }

  // Log
  const logEl   = document.getElementById('log');
  const idx     = viewingHandIdx >= 0 && viewingHandIdx < G.allHandLogs.length
    ? viewingHandIdx : G.allHandLogs.length - 1;
  const entries = idx >= 0 ? G.allHandLogs[idx].entries : [];
  logEl.innerHTML = entries.map(({ msg, cls }) =>
    `<div class="log-line${cls ? ' ' + cls : ''}">${msg}</div>`
  ).join('');
}
