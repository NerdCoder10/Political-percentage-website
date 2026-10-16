// UI: map background, drill-down panels (nation → state → county → city), midterm tab, methodology tab.
(function () {
  const M = Model;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : (+v).toFixed(d));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const partyLabel = { R: "Republican", D: "Democrat", I: "Independent", X: "Vacant" };

  // ------------------------------------------------------------------ data prep
  const atlas = US_ATLAS;
  const stateFeatures = topojson.feature(atlas, atlas.objects.states).features.filter((f) => M.stateByFips[f.id]);
  const countyFeatures = topojson.feature(atlas, atlas.objects.counties).features.filter((f) => ELECTIONS.counties[f.id]);
  const stateMesh = topojson.mesh(atlas, atlas.objects.states, (a, b) => a !== b);
  const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]); // matches us-atlas "albers" files
  const path = d3.geoPath();
  const stateLean = Object.fromEntries(Object.keys(M.states).map((st) => [st, M.stateLean(st)]));
  const countyLean = Object.fromEntries(countyFeatures.map((f) => [f.id, M.countyLean(f.id)]));
  const cityLeanCache = new Map();
  const cityLean = (i) => (cityLeanCache.has(i) ? cityLeanCache.get(i) : cityLeanCache.set(i, M.cityLean(CITIES[i])).get(i));
  CITIES.forEach((c, i) => { c.idx = i; c.xy = projection([c[3], c[4]]); });
  const citiesByState = d3.group(CITIES, (c) => c[1]);
  const citiesByCounty = d3.group(CITIES, (c) => c[5]);
  const ranks = M.rubricRanks();
  let forecast = M.forecast();
  const raceById = () => Object.fromEntries(forecast.races.map((r) => [r.id, r]));
  let races = raceById();

  // ------------------------------------------------------------------ colors
  let palette;
  const buildPalette = () => {
    const rep = css("--rep"), dem = css("--dem"), soft = css("--surface");
    palette = d3.scaleLinear()
      .domain([-40, -0.01, 0.01, 40])
      .range([rep, d3.interpolateRgb(rep, soft)(0.62), d3.interpolateRgb(dem, soft)(0.62), dem])
      .clamp(true);
  };
  buildPalette();
  const fillFor = (lean) => palette(lean.margin);

  // ------------------------------------------------------------------ map
  const mapEl = $("#map");
  const svg = d3.select(mapEl).append("svg").attr("role", "img").attr("aria-label", "United States political map");
  const root = svg.append("g");
  const gCounties = root.append("g");
  const gStates = root.append("g");
  const borders = root.append("path").attr("class", "state-borders").attr("d", path(stateMesh));
  const selOutline = root.append("path").attr("class", "state-outline-sel");
  const gCities = root.append("g");
  const tooltip = $("#tooltip");

  const statePaths = gStates.selectAll("path").data(stateFeatures).join("path")
    .attr("class", "state").attr("d", path)
    .on("click", (e, f) => { e.stopPropagation(); go({ level: "state", st: M.stateByFips[f.id] }); })
    .on("mousemove", (e, f) => showTip(e, M.states[M.stateByFips[f.id]].name, stateLean[M.stateByFips[f.id]]))
    .on("mouseleave", hideTip);
  const countyPaths = gCounties.selectAll("path").data(countyFeatures).join("path")
    .attr("class", "county").attr("d", path)
    .on("click", (e, f) => { e.stopPropagation(); go({ level: "county", st: ELECTIONS.counties[f.id].st, fips: f.id }); })
    .on("mousemove", (e, f) => showTip(e, `${ELECTIONS.counties[f.id].n}, ${ELECTIONS.counties[f.id].st}`, countyLean[f.id]))
    .on("mouseleave", hideTip);

  function showTip(e, title, lean) {
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${esc(title)}</strong>${leanText(lean)}<div class="fine">R ${fmt(lean.R)}% · D ${fmt(lean.D)}% · I ${fmt(lean.I)}% · O ${fmt(lean.O)}%</div>`;
    const x = Math.min(e.clientX + 14, innerWidth - tooltip.offsetWidth - 8);
    tooltip.style.left = x + "px"; tooltip.style.top = e.clientY + 14 + "px";
  }
  function hideTip() { tooltip.hidden = true; }

  const zoom = d3.zoom().scaleExtent([0.5, 80]).on("zoom", (e) => {
    root.attr("transform", e.transform);
    currentK = e.transform.k;
    sizeCities();
  });
  let currentK = 1;
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", () => { if (view.level !== "nation") go(view.level === "city" || view.level === "county" ? { level: "state", st: view.st } : { level: "nation" }); });

  const visibleArea = () => {
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    const panelW = innerWidth > 820 ? $("#panel").offsetWidth + 24 : 0;
    return { x: 12, y: 60, w: Math.max(200, w - panelW - 24), h: Math.max(150, h - 72) };
  };
  function fit(bounds, pad = 0.9, animate = true) {
    const a = visibleArea();
    const [[x0, y0], [x1, y1]] = bounds;
    const k = Math.min(60, pad / Math.max((x1 - x0) / a.w, (y1 - y0) / a.h));
    const t = d3.zoomIdentity.translate(a.x + a.w / 2 - (k * (x0 + x1)) / 2, a.y + a.h / 2 - (k * (y0 + y1)) / 2).scale(k);
    (animate ? svg.transition().duration(650) : svg).call(zoom.transform, t);
  }

  function sizeCities() {
    gCities.selectAll("circle").attr("r", (c) => (2 + Math.sqrt(c[2]) / 260) / currentK);
    gCities.selectAll("text").style("font-size", `${11 / currentK}px`).attr("dx", 6 / currentK).attr("dy", 4 / currentK)
      .style("stroke-width", 3 / currentK);
  }

  let colorMode = "states";
  function paintMap() {
    const sel = view.st;
    const showCounties = colorMode === "counties" || !!sel;
    statePaths
      .attr("fill", (f) => (colorMode === "counties" || M.stateByFips[f.id] === sel ? "transparent" : fillFor(stateLean[M.stateByFips[f.id]])))
      .classed("dim", (f) => sel && M.stateByFips[f.id] !== sel && colorMode === "states")
      .style("pointer-events", (f) => (colorMode === "counties" || M.stateByFips[f.id] === sel ? "none" : null));
    countyPaths
      .style("display", (f) => (showCounties && (colorMode === "counties" || ELECTIONS.counties[f.id].st === sel) ? null : "none"))
      .attr("fill", (f) => fillFor(countyLean[f.id]))
      .classed("sel", (f) => f.id === view.fips);
    const sf = sel && stateFeatures.find((f) => M.stateByFips[f.id] === sel);
    selOutline.attr("d", sf ? path(sf) : null);

    const list = sel ? (citiesByState.get(sel) ?? []).filter((c) => c.xy) : [];
    const labelled = new Set(list.slice(0, 8).map((c) => c.idx));
    if (view.city != null) labelled.add(view.city);
    gCities.selectAll("circle").data(list, (c) => c.idx).join("circle")
      .attr("class", "city").classed("sel", (c) => c.idx === view.city)
      .attr("cx", (c) => c.xy[0]).attr("cy", (c) => c.xy[1])
      .on("click", (e, c) => { e.stopPropagation(); go({ level: "city", st: c[1], fips: c[5], city: c.idx }); })
      .on("mousemove", (e, c) => showTip(e, `${c[0]}, ${c[1]}`, cityLean(c.idx)))
      .on("mouseleave", hideTip);
    gCities.selectAll("text").data(list.filter((c) => labelled.has(c.idx)), (c) => c.idx).join("text")
      .attr("class", "city-label").attr("x", (c) => c.xy[0]).attr("y", (c) => c.xy[1]).text((c) => c[0]);
    gCities.selectAll("text").raise();
    sizeCities();
  }

  // ------------------------------------------------------------------ navigation
  let view = { level: "nation" };
  function go(next, { animate = true, push = true } = {}) {
    view = { level: next.level, st: next.st ?? null, fips: next.fips ?? null, city: next.city ?? null };
    hideTip();
    paintMap();
    renderPanel();
    renderCrumbs();
    if (view.level === "nation") fit([[0, 0], [975, 610]], 0.96, animate);
    else if (view.level === "state") fit(path.bounds(stateFeatures.find((f) => M.stateByFips[f.id] === view.st)), 0.9, animate);
    else if (view.level === "county") fit(path.bounds(countyFeatures.find((f) => f.id === view.fips)), 0.5, animate);
    else if (view.level === "city") fit(path.bounds(countyFeatures.find((f) => f.id === view.fips)), 0.7, animate);
    if (push) setHash();
  }

  function renderCrumbs() {
    const parts = [`<button data-nav="nation">United States</button>`];
    if (view.st) parts.push(`<button data-nav="state:${view.st}">${esc(M.states[view.st].name)}</button>`);
    if (view.fips && (view.level === "county" || view.level === "city")) parts.push(`<button data-nav="county:${view.fips}">${esc(ELECTIONS.counties[view.fips].n)}</button>`);
    if (view.level === "city") parts.push(`<button data-nav="city:${view.city}">${esc(CITIES[view.city][0])}</button>`);
    $("#crumbs").innerHTML = parts.join('<span class="sep">›</span>');
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-nav]");
    if (!b) return;
    e.preventDefault();
    const [kind, arg] = b.dataset.nav.split(":");
    if (kind === "nation") go({ level: "nation" });
    if (kind === "state") go({ level: "state", st: arg });
    if (kind === "county") go({ level: "county", st: ELECTIONS.counties[arg].st, fips: arg });
    if (kind === "city") { const c = CITIES[+arg]; go({ level: "city", st: c[1], fips: c[5], city: +arg }); }
    if (kind === "tab") showTab(arg);
  });

  // ------------------------------------------------------------------ panel building blocks
  function leanText(l) {
    const m = Math.abs(l.margin);
    if (m < 1) return `<div class="lean-summary">Even — statistical tie</div>`;
    const p = l.margin > 0 ? "D" : "R";
    return `<div class="lean-summary txt-${p}">Leans ${p === "D" ? "Democratic" : "Republican"} by ${fmt(m)} pts</div>`;
  }
  function leanBlock(l, note) {
    return `<section aria-label="Political orientation by popular vote">
      <h3>Political orientation · popular vote</h3>
      ${leanText(l)}
      <div class="lean-bar" role="img" aria-label="Republican ${l.R}%, Democratic ${l.D}%, Independent ${l.I}%, Other ${l.O}%">
        <span class="seg-R" style="width:${l.R}%"></span><span class="seg-I" style="width:${l.I}%"></span><span class="seg-O" style="width:${l.O}%"></span><span class="seg-D" style="width:${l.D}%"></span>
      </div>
      <div class="lean-legend">
        <div><b class="txt-R">${fmt(l.R)}%</b><span class="dot seg-R"></span>Republican</div>
        <div><b class="txt-D">${fmt(l.D)}%</b><span class="dot seg-D"></span>Democratic</div>
        <div><b class="txt-I">${fmt(l.I)}%</b><span class="dot seg-I"></span>Independent</div>
        <div><b>${fmt(l.O)}%</b><span class="dot seg-O"></span>Other</div>
      </div>
      ${note ? `<p class="fine">${note}</p>` : ""}
    </section>`;
  }
  const miniLean = (l) => `<div class="lean-bar mini" title="R ${l.R}% · D ${l.D}% · I ${l.I}% · O ${l.O}%"><span class="seg-R" style="width:${l.R}%"></span><span class="seg-I" style="width:${l.I}%"></span><span class="seg-O" style="width:${l.O}%"></span><span class="seg-D" style="width:${l.D}%"></span></div>`;

  function rubricBlock(code, label) {
    const r = M.rubricScore(code);
    if (!r) return "";
    const rank = ranks[code];
    return `<section>
      <h3>Government performance rubric</h3>
      <div class="score-head"><span class="score-big">${r.total}<small> / 1000</small></span><span class="grade" title="Grade">${r.grade}</span>
        <span class="hint">${rank ? `Ranked #${rank} of 50 states` : label ?? ""}</span></div>
      ${r.categories.map((c) => `
        <details class="cat"><summary><div class="cat-row"><span>${esc(c.name)}</span><span class="num">${c.score} / ${c.points}</span>
          <div class="meter"><i style="width:${(100 * c.score) / c.points}%"></i></div></div></summary>
          <div class="cat-items">${c.items.map((i) => `<div><span>${esc(i.label)}: <b>${fmt(i.value, i.value % 1 ? 1 : 0)}${esc(i.unit)}</b></span><span class="num">${fmt(i.score)} / ${i.points}</span></div>`).join("")}</div>
        </details>`).join("")}
      <p class="fine">Tap a category for its indicators. <button class="btn-ghost" style="padding:2px 8px;font-size:12px" data-nav="tab:method">How scoring works</button></p>
    </section>`;
  }

  const initials = (n) => n.replace(/\b(Jr|Sr|II|III)\.?/g, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");

  // One line per poll: "Pollster (date): 52% approve / 41% disapprove", linked when a URL exists.
  const pollLine = (x, mode) => {
    const val = mode === "race"
      ? (x.D != null ? `D ${x.D} – R ${x.R}` : x.margin != null ? `margin ${x.margin > 0 ? "D+" : x.margin < 0 ? "R+" : "±"}${Math.abs(x.margin)}` : esc(x.note ?? ""))
      : `${x.approve}% ${x.scale === "favorability" ? "favorable" : x.scale === "rating" ? "excellent/good" : "approve"}${x.disapprove != null ? ` / ${x.disapprove}% ${x.scale === "favorability" ? "unfavorable" : x.scale === "rating" ? "fair/poor" : "disapprove"}` : ""}`;
    const name = x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.pollster)}</a>` : esc(x.pollster);
    return `<li>${name}${x.date ? ` (${esc(x.date)})` : ""}: ${val}${x.sponsor ? ` — <i>sponsor: ${esc(x.sponsor)}</i>` : ""}</li>`;
  };
  function approvalBlock(info) {
    if (!info) return "";
    return `<div class="approval">
      <div class="qual"><span>Job approval</span><div class="meter"><i style="width:${info.value}%"></i></div><b class="num">${fmt(info.value)}%</b></div>
      <details><summary>${info.imputed ? "No qualifying public poll — neutral median imputed" : `Average of ${info.polls.length} independent poll${info.polls.length > 1 ? "s" : ""}`}</summary>
        ${info.polls.length ? `<ul class="sources">${info.polls.map((x) => pollLine(x)).join("")}</ul>` : ""}
        ${info.excluded?.length ? `<p class="fine">Excluded (sponsored by a campaign, party or advocacy group):</p><ul class="sources">${info.excluded.map((x) => pollLine(x)).join("")}</ul>` : ""}
        ${info.note ? `<p class="fine">${esc(info.note)}</p>` : ""}
      </details></div>`;
  }

  function leaderCard(p, office, kind, ctx = {}) {
    if (!p) return "";
    const b = M.bio(p, kind, ctx);
    const party = p.party ?? "X";
    return `<article class="leader">
      <div class="leader-top">
        <div class="avatar ${party}" aria-hidden="true">${esc(initials(p.name))}</div>
        <div>
          <div class="leader-name">${esc(p.name)} <span class="chip ${party}">${party === "I" ? "I" : party}</span></div>
          <div class="leader-office">${esc(office)}</div>
          <div class="fine">${esc(b.summary)}</div>
        </div>
      </div>
      <div class="qual"><span>Qualifications</span><div class="meter"><i style="width:${b.qual.score}%"></i></div><b class="num">${b.qual.score}/100</b></div>
      ${kind === "governor" ? approvalBlock(p.approvalInfo) : ""}
      ${ctx.approval ? approvalBlock(ctx.approval) : ""}
      <details ${ctx.open ? "open" : ""}><summary>Biography &amp; possible next moves</summary>
        <h4>Qualifications &amp; background</h4>
        <ul>${b.qualifications.length ? b.qualifications.map((q) => `<li>${esc(q)}</li>`).join("") : "<li>No prior offices recorded in dataset.</li>"}</ul>
        <h4>Possible next moves</h4>
        <ul>${b.nextMoves.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
        <p class="fine">Score: experience ${b.qual.parts.experience} + prior offices ${b.qual.parts.offices} + background ${b.qual.parts.background}${b.qual.parts.leadership ? ` + leadership ${b.qual.parts.leadership}` : ""}.</p>
      </details>
    </article>`;
  }

  const govTitle = (st) => (st === "DC" ? "Mayor of the District of Columbia" : `Governor of ${M.states[st].name}`);
  const withState = (p, st) => ({ ...p, state: st });

  // ------------------------------------------------------------------ panels
  function renderPanel() {
    const el = $("#panel");
    el.innerHTML = view.level === "nation" ? nationPanel() : view.level === "state" ? statePanel(view.st)
      : view.level === "county" ? countyPanel(view.fips) : cityPanel(view.city);
    el.scrollTop = 0;
  }

  function nationPanel() {
    const l = M.nationLean();
    const sen = d3.rollup(CONGRESS.filter((m) => m.type === "sen"), (v) => v.length, (m) => m.party);
    const house = d3.rollup(CONGRESS.filter((m) => m.type === "rep" && m.state !== "DC"), (v) => v.length, (m) => m.party);
    const govs = d3.rollup(Object.entries(GOVERNORS).filter(([k]) => k !== "DC"), (v) => v.length, ([, g]) => g.party);
    return `<div class="kicker">National</div><h2>United States</h2>
      <p class="hint">Click any state to drill down to its counties and cities. Use the tabs above for the 2026 midterm forecast and the scoring method.</p>
      ${leanBlock(l, `Nationwide popular-vote orientation. Recent presidential results are weighted and adjusted for the current generic ballot (D+${NATIONAL_OPINION.genericBallot}).`)}
      ${rubricBlock("US", "Federal government, scored with the same goalposts as the states")}
      <section><h3>Balance of power</h3>
        <ul class="link-list">
          <li><span>U.S. Senate</span><span class="num"><b class="txt-R">${sen.get("R") ?? 0} R</b> · <b class="txt-D">${sen.get("D") ?? 0} D</b> · <b class="txt-I">${sen.get("I") ?? 0} I</b></span></li>
          <li><span>U.S. House</span><span class="num"><b class="txt-R">${house.get("R") ?? 0} R</b> · <b class="txt-D">${house.get("D") ?? 0} D</b> · ${435 - (house.get("R") ?? 0) - (house.get("D") ?? 0)} vacant</span></li>
          <li><span>Governors</span><span class="num"><b class="txt-R">${govs.get("R")} R</b> · <b class="txt-D">${govs.get("D")} D</b></span></li>
        </ul>
      </section>
      <section><h3>National leaders</h3>
        ${NATIONAL_LEADERS.map((p) => {
          const roster = p.roster && CONGRESS.find((m) => m.id === p.roster);
          const pa = p.office.startsWith("President") && POLLING.national.presidentApproval;
          return leaderCard({ ...(roster ?? {}), ...p, state: "US" }, p.office, "national",
            pa ? { approval: { value: pa.value, polls: pa.polls } } : {});
        }).join("")}
      </section>
      <p class="note">Officeholder data: Congress from the public @unitedstates/congress-legislators roster; governors, mayors and county leaders curated as of ${NATIONAL_OPINION.asOf}. Verify against official sources before relying on it.</p>`;
  }

  function statePanel(st) {
    const s = M.states[st];
    const l = stateLean[st];
    const g = GOVERNORS[st];
    const gRace = races[`GOV-${st}`];
    const sens = M.senators(st);
    const houseRows = [];
    if (s.seats) for (let d = s.seats === 1 ? 0 : 1; d <= (s.seats === 1 ? 0 : s.seats); d++) houseRows.push(d);
    const topCities = (citiesByState.get(st) ?? []).slice(0, 10);
    return `<div class="kicker">State</div><h2>${esc(s.name)}</h2>
      ${leanBlock(l)}
      ${rubricBlock(st)}
      <section><h3>Statewide leaders</h3>
        ${leaderCard(withState(g, st), govTitle(st), "governor", { forecast: gRace })}
        ${sens.map((m) => leaderCard(m, `U.S. Senator · Class ${m.cls}${m.end.startsWith("2026") ? " (appointed)" : ""}`, "senator",
          { forecast: races[`SEN-${st}`]?.incumbent.id === m.id ? races[`SEN-${st}`] : races[`SEN-${st}-S`]?.incumbent.id === m.id ? races[`SEN-${st}-S`] : null })).join("")}
        ${st === "DC" ? leaderCard(M.representative("DC", 0), "Delegate to the U.S. House (non-voting)", "representative", {}) : ""}
      </section>
      ${houseRows.length ? `<section><h3>U.S. House delegation · ${s.seats} district${s.seats > 1 ? "s" : ""}</h3>
        ${houseRows.map((d) => districtRow(st, d)).join("")}
        ${M.REDISTRICTED_2026.includes(st) ? `<p class="note">${esc(s.name)} adopted new congressional maps for 2026. District percentages here reflect the 2024 lines.</p>` : ""}
      </section>` : ""}
      <section><h3>Largest cities</h3>
        <ul class="link-list">${topCities.map((c) => `<li><button data-nav="city:${c.idx}">${esc(c[0])}</button>${miniLean(cityLean(c.idx))}</li>`).join("")}</ul>
        <p class="fine">Every county in ${esc(s.name)} is clickable on the map, and the city dots are clickable too.</p>
      </section>`;
  }

  function districtRow(st, d) {
    const rep = M.representative(st, d);
    const l = M.districtLean(st, d);
    const h = HOUSE24[`${st}-${d}`];
    const race = races[`${st}-${d === 0 ? "AL" : String(d).padStart(2, "0")}`];
    const label = d === 0 ? "At-large" : `District ${d}`;
    return `<details class="district"><summary>
        <span class="dname">${label} · ${rep ? `${esc(rep.name)} <span class="chip ${rep.party}">${rep.party}</span>` : "<i>Vacant</i>"}
          <small>R ${fmt(l.R)} · D ${fmt(l.D)} · I ${fmt(l.I)} · O ${fmt(l.O)}</small></span>
        ${miniLean(l)}</summary>
      ${rep ? leaderCard(rep, `U.S. Representative · ${st}-${d === 0 ? "AL" : d}`, "representative", { forecast: race, districtMargin: l.margin, open: true }) : `<p class="hint">Seat vacant. ${race ? `2026 forecast: ${Math.round(race.pD * 100)}% D / ${Math.round((1 - race.pD) * 100)}% R.` : ""}</p>`}
      ${h ? `<p class="fine">2024 House result: R ${fmt((100 * h.R) / h.total)}% · D ${fmt((100 * h.D) / h.total)}%${h.I ? ` · I ${fmt((100 * h.I) / h.total)}%` : ""}${h.O ? ` · Other ${fmt((100 * h.O) / h.total)}%` : ""}${h.unopposed ? " (uncontested)" : ""}.</p>` : ""}
    </details>`;
  }

  function countyLeaderBlock(fips) {
    const c = ELECTIONS.counties[fips];
    const cl = COUNTY_LEADERS[fips];
    if (cl) return leaderCard(withState(cl, c.st), cl.title, "county");
    const cons = CONSOLIDATED[fips];
    if (cons && MAYORS[cons]) return leaderCard(withState(MAYORS[cons], c.st), `Mayor of consolidated ${cons.split("|")[0]} (city-county government)`, "mayor");
    const form = COUNTY_GOVERNMENT[c.st] ?? COUNTY_GOVERNMENT.default;
    return `<div class="note"><b>Governed by:</b> ${esc(form)}.<br>Individual county officials for this county are not in the curated dataset. The state and federal officials who represent it are listed below.</div>`;
  }

  function stateContext(st) {
    const g = GOVERNORS[st];
    return `<section><h3>State &amp; federal representation</h3>
      <ul class="link-list">
        <li><span>${esc(govTitle(st))}</span><span>${esc(g.name)} <span class="chip ${g.party}">${g.party}</span></span></li>
        ${M.senators(st).map((m) => `<li><span>U.S. Senator</span><span>${esc(m.name)} <span class="chip ${m.party}">${m.party}</span></span></li>`).join("")}
      </ul>
      <p class="fine"><button class="btn-ghost" style="padding:2px 8px;font-size:12px" data-nav="state:${st}">Open ${esc(M.states[st].name)}</button> for full bios, the House delegation and the state's rubric score.</p>
    </section>`;
  }

  function countyPanel(fips) {
    const c = ELECTIONS.counties[fips];
    const l = countyLean[fips];
    const sh = M.countyShares(fips);
    const note = sh.borrowed ? "Results for this area are not reported at the county level, so the statewide vote is used."
      : sh.carried ? "2024 results here are reported for new planning regions; the 2020 county result is carried forward with the statewide 2020→2024 swing." : "";
    const cities = citiesByCounty.get(fips) ?? [];
    const v = c.v24;
    return `<div class="kicker">County · ${esc(M.states[c.st].name)}</div><h2>${esc(c.n)}${/County|Parish|Borough|city|Census Area|Municipality/i.test(c.n) ? "" : c.st === "LA" ? " Parish" : " County"}</h2>
      ${leanBlock(l, note)}
      ${v ? `<p class="fine">2024 presidential: ${d3.format(",")(v[3])} votes · R ${fmt((100 * v[0]) / v[3])}% · D ${fmt((100 * v[1]) / v[3])}% · other ${fmt((100 * v[2]) / v[3])}%</p>` : ""}
      <section><h3>County leadership</h3>${countyLeaderBlock(fips)}</section>
      ${cities.length ? `<section><h3>Cities in this county</h3><ul class="link-list">${cities.map((ct) => `<li><button data-nav="city:${ct.idx}">${esc(ct[0])}</button><span class="fine">${d3.format(",")(ct[2])}</span></li>`).join("")}</ul></section>` : ""}
      ${stateContext(c.st)}`;
  }

  function cityPanel(i) {
    const c = CITIES[i];
    const [name, st, pop, , , fips] = c;
    const l = cityLean(i);
    const mayor = MAYORS[`${name}|${st}`];
    const county = ELECTIONS.counties[fips];
    const multi = M.MULTI_COUNTY_CITIES[`${name}|${st}`];
    const note = multi ? "Combined popular vote of all five boroughs."
      : `Estimated from ${esc(county.n)}'s vote${l.countyShare < 0.98 ? ` plus an urban-core adjustment (${name} is ~${Math.round(l.countyShare * 100)}% of the county; adjustment shifts the margin ${fmt(l.urbanShift * 100)} pts toward Democrats)` : ""}.`;
    return `<div class="kicker">City · ${esc(county?.n ?? "")}, ${st}</div><h2>${esc(name)}</h2>
      <p class="hint">Population ${d3.format(",")(pop)}</p>
      ${leanBlock(l, note)}
      <section><h3>City leadership</h3>
        ${mayor ? leaderCard(withState(mayor, st), `Mayor of ${name}`, "mayor", { open: true })
          : `<div class="note">The mayor of ${esc(name)} is not in the curated dataset yet; it covers about 85 of the largest cities. Most U.S. cities use a mayor–council or council–manager government.</div>`}
      </section>
      <section><h3>County</h3>
        <ul class="link-list"><li><button data-nav="county:${fips}">${esc(county.n)}</button>${miniLean(countyLean[fips])}</li></ul>
        ${COUNTY_LEADERS[fips] ? `<p class="fine">${esc(COUNTY_LEADERS[fips].title)}: ${esc(COUNTY_LEADERS[fips].name)} (${COUNTY_LEADERS[fips].party})</p>` : ""}
      </section>
      ${stateContext(st)}`;
  }

  // ------------------------------------------------------------------ search
  const searchIndex = [
    ...Object.values(M.states).map((s) => ({ label: s.name, sub: "State", nav: `state:${s.abbr}`, key: s.name.toLowerCase() + " " + s.abbr.toLowerCase() })),
    ...countyFeatures.map((f) => { const c = ELECTIONS.counties[f.id]; return { label: c.n, sub: `County · ${c.st}`, nav: `county:${f.id}`, key: (c.n + " " + c.st).toLowerCase() }; }),
    ...CITIES.map((c) => ({ label: c[0], sub: `City · ${c[1]}`, nav: `city:${c.idx}`, key: (c[0] + " " + c[1]).toLowerCase(), pop: c[2] })),
  ];
  const searchEl = $("#search"), resultsEl = $("#search-results");
  let active = -1;
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    active = -1;
    if (q.length < 2) { resultsEl.hidden = true; return; }
    const hits = searchIndex.filter((x) => x.key.includes(q))
      .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (a.sub === "State" ? -1 : b.sub === "State" ? 1 : (b.pop ?? 0) - (a.pop ?? 0)))
      .slice(0, 10);
    resultsEl.innerHTML = hits.length ? hits.map((h, i) => `<li role="option" data-nav="${h.nav}" id="sr-${i}">${esc(h.label)} <small>${esc(h.sub)}</small></li>`).join("") : `<li><small>No matches</small></li>`;
    resultsEl.hidden = false;
  });
  searchEl.addEventListener("keydown", (e) => {
    const items = [...resultsEl.querySelectorAll("li[data-nav]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute("aria-selected", i === active));
    } else if (e.key === "Enter" && items.length) { (items[active] ?? items[0]).click(); }
    else if (e.key === "Escape") resultsEl.hidden = true;
  });
  resultsEl.addEventListener("click", () => { resultsEl.hidden = true; searchEl.value = ""; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) resultsEl.hidden = true; });

  document.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    colorMode = b.dataset.color;
    document.querySelectorAll("[data-color]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    paintMap();
  }));

  // ------------------------------------------------------------------ tabs + hash
  function showTab(tab) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $("#view-map").hidden = tab !== "map";
    $("#view-midterms").hidden = tab !== "midterms";
    $("#view-method").hidden = tab !== "method";
    if (tab === "midterms") renderMidterms();
    if (tab === "method" && !$("#method").innerHTML) renderMethod();
    if (tab === "map") requestAnimationFrame(() => go(view, { animate: false, push: false }));
    currentTab = tab;
    setHash();
  }
  let currentTab = "map";
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  function setHash() {
    const h = currentTab !== "map" ? currentTab
      : view.level === "state" ? `state/${view.st}` : view.level === "county" ? `county/${view.fips}`
      : view.level === "city" ? `city/${encodeURIComponent(CITIES[view.city][0] + "|" + view.st)}` : "";
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function fromHash() {
    const [kind, arg] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (kind === "midterms" || kind === "method") { go({ level: "nation" }, { animate: false, push: false }); showTab(kind); return; }
    if (kind === "state" && M.states[arg]) return go({ level: "state", st: arg }, { animate: false });
    if (kind === "county" && ELECTIONS.counties[arg]) return go({ level: "county", st: ELECTIONS.counties[arg].st, fips: arg }, { animate: false });
    if (kind === "city") { const c = CITIES.find((x) => `${x[0]}|${x[1]}` === arg); if (c) return go({ level: "city", st: c[1], fips: c[5], city: c.idx }, { animate: false }); }
    go({ level: "nation" }, { animate: false });
  }

  // ------------------------------------------------------------------ midterms tab
  const gbEl = $("#gb");
  const gbLabel = (v) => (v === 0 ? "Even" : v > 0 ? `D+${v}` : `R+${-v}`);
  let officeFilter = "all", openRace = null;
  gbEl.value = NATIONAL_OPINION.genericBallot;
  gbEl.addEventListener("input", () => { forecast = M.forecast({ genericBallot: +gbEl.value }); races = raceById(); renderMidterms(); });
  $("#gb-reset").addEventListener("click", () => { gbEl.value = NATIONAL_OPINION.genericBallot; gbEl.dispatchEvent(new Event("input")); });
  $("#state-filter").innerHTML = `<option value="">All states</option>` + Object.values(M.states).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.abbr}">${esc(s.name)}</option>`).join("");
  ["#state-filter", "#sort", "#race-search"].forEach((s) => $(s).addEventListener("input", renderRaceTable));
  document.querySelectorAll("[data-office]").forEach((b) => b.addEventListener("click", () => {
    officeFilter = b.dataset.office;
    document.querySelectorAll("[data-office]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderRaceTable();
  }));

  function renderMidterms() {
    $("#gb-label").textContent = gbLabel(+gbEl.value) + (+gbEl.value === NATIONAL_OPINION.genericBallot ? " (current polling average)" : "");
    const c = forecast.control;
    const gov = forecast.races.filter((r) => r.office === "governor");
    const notUp = Object.entries(GOVERNORS).filter(([k, g]) => k !== "DC" && g.status2026 === "not-up");
    const govD = Math.round(d3.sum(gov, (r) => r.pD) + notUp.filter(([, g]) => g.party === "D").length);
    const split = (p) => `<div class="split"><i style="width:${p * 100}%;background:var(--dem)"></i><i style="width:${(1 - p) * 100}%;background:var(--rep)"></i></div>`;
    $("#summary").innerHTML = `
      <div class="card"><div class="label">U.S. House control</div>
        <div class="big"><span class="txt-D">${Math.round(c.house.pD * 100)}%</span> · <span class="txt-R">${Math.round((1 - c.house.pD) * 100)}%</span></div>
        ${split(c.house.pD)}<div class="sub">Expected seats: <b class="txt-D">${c.house.expectedD} D</b> – <b class="txt-R">${435 - c.house.expectedD} R</b> (218 for majority)</div></div>
      <div class="card"><div class="label">U.S. Senate control</div>
        <div class="big"><span class="txt-D">${Math.round(c.senate.pD * 100)}%</span> · <span class="txt-R">${Math.round((1 - c.senate.pD) * 100)}%</span></div>
        ${split(c.senate.pD)}<div class="sub">Expected: <b class="txt-D">${c.senate.expectedD} D/I</b> – <b class="txt-R">${100 - c.senate.expectedD} R</b>. Democrats need 51 (VP breaks ties for R). Not up: ${c.senate.holdover.D} D/I, ${c.senate.holdover.R} R.</div></div>
      <div class="card"><div class="label">Governorships after 2026</div>
        <div class="big"><span class="txt-D">${govD} D</span> · <span class="txt-R">${50 - govD} R</span></div>
        ${split(govD / 50)}<div class="sub">${gov.length} races on the ballot; expected value from race probabilities.</div></div>
      <div class="card"><div class="label">National climate</div>
        <div class="big">${gbLabel(+gbEl.value)}</div>
        <div class="sub">Swing vs. 2024 House vote (${M.houseNationalMargin24 > 0 ? "D" : "R"}+${fmt(Math.abs(M.houseNationalMargin24))}): <b>${forecast.swing > 0 ? "+" : ""}${forecast.swing} pts toward ${forecast.swing >= 0 ? "Democrats" : "Republicans"}</b>. Presidential approval ≈ ${NATIONAL_OPINION.presidentApproval}%.</div></div>`;
    renderRaceTable();
  }

  const officeOrder = { senate: 0, governor: 1, house: 2, mayor: 3 };
  function renderRaceTable() {
    const st = $("#state-filter").value, q = $("#race-search").value.trim().toLowerCase(), sort = $("#sort").value;
    let list = forecast.races.filter((r) => (officeFilter === "all" || r.office === officeFilter) && (!st || r.state === st)
      && (!q || (r.title + " " + r.incumbent.name).toLowerCase().includes(q)));
    const cmp = {
      close: (a, b) => Math.abs(a.pD - 0.5) - Math.abs(b.pD - 0.5) || officeOrder[a.office] - officeOrder[b.office],
      d: (a, b) => b.pD - a.pD, r: (a, b) => a.pD - b.pD,
      name: (a, b) => officeOrder[a.office] - officeOrder[b.office] || a.title.localeCompare(b.title, undefined, { numeric: true }),
    }[sort];
    list.sort(cmp);
    const shown = list.slice(0, 600);
    $("#race-rows").innerHTML = shown.map((r) => {
      const pD = Math.round(r.pD * 100);
      const dLabel = r.challenger === "I" ? "Ind" : "D";
      const cls = r.rating.tier === 0 ? "T" : r.rating.side + r.rating.tier;
      const seatText = r.status === "open" ? "Open seat" : r.status === "uncertain" ? "Incumbent (uncertain)" : "Incumbent running";
      const row = `<tr class="race" data-race="${r.id}" aria-expanded="${openRace === r.id}">
        <td><div class="race-title">${esc(r.title)}<small>${r.office === "house" ? r.id : r.office[0].toUpperCase() + r.office.slice(1)}${r.redistricted ? " · new 2026 map" : ""}${r.poll ? ` · ${esc(r.poll.D)} vs. ${esc(r.poll.R)} · polled` : ""}</small></div></td>
        <td>${esc(r.incumbent.name)} <span class="chip ${r.incumbent.party}">${r.incumbent.party}</span></td>
        <td>${seatText}</td>
        <td><span class="pill ${cls}">${r.rating.label.replace(" D", r.challenger === "I" ? " Ind" : " D")}</span></td>
        <td><div class="prob"><span class="l">${pD}%</span><span class="bar" role="img" aria-label="${dLabel} ${pD}%, R ${100 - pD}%"><i style="width:${pD}%;background:var(--${r.challenger === "I" ? "ind" : "dem"})"></i><i style="width:${100 - pD}%;background:var(--rep)"></i></span><span class="r">${100 - pD}%</span></div></td>
      </tr>`;
      return row + (openRace === r.id ? raceDetail(r) : "");
    }).join("");
    $("#race-count").textContent = `Showing ${shown.length} of ${list.length} races. Click a race to see how its probability was calculated. Left number = ${officeFilter === "senate" || officeFilter === "all" ? "Democratic (or Democratic-backed independent)" : "Democratic"} win chance, right = Republican.`;
  }
  function raceDetail(r) {
    const f = (v) => `${v > 0 ? "D+" : v < 0 ? "R+" : "±"}${fmt(Math.abs(v))}`;
    return `<tr class="detail"><td colspan="5">
      ${r.note ? `<p>${esc(r.note)}</p>` : ""}
      <div class="factors">
        <div>Partisan baseline<b>${f(r.baseline)}</b></div>
        <div>National climate<b>${f(r.climate)}</b></div>
        <div>Incumbency<b>${f(r.incumbency)}</b></div>
        <div>Approval (public opinion)<b>${f(r.approvalEffect)}</b></div>
        <div>Qualifications<b>${f(r.qualityEffect)}</b></div>
        ${r.personal ? `<div>Candidate personal vote<b>${f(r.personal)}</b></div>` : ""}
        <div>Fundamentals margin<b>${f(r.fundamentals)}</b></div>
        ${r.poll ? `<div>Poll average (${r.poll.polls.length} source${r.poll.polls.length > 1 ? "s" : ""})<b>${f(r.poll.margin)}</b></div><div>Poll weight<b>${Math.round(r.poll.weight * 100)}%</b></div>` : ""}
        <div>Final margin<b>${f(r.margin)}</b></div>
        <div>Uncertainty (σ)<b>±${r.sigma} pts</b></div>
      </div>
      ${r.poll ? `<p class="fine"><b>${esc(r.poll.D)}</b> (${r.challenger === "I" ? "I" : "D"}) vs. <b>${esc(r.poll.R)}</b> (R). Polls used — ${esc(r.poll.basis)}:</p>
        <ul class="sources">${r.poll.polls.map((x) => pollLine(x, "race")).join("")}</ul>
        ${r.poll.excluded?.length ? `<p class="fine">Excluded as sponsored:</p><ul class="sources">${r.poll.excluded.map((x) => pollLine(x, "race")).join("")}</ul>` : ""}
        ${r.poll.note ? `<p class="fine">${esc(r.poll.note)}</p>` : ""}` : `<p class="fine">No published head-to-head polling found for this race; the forecast uses fundamentals only.</p>`}
      <p class="fine">Win probability = Φ(final margin ÷ σ) = Φ(${fmt(r.margin)} ÷ ${r.sigma}) = ${fmt(r.pD * 100)}% ${r.challenger === "I" ? "independent" : "Democratic"}.
      ${r.office !== "mayor" ? `<button class="btn-ghost" style="padding:2px 8px;font-size:12px" data-open-state="${r.state}">View ${esc(M.states[r.state].name)} on the map</button>` : ""}</p>
    </td></tr>`;
  }
  $("#race-rows").addEventListener("click", (e) => {
    const os = e.target.closest("[data-open-state]");
    if (os) { showTab("map"); go({ level: "state", st: os.dataset.openState }); return; }
    const tr = e.target.closest("tr.race");
    if (!tr) return;
    openRace = openRace === tr.dataset.race ? null : tr.dataset.race;
    renderRaceTable();
  });

  // ------------------------------------------------------------------ methodology tab
  function renderMethod() {
    const ranked = Object.keys(M.states).filter((s) => s !== "DC").map((s) => ({ s, r: M.rubricScore(s), l: stateLean[s] })).sort((a, b) => b.r.total - a.r.total);
    const us = M.rubricScore("US");
    $("#method").innerHTML = `
      <h1>Rubric &amp; Methodology</h1>
      <p class="lede">Every number on this site comes from the transparent formulas below. The code lives in <code>js/model.js</code>, so anyone can audit or tune it.</p>

      <h2>1. Government Performance Rubric (1,000 points)</h2>
      <p>Nine areas of government are scored with <b>fixed goalposts</b>. A government earns
      <code>points × (value − worst) ÷ (best − worst)</code>, capped between 0 and the maximum. Goalposts are absolute, not relative to other states, so one state's score never changes because another state improved. Weights reflect how directly each area affects residents and how much government controls it.</p>
      <div class="table-wrap"><table class="method-table">
        <thead><tr><th>Category / indicator</th><th class="num">Points</th><th class="num">Worst (0 pts)</th><th class="num">Best (full)</th><th>Why this weight</th></tr></thead>
        <tbody>${M.RUBRIC.map((c) => `<tr class="cat-head"><td>${esc(c.name)}</td><td class="num">${c.points}</td><td></td><td></td><td>${esc(c.why)}</td></tr>`
          + c.items.map((i) => `<tr><td>&nbsp;&nbsp;${esc(i.label)}</td><td class="num">${i.points}</td><td class="num">${i.worst}${esc(i.unit)}</td><td class="num">${i.best}${esc(i.unit)}</td><td></td></tr>`).join("")).join("")}
          <tr class="cat-head"><td>Total</td><td class="num">${M.RUBRIC_TOTAL}</td><td></td><td></td><td>Grades: A ≥ 750 · B ≥ 650 · C ≥ 550 · D ≥ 450 · F below</td></tr>
        </tbody></table></div>
      <p class="fine">Cross-partisan appeal = executive approval − (50 + half the executive's party lead in that state). It rewards leaders who win approval beyond their own party's base, so public opinion isn't just a partisanship proxy. Indicator values are rounded approximations of the latest BLS, BEA, Census ACS, CDC, FBI, NCES, FHWA, EIA, S&amp;P and Pew releases; see <code>data/state-indicators.js</code>.</p>

      <h3 style="margin-top:18px">State rankings</h3>
      <div class="table-wrap"><table class="method-table">
        <thead><tr><th>#</th><th>State</th><th class="num">Score</th><th>Grade</th>${M.RUBRIC.map((c) => `<th class="num" title="${esc(c.name)}">${esc(c.name.split(" ")[0])}</th>`).join("")}<th>Lean</th></tr></thead>
        <tbody>
          <tr class="cat-head"><td>—</td><td>United States (federal)</td><td class="num">${us.total}</td><td>${us.grade}</td>${us.categories.map((c) => `<td class="num">${c.score}</td>`).join("")}<td></td></tr>
          ${ranked.map((x, i) => `<tr><td>${i + 1}</td><td><button class="btn-ghost" style="padding:1px 8px" data-open-state="${x.s}">${esc(M.states[x.s].name)}</button></td><td class="num"><b>${x.r.total}</b></td><td>${x.r.grade}</td>${x.r.categories.map((c) => `<td class="num">${c.score}</td>`).join("")}<td class="txt-${x.l.leader}">${x.l.leader}+${fmt(Math.abs(x.l.margin))}</td></tr>`).join("")}
        </tbody></table></div>

      <h2>2. Political-orientation algorithm (R / D / Independent / Other)</h2>
      <p>The algorithm uses real popular-vote returns: 2016, 2020 and 2024 presidential results for all ${Object.keys(ELECTIONS.counties).length.toLocaleString()} counties, plus 2024 U.S. House results for all 435 districts. For any area:</p>
<pre class="formula">base      = 0.6·share₂₀₂₄ + 0.3·share₂₀₂₀ + 0.1·share₂₀₁₆          (for R, D and non-major votes)
momentum  = + 0.2 · (share₂₀₂₄ − share₂₀₂₀)                          (damped trend continuation)
climate   = ± ½ · (generic ballot − 2024 House vote margin) · elasticity
elasticity= 1 − ½·|D − R|                                            (lopsided places move less)
soft I    = 7% · max(0, 1 − |D − R| / 0.6)                            (ticket-splitters, taken from R & D)
Independent = 0.6 · non-major vote + soft I
Other       = 0.4 · non-major vote + 0.4%
→ normalized so R + D + I + O = 100%</pre>
      <ul>
        <li><b>Nation &amp; states</b> are summed directly from county returns.</li>
        <li><b>Counties</b> use their own returns. Alaska boroughs use the statewide vote, and Connecticut's old counties carry 2020 forward with the statewide swing.</li>
        <li><b>Congressional districts</b> blend the 2024 House vote (70%) with the state presidential vote (30%) to remove one-off candidate effects.</li>
        <li><b>Cities</b> start from their county, then get an urban-core adjustment toward Democrats of (4% + 8% × size factor) × (1 − city's share of county). New York City combines its five boroughs.</li>
      </ul>
      <p class="callout">These are modeled popular-vote shares, not party registration. "Independent" means voters likely to back independent or third-party candidates, or to split tickets.</p>

      <h2>3. Qualifications &amp; "next moves"</h2>
      <p>Qualification score (0–100) = years in elected office × 3 (max 45) + 12 per prior public office (max 35) + 6 per relevant professional credential such as law, military, medicine, business or education (max 15) + 5 for a party-leadership role. Possible next moves come from rules that look at term limits, age, the office's next election, open seats in the state, how safe the seat is, and the 2026 forecast.</p>

      <h2>4. 2026 midterm forecast</h2>
<pre class="formula">expected D margin = partisan baseline
                  + (generic ballot − 2024 House margin) × elasticity
                  + incumbency (Senate ±2.5, Governor ±3; open House seats −3 for the departing party)
                  + qualification edge  ((score − 50) × 0.04, max ±2)
                  + approval effect for running governors  (0.5 × (approval − (50 + ½ party lead)), max ±12)
                  + documented personal vote (e.g. Collins −12, Osborn +12)
final margin      = w × head-to-head poll average + (1 − w) × expected margin
                    w = 0.35 + 0.1 per independent poll (an aggregator average counts as 3), max 0.7
P(win) = Φ(final margin ÷ σ)      σ = 6 Senate · 6.5 House (+3 if redistricted) · 7 Governor · 8 Mayor,
                                   shrinking by up to 25% as polling weight grows</pre>
      <p>Chamber control comes from 20,000 simulated elections. Each simulation draws one shared national polling error (σ = 2.5 pts) plus independent race-level errors. Democrats need 218 House seats, and 51 Senate seats because the Republican Vice President breaks ties. Move the generic-ballot slider on the forecast tab to see how every race responds.</p>

      <h2>5. Sources &amp; neutrality</h2>
      <p>Approval ratings, national polling and race polls come from published polls collected from news coverage on ${esc(POLLING.asOf)}. Each number lists its pollster, field date and a link. These rules keep the inputs as neutral as possible:</p>
      <ol>
        <li><b>Independent pollsters first.</b> Universities, news organizations and nonpartisan firms that publish their methods count, such as Morning Consult, Emerson, Siena, Marist, Quinnipiac, UNH, Marquette and Vanderbilt.</li>
        <li><b>Sponsored polls are excluded from averages.</b> Polls paid for by a campaign, party or advocacy group are shown with their sponsor but don't count, whichever side paid for them.</li>
        <li><b>Simple averages.</b> No pollster grades or "house effect" corrections, so anyone can reproduce the number.</li>
        <li><b>Neutral imputation.</b> A governor with no qualifying poll gets the median of all sourced governors (${fmt(M.approvalMedian)}%), not a guess in either direction.</li>
        <li><b>Several aggregators for national numbers.</b> President approval (${fmt(POLLING.national.presidentApproval.value)}%) and the generic ballot (D+${fmt(POLLING.national.genericBallot.value)}) average aggregators with differently leaning audiences: ${POLLING.national.genericBallot.polls.map((x) => esc(x.pollster)).join(", ")}.</li>
        <li><b>Polls inform the forecast but don't replace it.</b> Head-to-head polls get at most 70% weight, and the rest comes from the vote-history fundamentals, so a single outlier can't swing a race.</li>
      </ol>
      <div class="table-wrap"><table class="method-table">
        <thead><tr><th>State</th><th>Governor</th><th class="num">Approval used</th><th>Basis</th></tr></thead>
        <tbody>${Object.entries(GOVERNORS).sort((a, b) => a[0].localeCompare(b[0])).map(([st, g]) => {
          const i = g.approvalInfo;
          return `<tr><td>${st}</td><td>${esc(g.name)}</td><td class="num">${fmt(i.value)}%${i.imputed ? "*" : ""}</td><td><ul class="sources" style="margin:0">${i.polls.length ? i.polls.map((x) => pollLine(x)).join("") : `<li>${esc(i.note ?? "No qualifying poll")} (median imputed)</li>`}${(i.excluded ?? []).map((x) => pollLine(x)).join("")}</ul></td></tr>`;
        }).join("")}</tbody></table></div>
      <p class="fine">* imputed median. Ratings labelled "favorable" or "excellent/good" use different question wording from job approval and run a little lower; they're used only where no job-approval poll exists.</p>
      <p class="callout"><b>Economic, health, education, safety and other rubric indicators:</b> unemployment is updated from the BLS August 2026 release for the states it reported (${Object.keys(POLLING.indicatorUpdates.unemp.values).join(", ")}). The other indicators are still rounded figures from the latest official releases and are marked approximate. This build environment blocks the official data services (Census, BLS, BEA, CDC, FBI, EIA, NAEP), so they couldn't be pulled automatically.</p>

      <h2>Data sources &amp; limitations</h2>
      <ul>
        <li>County presidential results: <code>tonmcg/US_County_Level_Election_Results_08-24</code>. House results: FiveThirtyEight <code>election-results</code>.</li>
        <li>Members of Congress, with service history and leadership: <code>@unitedstates/congress-legislators</code> (public domain).</li>
        <li>Map: U.S. Census cartographic boundaries via <code>us-atlas</code>. Cities: the 1,000 largest U.S. cities (Census estimates).</li>
        <li>Governors, mayors (~85 largest cities), county executives, approval ratings and retirement statuses are curated in <code>data/leaders.js</code> as of ${NATIONAL_OPINION.asOf}. Counties and cities without a curated leader show their form of government instead.</li>
        <li>Mid-decade redistricting (TX, CA, MO, NC, OH, UT) isn't fully reflected in district baselines, so those races get extra uncertainty.</li>
        <li>This is a statistical model for education and exploration. It is not an official forecast or an endorsement.</li>
      </ul>
      <p class="fine">Rebuild the generated data with <code>npm run build:data</code>. Run the sanity checks with <code>npm run check</code>.</p>`;
  }
  $("#method").addEventListener("click", (e) => {
    const os = e.target.closest("[data-open-state]");
    if (os) { showTab("map"); go({ level: "state", st: os.dataset.openState }); }
  });

  // ------------------------------------------------------------------ boot
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { buildPalette(); paintMap(); });
  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => go(view, { animate: false, push: false }), 150); });
  fromHash();
})();
