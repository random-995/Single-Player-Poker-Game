'use strict';

// ── Shared mutable state (accessible across all scripts) ──────────────────
var G               = null;
var resolveHuman    = null;
var resolveNextHand = null;
var resolveNextStreet = null;
var playerCardsVisible = [false, false, false, false];
var viewingHandIdx  = -1;

// ── Game class ────────────────────────────────────────────────────────────
class Game {
  constructor(configs, options = {}) {
    this.blindBets    = options.blindBets !== false;
    this.startingChips = options.startingChips || STARTING_CHIPS;
    this.players   = configs.map((cfg, i) => ({
      id:           i,
      name:         cfg.label,
      isHuman:      cfg.type === 'human',
      strategy:     cfg.type === 'human' || cfg.type === 'empty' ? null : cfg.type,
      skill:        cfg.skill || null,
      chips:        cfg.type === 'empty' ? 0 : this.startingChips,
      hand:         [],
      folded:       cfg.type === 'empty',
      allIn:        false,
      betRound:     0,
      eliminated:   cfg.type === 'empty',
      wantsToLeave: false,
      result:         '',
      resultWon:      false,
      contributed:      0,        // total chips put into pot this hand (for side-pot calculation)
      raisedThisRound:  false,   // true once this player has raised in the current betting street
      riverPredictions: null,   // [cardA, cardB] — one is real river, one is fake; order is random
    }));
    this.deck            = null;
    this.board           = [];
    this.fullBoard       = [];
    this.pot             = 0;
    this.currentBet      = 0;
    this.lastRaise       = BIG_BLIND;
    this.street          = 0;
    this.dealerSeat      = this.players.length - 1;
    this.handNum         = 0;
    this.actor           = -1;
    this.showdown        = false;
    this.allHandLogs     = [];   // [{handNum, entries:[{msg,cls}]}]
    this.pendingNextSeed = '';
    this.sbSeat          = -1;
    this.bbSeat          = -1;
  }

  get currentLog() {
    return this.allHandLogs.length
      ? this.allHandLogs[this.allHandLogs.length - 1].entries
      : [];
  }

  p(i)     { return this.players[i]; }
  active() { return this.players.filter(p => !p.folded); }

  addLog(msg, cls = '') {
    if (!this.allHandLogs.length) return;
    this.allHandLogs[this.allHandLogs.length - 1].entries.unshift({ msg, cls });
  }

  nextSeat(seat) {
    const N = this.players.length;
    for (let i = 1; i <= N; i++) {
      const s = (seat + i) % N;
      if (!this.players[s].folded && this.players[s].chips > 0 && !this.players[s].eliminated)
        return s;
    }
    return seat;
  }

  // ── Main game loop ───────────────────────────────────────────────────────
  async run() {
    while (true) {
      this.players.forEach(p => {
        if (p.wantsToLeave && !p.isHuman) {
          p.eliminated = true; p.chips = 0; p.wantsToLeave = false;
          this.addLog(`${p.name} left the table.`);
        }
      });

      const alive = this.players.filter(p => p.chips > 0 && !p.eliminated);
      if (alive.length <= 1) {
        const w = alive[0];
        this._startHandLog(0);
        this.addLog(w ? `${w.name} wins the game.` : 'Game over.', 'win');
        render(); break;
      }

      const human = this.players.find(p => p.isHuman);
      if (human && human.chips <= 0) {
        this._startHandLog(0);
        this.addLog('You are out of chips.', 'loss'); render(); break;
      }

      await this.playHand();
    }
  }

  _startHandLog(handNum) {
    this.allHandLogs.push({ handNum, entries: [] });
    viewingHandIdx = this.allHandLogs.length - 1;
    updateLogSelector();
  }

