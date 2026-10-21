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
    if (next.st && push) setTrackedState(next.st);
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
    if (kind === "races") { setTrackedState(arg); closeDelegation(); showTab("races"); }
    if (kind === "state") closeDelegation();
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
          <div class="cat-items">${c.items.map((i) => { const src = M.indicatorSources[i.key]; return `<div title="${esc(src?.source ?? "")}"><span>${esc(i.label)}: <b>${fmt(i.value, i.value % 1 ? 1 : 0)}${esc(i.unit)}</b>${src && !src.official ? ' <span class="tag">approx.</span>' : ""}${src?.notes?.[code] ? ` <span class="tag">${esc(src.notes[code])}</span>` : ""}</span><span class="num">${fmt(i.score)} / ${i.points}</span></div>`; }).join("")}</div>
        </details>`).join("")}
      <p class="fine">Tap a category for its indicators. <button class="btn-ghost" style="padding:2px 8px;font-size:12px" data-nav="tab:method">How scoring works</button></p>
    </section>`;
  }

  const initials = (n) => n.replace(/\b(Jr|Sr|II|III)\.?/g, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  // A person's photo (official portrait or Wikipedia lead image), or their initials when there is none.
  function face(p, size = "") {
    const party = p.party ?? "X";
    const ph = M.photo(p);
    if (!ph?.src) return `<span class="avatar ${party} ${size}" aria-hidden="true">${esc(initials(p.name))}</span>`;
    return `<img class="face ${party} ${size}" src="${esc(ph.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-initials="${esc(initials(p.name))}">`;
  }
  // A photo that fails to load (offline, removed) falls back to initials.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("face")) return;
    const span = document.createElement("span");
    span.className = img.className.replace("face", "avatar");
    span.setAttribute("aria-hidden", "true");
    span.textContent = img.dataset.initials;
    img.replaceWith(span);
  }, true);
  const photoCredit = (p) => {
    const ph = M.photo(p);
    if (!ph?.src) return "";
    return ph.src.includes("unitedstates.github.io") ? `<p class="fine">Photo: official congressional portrait (public domain, via <a href="https://github.com/unitedstates/images" target="_blank" rel="noopener">@unitedstates/images</a>).</p>`
      : `<p class="fine">Photo: <a href="${esc(ph.file)}" target="_blank" rel="noopener">Wikimedia Commons</a> (see the file page for author and license).</p>`;
  };
  // Two nominees side by side with their photos.
  function matchup(r) {
    const n = r.nominees;
    if (!n) return "";
    const dParty = r.challenger === "I" ? "I" : "D";
    const one = (name, party) => `<div class="nominee">${face({ name, party }, "md")}<div><b>${esc(name.replace(/\s*\(inc\.\)/, ""))}</b><span class="chip ${party}">${party}</span>${/\(inc\.\)/.test(name) || M.personKey(name) === M.personKey(r.incumbent.name) ? `<small>incumbent</small>` : ""}</div></div>`;
    return `<div class="matchup">${one(n.D, dParty)}<span class="vs">vs.</span>${one(n.R, "R")}</div>`;
  }

  // One line per poll: "Pollster (date): 52% approve / 41% disapprove", linked when a URL exists.
  // Modeled approval: our own estimate from actual votes and official data (no public polls).
  function approvalBlock(a) {
    if (!a) return "";
    return `<div class="approval">
      <div class="qual"><span>Approval (modeled)</span><div class="meter"><i style="width:${a.value}%"></i></div><b class="num">${fmt(a.value)}%</b></div>
      <details><summary>Our estimate — no public polls</summary>
        <p class="fine">Approve <b>${fmt(a.value)}%</b> · disapprove <b>${fmt(a.disapprove)}%</b> · not sure ${a.unsure}%.</p>
        <ul class="sources">
          <li>Support: ${a.support > 0 ? "+" : ""}${fmt(a.support)} pts, from ${esc(a.basis)}</li>
          ${a.economy ? `<li>State economy vs. the nation: ${a.economy > 0 ? "+" : ""}${fmt(a.economy)} pts</li>` : ""}
          <li>Party's baseline lean: ${a.lead > 0 ? "+" : ""}${fmt(a.lead)} pts · cross-partisan appeal ${a.crossover > 0 ? "+" : ""}${fmt(a.crossover)}</li>
        </ul>
        <p class="fine">Approval = 95% × (50 + support ÷ 2 + economy). The same formula for every officeholder of either party; see Rubric &amp; Methodology.</p>
      </details></div>`;
  }

  function leaderCard(p, office, kind, ctx = {}) {
    if (!p) return "";
    const b = M.bio(p, kind, ctx);
    const party = p.party ?? "X";
    return `<article class="leader">
      <div class="leader-top">
        ${face(p, "lg")}
        <div>
          <div class="leader-name">${esc(p.name)} <span class="chip ${party}">${party === "I" ? "I" : party}</span></div>
          <div class="leader-office">${esc(office)}</div>
          <div class="fine">${esc(b.summary)}</div>
        </div>
      </div>
      <div class="qual"><span>Qualifications</span><div class="meter"><i style="width:${b.qual.score}%"></i></div><b class="num">${b.qual.score}/100</b></div>
      ${kind === "governor" ? approvalBlock(M.modeledApproval(p.state)) : ""}
      ${ctx.approval ? approvalBlock(ctx.approval) : ""}
      <details ${ctx.open ? "open" : ""}><summary>Biography &amp; possible next moves</summary>
        <h4>Qualifications &amp; background</h4>
        <ul>${b.qualifications.length ? b.qualifications.map((q) => `<li>${esc(q)}</li>`).join("") : "<li>No prior offices recorded in dataset.</li>"}</ul>
        <h4>Possible next moves</h4>
        <ul>${b.nextMoves.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
        <p class="fine">Score: experience ${b.qual.parts.experience} + prior offices ${b.qual.parts.offices} + background ${b.qual.parts.background}${b.qual.parts.leadership ? ` + leadership ${b.qual.parts.leadership}` : ""}.</p>
        ${photoCredit(p)}
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
      ${leanBlock(l, `Nationwide popular-vote orientation. Recent presidential results are weighted and adjusted for the national climate measured from special elections (${gbLabel(NATIONAL_OPINION.climate)}).`)}
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
          return leaderCard({ ...(roster ?? {}), ...p, state: "US" }, p.office, "national",
            p.office.startsWith("President") ? { approval: M.modeledApproval("US") } : {});
        }).join("")}
      </section>
      <p class="note">Officeholder data: Congress from the public @unitedstates/congress-legislators roster; governors, mayors and county leaders curated as of ${NATIONAL_OPINION.asOf}. Verify against official sources before relying on it.</p>
      ${globalThis.DATA_VERSION ? `<p class="fine">Data last changed ${esc(new Date(DATA_VERSION.updated).toLocaleString())}. The data refreshes every 30 minutes, and this page picks up changes automatically.</p>` : ""}`;
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

  // ------------------------------------------------------------------ "My state": tracked across every tab
  // Remembered on this device. Set when the user picks a state in the Races tab or the My state panel,
  // taps a state on the map, or filters the Midterms list by state.
  const TRACK_KEY = "pp-my-state";
  let trackedState = (() => { try { const v = localStorage.getItem(TRACK_KEY); return M.states[v] ? v : null; } catch { return null; } })();
  function setTrackedState(st) {
    if (!st || !M.states[st] || st === trackedState) return;
    trackedState = st;
    try { localStorage.setItem(TRACK_KEY, st); } catch { /* storage blocked */ }
    updateMyStateButton();
    if (!$("#delegation").hidden) renderDelegation();
    dispatchEvent(new CustomEvent("pp:state", { detail: st }));
  }
  function updateMyStateButton() {
    const b = $("#my-state-btn");
    b.innerHTML = trackedState ? `<span class="tab-long">My state: </span>${trackedState}` : "My state";
    b.setAttribute("aria-label", trackedState ? `My state, ${M.states[trackedState].name}: senators and representatives` : "Choose my state");
  }
  const raceFor = (id) => forecast.races.find((r) => r.id === id);
  const holdLine = (r, party) => {
    if (!r) return "";
    const p = party === "D" || party === "I" ? r.pD : 1 - r.pD;
    return r.status === "open" ? `Seat open in 2026 · ${party} hold ${Math.round(p * 100)}%` : `Up in 2026 · ${Math.round(p * 100)}% to win`;
  };
  function renderDelegation() {
    const el = $("#delegation");
    const st = trackedState;
    const opts = Object.values(M.states).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.abbr}" ${s.abbr === st ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    if (!st) {
      el.innerHTML = `<div class="drawer-head"><h2>My state</h2><button class="btn-ghost" data-close-drawer>Close</button></div>
        <label class="stat-pick">Choose your state<select id="delegation-state"><option value="">Select…</option>${opts}</select></label>
        <p class="hint">Your governor, senators and representatives will stay one tap away on every tab.</p>`;
    } else {
      const s = M.states[st];
      const sens = M.senators(st);
      const reps = [];
      if (s.seats) for (let d = s.seats === 1 ? 0 : 1; d <= (s.seats === 1 ? 0 : s.seats); d++) reps.push(d);
      const senRace = (m) => raceFor(`SEN-${st}`)?.incumbent.id === m.id ? raceFor(`SEN-${st}`) : raceFor(`SEN-${st}-S`)?.incumbent.id === m.id ? raceFor(`SEN-${st}-S`) : null;
      const person = (m, office, kind, race, extra = "") => m ? `<details class="del-person"><summary>
          ${face(m, "sm")}<span class="del-name">${esc(m.name)} <span class="chip ${m.party}">${m.party}</span></span>
          <span class="del-sub">${esc(office)}${race ? ` · ${esc(holdLine(race, m.caucus ?? m.party))}` : extra}</span></summary>
          ${leaderCard(m, office, kind, { forecast: race, districtMargin: race?.baseline, open: true })}${race ? matchup(race) : ""}</details>` : "";
      const gov = GOVERNORS[st];
      const govRace = raceFor(`GOV-${st}`);
      el.innerHTML = `<div class="drawer-head"><h2>${esc(s.name)}</h2><button class="btn-ghost" data-close-drawer>Close</button></div>
        <label class="stat-pick">Change state<select id="delegation-state">${opts}</select></label>
        <div class="drawer-actions"><button class="btn-ghost" data-nav="races:${st}">Research ${st} races</button><button class="btn-ghost" data-nav="state:${st}">Open on map</button></div>
        ${gov ? `<h3>${st === "DC" ? "Mayor" : "Governor"}</h3>${person(withState(gov, st), govTitle(st), "governor", govRace, govRace ? "" : st === "DC" ? "" : " · Not up in 2026")}` : ""}
        ${st === "DC" ? "" : `<h3>U.S. Senators</h3>${sens.map((m) => person(m, `U.S. Senator · Class ${m.cls}`, "senator", senRace(m), ` · Term ends ${m.end.slice(0, 4)}`)).join("")}`}
        <h3>U.S. Representatives${s.seats ? ` · ${s.seats}` : ""}</h3>
        ${reps.map((d) => {
          const m = M.representative(st, d);
          const id = `${st}-${d === 0 ? "AL" : String(d).padStart(2, "0")}`;
          const label = d === 0 ? "At-large" : `District ${d}`;
          return m ? person(m, `${label}`, "representative", raceFor(id)) : `<div class="del-person vacant"><span class="chip X">—</span> ${label}: vacant</div>`;
        }).join("")}
        ${st === "DC" ? person(M.representative("DC", 0), "Delegate (non-voting)", "representative", null, "") : ""}
        <p class="fine">Tap a name for the biography, qualifications and 2026 outlook.</p>`;
    }
    el.querySelector("#delegation-state")?.addEventListener("change", (e) => setTrackedState(e.target.value));
  }
  function openDelegation() {
    const el = $("#delegation");
    renderDelegation();
    el.hidden = false;
    $("#my-state-btn").setAttribute("aria-expanded", "true");
    el.querySelector("select, summary, button")?.focus();
  }
  function closeDelegation() { $("#delegation").hidden = true; $("#my-state-btn").setAttribute("aria-expanded", "false"); }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-drawer]")) closeDelegation();
    else if (e.target.closest("#my-state-btn")) ($("#delegation").hidden ? openDelegation() : closeDelegation());
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#delegation").hidden) closeDelegation(); });
  updateMyStateButton();

  // ------------------------------------------------------------------ tabs + hash
  function showTab(tab) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $("#view-map").hidden = tab !== "map";
    $("#view-midterms").hidden = tab !== "midterms";
    $("#view-method").hidden = tab !== "method";
    $("#view-stats").hidden = tab !== "stats";
    $("#view-races").hidden = tab !== "races";
    if (tab === "midterms") renderMidterms();
    if (tab === "method" && !$("#method").innerHTML) renderMethod();
    if (tab === "stats") requestAnimationFrame(() => globalThis.renderStats?.($("#stats")));
    if (tab === "races") globalThis.renderRaces?.($("#races"));
    if (tab === "map") requestAnimationFrame(() => go(view, { animate: false, push: false }));
    currentTab = tab;
    setHash();
  }
  let currentTab = "map";
  // Used by the Stats tab to jump to a state on the map.
  globalThis.openState = (st) => { showTab("map"); go({ level: "state", st }); };
  // Shared helpers for the Races tab (js/races.js).
  globalThis.PP = {
    getForecast: () => forecast, leaderCard, esc, fmt, evidenceTable, ratingsLine, marketsLine, voteTable, modeledPoll, shortVote, face, matchup, governorOf: (st) => GOVERNORS[st] && withState(GOVERNORS[st], st), govTitle, gbLabel: (v) => (v === 0 ? "Even" : v > 0 ? `D+${v}` : `R+${-v}`),
    getTrackedState: () => trackedState, setTrackedState, openDelegation,
    isFollowing: (id) => following.has(id),
    toggleFollow: (id) => { following.has(id) ? following.delete(id) : following.add(id); saveFollowing(); updateFollowCount(); },
  };
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  function setHash() {
    const h = currentTab === "races" && trackedState ? `races/${trackedState}` : currentTab !== "map" ? currentTab
      : view.level === "state" ? `state/${view.st}` : view.level === "county" ? `county/${view.fips}`
      : view.level === "city" ? `city/${encodeURIComponent(CITIES[view.city][0] + "|" + view.st)}` : "";
    try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch { /* sandboxed frame */ }
  }
  function fromHash() {
    const [kind, arg] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (kind === "races") { if (M.states[arg]) setTrackedState(arg); go({ level: "nation" }, { animate: false, push: false }); showTab("races"); return; }
    if (kind === "midterms" || kind === "method" || kind === "stats") { go({ level: "nation" }, { animate: false, push: false }); showTab(kind); return; }
    if (kind === "state" && M.states[arg]) return go({ level: "state", st: arg }, { animate: false });
    if (kind === "county" && ELECTIONS.counties[arg]) return go({ level: "county", st: ELECTIONS.counties[arg].st, fips: arg }, { animate: false });
    if (kind === "city") { const c = CITIES.find((x) => `${x[0]}|${x[1]}` === arg); if (c) return go({ level: "city", st: c[1], fips: c[5], city: c.idx }, { animate: false }); }
    go({ level: "nation" }, { animate: false });
  }

  // ------------------------------------------------------------------ midterms tab
  const gbEl = $("#gb");
  const gbLabel = (v) => (v === 0 ? "Even" : v > 0 ? `D+${v}` : `R+${-v}`);
  let officeFilter = "all", openRace = null;
  gbEl.value = NATIONAL_OPINION.climate;
  gbEl.addEventListener("input", () => { forecast = M.forecast({ climate: +gbEl.value }); races = raceById(); renderMidterms(); });
  $("#gb-reset").addEventListener("click", () => { gbEl.value = NATIONAL_OPINION.climate; gbEl.dispatchEvent(new Event("input")); });

  // ---- Followed races: saved on this device (localStorage), shown with the "Following" filter.
  const FOLLOW_KEY = "pp-following";
  const loadFollowing = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? "[]")); } catch { return new Set(); } };
  let following = loadFollowing();
  const saveFollowing = () => { try { localStorage.setItem(FOLLOW_KEY, JSON.stringify([...following])); } catch { /* storage blocked: keeps working for this visit */ } };
  const updateFollowCount = () => { const b = $("#follow-count"); if (b) b.textContent = following.size ? ` (${following.size})` : ""; };
  updateFollowCount();
  $("#state-filter").innerHTML = `<option value="">All states</option>` + Object.values(M.states).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${s.abbr}">${esc(s.name)}</option>`).join("");
  ["#state-filter", "#sort", "#race-search"].forEach((s) => $(s).addEventListener("input", renderRaceTable));
  $("#state-filter").addEventListener("input", (e) => setTrackedState(e.target.value));
  document.querySelectorAll("[data-office]").forEach((b) => b.addEventListener("click", () => {
    officeFilter = b.dataset.office;
    document.querySelectorAll("[data-office]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderRaceTable();
  }));

  function renderMidterms() {
    $("#gb-label").textContent = gbLabel(+gbEl.value) + (+gbEl.value === NATIONAL_OPINION.climate ? " (special-election estimate)" : " (your setting)");
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
        <div class="big">${gbLabel(forecast.climate.value)}</div>
        <div class="sub">${forecast.climate.parts.map((x) => `${esc(x.label)}: <b>${gbLabel(x.value)}</b>`).join("<br>")}<br>No public polls are used.<br>Swing vs. 2024 House vote: <b>${forecast.swing > 0 ? "+" : ""}${forecast.swing} pts toward ${forecast.swing >= 0 ? "Democrats" : "Republicans"}</b>.</div></div>`;
    renderRaceTable();
  }

  const officeOrder = { senate: 0, governor: 1, house: 2, mayor: 3 };
  function renderRaceTable() {
    const st = $("#state-filter").value, q = $("#race-search").value.trim().toLowerCase(), sort = $("#sort").value;
    let list = forecast.races.filter((r) => (officeFilter === "all" || (officeFilter === "following" ? following.has(r.id) : r.office === officeFilter)) && (!st || r.state === st)
      && (!q || (r.title + " " + r.incumbent.name).toLowerCase().includes(q)));
    const cmp = {
      close: (a, b) => Math.abs(a.pD - 0.5) - Math.abs(b.pD - 0.5) || officeOrder[a.office] - officeOrder[b.office],
      d: (a, b) => b.pD - a.pD, r: (a, b) => a.pD - b.pD,
      name: (a, b) => officeOrder[a.office] - officeOrder[b.office] || a.title.localeCompare(b.title, undefined, { numeric: true }),
    }[sort];
    list.sort(cmp);
    const shown = list.slice(0, 600);
    if (officeFilter === "following" && !shown.length) {
      $("#race-rows").innerHTML = `<tr><td colspan="5" class="empty">You aren't following any races yet. Tap the ☆ next to any race to add it here. Your list is saved on this device.</td></tr>`;
      $("#race-count").textContent = "";
      return;
    }
    $("#race-rows").innerHTML = shown.map((r) => {
      const pD = Math.round(r.pD * 100);
      const dLabel = r.challenger === "I" ? "Ind" : "D";
      const cls = r.rating.tier === 0 ? "T" : r.rating.side + r.rating.tier;
      const seatText = r.status === "open" ? "Open seat" : r.status === "uncertain" ? "Incumbent (uncertain)" : "Incumbent running";
      const row = `<tr class="race" data-race="${r.id}" aria-expanded="${openRace === r.id}">
        <td><div class="race-cell"><button class="star" data-follow="${r.id}" aria-pressed="${following.has(r.id)}" aria-label="${following.has(r.id) ? "Stop following" : "Follow"} ${esc(r.title)}">${following.has(r.id) ? "★" : "☆"}</button>
          ${r.nominees ? `<span class="mini-faces">${face({ name: r.nominees.D, party: r.challenger === "I" ? "I" : "D" }, "xs")}${face({ name: r.nominees.R, party: "R" }, "xs")}</span>` : ""}
          <div class="race-title">${esc(r.title)}<small>${r.office === "house" ? r.id : r.office[0].toUpperCase() + r.office.slice(1)}${r.redistricted ? " · new 2026 map" : ""}${r.nominees ? ` · ${esc(r.nominees.D.replace(/\s*\(inc\.\)/, ""))} vs. ${esc(r.nominees.R.replace(/\s*\(inc\.\)/, ""))}` : ""}</small></div></div></td>
        <td>${esc(r.incumbent.name)} <span class="chip ${r.incumbent.party}">${r.incumbent.party}</span></td>
        <td>${seatText}</td>
        <td><span class="pill ${cls}">${r.rating.label.replace(" D", r.challenger === "I" ? " Ind" : " D")}</span></td>
        <td><div class="prob"><span class="l">${pD}%</span><span class="bar" role="img" aria-label="${dLabel} ${pD}%, R ${100 - pD}%"><i style="width:${pD}%;background:var(--${r.challenger === "I" ? "ind" : "dem"})"></i><i style="width:${100 - pD}%;background:var(--rep)"></i></span><span class="r">${100 - pD}%</span></div><div class="vote-line">Vote: ${shortVote(r)}</div></td>
      </tr>`;
      return row + (openRace === r.id ? raceDetail(r) : "");
    }).join("");
    $("#race-count").textContent = `Showing ${shown.length} of ${list.length} races. Click a race to see how its probability was calculated. Left number = ${officeFilter === "senate" || officeFilter === "all" ? "Democratic (or Democratic-backed independent)" : "Democratic"} win chance, right = Republican.`;
  }
  // ------------------------------------------------------------------ evidence (shared by the Midterms and Races tabs)
  const marginText = (v) => `${v > 0 ? "D+" : v < 0 ? "R+" : "±"}${fmt(Math.abs(v))}`;
  // The three equal source groups, each with its own signals underneath.
  function evidenceTable(r) {
    const dLab = r.challenger === "I" ? "Ind." : "D";
    const rows = r.thirds.map((t) => {
      const head = `<tr class="group ${t.side}"><th scope="rowgroup">${esc(t.label)}</th><td class="num">${marginText(t.margin)}</td><td class="num">±${fmt(t.sigma)}</td><td class="num">${Math.round(t.weight * 100)}%</td></tr>`;
      const items = r.signals.filter((sg) => sg.side === t.side).map((sg) => `<tr class="sub"><td>${esc(sg.label)}</td><td class="num">${marginText(sg.margin)}</td><td class="num">±${fmt(sg.sigma)}</td><td class="num">${sg.share}%</td></tr>`).join("");
      return head + items;
    }).join("");
    const missing = ["D", "R"].filter((s) => !r.thirds.some((t) => t.side === s));
    const note = r.balanced ? "" : missing.length === 2
      ? `<p class="fine">No partisan-leaning outlet rates this race, so it rests on the independent sources alone.</p>`
      : `<p class="fine">No ${missing[0] === "D" ? "Democratic" : "Republican"}-leaning outlet rates this race, so the ${missing[0] === "D" ? "Republican" : "Democratic"}-leaning group is set aside (0%) rather than tilting the forecast; the independent sources decide it.</p>`;
    return `<div class="table-wrap"><table class="signals">
        <thead><tr><th>Source group / signal</th><th class="num">Estimated margin</th><th class="num">Uncertainty</th><th class="num">Weight</th></tr></thead>
        <tbody>${rows}
          <tr class="total"><td>Combined forecast</td><td class="num">${marginText(r.margin)}</td><td class="num">±${r.sigma}</td><td class="num">${fmt(r.pD * 100)}% ${dLab}</td></tr></tbody>
      </table></div>${note}`;
  }
  // Each expert rating, tagged with its source group.
  function ratingsLine(r) {
    const SRC = globalThis.RACE_SIGNALS?.sources ?? {};
    if (!r.ratings) return `<p class="fine">No expert ratings published; forecasters treat this seat as safe.</p>`;
    const tag = { D: "D-leaning", R: "R-leaning", I: "independent" };
    return `<p class="fine">Expert ratings (<a href="${esc(SRC.ratings?.url ?? "#")}" target="_blank" rel="noopener">compiled on Wikipedia</a>): ${r.ratings.ratings.map((x) => {
      const l = M.sourceLean(x.by);
      return `${esc(l.name)} <b>${esc(x.rating)}</b> <span class="lean-tag ${l.side}">${tag[l.side]}</span>`;
    }).join(" · ")}</p>`;
  }
  function marketsLine(r) {
    const one = (m, name) => `<a href="${esc(m.url)}" target="_blank" rel="noopener">${name}</a> ${esc(m.D ?? (r.challenger === "I" ? "Independent" : "Democrat"))} ${Math.round(m.pD * 100)}% · ${esc(m.R ?? "Republican")} ${Math.round((1 - m.pD) * 100)}%`;
    const parts = [r.market && one(r.market, "Kalshi"), r.polymarket && one(r.polymarket, "Polymarket")].filter(Boolean);
    const p = r.primary;
    const prim = p ? `<p class="fine">2026 primary ballots (<a href="${esc(p.url)}" target="_blank" rel="noopener">results</a>): ${p.D.toLocaleString("en-US")} for Democrats, ${p.R.toLocaleString("en-US")} for Republicans, ${fmt(p.share)}% of the 2024 electorate (${esc(p.type)}). Raw gap ${marginText(p.rawMargin)}, against an average race's ${marginText(p.avgGap)}.</p>` : "";
    return (parts.length ? `<p class="fine">Prediction markets: ${parts.join("; ")}.</p>` : "") + prim;
  }

  // Predicted popular vote: shares, 80% range and estimated votes for each side.
  function shortVote(r) { return `${r.challenger === "I" ? "I" : "D"} ${fmt(r.vote.D)}% · R ${fmt(r.vote.R)}% · other ${fmt(r.vote.O)}%`; }
  // Our own modeled poll: what an unbiased poll of likely voters would show today — the predicted
  // vote with an undecided share that grows with the race's uncertainty (3–9%).
  function modeledPoll(r) {
    const v = r.vote, u = Math.round(Math.min(9, Math.max(3, 1.2 * r.sigma)));
    const k = (100 - u) / 100;
    const dParty = r.challenger === "I" ? "I" : "D";
    const d = Math.round(v.D * k), rr = Math.round(v.R * k), o = Math.round(v.O * k);
    return `<p class="fine"><b>Our modeled poll</b> (likely voters, today; no public polls): ${dParty} ${d}% · R ${rr}% · other ${o}% · undecided ${100 - d - rr - o}%.</p>`;
  }
  function voteTable(r) {
    const v = r.vote;
    const n = r.nominees;
    const dParty = r.challenger === "I" ? "I" : "D";
    const name = (side) => (n?.[side] ? esc(n[side].replace(/\s*\(inc\.\)/, "")) : side === "R" ? "Republican candidate" : dParty === "I" ? "Independent candidate" : "Democratic candidate");
    const two = 100 - v.O;
    const votes = (x) => (x == null ? "—" : `≈ ${Math.round(x).toLocaleString("en-US")}`);
    return `<div class="table-wrap"><table class="signals vote-table">
        <thead><tr><th>Candidate</th><th class="num">Predicted vote</th><th class="num">80% range</th>${v.total ? `<th class="num">Est. votes</th>` : ""}</tr></thead>
        <tbody>
          <tr><td>${name("D")} <span class="chip ${dParty}">${dParty}</span></td><td class="num"><b>${fmt(v.D)}%</b></td><td class="num">${fmt(v.lo)}–${fmt(v.hi)}%</td>${v.total ? `<td class="num">${votes(v.votesD)}</td>` : ""}</tr>
          <tr><td>${name("R")} <span class="chip R">R</span></td><td class="num"><b>${fmt(v.R)}%</b></td><td class="num">${fmt(two - v.hi)}–${fmt(two - v.lo)}%</td>${v.total ? `<td class="num">${votes(v.votesR)}</td>` : ""}</tr>
          <tr><td>Other candidates</td><td class="num">${fmt(v.O)}%</td><td class="num"></td>${v.total ? `<td class="num">${votes(v.votesO)}</td>` : ""}</tr>
        </tbody></table></div>
      ${modeledPoll(r)}
      <p class="fine">Predicted margin ${marginText(v.margin)}.${v.total ? ` Expected turnout ≈ ${v.total.toLocaleString("en-US")} votes (0.75 × the 2024 vote, the usual midterm drop-off).` : ""} The 80% range covers the outcome in 4 of 5 simulated elections.</p>`;
  }

  function raceDetail(r) {
    const f = (v) => `${v > 0 ? "D+" : v < 0 ? "R+" : "±"}${fmt(Math.abs(v))}`;
    const money = (x) => (x ? `${esc(x.name)} $${(x.receipts / 1e6).toFixed(x.receipts >= 1e6 ? 1 : 2)}M raised` : "—");
    const SRC = globalThis.RACE_SIGNALS?.sources ?? {};
    return `<tr class="detail"><td colspan="5">
      <p class="fine">Incumbent: <b>${esc(r.incumbent.name)}</b> (${esc(r.incumbent.party)}) · ${r.status === "open" ? "open seat" : r.status === "uncertain" ? "incumbent's plans uncertain" : "incumbent running"}</p>
      ${matchup(r)}
      ${r.note ? `<p>${esc(r.note)}</p>` : ""}
      <h4 class="detail-h">Predicted popular vote</h4>
      ${voteTable(r)}
      <h4 class="detail-h">How the evidence combines (one third each: Democratic-leaning, independent, Republican-leaning)</h4>
      ${evidenceTable(r)}
      <h4 class="detail-h">Fundamentals breakdown</h4>
      <div class="factors">
        <div>Partisan baseline${r.pvi != null ? ` (Cook PVI ${r.pvi > 0 ? "D" : r.pvi < 0 ? "R" : "EVEN"}${r.pvi ? "+" + Math.abs(r.pvi) : ""})` : ""}<b>${f(r.baseline)}</b></div>
        <div>National climate<b>${f(r.climate)}</b></div>
        <div>Incumbency<b>${f(r.incumbency)}</b></div>
        <div>Approval (public opinion)<b>${f(r.approvalEffect)}</b></div>
        <div>Qualifications<b>${f(r.qualityEffect)}</b></div>
        <div>Campaign money (FEC)<b>${f(r.moneyEffect)}</b></div>
        <div>State economy<b>${f(r.economyEffect)}</b></div>
        ${r.personal ? `<div>Candidate personal vote<b>${f(r.personal)}</b></div>` : ""}
        <div>Fundamentals total<b>${f(r.fundamentals)}</b></div>
      </div>
      ${r.money && (r.money.d || r.money.r) ? `<p class="fine">Fundraising (<a href="${esc(SRC.money?.url ?? "#")}" target="_blank" rel="noopener">FEC</a>): ${money(r.money.d)} · ${money(r.money.r)}.</p>` : ""}
      ${r.ratings ? ratingsLine(r) : ""}
      ${marketsLine(r)}
      <p class="fine">Win probability = Φ(combined margin ÷ σ) = Φ(${fmt(r.margin)} ÷ ${r.sigma}) = ${fmt(r.pD * 100)}% ${r.challenger === "I" ? "independent" : "Democratic"}.
      ${r.office !== "mayor" ? `<button class="btn-ghost" style="padding:2px 8px;font-size:12px" data-open-state="${r.state}">View ${esc(M.states[r.state].name)} on the map</button>` : ""}</p>
    </td></tr>`;
  }
  $("#race-rows").addEventListener("click", (e) => {
    const star = e.target.closest("[data-follow]");
    if (star) {
      const id = star.dataset.follow;
      following.has(id) ? following.delete(id) : following.add(id);
      saveFollowing(); updateFollowCount(); renderRaceTable();
      return;
    }
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
        <thead><tr><th>Category / indicator</th><th class="num">Points</th><th class="num">Worst (0 pts)</th><th class="num">Best (full)</th><th>Why this weight / data source</th></tr></thead>
        <tbody>${M.RUBRIC.map((c) => `<tr class="cat-head"><td>${esc(c.name)}</td><td class="num">${c.points}</td><td></td><td></td><td>${esc(c.why)}</td></tr>`
          + c.items.map((i) => { const src = M.indicatorSources[i.key]; return `<tr><td>&nbsp;&nbsp;${esc(i.label)}</td><td class="num">${i.points}</td><td class="num">${i.worst}${esc(i.unit)}</td><td class="num">${i.best}${esc(i.unit)}</td><td class="fine">${src?.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.source)}</a>` : esc(src?.source ?? "")}${src?.official ? "" : ' <span class="tag">approx.</span>'}</td></tr>`; }).join("")).join("")}
          <tr class="cat-head"><td>Total</td><td class="num">${M.RUBRIC_TOTAL}</td><td></td><td></td><td>Grades: A ≥ 750 · B ≥ 650 · C ≥ 550 · D ≥ 450 · F below</td></tr>
        </tbody></table></div>
      <p class="fine">Cross-partisan appeal = executive approval − (50 + half the executive's party lead in that state). It rewards leaders who win approval beyond their own party's base, so public opinion isn't just a partisanship proxy. Indicator sources are listed in the table above.</p>

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
      <p class="callout"><b>No public polls are used.</b> Head-to-head race polls, the generic congressional ballot and approval polls are all left out. The forecast leans instead on measures where at least 7% of voters took part. Those are the actual 2026 primary ballots in each race, the 2025–26 special elections and each governor's own last election. They are combined with vote history, money, the economy, expert ratings and prediction markets. Ratings and markets are judgments made by others, and some of those forecasters do look at polls.</p>
      <p>Each kind of evidence becomes an estimated Democratic margin with an uncertainty. The evidence is sorted into <b>three equal groups</b>: <b>Democratic-leaning sources</b>, <b>independent sources</b> and <b>Republican-leaning sources</b>. Each group counts for exactly one third of the forecast.</p>
<pre class="formula">Fundamentals (σ 6–7; governors 10)                               → independent group
  = partisan baseline (vote history; Cook PVI on 2026 House lines)
  + national climate × elasticity
  + incumbency (Senate ±2.5, Governor ±3; open House seats −3 for the departing party)
  + qualifications ((score − 50) × 0.04, max ±2)
  + campaign money (2 × ln(D receipts ÷ R receipts), FEC, max ±4)
  + state economy (unemployment and GDP growth vs. the nation, max ±2)
  + documented personal vote from past elections (e.g. Collins 2020, Osborn 2024)
Expert ratings (σ 6; 10 if every rater in the group says Safe)  → by outlet (table below)
  each group's raters averaged: Safe/Solid ±15 · Likely ±8 · Lean ±4 · Tilt ±1.5 · Toss-up 0
Prediction markets (σ 5 each): Kalshi and Polymarket, Φ⁻¹(price) × 6 → independent group
2026 primary ballots (actual votes; only where ≥ 7% of the 2024 electorate voted) → independent group
  margin = baseline + climate + 0.5 × (race's D-minus-R primary-ballot gap − the average race's gap)
  σ 5 top-two primaries · 8 both parties contested · 11 otherwise (an uncontested primary draws fewer)
Governors running again: + personal vote = ½ × (their last election margin − their party's
  presidential margin in the state that cycle), from actual votes

Inside a group:  weight = 1 ÷ σ²  (× 0.6 for ratings and markets when a group has several
                 signals, because they partly react to each other)
If fundamentals sit more than 8 pts from the ratings/markets average, their σ is multiplied by (gap ÷ 8).
Forecast margin = ⅓ Democratic-leaning + ⅓ independent + ⅓ Republican-leaning
Forecast σ      = σ of that average, with the groups' errors 50% correlated (minimum 3.5)
P(win) = Φ(forecast margin ÷ forecast σ)</pre>
      <p><b>Predicted popular vote.</b> Each race also gets a vote-share forecast.</p>
<pre class="formula">Vote margin   = the same equal-thirds blend, except a signal at the top of its scale
                (a Safe rating ±15, a 95%+ market) is raised to the fundamentals' margin
                when they agree on the winner — so landslides aren't pulled toward 50–50
Other share   = 2024 third-party vote in the district's House race (when both parties ran;
                not in NY and CT, where fusion lines count major-party votes as "other"),
                otherwise in the state's presidential vote; between 1% and 10%
