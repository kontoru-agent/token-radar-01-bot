// radar-2: the token radar's scoring model. One sealed snapshot goes in, one ranked
// board comes out — every pre-token protocol the snapshot carries, strongest implied
// launch value first.
//
// The watchlist is the floor, not the ceiling. The board holds all forty of its slugs
// and then ranks every other pre-token protocol besides: the early rows are the reason
// this radar exists. Pre-token means the index entry records no token at all — no market
// cap, no CoinGecko id, no symbol. Protocols whose token already trades are kept apart
// and shown at the market's own values, never mixed into the ranked board.
//
// A wrapped, staked or bridged product of a token that already trades is not a launch.
// WBTC is Bitcoin on Ethereum; a staked-ETH product is ETH in a staking wrapper. The
// set-aside rules below (see rankable) catch those from the snapshot's own fields for
// every protocol alike — a bridge, liquid-staking, restaking or CEX category, a name
// carrying a whole word wrapped, staked or staking, a name that starts with an
// exchange's name, or a name ending in a version marker. No name is ever special-cased;
// the protocols set aside are shown on the dashboard, counted by reason, never ranked.
//
// Implied value comes only from the snapshot's own figures:
//
//   base     = tvl_usd x BASE_MULTIPLE
//   growth   = clamp(change_7d, -60, 120) per cent
//   growth   multiplier = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity multiplier = 0.6 + min(age_days, 1095) / 1095 x 0.4
//       (age_days unknown: 365)
//   chain    multiplier = 1 + CHAIN_BONUS x min(chains - 1, 5)
//       (each extra chain: more users to launch to; a single-chain protocol scores 1.00)
//   implied  = max(1, round(base x growth x maturity x chain))
//
// The constants are this model's own, stated on the dashboard and changeable in its
// sandbox. One function scores every row; no protocol name is ever special-cased.
// The values below are the model: change one and every row's implied value moves.

/** One protocol entry of the snapshot: the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document, whole. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus: number;
  chain_cap: number;
}

export const MODEL: ModelConstants =
  {
    base_multiple: 0.25,
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.6,
    maturity_range: 0.4,
    maturity_days: 1095,
    unknown_age_days: 365,
    chain_bonus: 0.04,
    chain_cap: 5,
  };

/** The version label the dashboard prints beside the model, and the rules quote. */
export const MODEL_VERSION = 'radar-2' as const;

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS: number = 24;

/** One farm step: its action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: a ranked protocol and the model's arithmetic for it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  /** One line, in the model's own words, naming what drives this rank. */
  why: string;
  farm_steps: string[];
}

/** One board row in the dashboard's compact form; the page builds the farm plan itself. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  why: string;
}

/** One live-token protocol: it already trades, so the board shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One pre-token protocol set aside instead of ranked, and the rule that set it aside. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard renders: board, live set, set-aside set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
}

/** The headline figures: watchlist slugs, rows, and live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Thrown when the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** The number in `value` when it is finite, else `fallback`. */
function numOr(value: unknown, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  if (!Number.isFinite(value)) return fallback;
  return value;
}

/** Whole days from `listedAt` to `asOf`, never below zero; null when a date is missing or bad. */
export function ageDays(
  asOf: string,
  listedAt: string | null,
): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  const days = Math.floor((asOfMs - listedMs) / MS_PER_DAY);
  return days < 0 ? 0 : days;
}

/** One protocol's multipliers and implied value under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = numOr(protocol.change_7d, 0);
  const growthPct = Math.max(model.growth_floor, Math.min(model.growth_cap, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age === null ? model.unknown_age_days : age;
  const cappedAge = Math.max(0, Math.min(ageForModel, model.maturity_days));
  const maturityMult = model.maturity_floor + (cappedAge / model.maturity_days) * model.maturity_range;
  const extraChains = Math.max(0, Math.min(protocol.chains.length - 1, model.chain_cap));
  const chainMult = 1 + model.chain_bonus * extraChains;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.round(base * growthMult * maturityMult * chainMult);
  return { implied: implied < 1 ? 1 : implied, growthPct, growthMult, maturityMult, chainMult, age };
}

/** A name ending in a release marker is a pool of another protocol, not a launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name saying the product is wrapped, staked or staking: a wrapper of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name starting with an exchange's name: the exchange's own product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories holding wrapped, staked, bridged or exchange products, not launches of their own. */
const SET_ASIDE_CATEGORIES = new Set(
  ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'],
);