  // ── One hand ─────────────────────────────────────────────────────────────
  async playHand() {
    this.handNum++;
    this.showdown = false;
    this._startHandLog(this.handNum);

    const N = this.players.length;
    do { this.dealerSeat = (this.dealerSeat + 1) % N; }
    while (this.players[this.dealerSeat].chips <= 0 || this.players[this.dealerSeat].eliminated);

    const seed = this.pendingNextSeed !== '' ? +this.pendingNextSeed : randomSeed();
    this.pendingNextSeed = '';
    this.addLog(`Seed: ${seed}`);

    this.deck        = new Deck(seed);
    this.board       = [];
    this.fullBoard   = [];
    this.pot         = 0;
    this.currentBet  = 0;
    this.lastRaise   = BIG_BLIND;
    this.street      = 0;
    this.actor       = -1;

    this.players.forEach(p => {
      if (p.wantsToLeave && !p.isHuman) {
        p.eliminated = true; p.chips = 0; p.wantsToLeave = false;
        this.addLog(`${p.name} left the table.`);
      }
      p.hand      = [];
      p.folded    = p.chips <= 0 || p.eliminated;
      p.allIn     = false;
      p.betRound  = 0;
      p.result         = '';
      p.resultWon      = false;
      p.contributed       = 0;
      p.raisedThisRound   = false;
      p.riverPredictions  = null;
    });

    // ── River prediction skill: two cards shown publicly, one real river one fake ──
    const numActive   = this.players.filter(p => !p.folded).length;
    const riverIdx    = 51 - (numActive * 2 + 4);
    const actualRiver = this.deck.cards[riverIdx];
    for (const p of this.players) {
      if (p.folded || p.skill !== 'river_prediction') continue;
      const others = this.deck.cards.filter(c => c !== actualRiver);
      const fakeRiver = others[Math.floor(Math.random() * others.length)];
      // Shuffle so no one knows which is real
      p.riverPredictions = Math.random() < 0.5
        ? [actualRiver, fakeRiver]
        : [fakeRiver, actualRiver];
      const hasHuman = this.players.some(pl => pl.isHuman);
      if (!hasHuman || p.isHuman) {
        this.addLog(`${p.name} predicts the river: ${p.riverPredictions[0]} or ${p.riverPredictions[1]}`, 'predict');
      }
    }

    // ① Wait before dealing
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();

    for (const p of this.players)
      if (!p.folded) p.hand = [this.deck.deal(), this.deck.deal()];

    // Pre-deal all 5 board cards upfront
    this.fullBoard = [
      this.deck.deal(), this.deck.deal(), this.deck.deal(), // flop
      this.deck.deal(),                                      // turn
      this.deck.deal(),                                      // river
    ];

    // Log dealt hands in seat order (add in reverse due to unshift)
    const dealtPlayers = this.players.filter(p => !p.folded);
    const hasHuman = this.players.some(p => p.isHuman);
    for (let i = dealtPlayers.length - 1; i >= 0; i--) {
      const dp = dealtPlayers[i];
      if (!hasHuman || dp.isHuman)
        this.addLog(`${dp.name}: ${dp.hand.map(c => c.toString()).join(' ')}`);
    }
    this.addLog('── Dealt ──');
    render();

    await this._applySwapSkills();

    // ② Wait before pre-flop bets
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();

    let firstActor;
    if (this.blindBets) {
      const sb = this.nextSeat(this.dealerSeat);
      const bb = this.nextSeat(sb);
      this.sbSeat = sb;
      this.bbSeat = bb;
      this._blind(sb, SMALL_BLIND);
      this._blind(bb, BIG_BLIND);
      this.currentBet = BIG_BLIND;
      this.lastRaise  = BIG_BLIND;
      this.addLog(`${this.p(sb).name} posts SB $${SMALL_BLIND}`);
      this.addLog(`${this.p(bb).name} posts BB $${BIG_BLIND}`);
      firstActor = this.nextSeat(bb);
    } else {
      this.sbSeat = -1;
      this.bbSeat = -1;
      firstActor = this.nextSeat(this.dealerSeat);
    }
    render();

    await this.bettingRound(firstActor);
    if (this.active().length <= 1) { await this.finish(); return; }

    // ③ Wait before flop
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();
    this.street = 1;
    this.board = this.fullBoard.slice(0, 3);
    this.addLog(`Flop: ${this.board.map(c => c.toString()).join(' ')}`);
    render();

    await this.bettingRound(this.nextSeat(this.dealerSeat));
    if (this.active().length <= 1) { await this.finish(); return; }

    // ④ Wait before turn
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();
    this.street = 2;
    this.board = this.fullBoard.slice(0, 4);
    this.addLog(`Turn: ${this.board[3].toString()}`);
    render();

    await this.bettingRound(this.nextSeat(this.dealerSeat));
    if (this.active().length <= 1) { await this.finish(); return; }

    // ⑤ Wait before river
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();
    this.street = 3;
    this.board = this.fullBoard.slice(0, 5);
    this.addLog(`River: ${this.board[4].toString()}`);
    render();

    await this.bettingRound(this.nextSeat(this.dealerSeat));
    await this.finish();
  }

