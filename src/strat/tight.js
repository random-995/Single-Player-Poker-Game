'use strict';
// Tight player: only enters with strong hands; raises confidently when strong.
window.TightPlayer = {
  name: 'Tight',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal, street }) {
    const isFree = callAmount <= 0;

    // Preflop: selective entry, raises with solid hands
    if (street === 0) {
      if (handStrength < 0.46) return isFree ? { action: 'call' } : { action: 'fold' };
      if (handStrength < 0.58) return { action: 'call' };
      // Good hand: raise 3x
      const amount = Math.min(Math.floor(minRaiseTotal * 3), maxRaiseTotal);
      return amount > minRaiseTotal ? { action: 'raise', amount } : { action: 'call' };
    }

    // Postflop: folds weak, raises more readily with strong hands
    if (handStrength < 0.40) return isFree ? { action: 'call' } : { action: 'fold' };
    if (handStrength < 0.60) return { action: 'call' };
    // Strong hand: 2.5x raise
    const amount = Math.min(Math.floor(minRaiseTotal * 2.5), maxRaiseTotal);
    return amount >= minRaiseTotal ? { action: 'raise', amount } : { action: 'call' };
  }
};
