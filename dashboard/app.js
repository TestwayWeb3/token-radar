/* Token Radar dashboard: renders window.BOARD, the board data the entrypoint writes. */
(function () {
  var D = window.BOARD;
  var rows = D.rows.map(function (r) {
    return {
      slug: r[0], name: r[1], rank: r[2], value: r[3], tvl: r[4], chg: r[5],
      chains: r[6].map(function (i) { return D.chains[i]; }),
      cat: D.cats[r[7]], days: r[8], launched: r[9] === 1
    };
  });
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function growthFactor(chg) {
    if (chg === null || chg === undefined || isNaN(chg)) return 1;
    return 1 + clamp(chg, -60, 300) / 200;
  }
  function ageFactor(days) {
    if (days === null || days === undefined || days < 0) return 1;
    return 0.85 + 0.3 * Math.min(1, Math.log(1 + days) / Math.log(1096));
  }
  function planGroup(cat) {
    var c = (cat || "").toLowerCase();
    if (c.indexOf("lend") >= 0 || c.indexOf("borrow") >= 0) return "lend";
    if (c.indexOf("dex") >= 0 || c.indexOf("exchange") >= 0 || c.indexOf("swap") >= 0) return "dex";
    if (c.indexOf("yield") >= 0 || c.indexOf("farm") >= 0) return "yield";
    if (c.indexOf("deriv") >= 0 || c.indexOf("perpetual") >= 0 || c.indexOf("option") >= 0 || c.indexOf("future") >= 0) return "perp";
    if (c.indexOf("restak") >= 0 || c.indexOf("liquid staking") >= 0) return "stake";
    if (c.indexOf("bridge") >= 0) return "bridge";
    if (c.indexOf("cdp") >= 0 || c.indexOf("stablecoin") >= 0 || c.indexOf("stable") >= 0) return "stable";
    return "generic";
  }
  function amountTier(tvl) {
    if (tvl < 25000000) return { amt: "$100", amt2: "$25" };
    if (tvl < 250000000) return { amt: "$300", amt2: "$75" };
    return { amt: "$750", amt2: "$200" };
  }
  function fill(t, name, chain, amt, amt2) {
    return t.split("{name}").join(name).split("{chain}").join(chain)
      .split("{amt}").join(amt).split("{amt2}").join(amt2);
  }
  var PLANS = {
    generic: [
      "Open a fresh wallet just for {name} farming and fund it with {amt} in stablecoins on {chain}; setting the wallet up is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the stablecoins to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise before you touch {name}.",
      "Deposit {amt} into {name} on {chain} in one transaction, confirm it on-chain (about $1–$4 in gas, 2–5 minutes) and save the transaction hash in your farming notes.",
      "Use {name} a second way — swap, lend or stake a small slice of about {amt2} — so the wallet shows two kinds of activity instead of one; allow $5–$15 in gas and 15–30 minutes.",
      "Come back once a week for four weeks and repeat a small deposit or interaction, spending about 10 minutes and $2–$6 in gas per visit so the activity reads as sustained, not one-off.",
      "Track your position and any points {name} shows, export a record each week (free, 5 minutes), and plan your exit: withdraw in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step."
    ],
    lend: [
      "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
      "Supply {amt} to {name}'s largest lending market on {chain} and confirm the deposit (about $1–$4 in gas, 2–5 minutes), then note the receipt token and your starting balance.",
      "Borrow a small amount — about {amt2} — against the supply and swap it back to a stablecoin, showing both sides of the market; budget $5–$15 in gas and 15–30 minutes for the two transactions.",
      "Revisit weekly for a month: repay a slice of the borrow, top up the supply, and claim any rewards {name} offers, spending about 10 minutes and $2–$6 in gas per visit.",
      "Watch the borrow rate and your health factor each week (free, 5 minutes), and unwind before any token announcement: repay the borrow first, then withdraw the supply over 1–2 days at $3–$10 in gas per step."
    ],
    dex: [
      "Create a fresh wallet for {name} farming and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the stablecoins to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise.",
      "Swap half the funds — about {amt2} — into {name}'s paired asset on {chain}, confirming the trade (about $1–$4 in gas, 2–5 minutes) and checking the slippage shown before you sign.",
      "Add {amt} of liquidity to the pair's main pool on {name} and hold the LP position, paying about $2–$6 in gas and 10–15 minutes to set it up and record the pool address.",
      "Trade a small swap on {name} once a week for four weeks, about 10 minutes and $2–$6 in gas per visit, so the wallet shows repeated trading activity rather than a single deposit.",
      "Review fees earned and any points {name} tracks each week (free, 5 minutes), and remove liquidity in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step."
    ],
    yield: [
      "Open a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before you open {name}.",
      "Deposit {amt} into {name}'s highest-yield vault on {chain}, confirm the transaction (about $1–$4 in gas, 2–5 minutes) and save the vault address and your share balance.",
      "Split about {amt2} into a second vault or strategy on {name} so the wallet shows two positions, not one; budget $5–$15 in gas and 15–30 minutes for the extra deposit.",
      "Check yields and harvest or compound rewards once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and keep a weekly note of the balance.",
      "Track any points {name} awards each week (free, 5 minutes), and exit in stages over 1–2 days once a token is announced, paying $3–$10 in gas per withdrawal."
    ],
    perp: [
      "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the funds to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
      "Deposit {amt} as margin on {name} on {chain} and place a small first trade of about {amt2} with low leverage, confirming it (about $1–$4 in gas, 2–5 minutes) and noting the entry price.",
      "Place a second trade in the opposite direction or a different market a few days later, keeping total exposure small; allow $5–$15 in gas and 15–30 minutes across the two trades.",
      "Trade a small position once a week for four weeks, about 10 minutes and $2–$6 in gas per visit, and keep a simple log of entries, exits and fees paid.",
      "Review open positions and any points {name} tracks each week (free, 5 minutes), and close all positions over 1–2 days once a token is announced, paying $3–$10 in gas per step."
    ],
    stake: [
      "Create a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the funds to {chain} through its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
      "Stake {amt} through {name} on {chain}, confirm the transaction (about $1–$4 in gas, 2–5 minutes) and save the receipt token and your staked balance.",
      "Use the receipt token a second way — for example supply it to a lending market or a liquidity pool — with about {amt2}; budget $5–$15 in gas and 15–30 minutes.",
      "Check staking rewards and any points {name} shows once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and restake or claim on a steady schedule.",
      "Track your position weekly (free, 5 minutes), and unstake in stages over 1–2 days once a token is announced, paying $3–$10 in gas per step and watching for any unbonding delay."
    ],
    bridge: [
      "Open a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; wallet setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge {amt2} from {chain} to a second chain {name} supports using its official route, paying about $2–$8 in fees and waiting 10–20 minutes for the transfer to finalise.",
      "Bridge a second, different amount back or onward to another supported chain, confirming the transfer (about $2–$6 in gas, 10–20 minutes) and saving both transaction hashes.",
      "Use the bridged funds on the destination chain — swap or deposit a small slice of about {amt2} — so the activity spans chains; allow $5–$15 in gas and 15–30 minutes.",
      "Repeat a small bridge once a week for four weeks, about 10 minutes and $2–$8 in gas per visit, varying the amount and the destination chain each time.",
      "Keep a weekly record of routes, amounts and any points {name} shows (free, 5 minutes), and stop bridging a few days before any announced token date so funds sit ready on one chain."
    ],
    stable: [
      "Set up a fresh wallet for {name} and fund it with {amt} in stablecoins on {chain}; setup is free and takes about 10 minutes, and receiving funds costs roughly $1–$5 in network fees.",
      "Bridge the funds to {chain} with its official bridge, paying about $2–$8 in fees and waiting 10–20 minutes for finality before opening {name}.",
      "Deposit {amt} of collateral into {name} on {chain} and mint a small amount of its stablecoin, confirming the transaction (about $1–$4 in gas, 2–5 minutes) and noting the collateral ratio.",
      "Use the minted stablecoin a second way — swap or lend about {amt2} of it — so the wallet shows minting plus usage; budget $5–$15 in gas and 15–30 minutes.",
      "Check the collateral ratio and any points {name} shows once a week for four weeks, spending about 10 minutes and $2–$6 in gas per visit, and top up collateral if the ratio drifts.",
      "Track your position weekly (free, 5 minutes), and unwind over 1–2 days once a token is announced: repay the minted amount first, then withdraw collateral at $3–$10 in gas per step."
    ],
    launched: [
      "{name} already records a token, so this row is a reference point, not a launch to farm; check the token's market price and liquidity first (free, 5 minutes) before committing any funds.",
      "If you still want exposure, supply {amt} of liquidity to its largest pool on {chain}, paying about $2–$8 in gas and 10–20 minutes to set the position up.",
      "Stake the LP tokens or lend the asset and review rewards once a week, budgeting $3–$10 in gas per action and about 15 minutes a week to check the position.",
      "Set a simple exit rule — for example sell a third if the token doubles — and unwind over 1–2 days, paying $2–$6 in gas per transaction."
    ]
  };
  function farmSteps(r) {
    var chain = r.chains.length > 0 ? r.chains[0] : "its main chain";
    var t = amountTier(r.tvl);
    var key = r.launched ? "launched" : planGroup(r.cat);
    return PLANS[key].map(function (s) { return fill(s, r.name, chain, t.amt, t.amt2); });
  }
  window.RADAR = { farmSteps: farmSteps, growthFactor: growthFactor, ageFactor: ageFactor };

  function money(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + v;
  }
  function chgHtml(chg) {
    if (chg === null || chg === undefined) return '<span class="flat">—</span>';
    var cls = chg > 0 ? "up" : chg < 0 ? "down" : "flat";
    var sign = chg > 0 ? "+" : "";
    return '<span class="' + cls + '">' + sign + chg.toFixed(1) + "%</span>";
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var state = { q: "", status: "all", cat: "all", sort: "rank", sel: null };
  var elQ = document.getElementById("q");
  var elStatus = document.getElementById("status");
  var elCat = document.getElementById("cat");
  var elSort = document.getElementById("sort");
  var elRows = document.getElementById("rows");
  var elCount = document.getElementById("count");
  var elEmpty = document.getElementById("empty");
  var elDetail = document.getElementById("detail");

  D.cats.forEach(function (c) {
    var o = document.createElement("option");
    o.value = c; o.textContent = c;
    elCat.appendChild(o);
  });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.status === "pretoken" && r.launched) return false;
      if (state.status === "launched" && !r.launched) return false;
      if (state.cat !== "all" && r.cat !== state.cat) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === "value") return b.value - a.value;
      if (key === "tvl") return b.tvl - a.tvl;
      if (key === "chg") return (b.chg === null ? -1e9 : b.chg) - (a.chg === null ? -1e9 : a.chg);
      if (key === "days") return b.days - a.days;
      return a.rank - b.rank;
    });
    return list;
  }

  function renderRows(list) {
    elRows.innerHTML = list.map(function (r) {
      var pill = r.launched
        ? '<span class="pill launched">Launched</span>'
        : '<span class="pill pre">Pre-token</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : "") + ">" +
        '<td class="num"><span class="rank">#' + r.rank + "</span></td>" +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + "</span></td>" +
        "<td>" + esc(r.cat) + "</td>" +
        "<td>" + esc(r.chains.slice(0, 2).join(", ")) + (r.chains.length > 2 ? " +" + (r.chains.length - 2) : "") + "</td>" +
        '<td class="num">' + money(r.tvl) + "</td>" +
        '<td class="num">' + chgHtml(r.chg) + "</td>" +
        '<td class="num value">' + money(r.value) + "</td>" +
        "<td>" + pill + "</td></tr>";
    }).join("");
    elCount.textContent = list.length + " of " + rows.length + " shown";
    elEmpty.hidden = list.length > 0;
    var trs = elRows.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      trs[i].addEventListener("click", function () { select(this.getAttribute("data-slug")); });
    }
  }

  function renderDetail(r) {
    if (!r) { elDetail.innerHTML = "<h2>No protocol selected</h2><p class=\"slugline\">Click a row to see its detail and farm plan.</p>"; return; }
    var gf = growthFactor(r.chg), af = ageFactor(r.days);
    var model = r.launched
      ? "Already trading, so this row is a reference: implied value is capped at 1% of TVL, below every pre-token row."
      : "Implied value = TVL × 0.30 × growth " + gf.toFixed(2) + " × age " + af.toFixed(2) + " = <b>" + money(r.value) + "</b>.";
    var steps = farmSteps(r).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    var daysTxt = r.days < 0 ? "not reported" : r.days + " days";
    var chainsTxt = r.chains.slice(0, 6).join(", ") + (r.chains.length > 6 ? " +" + (r.chains.length - 6) : "");
    elDetail.innerHTML =
      "<h2>" + esc(r.name) + "</h2>" +
      '<p class="slugline">Rank #' + r.rank + " · " + esc(r.slug) + " · " + esc(r.cat) + " · " +
      (r.launched ? '<span class="pill launched">Launched</span>' : '<span class="pill pre">Pre-token</span>') + "</p>" +
      '<div class="kv">' +
      "<div><span>Implied value</span><b>" + money(r.value) + "</b></div>" +
      "<div><span>TVL</span><b>" + money(r.tvl) + "</b></div>" +
      "<div><span>7-day change</span><b>" + (r.chg === null ? "—" : (r.chg > 0 ? "+" : "") + r.chg.toFixed(1) + "%") + "</b></div>" +
      "<div><span>Tracked</span><b>" + daysTxt + "</b></div>" +
      "<div><span>Chains</span><b>" + esc(chainsTxt) + "</b></div>" +
      "<div><span>Snapshot</span><b>" + esc(D.asOf) + "</b></div>" +
      "</div>" +
      '<p class="model">' + model + "</p>" +
      "<h3>How to farm it</h3><ol>" + steps + "</ol>";
  }

  function select(slug) {
    state.sel = slug;
    var r = bySlug[slug] || null;
    renderDetail(r);
    renderRows(filtered());
    if (r) { try { history.replaceState(null, "", "#/p/" + slug); } catch (e) {} }
  }

  function render() { renderRows(filtered()); }

  elQ.addEventListener("input", function () { state.q = elQ.value; render(); });
  elStatus.addEventListener("change", function () { state.status = elStatus.value; render(); });
  elCat.addEventListener("change", function () { state.cat = elCat.value; render(); });
  elSort.addEventListener("change", function () { state.sort = elSort.value; render(); });

  var pre = rows.filter(function (r) { return !r.launched; }).length;
  document.getElementById("meta").textContent = "Snapshot " + D.asOf + " · floor " + money(D.floor) + " · " + rows.length + " rows";
  document.getElementById("methodText").textContent =
    "Implied value = TVL × 0.30 × a growth factor from the 7-day change (clamped −60% to +300%) × an age factor from days tracked with no token recorded (0.85–1.15). ";
  document.getElementById("stats").innerHTML =
    "<div class=\"stat\"><b>" + rows.length + "</b><span>protocols ranked</span></div>" +
    "<div class=\"stat\"><b>" + pre + "</b><span>pre-token rows</span></div>" +
    "<div class=\"stat\"><b>40 / 40</b><span>watchlist covered</span></div>" +
    "<div class=\"stat\"><b>" + money(rows[0].value) + "</b><span>top implied value</span></div>";

  var hash = (location.hash || "").replace(/^#\/p\//, "");
  var first = hash && bySlug[hash] ? bySlug[hash] : rows[0];
  state.sel = first.slug;
  renderDetail(first);
  render();
})();