  // ── Swap skill: replace weakest card before pre-flop ────────────────────
  async _applySwapSkills() {
    for (const p of this.players) {
      if (p.isHuman || p.folded || p.skill !== 'swap') continue;  // robots only
      if (preflopStrength(p.hand) < 0.40) {
        const swapIdx = p.hand[0].getValue() <= p.hand[1].getValue() ? 0 : 1;
        const oldCard = p.hand[swapIdx];
        p.hand[swapIdx] = this.deck.deal();
        this.addLog(`${p.name} uses Swap: ${oldCard} → ${p.hand[swapIdx]}`);
        render(); await delay(300);
      }
    }
  }

  // Called by console "swap" command — usable any time during a hand
  doHumanSwap() {
    const human = this.players.find(p => p.isHuman && !p.folded && p.skill === 'swap');
    if (!human || human.hand.length === 0) return false;
    const swapIdx = human.hand[0].getValue() <= human.hand[1].getValue() ? 0 : 1;
    const oldCard = human.hand[swapIdx];
    human.hand[swapIdx] = this.deck.deal();
    this.addLog(`You use Swap: ${oldCard} → ${human.hand[swapIdx]}`);
    render();
    return true;
  }

  _blind(seat, amount) {
    const p = this.p(seat), paid = Math.min(amount, p.chips);
    p.chips -= paid; p.betRound = paid; this.pot += paid; p.contributed += paid;
    if (p.chips === 0) p.allIn = true;
  }

  // ── Betting round ─────────────────────────────────────────────────────────
  async bettingRound(firstSeat) {
    if (this.street > 0) {
      this.currentBet = 0; this.lastRaise = BIG_BLIND;
      this.players.forEach(p => { p.betRound = 0; });
    }
    this.players.forEach(p => { p.raisedThisRound = false; });

    const N = this.players.length;
    let queue = [];
    for (let i = 0; i < N; i++) {
      const s = (firstSeat + i) % N;
      if (!this.p(s).folded && !this.p(s).allIn) queue.push(s);
    }

    let idx = 0;
    while (idx < queue.length) {
      const seat = queue[idx++];
      const p    = this.p(seat);
      if (p.folded || p.allIn) continue;

      if (p.wantsToLeave && !p.isHuman) {
        p.folded = true; p.eliminated = true; p.chips = 0; p.wantsToLeave = false;
        this.addLog(`${p.name} left the table.`);
        this.actor = -1; render(); continue;
      }

      const callAmt = Math.min(this.currentBet - p.betRound, p.chips);
      this.actor = seat; render();

      let action;
      if (p.isHuman) {
        showButtons(callAmt, this.currentBet, this.lastRaise, p.chips, p.betRound, p.raisedThisRound);
        action = await waitForHuman();
        hideButtons();
      } else {
        await delay(ROBOT_DELAY);
        action = this._robotDecide(seat, callAmt);
      }

      this.actor = -1;
      this._apply(seat, action, callAmt);
      render();

      if (action.action === 'raise') {
        const tail = [];
        for (let i = 1; i < N; i++) {
          const s = (seat + i) % N;
          if (!this.p(s).folded && !this.p(s).allIn) tail.push(s);
        }
        queue = queue.slice(0, idx).concat(tail);
      }
      if (this.active().length <= 1) break;
    }
    this.actor = -1;
  }

  _robotDecide(seat, callAmt) {
    const p    = this.p(seat);
    const strat = STRATEGIES[p.strategy]?.();
    if (!strat) return { action: 'call' };
    const minR = this.currentBet + this.lastRaise;
    const maxR = p.chips + p.betRound;
    let handStrength = window.computeHandStrength(p.hand, this.board, this.street, this.active().length - 1);
    // River prediction weighting: average equity over both predicted cards (one real, one fake)
    if (this.street < 3 && window.computePerceivedEquity) {
      const numOpp = this.active().length - 1;
      for (const pp of this.players) {
        if (!pp.riverPredictions) continue;
        const [c1, c2] = pp.riverPredictions;
        const s1 = window.computePerceivedEquity(p.hand, this.board, numOpp, 800, c1);
        const s2 = window.computePerceivedEquity(p.hand, this.board, numOpp, 800, c2);
        handStrength = 0.5 * s1 + 0.5 * s2;
        break;
      }
    }
    const dec  = strat.decide({
      holeCards:    p.hand,      communityCards: this.board,
      handStrength,
      callAmount:   callAmt,     minRaiseTotal:  minR,
      maxRaiseTotal: maxR,       myStack:         p.chips,
      myTotalBet:   p.betRound,  street:          this.street,
      pot:          this.pot,    numActive:       this.active().length,
      hasRaised:    p.raisedThisRound,
    });
    if (dec.action === 'raise') {
      const amt = Math.max(minR, Math.min(dec.amount, maxR));
      if (amt <= this.currentBet) return { action: 'call' };
      return { action: 'raise', amount: amt };
    }
    return dec;
  }

