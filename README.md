# Token Radar (radar-2)

A radar for protocol token launches that do not exist yet. It reads the sealed
DefiLlama snapshot from `/input/snapshot.json`, ranks every pre-token protocol by an
implied launch value, and hands in a dashboard a reader can use: the ranked board, a
detail view for each protocol with the model's own arithmetic and a farm plan, and a
live model sandbox.

## The model (radar-2)

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.04 x min(chains - 1, 5)) )
```

- **TVL** is the size of the launch: a token's first market is the protocol's own users.
- **Seven-day growth** is momentum, clamped so one spike cannot carry a row.
- **Age with no token** is maturity: the longer a protocol has run with no token, the
  more likely the token is the exit that is left.
- **Chain breadth** is reach: each extra chain is more users to launch to (+4% each, to 5).

Age unknown uses 365 days. One function scores every row; no protocol name is special-cased.

## What is set aside, and why

A wrapped, staked or bridged product of a token that already trades is not a launch:
WBTC is Bitcoin on Ethereum, a staked-ETH product is ETH in a staking wrapper. radar-2
sets those aside (computed from the snapshot's own fields — a bridge / liquid-staking /
restaking / CEX category, a name carrying a whole word wrapped, staked or staking, or a
name starting with an exchange's name), shows them counted by reason on the Set aside
tab, and never ranks them. Protocols whose token already trades are shown apart with
their market caps. The board says a protocol *records no token* — never that it has none.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output
directory and `dossier.json` with `vendor/makefun-board.ts`. Node 22, standard library
only, no network, deterministic.

## Layout

- `main.ts` — the entry program.
- `lib/model.ts` — the snapshot, the radar-2 model, the board, the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library (copied from the kit, unchanged).
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — three renders of this dashboard: the board, a detail view, a filtered view.
