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

// Returns an array of win probabilities (0–1), one per player in playersHands.
// playersHands: array of arrays of Card objects (only the players still active).
// board: array of Card objects (0–5).
window.computeEquityAllPlayers = function(playersHands, board) {
  try {
    const t = new TexasHoldem();
    for (const hand of playersHands) {
      t.addPlayer(hand.map(toOddsCard));
    }
    if (board.length) {
      t.setBoard(board.map(toOddsCard));
    }
    const res = t.calculate().result;
    const total = res.iterations;
    return res.players.map(p => (p.wins + p.ties / 2) / total);
  } catch (e) {
    return playersHands.map(() => 1 / playersHands.length);
  }
};

// window.computeEquity is intentionally not defined here.
// cards.js falls back to preflopStrength / hand-score normalization when it is absent,
// which is the correct behaviour for robot decisions vs. unknown opponent hands.