D share       = (100 − other) ÷ 2 + vote margin ÷ 2         R share = 100 − other − D share
80% range     = vote margin ± 1.28 σ
Turnout       = 0.75 × the area's 2024 vote   (2018 House vote ÷ 2016 presidential = 0.83;
                2022 ÷ 2020 = 0.68)          Est. votes = turnout × share</pre>
      <p><b>Keeping it balanced.</b> If only one partisan side rates a race, using that side alone would tilt the result. In that case both partisan groups are set aside and the independent group decides the race. House seats that no forecaster rates as competitive are independent-only.</p>
      <p><b>How each outlet is classified.</b> An outlet is <i>Democratic-leaning</i> or <i>Republican-leaning</i> when <a href="https://www.allsides.com/media-bias/ratings" target="_blank" rel="noopener">AllSides</a> or <a href="https://mediabiasfactcheck.com/" target="_blank" rel="noopener">Media Bias/Fact Check</a> rates it left or right of center, and neither rates it the other way. Everything else is <i>independent</i>: nonpartisan handicappers, data services, prediction markets and official statistics. Head-to-head polls are not used in either group.</p>
      <div class="table-wrap"><table class="method-table">
        <thead><tr><th>Source</th><th>Group</th><th>Basis</th></tr></thead>
        <tbody>${["D", "I", "R"].map((side) => Object.values(M.SOURCE_LEAN).filter((x) => x.side === side).map((x) => `<tr><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></td><td><span class="lean-tag ${side}">${esc(M.SIDE_LABEL[side].replace(" sources", ""))}</span></td><td>${esc(x.basis)}</td></tr>`).join("")).join("")}
          <tr><td>Kalshi · Polymarket</td><td><span class="lean-tag I">Independent</span></td><td>Prediction markets: prices set by traders, not an outlet</td></tr>
          <tr><td>Election results · Census · BLS · BEA · FEC</td><td><span class="lean-tag I">Independent</span></td><td>Official statistics (the fundamentals)</td></tr></tbody></table></div>
      <p><b>National climate</b> uses actual votes, not polls. Across the 2025–26 special elections, Democrats ran ${POLLING.specialElections?.value ?? "—"} points ahead of each district's 2024 presidential result. That swing is discounted to 60%, because special-election turnout exaggerates swings (the 2017–18 specials versus the 2018 result), and starts from the 2024 national margin of R+1.5. Result: <b>${gbLabel(M.climateParts().value)}</b>. Move the slider on the forecast tab to try your own value.</p>
      <p><b>Who is running:</b> Ballotpedia's list of members not seeking re-election marks open seats. Nominees come from prediction markets (Kalshi, Polymarket) and each party's leading fundraiser in FEC filings.</p>
      <p><b>Following races:</b> tap ☆ on any race to follow it. The <b>Following</b> filter then shows only your races. The list is saved on your device.</p>
      <p>Chamber control comes from 20,000 simulated elections. Each simulation draws one shared national error (σ 2.5 pts) plus independent race-level errors. Democrats need 218 House seats, and 51 Senate seats because the Republican Vice President breaks ties.</p>

      <h2>5. Sources &amp; neutrality</h2>
      <p class="callout"><b>No public opinion polls are used anywhere on this site.</b> Even the largest opinion polls reach well under 0.1% of voters. Instead, the site relies on measures where <b>at least 7% of voters</b> took part (actual ballots), and it predicts the poll numbers itself.</p>
      <ol>
        <li><b>2026 primary ballots</b> (section 4): real votes in every race's primaries, used only where they reach 7% of the 2024 electorate. Today the range is ${(() => { const xs = forecast.races.filter((r) => r.primary).map((r) => r.primary.share); return xs.length ? `${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))}%` : "—"; })()} of voters across ${forecast.races.filter((r) => r.primary).length} races.</li>
        <li><b>2025–26 special elections</b>: the national climate (${gbLabel(NATIONAL_OPINION.climate)}). It stands in for the "generic ballot" poll.</li>
        <li><b>Each governor's own last general election</b>: their personal vote and modeled approval.</li>
        <li><b>Our own modeled polls.</b> Approval ratings are predicted with one formula for both parties, shown below. Each race shows a modeled likely-voter poll, which is the predicted vote with the undecided share that the race's uncertainty implies.</li>
        <li><b>Equal thirds.</b> Democratic-leaning, independent and Republican-leaning sources each count one third of every race forecast (section 4), so neither side's outlets can outvote the other.</li>
      </ol>
