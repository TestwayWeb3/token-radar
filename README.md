# Token Radar

A token launch radar for the make.fun competition token-radar-01. It reads a sealed
snapshot of DeFi protocols, ranks the ones that record no token yet by an implied
launch value of its own, and writes a dashboard a reader can use to pick the next
protocol to farm.

## The value model

Implied value = TVL × 0.30 × a growth factor × an age factor.

- The growth factor comes from the protocol's seven-day TVL change, clamped to
  −60% … +300%, and runs from 0.70 to 2.50.
- The age factor comes from how many days the protocol has been tracked while
  recording no token, and runs from 0.85 to 1.15.
- Protocols that already record a token are ranked below every pre-token row, at
  1% of TVL, so the board separates launches still to come from tokens already
  trading. The board holds 217 rows: the 40 watchlist protocols, the other
  pre-token protocols that pass the same screen the watchlist uses (no
  exchange-named, wrapped, staked, bridged or CEX entries), and 20 launched
  protocols as a reference tail.

## Farm plans

Each row carries a plan built from the protocol's own category, main chain and
TVL band: a fresh wallet, a bridge, a first deposit, a second kind of activity,
weekly repeats for a month, and a staged exit. Every step says what to do, what
it costs and how long it takes.

## How to run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

The program needs Node 22 or later and nothing else — standard library only.
It writes `board.json`, `dashboard/` (with `data.js`), `screenshots/` and
`dossier.json` into the output directory. Two runs on the same snapshot write
byte-identical outputs.

## The dashboard

`dashboard/` is a static page with no network use: a sortable, filterable board,
a detail view for every protocol with its model breakdown and farm plan, and a
search box. Open `dashboard/index.html` in a browser after a run, once
`data.js` has been written beside it.
