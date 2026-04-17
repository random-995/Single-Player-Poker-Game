# No-Limit Hold'em

A browser-based no-limit Texas Hold'em poker game. Play against AI opponents, spectate full robot games, and use special skills to gain an edge.

## Play

Open `index.html` in any modern browser. No server or build step required to play.

## Setup

Choose a mode on the start screen:

- **Play as human** — you sit at Seat 1 and act each round. Pick an optional skill for yourself and configure the robot opponents in the remaining seats.
- **Spectate** — all seats are robots; watch the game play out automatically.

Configure 2–10 seats and optionally set a seed for reproducible deals.

## Robots

Each robot seat has two independent settings:

| Setting | Options | Effect |
|---|---|---|
| **Player** | W.M, Thief, Neumann | Robot's name and special skill |
| **Strategy** | Tight, Aggressive, Loose | How the robot bets |

### Strategies

All three strategies share the same decision logic; they differ only in their parameters. Pre-flop thresholds scale automatically with player count so that, for example, a tight robot joins roughly 1-in-N hands at an N-player table.

| Parameter | Tight | Aggressive | Loose |
|---|---|---|---|
| Pre-flop fold factor | 1.3× | 1.0× | 1.0× |
| Pre-flop raise factor | 1.5× | 1.2× | 1.5× |
| Post-flop fold threshold | 0.50 | 0.50 | 0.40 |
| Post-flop raise threshold | 0.75 | 0.60 | 0.70 |
| Fold rate (when weak) | 90% | 70% | 50% |
| Max call-fold rate | 40% | 50% | 80% |
| Raise size (BB multiples) | 3–10 | 3–10 | 3–10 |
| All-in stack threshold | 10 BB | 20 BB | 15 BB |
| All-in strength threshold | 0.80 | 0.60 | 0.80 |
| All-in rate | 60% | 60% | 50% |

**Call-fold pressure** — if the call amount exceeds 3 BB, the robot may fold even a marginal calling hand. The probability scales from 10% at 3 BB up to the max call-fold rate at ~20 BB.

**Raise-once rule** — each robot raises at most once per street. If re-raised after already raising, it just calls.

## Skills

Each player (human or robot) can hold at most one skill.

| Skill | Who | Effect |
|---|---|---|
| **Swap** | Thief / human | Replaces the weaker hole card from the deck before pre-flop betting. Robots use it automatically when pre-flop equity is below 40%. |
| **River Prediction** | Neumann / human | Before the turn betting round, peeks at one randomly selected hidden card (an opponent's hole card or the river card). Uses the revealed card to compute a weighted equity estimate. |

## Console Commands

Open the console panel at the bottom of the screen to use these commands:

| Command | Description |
|---|---|
| `score` | Show each active player's perceived win probability (Monte Carlo, opponents assumed random). |
| `score <name>` | Show perceived win probability for one player. |
| `matchup` | Show actual win probabilities for all active players using their real hole cards (Monte Carlo, true matchup). |
| `chips <name> <amount>` | Set a player's chip count mid-game. |
| `chips all <amount>` | Set all active players' chip counts. |
| `swap` | Use your Swap skill (requires Swap skill). |
| `tarot` | Draw one tarot card. |
| `tarot N` | Draw N tarot cards (up to 10). |
| `NdM` | Roll N dice with M faces (e.g. `2d6`, `1d20`). |

**score vs matchup** — `score` computes each player's equity independently, treating opponents as random (perceived equity). `matchup` fixes everyone's actual hole cards and computes true head-to-head probabilities that sum to 100%.

## Side Pots

Side pots are handled automatically. When a short-stacked player goes all-in, they can only win the portion of the pot they contributed to. Separate side pots are created for each all-in level and awarded independently at showdown.

## Equity Engine

Win probability calculations use [poker-odds-calc](https://github.com/rundef/poker-odds-calc) via Monte Carlo simulation. To rebuild the bundled equity calculator after editing `src/equity.js`:

```
npm install
npm run build
```

## Project Structure

```
index.html               UI and setup screen
style.css                Styles
src/
  boot.js                Setup screen wiring and game initialisation
  cards.js               Card, Deck, hand evaluator, hand-strength helpers
  game.js                Game loop, betting rounds, side pots, skill application
  ui.js                  Rendering and console command handling
  equity.js              Equity calculator source (requires build)
  equity.bundle.js       Browser-ready bundle of equity.js
  strat/
    strategy.js          Robot betting strategies (tight, aggressive, loose)
  players/
    neumann.js           Neumann robot (river prediction skill)
    thief.js             Thief robot (swap skill)
    wm.js                W.M robot
```
