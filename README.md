# No-Limit Hold'em

A browser-based no-limit Texas Hold'em poker game. Play against AI opponents, spectate full robot games, and use special skills to gain an edge.

## Play

Open `index.html` in any modern browser. No server required.

## Setup

On the start screen, choose a mode:

- **Play as human** — you sit at Seat 1 and act each round. Pick an optional skill for yourself and configure the robot opponents in the remaining seats.
- **Spectate** — all seats are robots; watch the game play out automatically.

Configure up to 4 seats and optionally set a seed for reproducible deals.

## Robots

Each robot seat has two independent settings:

| Setting | Options | Effect |
|---|---|---|
| **Player** | W.M, Thief, Neumann | Determines the robot's name and special skill |
| **Strategy** | Tight, Aggressive, Loose | Determines how the robot bets |

### Strategies

- **Tight** — folds weak hands, raises only with strong ones.
- **Aggressive** — bets and raises frequently.
- **Loose** — calls widely, rarely folds.

## Skills

Skills are special abilities that give a player an edge. Each player (human or robot) can hold at most one skill.

| Skill | Who | Effect |
|---|---|---|
| **Swap** | Thief / human | Replaces the weaker hole card from the deck before pre-flop betting. Robots use it automatically when pre-flop strength is below 40%. |
| **Prediction** | Neumann / human | Before the turn betting round, peeks at one randomly selected hidden card (an opponent's hole card or the river). Uses the revealed card to compute a weighted hand-strength estimate. |

## Console Commands

The console panel at the bottom of the screen accepts the following commands:

| Command | Description |
|---|---|
| `score` | Show the winning probability for every active player, calculated using actual hole cards via exhaustive board enumeration. |
| `score <name>` | Show the winning probability for a single player (case-insensitive). |
| `swap` | Use your Swap skill (requires the Swap skill). |
| `prediction` | Use your Prediction skill during the turn betting round (requires the Prediction skill). |
| `tarot` | Draw one tarot card. |
| `tarot N` | Draw N tarot cards (up to 10). |
| `NdM` | Roll N dice with M faces (e.g. `2d6`, `1d20`). |

## Equity Calculation

`score` uses [poker-odds-calc](https://github.com/rundef/poker-odds-calc) to compute true winning equity. All active players' hole cards are passed to an exhaustive board enumerator, which iterates over every possible remaining runout and tallies wins and ties. The result is each player's exact share of future outcomes — not a hand-score heuristic.

To rebuild the bundled equity calculator after editing `equity.js`:

```
npm install
npm run build
```

## Project Structure

```
index.html          — UI and setup screen
style.css           — Styles
constants.js        — Game constants (blinds, chip counts, hand names)
cards.js            — Card, Deck, hand-evaluation logic
game.js             — Game loop, betting rounds, skill application
ui.js               — Rendering and console command handling
boot.js             — Setup screen wiring and game initialisation
equity.js           — Source for the equity calculator (requires build)
equity.bundle.js    — Browser-ready bundle of equity.js
strat/              — Robot betting strategies (tight, aggressive, loose)
players/            — Robot player definitions (W.M, Thief, Neumann)
```
