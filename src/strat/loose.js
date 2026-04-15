'use strict';
// Loose player: plays almost any two cards, calls a lot, occasional raise.
window.LoosePlayer = {
  name: 'Loose',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal }) {
    const isFree = callAmount <= 0;

    // Only folds truly terrible hands under pressure
    if (handStrength < 0.14 && !isFree && Math.random() < 0.60) {
      return { action: 'fold' };
    }

    // Occasional raise with decent hands
    if (handStrength > 0.58 && minRaiseTotal <= maxRaiseTotal && Math.random() < 0.28) {
      const amount = Math.min(Math.floor(minRaiseTotal * 2), maxRaiseTotal);
      return { action: 'raise', amount };
    }

    // Otherwise just call/check everything
    return { action: 'call' };
  }
};
