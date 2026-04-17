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
// forcedRiver: optional Card object fixed as the 5th board card in every iteration.
window.computePerceivedEquity = function(hole, board, numOpponents, iterations = 800, forcedRiver = null) {
  numOpponents = Math.max(1, numOpponents || 1);
  const holeStr = hole.map(toOddsCard);
  const boardStr = board.map(toOddsCard);
  const forcedRiverStr = forcedRiver ? toOddsCard(forcedRiver) : null;

  const knownSet = new Set([...holeStr, ...boardStr]);
  if (forcedRiverStr) knownSet.add(forcedRiverStr);
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
      while (fullBoard.length < 4) fullBoard.push(d[idx++]);
      // Use the forced river as the 5th card if provided and not yet revealed
      if (fullBoard.length < 5) fullBoard.push(forcedRiverStr || d[idx++]);
      t.setBoard(fullBoard);
      const res = t.calculate().result;
      wins += res.players[0].wins;
      ties += res.players[0].ties;
      valid++;
    } catch (e) { /* skip bad draws */ }
  }
  return valid === 0 ? 1 / (numOpponents + 1) : (wins + ties / 2) / valid;
};

// Used by computeHandStrength in cards.js for robot decisions.
// Fewer iterations than computePerceivedEquity to keep robot turns fast.
window.computeEquity = function(hole, board, numOpponents) {
  return window.computePerceivedEquity(hole, board, numOpponents, 800);
};

// Compute actual win probabilities for all players given their known hole cards.
// allHoles: array of [Card, Card] per player. Returns array of win-prob (0–1) per player.
window.computeMatchupEquity = function(allHoles, board, iterations = 1200) {
  const holesStr = allHoles.map(h => h.map(toOddsCard));
  const boardStr = board.map(toOddsCard);
  const knownSet = new Set([...holesStr.flat(), ...boardStr]);
  const remaining = ALL_CARDS.filter(c => !knownSet.has(c));

  const wins = new Array(allHoles.length).fill(0);
  const ties = new Array(allHoles.length).fill(0);
  let valid = 0;

  for (let i = 0; i < iterations; i++) {
    const d = shuffleArr(remaining);
    let idx = 0;
    try {
      const t = new TexasHoldem();
      for (const h of holesStr) t.addPlayer(h);
      const fullBoard = [...boardStr];
      while (fullBoard.length < 5) fullBoard.push(d[idx++]);
      t.setBoard(fullBoard);
      const players = t.calculate().result.players;
      for (let j = 0; j < players.length; j++) {
        wins[j] += players[j].wins;
        ties[j] += players[j].ties;
      }
      valid++;
    } catch (e) { /* skip */ }
  }

  if (valid === 0) return allHoles.map(() => 1 / allHoles.length);
  return wins.map((w, j) => (w + ties[j] / 2) / valid);
};
