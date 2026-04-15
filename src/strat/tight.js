'use strict';
// Tight player: only enters with strong hands; raises with premiums.
window.TightPlayer = {
  name: 'Tight',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal, street }) {
    const isFree = callAmount <= 0;

    // Preflop: very selective
    if (street === 0) {
      if (handStrength < 0.46) return isFree ? { action: 'call' } : { action: 'fold' };
      if (handStrength < 0.70) return { action: 'call' };
      // Premium — raise 2.5x
      const amount = Math.min(Math.floor(minRaiseTotal * 2.5), maxRaiseTotal);
      return amount > minRaiseTotal ? { action: 'raise', amount } : { action: 'call' };
    }

    // Postflop: conservative
    if (handStrength < 0.40) return isFree ? { action: 'call' } : { action: 'fold' };
    if (handStrength < 0.70) return { action: 'call' };
    // Strong hand: pot-sized raise
    const amount = Math.min(Math.floor(minRaiseTotal * 2), maxRaiseTotal);
    return amount >= minRaiseTotal ? { action: 'raise', amount } : { action: 'call' };
  }
};
