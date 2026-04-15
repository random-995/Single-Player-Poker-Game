'use strict';
// Loose player: plays almost any two cards, calls a lot, raises with decent hands.
window.LoosePlayer = {
  name: 'Loose',
  decide({ handStrength, callAmount, minRaiseTotal, maxRaiseTotal }) {
    const isFree = callAmount <= 0;

    // Only folds truly terrible hands under pressure
    if (handStrength < 0.14 && !isFree && Math.random() < 0.60) {
      return { action: 'fold' };
    }

    // Raise more often with decent hands
    if (handStrength > 0.48 && minRaiseTotal <= maxRaiseTotal && Math.random() < 0.50) {
      const amount = Math.min(Math.floor(minRaiseTotal * 2.5), maxRaiseTotal);
      return { action: 'raise', amount };
    }

    return { action: 'call' };
  }
};