  _apply(seat, action, callAmt) {
    const p = this.p(seat);
    if (action.action === 'fold') {
      p.folded = true; this.addLog(`${p.name} folds`);
    } else if (action.action === 'call') {
      if (callAmt <= 0) {
        this.addLog(`${p.name} checks`);
      } else {
        const paid = Math.min(callAmt, p.chips);
        p.chips -= paid; p.betRound += paid; this.pot += paid; p.contributed += paid;
        if (p.chips === 0) { p.allIn = true; this.addLog(`${p.name} calls $${paid} (all-in)`); }
        else this.addLog(`${p.name} calls $${paid}`);
      }
    } else if (action.action === 'raise') {
      const addl = action.amount - p.betRound;
      const paid = Math.min(addl, p.chips);
      p.chips -= paid; p.betRound += paid; this.pot += paid; p.contributed += paid;
      this.lastRaise  = p.betRound - this.currentBet;
      this.currentBet = p.betRound;
      p.raisedThisRound = true;
      if (p.chips === 0) { p.allIn = true; this.addLog(`${p.name} raises to $${p.betRound} (all-in)`); }
      else this.addLog(`${p.name} raises to $${p.betRound}`);
    }
  }

  // ── Side-pot calculator ───────────────────────────────────────────────────
  // Returns [{size, eligible}] from smallest cap to largest.
  // eligible = non-folded players who can win that pot layer.
  _computeSidePots(showdownPlayers) {
    const contributors = this.players.filter(p => p.contributed > 0);
    contributors.sort((a, b) => a.contributed - b.contributed);
    const pots = [];
    let prev = 0;
    for (const c of contributors) {
      const cap = c.contributed;
      if (cap <= prev) continue;
      const numInLayer = contributors.filter(x => x.contributed > prev).length;
      const size       = (cap - prev) * numInLayer;
      const eligible   = showdownPlayers.filter(p => p.contributed >= cap);
      pots.push({ size, eligible: eligible.length > 0 ? eligible : showdownPlayers });
      prev = cap;
    }
    return pots;
  }

  // ── Award pot, show results, wait for Next Hand click ────────────────────
  async finish() {
    const inHand = this.active();
    if (inHand.length === 1) {
      inHand[0].chips    += this.pot;
      inHand[0].result    = 'uncontested';
      inHand[0].resultWon = true;
      this.addLog(`${inHand[0].name} wins $${this.pot} (uncontested)`, 'win');
      this.pot = 0; render();
    } else {
      this.showdown = true;
      this.addLog('── Showdown ──'); render(); await delay(400);

      // Score all showdown participants
      const scores = {}, handTypes = {};
      for (const p of inHand) {
        const { score, type } = bestHand(p.hand, this.board);
        scores[p.id]    = score;
        handTypes[p.id] = type;
        this.addLog(`${p.name}: ${p.hand.map(c => c.toString()).join(' ')} — ${HAND_NAMES[type]}`);
      }

      // Distribute side pots in order, accumulate winnings per player
      const wonPots   = new Set();
      const winTotals = {};
      for (const { size, eligible } of this._computeSidePots(inHand)) {
        if (size <= 0) continue;
        let best = -1, potWinners = [];
        for (const p of eligible) {
          if (scores[p.id] > best)       { best = scores[p.id]; potWinners = [p]; }
          else if (scores[p.id] === best)   potWinners.push(p);
        }
        const share = Math.floor(size / potWinners.length);
        const rem   = size - share * potWinners.length;
        for (const w of potWinners) {
          w.chips += share;
          wonPots.add(w.id);
          winTotals[w.id] = (winTotals[w.id] || 0) + share;
        }
        if (rem > 0) { potWinners[0].chips += rem; winTotals[potWinners[0].id] += rem; }
      }
      // One log line per winner
      for (const p of inHand) {
        if (winTotals[p.id]) this.addLog(`${p.name} wins $${winTotals[p.id]}`, 'win');
      }

      for (const p of inHand) {
        p.result    = HAND_NAMES[handTypes[p.id]];
        p.resultWon = wonPots.has(p.id);
      }
      this.pot = 0; render();
    }
    showNextHandPanel();
    await new Promise(resolve => { resolveNextHand = resolve; });
    hideNextHandPanel();
  }
}
