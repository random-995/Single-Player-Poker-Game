'use strict';

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() { return Math.floor(Math.random() * 0xFFFFFFFF); }

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Card ──────────────────────────────────────────────────────────────────
class Card {
  constructor(suit, rank) { this.suit = suit; this.rank = rank; }
  getValue() {
    return {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
            '10':10,'J':11,'Q':12,'K':13,'A':14}[this.rank] || 0;
  }
  toString() { return this.rank + this.suit; }
}

// ── Deck (shuffled, optionally seeded) ────────────────────────────────────
class Deck {
  constructor(seed) {
    this.cards = [];
    for (const suit of ['♠','♥','♦','♣'])
      for (const rank of ['2','3','4','5','6','7','8','9','10','J','Q','K','A'])
        this.cards.push(new Card(suit, rank));
    const rng = (seed !== undefined && seed !== '') ? mulberry32(+seed) : Math.random.bind(Math);
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal() { return this.cards.pop(); }
}

// ── Hand evaluator ────────────────────────────────────────────────────────
function combos5(arr) {
  const out = [];
  const n = arr.length;
  for (let a = 0;   a < n-4; a++)
  for (let b = a+1; b < n-3; b++)
  for (let c = b+1; c < n-2; c++)
  for (let d = c+1; d < n-1; d++)
  for (let e = d+1; e < n;   e++)
    out.push([arr[a],arr[b],arr[c],arr[d],arr[e]]);
  return out;
}

function scoreFive(cards) {
  const vals   = cards.map(c => c.getValue()).sort((a,b) => b-a);
  const suits  = cards.map(c => c.suit);
  const flush  = suits.every(s => s === suits[0]);
  const cnt    = {};
  vals.forEach(v => { cnt[v] = (cnt[v]||0)+1; });
  const groups  = Object.entries(cnt).map(([v,c]) => [+v,+c]).sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const counts  = groups.map(g => g[1]);
  const gv      = groups.map(g => g[0]);
  const uniq    = [...new Set(vals)];
  const straight = uniq.length===5 && vals[0]-vals[4]===4;
  const wheel    = uniq.length===5 && vals[0]===14&&vals[1]===5&&vals[2]===4&&vals[3]===3&&vals[4]===2;
  let type, tb;
  if      ((straight||wheel)&&flush)     { type=8; tb=[wheel?5:vals[0]]; }
  else if (counts[0]===4)                { type=7; tb=gv; }
  else if (counts[0]===3&&counts[1]===2) { type=6; tb=gv; }
  else if (flush)                        { type=5; tb=vals; }
  else if (straight||wheel)              { type=4; tb=[wheel?5:vals[0]]; }
  else if (counts[0]===3)                { type=3; tb=gv; }
  else if (counts[0]===2&&counts[1]===2) { type=2; tb=gv; }
  else if (counts[0]===2)                { type=1; tb=gv; }
  else                                   { type=0; tb=vals; }
  let score = type * 15**5;
  tb.forEach((v,i) => { score += v * 15**(4-i); });
  return { score, type };
}

function bestHand(hole, board) {
  const all = [...hole, ...board];
  let best  = { score: -1, type: -1 };
  for (const combo of combos5(all)) {
    const ev = scoreFive(combo);
    if (ev.score > best.score) best = ev;
  }
  return best;
}

// ── Preflop hand strength (0–1 scale, Chen-inspired) ──────────────────────
function preflopStrength(hole) {
  const [c1, c2] = hole;
  const r1 = c1.getValue(), r2 = c2.getValue();
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  const suited = c1.suit === c2.suit, pair = r1 === r2, gap = hi - lo;
  let s = hi;
  if (pair)   s = Math.max(hi * 2, 5);
  if (suited) s += 2;
  if (gap===1) s+=1; else if (gap===3) s-=1; else if (gap===4) s-=2; else if (gap>4) s-=4;
  return Math.min(Math.max(s / 26, 0), 1);
}

const MAX_HAND_SCORE = 8*15**5 + 14*(15**4 + 15**3 + 15**2 + 15 + 1);

// Exposed for robot strategy files
// numOpponents: how many active opponents (used for equity calc postflop)
window.computeHandStrength = function(hole, board, street, numOpponents) {
  if (window.computeEquity) return window.computeEquity(hole, board, numOpponents);
  if (street === 0 || board.length < 3) return preflopStrength(hole);
  return Math.min(bestHand(hole, board).score / MAX_HAND_SCORE, 1);
};