/** Why a pre-token protocol is set aside instead of ranked; null when it ranks. */
export function setAsideReason(
  p: SnapshotProtocol,
): string | null {
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) {
    return `category ${p.category} — a wrapped, staked or bridged product`;
  }
  if (WRAPPED_WORD.test(p.name)) {
    return 'name says wrapped, staked or staking — a wrapper of a token that trades';
  }
  if (EXCHANGE_PREFIX.test(p.name)) return "an exchange's own product";
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  return null;
}

/** Whether a protocol's entry records no token at all. */
export function isPreToken(
  p: SnapshotProtocol,
): boolean {
  if (p.mcap_usd !== null) return false;
  if (p.gecko_id !== null) return false;
  if (p.symbol !== null) return false;
  return true;
}

/** Whether a protocol may rank: pre-token, with none of the set-aside rules firing. */
export function isRankable(
  p: SnapshotProtocol,
): boolean {
  return isPreToken(p) && setAsideReason(p) === null;
}

/** The snapshot's protocols keyed by slug. */
function indexBySlug(
  protocols: SnapshotProtocol[],
): Map<string, SnapshotProtocol> {
  const index = new Map<string, SnapshotProtocol>();
  for (const p of protocols) index.set(p.slug, p);
  return index;
}

/**
 * The board: the watchlist first, then every other rankable pre-token protocol by TVL,
 * all scored and ordered by implied value, ranks 1..n.
 */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = indexBySlug(snapshot.protocols);
  const picked = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: take every slug the snapshot still carries. (Its
  // coverage is the gate's row; it is never gambled on a record that went missing.)
  for (const slug of snapshot.watchlist) {
    const found = index.get(slug);
    if (found !== undefined) picked.set(slug, found);
  }
  // The early radar: EVERY other rankable pre-token protocol, by TVL. No cap and no
  // floor cutoff: the starter missed twenty rankable protocols at or above the $50M
  // floor that the watchlist leaves out — DefiLlama records a parent protocol for them,
  // a field the snapshot does not carry — Sentora Curator at $2.76B among them. A board
  // that stops at the floor leaves launches out. A chosen protocol stays chosen; the
  // early radar never replaces a watchlist row.
  const scouts = snapshot.protocols
    .filter((p) => !picked.has(p.slug) && isRankable(p))
    .sort((a, b) => {
      if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
      return a.slug < b.slug ? -1 : 1;
    });
  for (const p of scouts) picked.set(p.slug, p);

  const scored = [...picked.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    return a.p.slug < b.p.slug ? -1 : 1;
  });
  return scored.map((s, i) => {
    const p = s.p;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
      },
      why: whyLine(p, s.implied, s.growthPct, s.age),
      farm_steps: farmSteps(p, s.age).map(stepText),
    };
  });
}

