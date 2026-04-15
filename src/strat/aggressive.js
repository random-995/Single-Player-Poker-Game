'use strict';
// Aggressive player: wide range, raises frequently and large, applies pressure.
window.AggressivePlayer = {
  name: 'Aggressive',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal }) {
    const isFree = callAmount <= 0;

    // Fold true trash when facing a real bet
    if (handStrength < 0.18 && !isFree) return { action: 'fold' };

    // Raise ~75% of the time with decent hands
    if (handStrength > 0.25 && minRaiseTotal <= maxRaiseTotal) {
      if (Math.random() < 0.75) {
        const mult = 2.5 + Math.random() * 2.5;       // 2.5x–5x raise
        const amount = Math.min(Math.floor(minRaiseTotal * mult), maxRaiseTotal);
        return { action: 'raise', amount };
      }
    }

    return { action: 'call' };
  }
};
