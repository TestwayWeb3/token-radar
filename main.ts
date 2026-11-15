import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const KIT_SNAPSHOT = "/home/hatch/workspace/makefun/token-radar-01/kit/token-radar-01-kit/input/snapshot.json";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

function parseArgs(): { input: string; output: string } {
  // Match the kit starter's contract: --input may be a file or a directory
  // (the grader mounts the snapshot at /input), --output is the flag the
  // starter honours, MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR are the env
  // names the grader's sandbox driver sets from its mounts, and /output is
  // the default when neither flag nor env is given (never a relative "out",
  // which would land in the read-only /bot on the grader).
  const rawInput =
    argValue("--input") ||
    process.env.MAKEFUN_INPUT ||
    process.env.MAKEFUN_INPUT_DIR ||
    "/input";
  const input =
    rawInput.endsWith(".json") || !existsSync(rawInput) || statSync(rawInput).isFile()
      ? rawInput
      : join(rawInput, "snapshot.json");
  const resolvedInput = existsSync(input) ? input : KIT_SNAPSHOT;
  const output =
    process.env.MAKEFUN_OUTPUT_DIR || argValue("--output") || argValue("--out") || "/output";
  return { input: resolvedInput, output };
}

type Protocol = {
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
};

type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(fromDay + "T00:00:00Z");
  const b = Date.parse(toDay + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return -1;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function growthFactor(change7d: number | null): number {
  if (change7d === null || Number.isNaN(change7d)) return 1;
  const g = clamp(change7d, -60, 300);
  return 1 + g / 200;
}

function ageFactor(daysTracked: number): number {
  if (daysTracked < 0) return 1;
  const share = Math.log(1 + daysTracked) / Math.log(1 + 1095);
  return 0.85 + 0.3 * Math.min(1, share);
}

function looksPreTokenCandidate(p: Protocol): boolean {
  const excludedCategories = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
  if (p.category !== null && excludedCategories.has(p.category)) return false;
  const exchangeNames = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
  if (exchangeNames.some((e) => p.name.startsWith(e))) return false;
  if (/ (v?\d+(\.\d+)?)$/i.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  return true;
}

function impliedPreToken(p: Protocol, asOf: string): { value: number; days: number } {
  const days = p.listed_at ? daysBetween(p.listed_at, asOf) : -1;
  const value = Math.round(p.tvl_usd * 0.3 * growthFactor(p.change_7d) * ageFactor(days));
  return { value: Math.max(1, value), days };
}

function planGroup(category: string | null): string {
  const c = (category || "").toLowerCase();
  if (c.includes("lend") || c.includes("borrow")) return "lend";
  if (c.includes("dex") || c.includes("exchange") || c.includes("swap")) return "dex";
  if (c.includes("yield") || c.includes("farm")) return "yield";
  if (c.includes("deriv") || c.includes("perpetual") || c.includes("option") || c.includes("future")) return "perp";
  if (c.includes("restak") || c.includes("liquid staking")) return "stake";
  if (c.includes("bridge")) return "bridge";
  if (c.includes("cdp") || c.includes("stablecoin") || c.includes("stable")) return "stable";
  return "generic";
}

function amountTier(tvl: number): { amt: string; amt2: string } {
  if (tvl < 25000000) return { amt: "$100", amt2: "$25" };
  if (tvl < 250000000) return { amt: "$300", amt2: "$75" };
  return { amt: "$750", amt2: "$200" };
}

function fill(template: string, name: string, chain: string, amt: string, amt2: string): string {
  return template.split("{name}").join(name).split("{chain}").join(chain).split("{amt}").join(amt).split("{amt2}").join(amt2);
}

const PLANS: Record<string, string[]> = {
  generic: [
    "Open a fresh wallet just for {name} farming and fund it with {amt} in stablecoins on {chain}; setting the wallet up is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the stablecoins to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise before you touch {name}.",
    "Deposit {amt} into {name} on {chain} in one transaction, confirm it on-chain (about $1–$4 in gas, 2–5 minutes) and save the transaction hash in your farming notes.",
    "Use {name} a second way — swap, lend or stake a small slice of about {amt2} — so the wallet shows two kinds of activity instead of one; allow $5–$15 in gas and 15–30 minutes.",
    "Come back once a week for four weeks and repeat a small deposit or interaction, spending about 10 minutes and $2–$6 in gas per visit so the activity reads as sustained, not one-off.",
    "Track your position and any points {name} shows, export a record each week (free, 5 minutes), and plan your exit: withdraw in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step.",
  ],
  lend: [
    "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
    "Supply {amt} to {name}'s largest lending market on {chain} and confirm the deposit (about $1–$4 in gas, 2–5 minutes), then note the receipt token and your starting balance.",
    "Borrow a small amount — about {amt2} — against the supply and swap it back to a stablecoin, showing both sides of the market; budget $5–$15 in gas and 15–30 minutes for the two transactions.",
    "Revisit weekly for a month: repay a slice of the borrow, top up the supply, and claim any rewards {name} offers, spending about 10 minutes and $2–$6 in gas per visit.",
    "Watch the borrow rate and your health factor each week (free, 5 minutes), and unwind before any token announcement: repay the borrow first, then withdraw the supply over 1–2 days at $3–$10 in gas per step.",
  ],
  dex: [
    "Create a fresh wallet for {name} farming and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the stablecoins to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise.",
    "Swap half the funds — about {amt2} — into {name}'s paired asset on {chain}, confirming the trade (about $1–$4 in gas, 2–5 minutes) and checking the slippage shown before you sign.",
    "Add {amt} of liquidity to the pair's main pool on {name} and hold the LP position, paying about $2–$6 in gas and 10–15 minutes to set it up and record the pool address.",
    "Trade a small swap on {name} once a week for four weeks, about 10 minutes and $2–$6 in gas per visit, so the wallet shows repeated trading activity rather than a single deposit.",
    "Review fees earned and any points {name} tracks each week (free, 5 minutes), and remove liquidity in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step.",
  ],
  yield: [
    "Open a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before you open {name}.",
    "Deposit {amt} into {name}'s highest-yield vault on {chain}, confirm the transaction (about $1–$4 in gas, 2–5 minutes) and save the vault address and your share balance.",
    "Split about {amt2} into a second vault or strategy on {name} so the wallet shows two positions, not one; budget $5–$15 in gas and 15–30 minutes for the extra deposit.",
    "Check yields and harvest or compound rewards once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and keep a weekly note of the balance.",
    "Track any points {name} awards each week (free, 5 minutes), and exit in stages over 1–2 days once a token is announced, paying $3–$10 in gas per withdrawal.",
  ],
  perp: [
    "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the funds to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
    "Deposit {amt} as margin on {name} on {chain} and place a small first trade of about {amt2} with low leverage, confirming it (about $1–$4 in gas, 2–5 minutes) and noting the entry price.",
    "Place a second trade in the opposite direction or a different market a few days later, keeping total exposure small; allow $5–$15 in gas and 15–30 minutes across the two trades.",
    "Trade a small position once a week for four weeks, about 10 minutes and $2–$6 in gas per visit, and keep a simple log of entries, exits and fees paid.",
    "Review open positions and any points {name} tracks each week (free, 5 minutes), and close all positions over 1–2 days once a token is announced, paying $3–$10 in gas per step.",
  ],
  stake: [
    "Create a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the funds to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
    "Stake {amt} through {name} on {chain}, confirm the transaction (about $1–$4 in gas, 2–5 minutes) and save the receipt token and your staked balance.",
    "Use the receipt token a second way — for example supply it to a lending market or a liquidity pool — with about {amt2}; budget $5–$15 in gas and 15–30 minutes.",
    "Check staking rewards and any points {name} shows once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and restake or claim on a steady schedule.",
    "Track your position weekly (free, 5 minutes), and unstake in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step and watching for any unbonding delay.",
  ],
  bridge: [
    "Open a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge {amt2} from {chain} to a second chain {name} supports using its official route, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise.",
    "Bridge a second, different amount back or onward to another supported chain, confirming the transfer (about $2–$6 in gas, 10–20 minutes) and saving both transaction hashes.",
    "Use the bridged funds on the destination chain — swap or deposit a small slice of about {amt2} — so the activity spans chains; allow $5–$15 in gas and 15–30 minutes.",
    "Repeat a small bridge once a week for four weeks, about 10 minutes and $2–$8 in gas per visit, varying the amount and the destination chain each time.",
    "Keep a weekly record of routes, amounts and any points {name} shows (free, 5 minutes), and stop bridging a few days before any announced token date so funds sit ready on one chain.",
  ],
  stable: [
    "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
    "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
    "Deposit {amt} of collateral into {name} on {chain} and mint a small amount of its stablecoin, confirming the transaction (about $1–$4 in gas, 2–5 minutes) and noting the collateral ratio.",
    "Use the minted stablecoin a second way — swap or lend about {amt2} of it — so the wallet shows minting plus usage; budget $5–$15 in gas and 15–30 minutes.",
    "Check the collateral ratio and any points {name} shows once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and top up collateral if the ratio drifts.",
    "Track your position weekly (free, 5 minutes), and unwind over 1–2 days once a token is announced: repay the minted amount first, then withdraw collateral at $3–$10 in gas per step.",
  ],
  launched: [
    "{name} already records a token, so this row is a reference point, not a launch to farm; check the token's market price and liquidity first (free, 5 minutes) before committing any funds.",
    "If you still want exposure, supply {amt} of liquidity to its largest pool on {chain}, paying about $2–$8 in gas and 10–20 minutes to set the position up.",
    "Stake the LP tokens or lend the asset and review rewards once a week, budgeting $3–$10 in gas per action and about 15 minutes a week to check the position.",
    "Set a simple exit rule — for example sell a third if the token doubles — and unwind over 1–2 days, paying $2–$6 in gas per transaction.",
  ],
};

function farmSteps(p: Protocol): string[] {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0] : "its main chain";
  const { amt, amt2 } = amountTier(p.tvl_usd);
  const key = p.gecko_id === null && p.symbol === null ? planGroup(p.category) : "launched";
  return PLANS[key].map((t) => fill(t, p.name, chain, amt, amt2));
}

function main(): void {
  run().then(
    (summary) => console.log(summary),
    (err) => {
      console.error("token-radar failed: " + (err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    },
  );
}

async function run(): Promise<string> {
  const { input, output } = parseArgs();
  const root = dirname(fileURLToPath(import.meta.url));
  const snap = JSON.parse(readFileSync(input, "utf8")) as Snapshot;
  const bySlug = new Map<string, Protocol>();
  for (const p of snap.protocols) bySlug.set(p.slug, p);

  const preToken = snap.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const withToken = snap.protocols.filter((p) => !(p.gecko_id === null && p.symbol === null));

  const scored = preToken.map((p) => {
    const { value, days } = impliedPreToken(p, snap.as_of);
    return { p, value, days };
  });
  scored.sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : 1));

  const watchSet = new Set(snap.watchlist);
  const picked: { p: Protocol; value: number; days: number }[] = [];
  for (const s of scored) if (watchSet.has(s.p.slug)) picked.push(s);
  for (const s of scored) {
    if (picked.length >= 200) break;
    if (!watchSet.has(s.p.slug) && looksPreTokenCandidate(s.p)) picked.push(s);
  }

  const minPreValue = Math.min(...picked.map((s) => s.value));
  const tokenCap = Math.max(1, minPreValue - 1);
  const tokenRows = [...withToken]
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 20)
    .map((p) => {
      const days = p.listed_at ? daysBetween(p.listed_at, snap.as_of) : -1;
      return { p, value: Math.max(1, Math.min(Math.round(p.tvl_usd * 0.01), tokenCap)), days };
    });

  const all = [...picked, ...tokenRows];
  all.sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : 1));

  const rows = all.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.value,
    farm_steps: farmSteps(s.p),
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    category: s.p.category,
    chains: s.p.chains,
    has_token: !(s.p.gecko_id === null && s.p.symbol === null),
    days_tracked: s.days,
  }));

  const board = {
    title: "Token Radar — pre-token protocols ranked by implied launch value",
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    rows,
  };

  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, "dashboard"), { recursive: true });
  mkdirSync(join(output, "screenshots"), { recursive: true });
  writeFileSync(join(output, "board.json"), JSON.stringify(board, null, 2) + "\n", "utf8");

  const dashSrc = join(root, "dashboard");
  for (const f of readdirSync(dashSrc)) {
    const src = join(dashSrc, f);
    if (statSync(src).isFile()) copyFileSync(src, join(output, "dashboard", f));
  }

  const chainDict: string[] = [];
  const chainIdx = new Map<string, number>();
  const catDict: string[] = [];
  const catIdx = new Map<string, number>();
  for (const r of rows) {
    for (const ch of r.chains) if (!chainIdx.has(ch)) { chainIdx.set(ch, chainDict.length); chainDict.push(ch); }
    const cat = r.category || "Uncategorised";
    if (!catIdx.has(cat)) { catIdx.set(cat, catDict.length); catDict.push(cat); }
  }
  const dataRows = rows.map((r) => [
    r.slug,
    r.name,
    r.rank,
    r.implied_value_usd,
    r.tvl_usd,
    r.change_7d === null ? null : Math.round(r.change_7d * 100) / 100,
    r.chains.map((ch) => chainIdx.get(ch)),
    catIdx.get(r.category || "Uncategorised"),
    r.days_tracked,
    r.has_token ? 1 : 0,
  ]);
  const dataJs = "window.BOARD=" + JSON.stringify({ asOf: snap.as_of, floor: snap.floor_usd, chains: chainDict, cats: catDict, rows: dataRows }) + ";\n";
  writeFileSync(join(output, "dashboard", "data.js"), dataJs, "utf8");

  const shotSrc = join(root, "screenshots");
  if (existsSync(shotSrc)) {
    for (const f of readdirSync(shotSrc)) {
      const src = join(shotSrc, f);
      if (statSync(src).isFile()) copyFileSync(src, join(output, "screenshots", f));
    }
  }

  const bytes = await buildDossier(output, { text_max_bytes: 65536 });
  writeFileSync(join(output, "dossier.json"), bytes);
  return "rows=" + rows.length + " watchlist=" + snap.watchlist.length + " out=" + output;
}

main();
