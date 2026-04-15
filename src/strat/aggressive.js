'use strict';
// Aggressive player: wide range, raises frequently, applies pressure.
window.AggressivePlayer = {
  name: 'Aggressive',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal }) {
    const isFree = callAmount <= 0;

    // Bluff-fold threshold: only fold true trash when facing a real bet
    if (handStrength < 0.18 && !isFree) return { action: 'fold' };

    // Raise ~55% of the time when strong enough
    if (handStrength > 0.30 && minRaiseTotal <= maxRaiseTotal) {
      if (Math.random() < 0.55) {
        const mult = 2 + Math.random() * 2;          // 2x–4x raise
        const amount = Math.min(Math.floor(minRaiseTotal * mult), maxRaiseTotal);
        return { action: 'raise', amount };
      }
    }

    return { action: 'call' };
  }
};
