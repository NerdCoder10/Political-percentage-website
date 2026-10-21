// "Stats" tab: every statistic behind the 1,000-point Government Performance Rubric,
// as a ranked chart for one indicator at a time plus a full table, each cited to its source.
(function () {
  const M = Model;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Sources for the indicators that are not downloaded automatically.
  const CURATED = {
    credit: { source: "S&P Global Ratings, state general-obligation credit ratings (curated; S&P publishes no free data feed)", url: "https://www.spglobal.com/ratings/en/", vintage: "2025–26" },
    pension: { source: "Pew Charitable Trusts and Equable Institute, state public-pension funded ratios (curated)", url: "https://www.pewtrusts.org/", vintage: "FY2023–24" },
    approval: { source: "Modeled approval (our own estimate, no public polls): each governor's 2026 forecast margin or own last election, plus the state economy; the neutral national lean (an even vote) for the President. Formula under Rubric & Methodology", url: null, vintage: "2026" },
    crossover: { source: "Computed: approval minus the approval expected from the state's partisan lean (50 + half the governor's party lead)", url: null, vintage: "2025–26" },
  };
  const sourceFor = (key) => {
    const s = M.indicatorSources[key] ?? {};
    return { ...s, ...(CURATED[key] && !s.official ? CURATED[key] : {}), ...(key === "approval" || key === "crossover" ? CURATED[key] : {}) };
  };

  // Other datasets used elsewhere in the app, cited at the bottom of the tab.
  const OTHER_SOURCES = [
    { name: "County presidential results 2016–2024", by: "Tony McGovern, compiled from state election offices", url: "https://github.com/tonmcg/US_County_Level_Election_Results_08-24" },
    { name: "2024 U.S. House results by district", by: "FiveThirtyEight election-results", url: "https://github.com/fivethirtyeight/election-results" },
    { name: "Current members of Congress", by: "@unitedstates/congress-legislators (public domain)", url: "https://github.com/unitedstates/congress-legislators" },
    { name: "Map boundaries", by: "U.S. Census Bureau cartographic boundaries via us-atlas", url: "https://github.com/topojson/us-atlas" },
    { name: "Expert race ratings", by: "Cook, Inside Elections, Sabato, DDHQ, The Economist, Fox News, RealClearPolitics, Silver Bulletin and others, as compiled by Wikipedia", url: "https://en.wikipedia.org/wiki/2026_United_States_Senate_elections" },
    { name: "Prediction markets", by: "Kalshi", url: "https://kalshi.com/category/elections" },
    { name: "Campaign fundraising", by: "Federal Election Commission, current campaigns summary", url: "https://www.fec.gov/data/browse-data/?tab=bulk-data" },
    { name: "Members not seeking re-election", by: "Ballotpedia", url: "https://ballotpedia.org/List_of_U.S._Congress_incumbents_who_are_not_running_for_re-election_in_2026" },
  ];

  const ITEMS = M.RUBRIC.flatMap((c) => c.items.map((it) => ({ ...it, category: c.name })));
  const CODES = Object.keys(M.states).filter((s) => s !== "DC");
  const ALL = [...CODES, "DC", "US"];
  const nameOf = (code) => (code === "US" ? "United States" : M.states[code].name);
  const values = {};
  for (const code of ALL) values[code] = M.indicators(code);
  const scores = Object.fromEntries(ALL.map((c) => [c, M.rubricScore(c)]));

  // Source numbers: one per indicator, in rubric order, then the other datasets.
  const sourceList = [];
  const sourceIndex = {};
  for (const it of ITEMS) {
    const s = sourceFor(it.key);
    const label = s.source ?? "—";
    if (!(label in sourceIndex)) { sourceIndex[label] = sourceList.length + 1; sourceList.push({ ...s, label }); }
    it.sourceNo = sourceIndex[label];
  }

  const fmtVal = (it, v) => (v == null || Number.isNaN(v) ? "—" : `${Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v).toFixed(v % 1 ? 1 : 0)}${it.unit.trim() === "" ? "" : it.unit}`);
  const better = (it) => (it.best > it.worst ? "higher" : "lower");
  const pointsFor = (it, v) => Math.round(it.points * Math.max(0, Math.min(1, (v - it.worst) / (it.best - it.worst))) * 10) / 10;

  let state = { key: "unemp", sort: "rank" };
  try { const saved = JSON.parse(localStorage.getItem("pp-stats") ?? "null"); if (saved && ITEMS.some((i) => i.key === saved.key)) state = saved; } catch { /* storage blocked */ }
  const save = () => { try { localStorage.setItem("pp-stats", JSON.stringify(state)); } catch { /* ignore */ } };

  function render(root) {
    root.innerHTML = `
      <h1>Statistics behind the rubric</h1>
      <p class="lede">These are the numbers used to score every state and the federal government out of 1,000 points. Pick a measure to see how every state compares, where the scoring goalposts sit, and where the data comes from. The full table and the numbered source list are below the chart.</p>
      <div class="controls-row">
        <label class="stat-pick">Measure
          <select id="stat-key">${M.RUBRIC.map((c) => `<optgroup label="${esc(c.name)} (${c.points} pts)">${c.items.map((it) => `<option value="${it.key}" ${it.key === state.key ? "selected" : ""}>${esc(it.label)}</option>`).join("")}</optgroup>`).join("")}</select>
        </label>
        <div class="seg" role="group" aria-label="Sort states">
          <button data-sort="rank" aria-pressed="${state.sort === "rank"}">Best to worst</button>
          <button data-sort="name" aria-pressed="${state.sort === "name"}">A–Z</button>
        </div>
      </div>
      <div id="stat-card" class="card stat-card"></div>
      <figure class="stat-figure">
        <div id="stat-chart" class="stat-chart"></div>
        <figcaption class="fine" id="stat-caption"></figcaption>
      </figure>
      <h2>Full data table</h2>
      <p class="fine">Every rubric input for every state. The number in brackets after a column name is its entry in the source list below. Rows are ranked by total score; tap a state to open it on the map.</p>
      <div class="table-wrap stat-table-wrap"><table class="method-table stat-table" id="stat-table"></table></div>
      <h2>Sources</h2>
      <ol class="source-list" id="stat-sources"></ol>
      <h3 style="margin-top:18px">Other data used in the app</h3>
      <ul class="source-list">${OTHER_SOURCES.map((s) => `<li><b>${esc(s.name)}</b>: ${esc(s.by)}. <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ""))}</a></li>`).join("")}</ul>`;

    $("#stat-key", root).addEventListener("change", (e) => { state.key = e.target.value; save(); draw(root); });
    root.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
      state.sort = b.dataset.sort; save();
      root.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      draw(root);
    }));
    drawTable(root);
    $("#stat-sources", root).innerHTML = sourceList.map((s) => `<li id="src-${sourceIndex[s.label]}">${esc(s.label)}${s.vintage ? `. Data year: <b>${esc(s.vintage)}</b>` : ""}.${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, "").slice(0, 70))}</a>` : ""}${s.official === false ? ' <span class="tag">approx.</span>' : ""}</li>`).join("");
    draw(root);
  }

  function draw(root) {
    const it = ITEMS.find((i) => i.key === state.key);
    const src = sourceFor(it.key);
    const us = values.US[it.key];
    const rows = CODES.map((c) => ({ code: c, v: values[c][it.key] })).filter((r) => r.v != null && !Number.isNaN(r.v));
    const dir = better(it) === "higher" ? -1 : 1;
    const ranked = [...rows].sort((a, b) => dir * (a.v - b.v));
    ranked.forEach((r, i) => { r.rank = i + 1; });
    const order = state.sort === "name" ? [...ranked].sort((a, b) => nameOf(a.code).localeCompare(nameOf(b.code))) : [...ranked];
    if (us != null) order.unshift({ code: "US", v: us, rank: null });

    $("#stat-card", root).innerHTML = `
      <div class="stat-card-grid">
        <div><div class="label">${esc(it.category)}</div><div class="stat-title">${esc(it.label)}</div>
          <div class="sub">Worth <b>${it.points} of 1,000 points</b>. ${better(it) === "higher" ? "Higher" : "Lower"} is better. Full points at <b>${fmtVal(it, it.best)}</b>, zero at <b>${fmtVal(it, it.worst)}</b>.</div></div>
        <div><div class="label">United States</div><div class="stat-title num">${fmtVal(it, us)}</div>
          <div class="sub">Best: ${ranked[0] ? `${esc(nameOf(ranked[0].code))} ${fmtVal(it, ranked[0].v)}` : "—"}<br>Worst: ${ranked.at(-1) ? `${esc(nameOf(ranked.at(-1).code))} ${fmtVal(it, ranked.at(-1).v)}` : "—"}</div></div>
        <div class="stat-source"><div class="label">Source [${it.sourceNo}]</div>
          <div class="sub">${esc(src.source ?? "—")}${src.vintage ? `. Data year: <b>${esc(src.vintage)}</b>` : ""}.
          ${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">Open the source</a>` : ""}${src.official === false ? ' <span class="tag">approx.</span>' : ""}
          ${src.notes && Object.keys(src.notes).length ? `<br>Notes: ${Object.entries(src.notes).map(([k, v]) => `${esc(nameOf(k))}: ${esc(v)}`).join("; ")}` : ""}</div></div>
      </div>`;

    // ---- Dot plot: one dot per state on a shared scale, U.S. marked, goalposts dashed.
    const el = $("#stat-chart", root);
    el.innerHTML = "";
    const width = Math.max(320, el.clientWidth || 700);
    const narrow = width < 560;
    const m = { top: 30, right: narrow ? 52 : 70, bottom: 26, left: narrow ? 104 : 150 };
    const rowH = 19;
    const height = m.top + m.bottom + order.length * rowH;
    const all = [...order.map((r) => r.v), it.worst, it.best];
    const x = d3.scaleLinear().domain(d3.extent(all)).nice().range([m.left, width - m.right]);
    const y = (i) => m.top + i * rowH + rowH / 2;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("role", "img")
      .attr("aria-label", `${it.label} by state, ${better(it)} is better. U.S.: ${fmtVal(it, us)}.`);

    // recessive grid + axis labels
    const ticks = x.ticks(narrow ? 4 : 6);
    svg.append("g").selectAll("line").data(ticks).join("line").attr("class", "grid")
      .attr("x1", (t) => x(t)).attr("x2", (t) => x(t)).attr("y1", m.top - 6).attr("y2", height - m.bottom);
    svg.append("g").selectAll("text").data(ticks).join("text").attr("class", "axis-label")
      .attr("x", (t) => x(t)).attr("y", height - m.bottom + 16).attr("text-anchor", "middle").text((t) => fmtVal(it, t));

    // goalposts
    for (const [v, label] of [[it.worst, "0 pts"], [it.best, `${it.points} pts`]]) {
      svg.append("line").attr("class", "goalpost").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.top - 6).attr("y2", height - m.bottom);
      svg.append("text").attr("class", "goal-label").attr("x", x(v)).attr("y", m.top - 12).attr("text-anchor", "middle").text(label);
    }

    // rows
    const g = svg.append("g").selectAll("g").data(order).join("g").attr("class", (r) => `row${r.code === "US" ? " us" : ""}`)
      .attr("transform", (r, i) => `translate(0,${y(i)})`);
    g.append("rect").attr("class", "hit").attr("x", 0).attr("y", -rowH / 2).attr("width", width).attr("height", rowH);
    g.append("line").attr("class", "guide").attr("x1", m.left).attr("x2", (r) => x(r.v)).attr("y1", 0).attr("y2", 0);
    g.append("text").attr("class", "row-label").attr("x", m.left - 8).attr("dy", "0.35em").attr("text-anchor", "end")
      .text((r) => (r.code === "US" ? "United States" : `${state.sort === "rank" ? r.rank + ". " : ""}${narrow ? r.code : nameOf(r.code)}`));
    g.append("circle").attr("class", "dot").attr("cx", (r) => x(r.v)).attr("r", 5);
    g.append("text").attr("class", "row-value").attr("x", width - m.right + 8).attr("dy", "0.35em").text((r) => fmtVal(it, r.v));

    // hover / tap tooltip + click to open the state on the map
    const tip = $("#tooltip");
    g.on("mousemove", (e, r) => {
      tip.hidden = false;
      tip.innerHTML = `<strong>${esc(nameOf(r.code))}</strong>${fmtVal(it, r.v)}${r.rank ? ` · #${r.rank} of ${ranked.length}` : ""}<div class="fine">${pointsFor(it, r.v)} of ${it.points} points</div>`;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = e.clientY + 14 + "px";
    }).on("mouseleave", () => { tip.hidden = true; })
      .on("click", (e, r) => { if (r.code !== "US") { tip.hidden = true; globalThis.openState?.(r.code); } });

    $("#stat-caption", root).innerHTML = `Each dot is a state's value; the darker row is the national figure. Dashed lines mark the scoring goalposts. Source: ${esc(src.source ?? "—")}${src.vintage ? ` (${esc(src.vintage)})` : ""}. Chart: Political Percentage.`;
  }

  function drawTable(root) {
    const order = [...CODES, "DC"].sort((a, b) => scores[b].total - scores[a].total);
    const head = `<thead><tr><th class="sticky">State</th><th class="num">Score</th>${ITEMS.map((it) => `<th class="num" title="${esc(sourceFor(it.key).source ?? "")}">${esc(it.label)} <a href="#src-${it.sourceNo}" class="src-ref">[${it.sourceNo}]</a></th>`).join("")}</tr></thead>`;
    const row = (code) => `<tr><td class="sticky">${code === "US" ? "<b>United States</b>" : `<a href="#state/${code}" class="state-link" data-state="${code}">${esc(nameOf(code))}</a>`}</td><td class="num"><b>${scores[code].total}</b></td>${ITEMS.map((it) => `<td class="num">${fmtVal(it, values[code][it.key])}</td>`).join("")}</tr>`;
    $("#stat-table", root).innerHTML = head + `<tbody>${row("US")}${order.map(row).join("")}</tbody>`;
    $("#stat-table", root).addEventListener("click", (e) => {
      const a = e.target.closest(".state-link");
      if (a) { e.preventDefault(); globalThis.openState?.(a.dataset.state); }
    });
  }

  let rendered = false;
  globalThis.renderStats = (root) => {
    if (!rendered) { render(root); rendered = true; } else draw(root);
  };
  // If the app opened straight onto this tab (e.g. #stats) before this file loaded, draw now.
  if (!$("#view-stats")?.hidden) globalThis.renderStats($("#stats"));
  addEventListener("resize", () => { const root = $("#stats"); if (rendered && root && !root.closest("[hidden]")) draw(root); });
})();