/** One line naming what drives a row's rank, from the model's own figures. */
export function whyLine(
  p: SnapshotProtocol,
  implied: number,
  growthPct: number,
  age: number | null,
): string {
  const tvlPart = `$${(p.tvl_usd / 1e6).toFixed(0)}M TVL`;
  let growthPart: string;
  if (growthPct > 2) growthPart = `growing ${growthPct.toFixed(1)}% in 7 days`;
  else if (growthPct < -2) growthPart = `down ${Math.abs(growthPct).toFixed(1)}% in 7 days`;
  else growthPart = 'flat over 7 days';
  let agePart: string;
  if (age === null) agePart = 'tracked with no listing date';
  else if (age >= 365) agePart = `${Math.floor(age / 365)}y ${age % 365}d with no token`;
  else agePart = `${age}d with no token`;
  const chainPart = p.chains.length > 1 ? ` on ${p.chains.length} chains` : '';
  const valuePart = implied.toLocaleString('en-US');
  return `Ranks here on ${tvlPart}, ${growthPart}, ${agePart}${chainPart} — implied value $${valuePart}.`;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string — action, cost and time — inside the gate's 20..600 characters. */
export function stepText(
  step: FarmStep,
): string {
  let joined = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (joined.length > 600) joined = `${joined.slice(0, 596)}...`;
  if (joined.length < 20) joined = `${joined} Hold the position and check the protocol's own page.`;
  return joined;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function firstChain(
  p: SnapshotProtocol,
): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs, from the protocol's own TVL. */
function capitalFor(
  p: SnapshotProtocol,
): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(
  age: number | null,
): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Whether the lowercased category names `word`. */
function hasWord(
  category: string,
  word: string,
): boolean {
  return category.includes(word);
}

/** The category's one action, in words a farmer can follow. */
function actionFor(
  p: SnapshotProtocol,
  capital: number,
  chain: string,
): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (hasWord(c, 'lend') || hasWord(c, 'cdp') || hasWord(c, 'collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (hasWord(c, 'dex') || hasWord(c, 'yield') || hasWord(c, 'leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (hasWord(c, 'bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (hasWord(c, 'staking') || hasWord(c, 'restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (hasWord(c, 'perpetual') || hasWord(c, 'derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  }
  if (hasWord(c, 'prediction')) {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  if (hasWord(c, 'curator') || hasWord(c, 'allocator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (hasWord(c, 'stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (hasWord(c, 'rwa')) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  }
  if (hasWord(c, 'insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  if (hasWord(c, 'basis')) {
    return `Deposit $${capital} of USDC into ${name}'s basis strategy on ${chain} and keep the position open.`;
  }
  if (hasWord(c, 'index')) {
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it.`;
  }
  if (hasWord(c, 'governance') || hasWord(c, 'incentive')) {
    return `Lock $${capital} of the qualifying asset in ${name}'s governance on ${chain} and vote once.`;
  }
  if (hasWord(c, 'payment') || hasWord(c, 'card')) {
    return `Route $${capital} of spending through ${name} on ${chain} and keep the account active.`;
  }
  if (hasWord(c, 'farm')) {
    return `Deposit $${capital} of the farmed asset into ${name} on ${chain} and keep the position open.`;
  }
  if (hasWord(c, 'interest rate')) {
    return `Open a $${capital} rate position through ${name} on ${chain} and keep it open.`;
  }
  if (hasWord(c, 'anchor') || hasWord(c, 'decentralized btc')) {
    return `Deposit $${capital} of the BTC-pegged asset through ${name} on ${chain} and keep the position open.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * One protocol's farm plan: six steps, each an action with a cost and a time. The plan
 * comes from the protocol's own record — category, chains, TVL, age — never from a
 * hand-written list of names.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
): FarmStep[] {
  const chain = firstChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(
  snapshot: Snapshot,
): LiveRow[] {
  const trading = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  trading.sort((a, b) => {
    const mcap = (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0);
    return mcap !== 0 ? mcap : b.tvl_usd - a.tvl_usd;
  });
  return trading.slice(0, LIVE_ROWS).map((p) => {
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    };
  });
}

/** One board row in the dashboard's compact form; the page builds the farm plan itself. */
export function radarRow(
  row: BoardRow,
): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    why: row.why,
  };
}

/** The pre-token protocols the board sets aside, biggest first, with the rule that set each aside. */
export function setAsideRows(
  snapshot: Snapshot,
): SetAsideRow[] {
  const aside = snapshot.protocols.filter((p) => isPreToken(p) && setAsideReason(p) !== null);
  aside.sort((a, b) => b.tvl_usd - a.tvl_usd);
  return aside.map((p) => {
    return { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: setAsideReason(p)! };
  });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  let earlyCount = 0;
  for (const r of board) if (!snapshot.watchlist.includes(r.slug)) earlyCount += 1;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    set_aside_size: setAside.length,
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(
  text: string,
): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  const watch = o.watchlist;
  if (!Array.isArray(watch) || watch.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    const okShape = typeof p.slug === 'string' && typeof p.name === 'string' &&
      typeof p.tvl_usd === 'number' && Number.isFinite(p.tvl_usd);
    if (!okShape) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    const chainsOk = Array.isArray(p.chains)
      ? p.chains.filter((c): c is string => typeof c === 'string')
      : [];
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: chainsOk,
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: watch as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null: the watchlist covered, ranks
 * 1..n, implied values non-rising with no shared value, farm steps in range.
 */
export function boardIssue(
  board: BoardRow[],
  snapshot: Snapshot,
): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    const shown = missing.slice(0, 5).join(', ');
    const plural = missing.length === 1 ? '' : 's';
    return `the board misses ${missing.length} watchlist slug${plural}: ${shown}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2) {
    const first = board[0]!.implied_value_usd;
    const last = board[board.length - 1]!.implied_value_usd;
    if (first === last) {
      return `all ${board.length} rows share the same implied value $${first}: a board that ranks nothing by value is not a ranking`;
    }
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    const valueOk = Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0;
    if (!valueOk) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(
  radar: RadarData,
): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
