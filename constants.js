'use strict';

// ── Game constants ─────────────────────────────────────────────────────────
const SMALL_BLIND    = 50;
const BIG_BLIND      = 100;
const STARTING_CHIPS = 5000;
const ROBOT_DELAY    = 600;

const STREET_LABEL = ['Pre-Flop', 'Flop', 'Turn', 'River'];
const SUIT_COLOR   = { '♠':'#111', '♣':'#111', '♥':'#c0392b', '♦':'#c0392b' };
const HAND_NAMES   = ['High Card','Pair','Two Pair','Three of a Kind',
                      'Straight','Flush','Full House','Four of a Kind','Straight Flush'];

// ── Strategy registry (populated by strat/*.js loaded before this) ─────────
const STRATEGIES = {
  tight:      () => window.TightPlayer,
  aggressive: () => window.AggressivePlayer,
  loose:      () => window.LoosePlayer,
};
