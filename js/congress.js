// "Congress & Court" tab: every senator, representative and Supreme Court justice — political
// orientation and positions on specific issues, both taken from their recorded votes.
// Uses the app's helpers through globalThis.PP (see js/app.js).
(function () {
  const M = Model;
  const $ = (s, el = document) => el.querySelector(s);
  const P = () => globalThis.PP;
  const esc = (s) => P().esc(s);
  const V = () => globalThis.CONGRESS_VOTES ?? { keyVotes: [], ideology: {}, votes: {} };
  const SC = () => globalThis.SCOTUS ?? { justices: [], cases: [] };
  const KEY = "pp-congress";
  let ui = { chamber: "senate", state: "", party: "", q: "", sort: "ideology" };
  try { ui = { ...ui, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch { /* storage unavailable */ } };

  // DW-NOMINATE first dimension: −1 most liberal … +1 most conservative.
  const orientation = (x) => (x == null ? "Not yet scored" : x <= -0.45 ? "Very liberal" : x <= -0.25 ? "Liberal" : x < -0.05 ? "Leans liberal"
    : x <= 0.05 ? "Centrist" : x < 0.25 ? "Leans conservative" : x < 0.5 ? "Conservative" : "Very conservative");
  const voteWord = { Y: "Yea", N: "Nay", "-": "Did not vote" };

  function members(chamber) {
    const type = chamber === "senate" ? "sen" : "rep";
    return CONGRESS.filter((m) => m.type === type);
  }

  // ---------------------------------------------------------------- orientation dot plot
  // One dot per member along the liberal–conservative axis, stacked in narrow bins.
  function dotPlot(list) {
    const W = 760, H = list.length > 120 ? 190 : 120, pad = 28, r = list.length > 120 ? 3.2 : 5;
    const x = (v) => pad + ((v + 1) / 2) * (W - 2 * pad);
    const step = r * 2 + 1, bins = new Map();
    const dots = [...list].filter((m) => m.ideo != null).sort((a, b) => a.ideo - b.ideo).map((m) => {
      const b = Math.round(x(m.ideo) / step);
      const k = bins.get(b) ?? 0;
      bins.set(b, k + 1);
      return { m, cx: b * step, cy: H - 24 - r - k * step };
    });
    const ticks = [-1, -0.5, 0, 0.5, 1];
    return `<figure class="ideo-plot">
      <div class="ideo-legend" aria-hidden="true"><span><i class="dot D"></i>Democrat</span><span><i class="dot R"></i>Republican</span><span><i class="dot I"></i>Independent</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Each member's DW-NOMINATE score from most liberal (left) to most conservative (right); the member list below has every value.">
        <line x1="${pad}" x2="${W - pad}" y1="${H - 22}" y2="${H - 22}" class="axis"/>
        ${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${H - 22}" y2="${H - 18}" class="axis"/><text x="${x(t)}" y="${H - 6}" text-anchor="${t === -1 ? "start" : t === 1 ? "end" : "middle"}" class="tick">${t === -1 ? "−1 liberal" : t === 1 ? "+1 conservative" : t > 0 ? "+" + t : t === 0 ? "0" : "−" + -t}</text>`).join("")}
        ${dots.map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${r}" class="ideo-dot ${d.m.party}" data-id="${d.m.id}" tabindex="-1"><title>${esc(d.m.name)} (${d.m.party}-${d.m.state}): ${d.m.ideo > 0 ? "+" : ""}${d.m.ideo.toFixed(2)} · ${orientation(d.m.ideo)}</title></circle>`).join("")}
      </svg>
      <figcaption class="fine">DW-NOMINATE score from every recorded vote in the 119th Congress (<a href="https://voteview.com/data" target="_blank" rel="noopener">Voteview, UCLA</a>). Tap a dot to jump to that member.</figcaption>
    </figure>`;
  }

  // ---------------------------------------------------------------- Senate / House
  function chamberView(chamber) {
    const cap = chamber === "senate" ? "Senate" : "House";
    const kv = V().keyVotes.filter((k) => k.chamber === cap);
    const all = members(chamber).map((m) => ({ ...m, ideo: V().ideology[m.id]?.dim1 ?? null, party: m.caucus && m.party === "I" ? "I" : m.party }));
    const sorted = [...all].filter((m) => m.ideo != null).sort((a, b) => a.ideo - b.ideo);
    const rank = new Map(sorted.map((m, i) => [m.id, i]));
    const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
    // "Most liberal of 100" / "12th most conservative of 435", whichever end the member is nearer.
    const rankText = (m) => { const i = rank.get(m.id), n = sorted.length; return i < n / 2 ? `${i === 0 ? "Most" : `${ordinal(i + 1)} most`} liberal of ${n}` : `${i === n - 1 ? "Most" : `${ordinal(n - i)} most`} conservative of ${n}`; };
    // Each party's majority position on each key vote, to flag members who broke with it.
    const partyLine = {};
    for (const k of kv) for (const p of ["D", "R"]) {
      let y = 0, n = 0;
      for (const m of all) if ((m.caucus ?? m.party) === p) { const v = V().votes[m.id]?.[k.id]; if (v === "Y") y++; else if (v === "N") n++; }
      (partyLine[k.id] ??= {})[p] = y >= n ? "Y" : "N";
    }
    const q = ui.q.trim().toLowerCase();
    let list = all.filter((m) => (!ui.state || m.state === ui.state) && (!ui.party || m.party === ui.party) && (!q || m.name.toLowerCase().includes(q)));
    list.sort(ui.sort === "name" ? (a, b) => a.last.localeCompare(b.last) : ui.sort === "state" ? (a, b) => a.state.localeCompare(b.state) || (a.district ?? 0) - (b.district ?? 0)
      : (a, b) => (a.ideo ?? 9) - (b.ideo ?? 9));
    const where = (m) => (chamber === "senate" ? `Senator · ${M.states[m.state]?.name ?? m.state}` : `${m.state}-${m.district === 0 || m.district == null ? "AL" : String(m.district).padStart(2, "0")}`);
    const row = (m) => {
      const votes = V().votes[m.id] ?? {};
      const broke = kv.filter((k) => votes[k.id] && votes[k.id] !== "-" && partyLine[k.id]?.[m.caucus ?? m.party] && votes[k.id] !== partyLine[k.id][m.caucus ?? m.party]);
      return `<details class="member" id="mem-${m.id}">
        <summary>
          ${P().face({ id: m.id, name: m.name, party: m.party }, "sm")}
          <span class="mem-main"><b>${esc(m.name)}</b> <span class="chip ${m.party}">${m.party}</span><span class="mem-sub">${esc(where(m))}</span></span>
          <span class="mem-ideo">
            <span class="ideo-track" aria-hidden="true">${m.ideo != null ? `<i class="${m.party}" style="left:${((m.ideo + 1) / 2) * 100}%"></i>` : ""}</span>
            <span class="mem-label">${orientation(m.ideo)}${m.ideo != null ? ` · ${m.ideo > 0 ? "+" : ""}${m.ideo.toFixed(2)}` : ""}</span>
          </span>
        </summary>
        <div class="mem-body">
          ${m.ideo != null ? `<p class="fine">${rankText(m)} in the ${cap}, based on ${V().ideology[m.id].votes ?? "all"} recorded votes.${broke.length ? ` Broke with ${(m.caucus ?? m.party) === "R" ? "Republicans" : "Democrats"} on ${broke.length} of these ${kv.length} key votes.` : ""}</p>` : `<p class="fine">Too few recorded votes yet to place on the scale.</p>`}
          <div class="table-wrap"><table class="signals vote-table">
            <thead><tr><th>Issue</th><th>Key vote · a Yea vote would…</th><th>Vote</th></tr></thead>
            <tbody>${kv.map((k) => {
              const v = votes[k.id];
              const off = v && v !== "-" && partyLine[k.id]?.[m.caucus ?? m.party] && v !== partyLine[k.id][m.caucus ?? m.party];
              return `<tr><td>${esc(k.issue)}</td><td><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.title)}</a>${k.note ? ` <span class="fine">(${esc(k.note)})</span>` : ""}<br><span class="fine">${esc(k.yes)}</span></td>
                <td class="vote ${v === "Y" ? "yea" : v === "N" ? "nay" : ""}"><b>${v ? voteWord[v] : "Not in office"}</b>${off ? `<br><span class="tag">broke with party</span>` : ""}</td></tr>`;
            }).join("")}</tbody></table></div>
        </div></details>`;
    };
    return `${dotPlot(all)}
      <details class="kv-legend"><summary>The ${kv.length} key votes used for issue positions</summary>
        <ul class="sources">${kv.map((k) => `<li><b>${esc(k.issue)}:</b> <a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.title)}</a>, ${esc(k.date)} — Yea would ${esc(k.yes)}. ${esc(k.result)}, ${k.yea}–${k.nay}${k.note ? ` (${esc(k.note)})` : ""}.</li>`).join("")}</ul>
        <p class="fine">Votes are the members' own recorded roll-call votes (<a href="https://voteview.com/data" target="_blank" rel="noopener">Voteview</a>). Each bill is described by what it did, not by either side's framing.</p>
      </details>
      <p class="fine">${list.length} ${chamber === "senate" ? "senators" : "representatives"} shown. Tap a name for their votes.</p>
      <div class="member-list">${list.map(row).join("") || `<p class="hint">No members match.</p>`}</div>`;
  }

  // ---------------------------------------------------------------- Supreme Court
  function courtView() {
    const { justices, cases } = SC();
    // Orientation: the share of each justice's votes that went to the side generally described as
    // the conservative outcome (each case's `dir`). Unanimous cases count like any other.
    const align = justices.map((j, i) => {
      let agree = 0, total = 0;
      for (const c of cases) { const v = c.votes[i]; if (v === "Y" || v === "N") { total++; if ((v === "Y") === (c.dir === "C")) agree++; } }
      return { agree, total, pct: total ? Math.round((100 * agree) / total) : null };
    });
    const label = (p) => (p == null ? "" : p >= 85 ? "Conservative" : p >= 60 ? "Leans conservative" : p > 40 ? "Swing" : p > 15 ? "Leans liberal" : "Liberal");
    const order = justices.map((j, i) => i).sort((a, b) => (align[b].pct ?? 0) - (align[a].pct ?? 0));
    const age = (j) => new Date().getFullYear() - j.born;
    const card = (i) => {
      const j = justices[i], a = align[i];
      return `<details class="member" id="jus-${j.id}">
        <summary>
          ${P().face({ name: j.name, party: j.party }, "sm")}
          <span class="mem-main"><b>${esc(j.name)}</b><span class="mem-sub">${esc(j.role)} since ${j.since} · appointed by ${esc(j.appointedBy)} (<span class="txt-${j.party}">${j.party === "R" ? "Republican" : "Democrat"}</span>)</span></span>
          <span class="mem-ideo"><span class="ideo-track court" aria-hidden="true"><i class="${j.party}" style="left:${a.pct}%"></i></span><span class="mem-label">${label(a.pct)} · ${a.agree} of ${a.total} conservative</span></span>
        </summary>
        <div class="mem-body">
          <p class="fine">Age ${age(j)}. ${j.prior.map(esc).join(" · ")}. Took the side generally described as conservative in ${a.agree} of the ${a.total} cases below, the liberal side in ${a.total - a.agree}. <a href="https://en.wikipedia.org/wiki/${j.wiki}" target="_blank" rel="noopener">Biography</a></p>
          <div class="table-wrap"><table class="signals vote-table"><thead><tr><th>Issue</th><th>Case · a Yes vote would…</th><th>Vote</th></tr></thead>
          <tbody>${cases.map((c) => { const v = c.votes[i]; return `<tr><td>${esc(c.issue)}</td><td><a href="https://en.wikipedia.org/wiki/${c.wiki}" target="_blank" rel="noopener">${esc(c.name)}</a> (${c.year})<br><span class="fine">${esc(c.yes)}</span></td>
            <td class="vote ${v === "Y" ? "yea" : v === "N" ? "nay" : ""}"><b>${{ Y: "Yes", N: "No", P: "In part", "-": "Did not take part" }[v]}</b></td></tr>`; }).join("")}</tbody></table></div>
        </div></details>`;
    };
    return `<p class="lede">The nine justices, ordered from most conservative to most liberal by how they voted in ${cases.length} landmark cases from 2022–2025. Each case's outcome is marked as the position generally described as conservative or liberal. Several cases split the usual blocs (Fischer, Murthy, FCC v. Consumers' Research), so the order reflects actual votes rather than the appointing party.</p>
      <div class="member-list">${order.map(card).join("")}</div>
      <h2 class="races-section-title">How each justice voted</h2>
      <div class="table-wrap"><table class="method-table court-matrix">
        <thead><tr><th>Case · a Yes vote would…</th>${order.map((i) => `<th class="num" title="${esc(justices[i].name)}">${esc(justices[i].name.split(" ").filter((w) => !/^(Jr\.|[A-Z]\.)$/.test(w)).pop())}</th>`).join("")}</tr></thead>
        <tbody>${cases.map((c) => `<tr><td><a href="https://en.wikipedia.org/wiki/${c.wiki}" target="_blank" rel="noopener">${esc(c.name)}</a> (${c.year})<br><span class="fine">${esc(c.issue)}: ${esc(c.yes)} <span class="tag">${c.dir === "C" ? "conservative side" : "liberal side"}</span></span></td>${order.map((i) => { const v = c.votes[i]; return `<td class="num vote ${v === "Y" ? "yea" : v === "N" ? "nay" : ""}">${{ Y: "Yes", N: "No", P: "Part", "-": "—" }[v]}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      ${cases.filter((c) => c.note).length ? `<ul class="sources">${cases.filter((c) => c.note).map((c) => `<li><b>${esc(c.name)}:</b> ${esc(c.note)}</li>`).join("")}</ul>` : ""}
      <p class="fine">Lineups are from each published opinion. "Part" means the justice agreed with the outcome only in part and is not counted either way.</p>`;
  }

  // ---------------------------------------------------------------- page
  function render(root) {
    const chamber = ui.chamber;
    const states = Object.values(M.states).sort((a, b) => a.name.localeCompare(b.name));
    root.innerHTML = `
      <h1>Congress &amp; Court</h1>
      <p class="lede">Every senator, representative and Supreme Court justice: where each sits from liberal to conservative, and how each voted on specific issues. Everything here comes from their own recorded votes.</p>
      <div class="races-head">
        <div class="seg" role="group" aria-label="Body">
          ${[["senate", "Senate"], ["house", "House"], ["court", "Supreme Court"]].map(([k, l]) => `<button data-body="${k}" aria-pressed="${chamber === k}">${l}</button>`).join("")}
        </div>
        ${chamber === "court" ? "" : `
        <label class="stat-pick">State<select id="cg-state"><option value="">All states</option>${states.map((s) => `<option value="${s.abbr}" ${s.abbr === ui.state ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <div class="seg" role="group" aria-label="Party">${[["", "All"], ["D", "D"], ["R", "R"], ["I", "I"]].map(([k, l]) => `<button data-party="${k}" aria-pressed="${ui.party === k}">${l}</button>`).join("")}</div>
        <label class="stat-pick">Sort<select id="cg-sort">${[["ideology", "Liberal → conservative"], ["name", "Name"], ["state", "State"]].map(([k, l]) => `<option value="${k}" ${ui.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <input id="cg-q" type="search" placeholder="Find a name…" value="${esc(ui.q)}" aria-label="Find a member by name">`}
      </div>
      <div id="cg-body">${chamber === "court" ? courtView() : chamberView(chamber)}</div>`;
    root.querySelectorAll("[data-body]").forEach((b) => b.addEventListener("click", () => { ui.chamber = b.dataset.body; save(); render(root); }));
    root.querySelectorAll("[data-party]").forEach((b) => b.addEventListener("click", () => { ui.party = b.dataset.party; save(); render(root); }));
    $("#cg-state", root)?.addEventListener("change", (e) => { ui.state = e.target.value; save(); render(root); });
    $("#cg-sort", root)?.addEventListener("change", (e) => { ui.sort = e.target.value; save(); render(root); });
    $("#cg-q", root)?.addEventListener("input", (e) => {
      ui.q = e.target.value; save();
      $("#cg-body", root).innerHTML = chamberView(ui.chamber);
    });
  }

  // Tapping a dot opens that member's entry.
  document.addEventListener("click", (e) => {
    const dot = e.target.closest?.(".ideo-dot");
    if (!dot) return;
    const d = document.getElementById(`mem-${dot.dataset.id}`);
    if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); }
  });

  globalThis.renderCongress = (root) => render(root);
  if (!$("#view-congress")?.hidden) render($("#congress-view"));
})();
