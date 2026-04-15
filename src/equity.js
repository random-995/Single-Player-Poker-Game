'use strict';
// Wraps poker-odds-calc to expose equity helpers for browser use.
// Bundled via esbuild into equity.bundle.js.

const { TexasHoldem } = require('poker-odds-calc/dist');

const SUIT_MAP = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };

function toOddsCard(card) {
  const rank = card.rank === '10' ? 'T' : card.rank;
  const suit = SUIT_MAP[card.suit];
  return rank + suit;
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_CARDS = [];
for (const r of ['2','3','4','5','6','7','8','9','T','J','Q','K','A'])
  for (const s of ['c','d','h','s'])
    ALL_CARDS.push(r + s);

// Returns win probability (0–1) for one player from their own perspective:
// they know their hole cards and the current board, but not opponents' cards.
// Opponents are treated as random hands drawn from the remaining deck.
// Probabilities across players will NOT sum to 1.
window.computePerceivedEquity = function(hole, board, numOpponents, iterations = 800) {
  numOpponents = Math.max(1, numOpponents || 1);
  const holeStr = hole.map(toOddsCard);
  const boardStr = board.map(toOddsCard);
  const knownSet = new Set([...holeStr, ...boardStr]);
  const remaining = ALL_CARDS.filter(c => !knownSet.has(c));

  let wins = 0, ties = 0, valid = 0;
  for (let i = 0; i < iterations; i++) {
    const d = shuffleArr(remaining);
    let idx = 0;
    try {
      const t = new TexasHoldem();
      t.addPlayer(holeStr);
      for (let j = 0; j < numOpponents; j++) t.addPlayer([d[idx++], d[idx++]]);
      const fullBoard = [...boardStr];
      while (fullBoard.length < 5) fullBoard.push(d[idx++]);
      t.setBoard(fullBoard);
      const res = t.calculate().result;
      wins += res.players[0].wins;
      ties += res.players[0].ties;
      valid++;
    } catch (e) { /* skip bad draws */ }
  }
  return valid === 0 ? 1 / (numOpponents + 1) : (wins + ties / 2) / valid;
};

// window.computeEquity is intentionally not defined here.
// cards.js falls back to preflopStrength / hand-score normalization when it is absent,
// which is the correct behaviour for robot decisions vs. unknown opponent hands.
