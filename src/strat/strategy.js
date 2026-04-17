'use strict';

// ── Strategy constants ────────────────────────────────────────────────────
//
// Pre-flop uses Monte Carlo equity, which returns the actual win probability.
// With N active players, a random hand has equity ≈ 1/N (e.g. 0.25 for 4P).
// AA vs 3 opponents ≈ 0.63; KK ≈ 0.55; average ≈ 0.25.
// Thresholds are expressed as MULTIPLES of (1/numActive) so they scale
// automatically with player count.
//
// preflopFoldFactor    : fold pre-flop when equity < factor / numActive
// preflopRaiseFactor   : raise pre-flop when equity > factor / numActive
// postflopFoldStrength : fold post-flop when equity < this (absolute)
// postflopRaiseStrength: raise post-flop when equity ≥ this (absolute)
// foldRate             : probability of folding when below the fold threshold
//                        (1 - foldRate = chance of calling/bluffing with a weak hand)
// callFoldMaxRate      : max probability of folding due to a large call amount
//                        scales from 10% at 3BB call → callFoldMaxRate at ~20BB
// raiseBBMin/raiseBBMax: raise target is a uniform-random BB multiple in [min,max]
// raiseRate            : probability of raising when threshold is met
// allinBBThreshold     : shove all-in when stack < this many BBs …
// allinStrength        : … and equity ≥ this …
// allinRate            : … with this probability

const STRAT_PARAMS = {
  tight: {
    preflopFoldFactor:     1.3,
    preflopRaiseFactor:    1.3,
    postflopFoldStrength:  0.50,
    postflopRaiseStrength: 0.60,
    foldRate:              1.0,
    callFoldMaxRate:       0.40,
    raiseBBMin:            1,
    raiseBBMax:            6,
    raiseRate:             1.0,
    allinBBThreshold:      10,
    allinStrength:         0.80,
    allinRate:             0.60,
  },
  aggressive: {
    preflopFoldFactor:     1.3,
    preflopRaiseFactor:    1.3,
    postflopFoldStrength:  0.50,
    postflopRaiseStrength: 0.50,
    foldRate:              1.0,
    callFoldMaxRate:       0.50,
    raiseBBMin:            3,
    raiseBBMax:            8,
    raiseRate:             0.8,
    allinBBThreshold:      20,
    allinStrength:         0.60,
    allinRate:             0.60,
  },
  loose: {
    preflopFoldFactor:     1.3,
    preflopRaiseFactor:    1.3,
    postflopFoldStrength:  0.40,
    postflopRaiseStrength: 0.60,
    foldRate:              0.50,
    callFoldMaxRate:       0.80,
    raiseBBMin:            1,
    raiseBBMax:            6,
    raiseRate:             0.80,
    allinBBThreshold:      15,
    allinStrength:         0.80,
    allinRate:             0.50,
  },
};

// ── Shared decide logic ───────────────────────────────────────────────────
function makeDecide(params) {
  return function decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal, myStack, street, numActive, hasRaised }) {
    const isFree  = callAmount <= 0;
    const neutral = 1 / Math.max(1, numActive);

    if (street === 0) {
      const foldThreshold  = params.preflopFoldFactor  * neutral;
      const raiseThreshold = params.preflopRaiseFactor * neutral;

      if (handStrength < foldThreshold && Math.random() < params.foldRate)
        return isFree ? { action: 'call' } : { action: 'fold' };

      if (!hasRaised && handStrength >= raiseThreshold && Math.random() < params.raiseRate)
        return tryRaise(params, handStrength, myStack, minRaiseTotal, maxRaiseTotal);
    } else {
      if (handStrength < params.postflopFoldStrength && Math.random() < params.foldRate)
        return isFree ? { action: 'call' } : { action: 'fold' };

      if (!hasRaised && handStrength >= params.postflopRaiseStrength && Math.random() < params.raiseRate)
        return tryRaise(params, handStrength, myStack, minRaiseTotal, maxRaiseTotal);
    }

    // Large-call pressure: scale fold probability from 10% at 3BB up to callFoldMaxRate at ~20BB
    if (callAmount > 0) {
      const callBBs = callAmount / BIG_BLIND;
      if (callBBs > 3) {
        const t            = Math.min(1, (callBBs - 3) / 17);
        const callFoldProb = 0.10 + t * (params.callFoldMaxRate - 0.10);
        if (Math.random() < callFoldProb) return { action: 'fold' };
      }
    }

    return { action: 'call' };
  };
}

function tryRaise(params, handStrength, myStack, minRaiseTotal, maxRaiseTotal) {
  if (maxRaiseTotal <= minRaiseTotal) return { action: 'call' };
  if (myStack / BIG_BLIND < params.allinBBThreshold
      && handStrength >= params.allinStrength
      && Math.random() < params.allinRate) {
    return { action: 'raise', amount: maxRaiseTotal };
  }
  const bbMult = params.raiseBBMin + Math.floor(Math.random() * (params.raiseBBMax - params.raiseBBMin + 1));
  const amount = Math.max(minRaiseTotal, bbMult * BIG_BLIND);
  if (amount <= maxRaiseTotal) return { action: 'raise', amount };
  return { action: 'call' };
}

// ── Register strategy objects (keep same names for STRATEGIES registry) ──
window.TightPlayer      = { name: 'Tight',      decide: makeDecide(STRAT_PARAMS.tight)      };
window.AggressivePlayer = { name: 'Aggressive', decide: makeDecide(STRAT_PARAMS.aggressive) };
window.LoosePlayer      = { name: 'Loose',      decide: makeDecide(STRAT_PARAMS.loose)      };