<pre class="formula">Modeled approval = 95% × (50 + support ÷ 2 + economy)            (5% "not sure")
  support  = governor on the 2026 ballot: their 2026 forecast margin
             otherwise: their own last general-election margin (actual votes)
             President: the national climate from special elections (${gbLabel(NATIONAL_OPINION.climate)})
  economy  = governors: −1.5 × (state − U.S. unemployment) + 0.5 × (state − U.S. GDP growth), max ±4
Cross-partisan appeal = support ÷ 2 + economy − the party's baseline lean ÷ 2</pre>
      <div class="table-wrap"><table class="method-table">
        <thead><tr><th>State</th><th>Governor</th><th class="num">Modeled approval</th><th>Based on</th></tr></thead>
        <tbody><tr><td>US</td><td>President</td><td class="num">${fmt(M.modeledApproval("US").value)}%</td><td>${esc(M.modeledApproval("US").basis)}</td></tr>
        ${Object.entries(GOVERNORS).sort((a, b) => a[0].localeCompare(b[0])).map(([st, g]) => {
          const a = M.modeledApproval(st);
          const ge = RACE_SIGNALS.governorElections?.[st];
          return a ? `<tr><td>${st}</td><td>${esc(g.name)}</td><td class="num">${fmt(a.value)}%</td><td>${esc(a.basis)}${ge && a.basis.includes("own") ? ` (<a href="${esc(ge.url)}" target="_blank" rel="noopener">results</a>)` : ""}${a.economy ? `; economy ${a.economy > 0 ? "+" : ""}${fmt(a.economy)}` : ""}</td></tr>` : "";
        }).join("")}</tbody></table></div>
      <p class="callout"><b>Rubric indicators:</b> 17 of the 19 indicators are downloaded directly from the official agencies by <code>scripts/fetch-indicators.mjs</code> (last run ${esc(OFFICIAL_INDICATORS?.fetched ?? "n/a")}): Census ACS, BLS, BEA, NCES/NAEP, CDC/NCHS, FBI Crime Data Explorer, FHWA, EIA and the U.S. Elections Project. Credit ratings and pension funding have no free official feed and remain curated approximations, marked <span class="tag">approx.</span>. The source and data year for each indicator are listed in the rubric table above.</p>

      <h2>Data sources &amp; limitations</h2>
      <ul>
        <li>County presidential results: <code>tonmcg/US_County_Level_Election_Results_08-24</code>. House results: FiveThirtyEight <code>election-results</code>.</li>
        <li>Members of Congress, with service history and leadership: <code>@unitedstates/congress-legislators</code> (public domain).</li>
        <li>Map: U.S. Census cartographic boundaries via <code>us-atlas</code>. Cities: the 1,000 largest U.S. cities (Census estimates).</li>
        <li>Governors, mayors (~85 largest cities), county executives and retirement statuses are curated in <code>data/leaders.js</code> as of ${NATIONAL_OPINION.asOf}. Counties and cities without a curated leader show their form of government instead.</li>
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
