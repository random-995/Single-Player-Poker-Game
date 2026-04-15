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
      predictionCard: null,
      predictionN:    0,
    }));
    this.deck            = null;
    this.board           = [];
    this.fullBoard       = [];
    this.pot             = 0;
    this.currentBet      = 0;
    this.lastRaise       = BIG_BLIND;
    this.street          = 0;
    this.dealerSeat      = 3;
    this.handNum         = 0;
    this.actor           = -1;
    this.showdown        = false;
    this.allHandLogs     = [];   // [{handNum, entries:[{msg,cls}]}]
    this.pendingNextSeed = '';
    this.humanCanPredict = false;
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
    for (let i = 1; i <= 4; i++) {
      const s = (seat + i) % 4;
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

    do { this.dealerSeat = (this.dealerSeat + 1) % 4; }
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
      p.predictionCard = null;
      p.predictionN    = 0;
    });

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
    for (let i = dealtPlayers.length - 1; i >= 0; i--)
      this.addLog(`${dealtPlayers[i].name}: ${dealtPlayers[i].hand.map(c => c.toString()).join(' ')}`);
    this.addLog('── Dealt ──');
    render();

    await this._applySwapSkills();

    // ② Wait before pre-flop bets
    showNextStreetBtn(); await waitForNextStreet(); hideNextStreetBtn();

    let firstActor;
    if (this.blindBets) {
      const sb = this.nextSeat(this.dealerSeat);
      const bb = this.nextSeat(sb);
      this._blind(sb, SMALL_BLIND);
      this._blind(bb, BIG_BLIND);
      this.currentBet = BIG_BLIND;
      this.lastRaise  = BIG_BLIND;
      this.addLog(`${this.p(sb).name} posts SB $${SMALL_BLIND}`);
      this.addLog(`${this.p(bb).name} posts BB $${BIG_BLIND}`);
      firstActor = this.nextSeat(bb);
    } else {
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
    this._applyPredictionSkill();
    this.humanCanPredict = this.players.some(p => p.isHuman && p.skill === 'prediction' && !p.folded);
    render();

    await this.bettingRound(this.nextSeat(this.dealerSeat));
    this.humanCanPredict = false;
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

  // ── Prediction skill: peek one hidden card before turn betting ───────────
  _applyPredictionSkill() {
    for (const p of this.players) {
      if (p.isHuman || p.folded || p.skill !== 'prediction') continue;
      // Hidden cards = active opponents' hole cards + the river card (next in deck)
      const hidden = [];
      for (const op of this.players) {
        if (op === p || op.folded || op.eliminated) continue;
        hidden.push(...op.hand);
      }
      if (this.fullBoard.length > 4)
        hidden.push(this.fullBoard[4]);
      if (hidden.length === 0) continue;
      const idx  = Math.floor(Math.random() * hidden.length);
      const card = hidden[idx];
      p.predictionCard = card;
      p.predictionN    = hidden.length;
      this.addLog(`${p.name} predicts: sees ${card} (1 of ${hidden.length} hidden)`);
    }
  }

  // Called by console "prediction calculation" — turn round only
  doHumanPrediction() {
    const human = this.players.find(p => p.isHuman && !p.folded && p.skill === 'prediction');
    if (!human || !this.humanCanPredict) return null;
    // Hidden cards = active opponents' hole cards + the river card (next in deck)
    const hidden = [];
    for (const p of this.players) {
      if (p === human || p.folded || p.eliminated) continue;
      hidden.push(...p.hand);
    }
    if (this.fullBoard.length > 4)
      hidden.push(this.fullBoard[4]);
    if (hidden.length === 0) return null;
    const idx  = Math.floor(Math.random() * hidden.length);
    const card = hidden[idx];
    const N    = hidden.length;
    const baseStrength = window.computeHandStrength(human.hand, this.board, 2, this.active().length - 1);
    const withStrength = window.computeHandStrength(human.hand, [...this.board, card], 3, this.active().length - 1);
    const weighted     = (1 / N) * withStrength + ((N - 1) / N) * baseStrength;
    return { card, N, weighted };
  }

  _blind(seat, amount) {
    const p = this.p(seat), paid = Math.min(amount, p.chips);
    p.chips -= paid; p.betRound = paid; this.pot += paid;
    if (p.chips === 0) p.allIn = true;
  }

  // ── Betting round ─────────────────────────────────────────────────────────
  async bettingRound(firstSeat) {
    if (this.street > 0) {
      this.currentBet = 0; this.lastRaise = BIG_BLIND;
      this.players.forEach(p => { p.betRound = 0; });
    }

    let queue = [];
    for (let i = 0; i < 4; i++) {
      const s = (firstSeat + i) % 4;
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
        showButtons(callAmt, this.currentBet, this.lastRaise, p.chips, p.betRound);
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
        for (let i = 1; i <= 3; i++) {
          const s = (seat + i) % 4;
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
    if (p.skill === 'prediction' && this.street === 2 && p.predictionCard) {
      const N = p.predictionN;
      const strengthWith = window.computeHandStrength(p.hand, [...this.board, p.predictionCard], 3, this.active().length - 1);
      handStrength = (1 / N) * strengthWith + ((N - 1) / N) * handStrength;
    }
    const dec  = strat.decide({
      holeCards:    p.hand,      communityCards: this.board,
      handStrength,
      callAmount:   callAmt,     minRaiseTotal:  minR,
      maxRaiseTotal: maxR,       myStack:         p.chips,
      myTotalBet:   p.betRound,  street:          this.street,
      pot:          this.pot,    numActive:       this.active().length,
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
        p.chips -= paid; p.betRound += paid; this.pot += paid;
        if (p.chips === 0) { p.allIn = true; this.addLog(`${p.name} calls $${paid} (all-in)`); }
        else this.addLog(`${p.name} calls $${paid}`);
      }
    } else if (action.action === 'raise') {
      const addl = action.amount - p.betRound;
      const paid = Math.min(addl, p.chips);
      p.chips -= paid; p.betRound += paid; this.pot += paid;
      this.lastRaise  = p.betRound - this.currentBet;
      this.currentBet = p.betRound;
      if (p.chips === 0) { p.allIn = true; this.addLog(`${p.name} raises to $${p.betRound} (all-in)`); }
      else this.addLog(`${p.name} raises to $${p.betRound}`);
    }
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
      let best = -1, winners = [];
      const handTypes = {};
      for (const p of inHand) {
        const { score, type } = bestHand(p.hand, this.board);
        handTypes[p.id] = type;
        this.addLog(`${p.name}: ${p.hand.map(c => c.toString()).join(' ')} — ${HAND_NAMES[type]}`);
        if (score > best)       { best = score; winners = [p]; }
        else if (score === best)  winners.push(p);
      }
      const share = Math.floor(this.pot / winners.length);
      for (const w of winners) { w.chips += share; this.addLog(`${w.name} wins $${share}`, 'win'); }
      for (const p of inHand)  { p.result = HAND_NAMES[handTypes[p.id]]; p.resultWon = winners.includes(p); }
      this.pot = 0; render();
    }
    showNextHandPanel();
    await new Promise(resolve => { resolveNextHand = resolve; });
    hideNextHandPanel();
  }
}
