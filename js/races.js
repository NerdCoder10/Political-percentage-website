// "Races by State" tab: research one state's U.S. Senate and House races in depth.
// Uses the app's live forecast and helpers through globalThis.PP (see js/app.js).
(function () {
  const M = Model;
  const $ = (s, el = document) => el.querySelector(s);
  const P = () => globalThis.PP;
  const esc = (s) => P().esc(s);
  const fmt = (v, d = 1) => P().fmt(v, d);
  const mf = (v) => `${v > 0 ? "D+" : v < 0 ? "R+" : "±"}${fmt(Math.abs(v))}`;
  const money = (x) => (x ? `${esc(titleCase(x.name))}: $${(x.receipts / 1e6).toFixed(x.receipts >= 1e6 ? 1 : 2)}M raised, $${(x.cash / 1e6).toFixed(x.cash >= 1e6 ? 1 : 2)}M on hand` : "");
  const titleCase = (n) => n.toLowerCase().replace(/(^|[\s,.'-])\w/g, (c) => c.toUpperCase()).replace(/^([^,]+), (.+)$/, "$2 $1");

  let filter = "all", sort = "district";

  function nominees(r) {
    if (r.nominees) return r.nominees;
    if (r.market?.D && r.market?.R) return { D: r.market.D, R: r.market.R };
    const d = r.money?.d, rr = r.money?.r;
    if (d && rr) return { D: titleCase(d.name), R: titleCase(rr.name), fromMoney: true };
    return null;
  }

  function raceCard(r) {
    const pD = Math.round(r.pD * 100);
    const cls = r.rating.tier === 0 ? "T" : r.rating.side + r.rating.tier;
    const dLab = r.challenger === "I" ? "Ind" : "D";
    const n = nominees(r);
    const member = r.incumbent.id ? M.congress().find((m) => m.id === r.incumbent.id) : null;
    const lean = r.office === "house" ? M.districtLean(r.state, r.district) : null;
    const h = r.office === "house" ? HOUSE24[`${r.state}-${r.district}`] : null;
    const SRC = globalThis.RACE_SIGNALS?.sources ?? {};
    return `<article class="race-card" id="race-${r.id}">
      <div class="race-card-top">
        <button class="star" data-follow-race="${r.id}" aria-pressed="${P().isFollowing(r.id)}" aria-label="${P().isFollowing(r.id) ? "Stop following" : "Follow"} ${esc(r.title)}">${P().isFollowing(r.id) ? "★" : "☆"}</button>
        <div>
          <h3>${esc(r.office === "house" ? (r.district === 0 ? "At-large district" : `District ${r.district}`) : r.title.replace(/^U\.S\. Senate — /, "U.S. Senate · "))}</h3>
          <div class="race-meta">Incumbent: <b>${esc(r.incumbent.name)}</b> <span class="chip ${r.incumbent.party}">${r.incumbent.party}</span> · ${r.status === "open" ? "open seat" : r.status === "uncertain" ? "incumbent's plans uncertain" : "running for re-election"}${r.redistricted ? " · new 2026 map" : ""}</div>
          ${n ? `<div class="race-meta">${esc(n.D)} (${r.challenger === "I" ? "I" : "D"}) vs. ${esc(n.R)} (R)${n.fromMoney ? " · leading fundraisers" : ""}</div>` : ""}
        </div>
        <span class="pill ${cls}">${r.rating.label.replace(" D", r.challenger === "I" ? " Ind" : " D")}</span>
      </div>
      <div class="prob"><span class="l">${pD}%</span><span class="bar" role="img" aria-label="${dLab} ${pD}%, R ${100 - pD}%"><i style="width:${pD}%;background:var(--${r.challenger === "I" ? "ind" : "dem"})"></i><i style="width:${100 - pD}%;background:var(--rep)"></i></span><span class="r">${100 - pD}%</span></div>
      ${r.note ? `<p class="fine">${esc(r.note)}</p>` : ""}
      <details><summary>Evidence behind this forecast</summary>
        <div class="table-wrap"><table class="signals">
          <thead><tr><th>Signal</th><th class="num">Margin</th><th class="num">±</th><th class="num">Weight</th></tr></thead>
          <tbody>${r.signals.map((sg) => `<tr><td>${esc(sg.label)}</td><td class="num">${mf(sg.margin)}</td><td class="num">${fmt(sg.sigma)}</td><td class="num">${sg.share}%</td></tr>`).join("")}
          <tr class="total"><td>Combined</td><td class="num">${mf(r.margin)}</td><td class="num">${r.sigma}</td><td class="num">${pD}% ${dLab}</td></tr></tbody>
        </table></div>
        <div class="factors">
          <div>Partisan baseline${r.pvi != null ? ` (Cook PVI ${r.pvi > 0 ? "D+" + r.pvi : r.pvi < 0 ? "R+" + -r.pvi : "EVEN"})` : ""}<b>${mf(r.baseline)}</b></div>
          <div>National climate<b>${mf(r.climate)}</b></div>
          <div>Incumbency<b>${mf(r.incumbency)}</b></div>
          <div>Qualifications<b>${mf(r.qualityEffect)}</b></div>
          <div>Campaign money<b>${mf(r.moneyEffect)}</b></div>
          <div>State economy<b>${mf(r.economyEffect)}</b></div>
          ${r.personal ? `<div>Personal vote<b>${mf(r.personal)}</b></div>` : ""}
        </div>
        ${r.money && (r.money.d || r.money.r) ? `<p class="fine">Fundraising (<a href="${esc(SRC.money?.url ?? "#")}" target="_blank" rel="noopener">FEC</a>): ${[money(r.money.d), money(r.money.r)].filter(Boolean).join(" · ")}.</p>` : ""}
        ${r.ratings ? `<p class="fine">Expert ratings (<a href="${esc(SRC.ratings?.url ?? "#")}" target="_blank" rel="noopener">compiled on Wikipedia</a>): ${r.ratings.ratings.map((x) => `${esc(x.by)} <b>${esc(x.rating)}</b>`).join(" · ")}</p>` : `<p class="fine">No expert ratings published; forecasters treat this seat as safe.</p>`}
        ${r.market ? `<p class="fine">Prediction market: <a href="${esc(r.market.url)}" target="_blank" rel="noopener">Kalshi</a> ${esc(r.market.D ?? "Democrat")} ${Math.round(r.market.pD * 100)}% · ${esc(r.market.R ?? "Republican")} ${Math.round((1 - r.market.pD) * 100)}%.</p>` : ""}
        ${lean ? `<p class="fine">District orientation (popular vote): R ${fmt(lean.R)}% · D ${fmt(lean.D)}% · I ${fmt(lean.I)}% · O ${fmt(lean.O)}%${h ? `. 2024 House result: R ${fmt((100 * h.R) / h.total)}% · D ${fmt((100 * h.D) / h.total)}%${h.unopposed ? " (uncontested)" : ""}` : ""}.</p>` : ""}
      </details>
      ${member ? `<details><summary>About the incumbent</summary>${P().leaderCard(member, r.office === "senate" ? `U.S. Senator · ${M.states[r.state].name}` : `U.S. Representative · ${r.id}`, r.office === "senate" ? "senator" : "representative", { forecast: r, districtMargin: r.baseline, open: true })}</details>` : ""}
    </article>`;
  }

  function render(root) {
    const st = P().getTrackedState();
    const opts = Object.values(M.states).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.abbr}" ${s.abbr === st ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    if (!st) {
      root.innerHTML = `<h1>Races by State</h1>
        <p class="lede">Pick a state to research its 2026 U.S. Senate and House races: forecasts, the evidence behind each one, candidates, fundraising, expert ratings and the state's current senators and representatives.</p>
        <label class="stat-pick">State<select id="races-state"><option value="">Choose a state…</option>${opts}</select></label>`;
      $("#races-state", root).addEventListener("change", (e) => P().setTrackedState(e.target.value));
      return;
    }
    const f = P().getForecast();
    const s = M.states[st];
    const lean = M.stateLean(st);
    const all = f.races.filter((r) => r.state === st && (r.office === "senate" || r.office === "house"));
    const sen = all.filter((r) => r.office === "senate");
    const house = all.filter((r) => r.office === "house");
    const expD = house.reduce((a, r) => a + r.pD, 0);
    const curD = house.filter((r) => r.incumbent.party === "D").length;
    const sortFn = sort === "close" ? (a, b) => Math.abs(a.pD - 0.5) - Math.abs(b.pD - 0.5) : (a, b) => a.district - b.district;
    const show = (office) => filter === "all" || filter === office;

    root.innerHTML = `
      <h1>Races by State</h1>
      <div class="races-head">
        <label class="stat-pick">State<select id="races-state">${opts}</select></label>
        <div class="seg" role="group" aria-label="Race type">
          ${["all", "senate", "house"].map((k) => `<button data-race-filter="${k}" aria-pressed="${filter === k}">${{ all: "All", senate: "Senate", house: "House" }[k]}</button>`).join("")}
        </div>
        <div class="seg" role="group" aria-label="Sort House races">
          <button data-race-sort="district" aria-pressed="${sort === "district"}">By district</button>
          <button data-race-sort="close" aria-pressed="${sort === "close"}">Closest first</button>
        </div>
        <button class="btn-ghost" id="races-delegation">Senators &amp; representatives</button>
      </div>
      <div class="state-summary">
        <div class="card"><div class="label">${esc(s.name)} lean</div><div class="big txt-${lean.leader}">${lean.leader === "D" ? "D" : "R"}+${fmt(Math.abs(lean.margin))}</div>
          <div class="sub">R ${fmt(lean.R)}% · D ${fmt(lean.D)}% · I ${fmt(lean.I)}% · O ${fmt(lean.O)}%</div></div>
        <div class="card"><div class="label">U.S. Senate in 2026</div><div class="big">${sen.length ? sen.map((r) => `<span class="txt-${r.rating.side === "D" ? "D" : "R"}">${Math.round(Math.max(r.pD, 1 - r.pD) * 100)}% ${r.pD >= 0.5 ? (r.challenger === "I" ? "Ind" : "D") : "R"}</span>`).join(" · ") : "Not up"}</div>
          <div class="sub">${sen.length ? sen.map((r) => esc(r.rating.label)).join(" · ") : "Neither seat is on the 2026 ballot."}</div></div>
        <div class="card"><div class="label">U.S. House · ${s.seats} seat${s.seats === 1 ? "" : "s"}</div><div class="big"><span class="txt-D">${fmt(expD)} D</span> · <span class="txt-R">${fmt(house.length - expD)} R</span></div>
          <div class="sub">Expected seats after 2026 · currently ${curD} D, ${house.length - curD - house.filter((r) => r.incumbent.name === "Vacant").length} R${house.some((r) => r.incumbent.name === "Vacant") ? ", vacancies" : ""}</div></div>
      </div>
      ${show("senate") ? `<h2 class="races-section-title">U.S. Senate</h2>${sen.length ? sen.map(raceCard).join("") : `<p class="hint">${st === "DC" ? "D.C. has no senators." : `No ${esc(s.name)} Senate seat is on the 2026 ballot.`}</p>`}` : ""}
      ${show("house") ? `<h2 class="races-section-title">U.S. House</h2>${house.length ? [...house].sort(sortFn).map(raceCard).join("") : `<p class="hint">D.C. elects a non-voting delegate.</p>`}` : ""}
      <p class="fine">Forecasts use the national climate set on the Midterms tab and no polls. Tap ☆ to follow a race; followed races appear under Following on the Midterms tab.</p>`;

    $("#races-state", root).addEventListener("change", (e) => P().setTrackedState(e.target.value));
    root.querySelectorAll("[data-race-filter]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.raceFilter; render(root); }));
    root.querySelectorAll("[data-race-sort]").forEach((b) => b.addEventListener("click", () => { sort = b.dataset.raceSort; render(root); }));
    $("#races-delegation", root).addEventListener("click", () => P().openDelegation());
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-follow-race]");
    if (!b) return;
    P().toggleFollow(b.dataset.followRace);
    const on = P().isFollowing(b.dataset.followRace);
    b.textContent = on ? "★" : "☆";
    b.setAttribute("aria-pressed", on);
  });

  globalThis.renderRaces = (root) => render(root);
  // Re-render when the tracked state changes anywhere in the app.
  addEventListener("pp:state", () => { const root = $("#races"); if (root && !$("#view-races").hidden) render(root); });
  if (!$("#view-races")?.hidden) render($("#races"));
})();
