// All scoring logic lives here so it can be read, tested (scripts/check.mjs) and tuned in one place.
//   1. Partisan-lean algorithm  → Republican / Democratic / Independent / Other % for any area
//   2. Government Performance Rubric (1,000 points)
//   3. Qualification score, biographies and "possible next moves"
//   4. 2026 midterm forecast (win probabilities for every Senate, House and Governor race)
(function () {
  const G = globalThis;
  const M = {};
  const YEAR = 2026;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  // ---------------------------------------------------------------------------------
  // 0. SOURCED PUBLIC-OPINION DATA (data/polling.js)
  // Approval = simple average of the qualifying (non-sponsored) polls listed for each
  // governor; governors with no qualifying poll get the median of all sourced values
  // (a neutral midpoint). National numbers average several aggregators.
  // ---------------------------------------------------------------------------------
  const P = G.POLLING;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  M.pollMargin = (poll) => (poll.margin != null ? poll.margin : poll.D != null && poll.R != null ? poll.D - poll.R : null);
  if (P) {
    G.NATIONAL_OPINION.presidentApproval = P.national.presidentApproval.value;
    G.NATIONAL_OPINION.genericBallot = P.national.genericBallot.value;
    G.NATIONAL_OPINION.asOf = P.asOf;
    const sourced = {};
    for (const [st, a] of Object.entries(P.governorApproval)) if (a.polls.length) sourced[st] = Math.round(mean(a.polls.map((x) => x.approve)) * 10) / 10;
    M.approvalMedian = median(Object.values(sourced));
    for (const [st, g] of Object.entries(G.GOVERNORS)) {
      const a = P.governorApproval[st] ?? { polls: [] };
      g.approval = sourced[st] ?? M.approvalMedian;
      g.approvalInfo = { ...a, value: g.approval, imputed: sourced[st] == null };
    }
    for (const [st, e] of Object.entries(P.events)) {
      if (e.governor === "lost-primary") { G.GOVERNORS[st].status2026 = "lost-primary"; G.GOVERNORS[st].event = e; }
      if (e.governor === "nominated") G.GOVERNORS[st].event = e;
      if (e.governorNote) G.GOVERNORS[st].note = e.governorNote;
    }
    for (const [key, u] of Object.entries(P.indicatorUpdates)) {
      const i = G.INDICATOR_COLUMNS.indexOf(key);
      for (const [st, v] of Object.entries(u.values)) if (G.STATE_INDICATORS[st]) G.STATE_INDICATORS[st][i] = v;
    }
  }

  // National climate (points, D minus R) — built WITHOUT polls, from votes actually cast:
  // the 2025–26 special-election swing against the 2024 presidential margin, discounted to 60%
  // because special-election electorates exaggerate swings (the 2017–18 specials vs. the 2018 result),
  // starting from the 2024 national presidential margin (R+1.5). The forecast slider can override it.
  M.climateParts = (override) => {
    const swing = P?.specialElections?.value ?? 0;
    const fromSpecials = Math.round((0.6 * swing - 1.5) * 10) / 10;
    if (override != null && override !== fromSpecials) {
      return { parts: [{ key: "manual", label: "Set with the slider", value: override, weight: 1 }], value: override, manual: true };
    }
    return { parts: [{ key: "specials", label: `2025–26 special elections: Democrats ran ${swing} pts ahead of the 2024 baseline × 0.6, from R+1.5`, value: fromSpecials, weight: 1 }], value: fromSpecials };
  };
  G.NATIONAL_OPINION.climate = M.climateParts().value;

  // Official statistics (data/generated/indicators.js, built by scripts/fetch-indicators.mjs)
  // replace the curated approximations wherever an agency published a value.
  M.indicatorSources = {};
  const OI = G.OFFICIAL_INDICATORS?.indicators ?? {};
  for (const [key, ind] of Object.entries(OI)) {
    const i = G.INDICATOR_COLUMNS.indexOf(key);
    if (i < 0) continue;
    for (const [st, v] of Object.entries(ind.values)) if (G.STATE_INDICATORS[st]) G.STATE_INDICATORS[st][i] = v;
    M.indicatorSources[key] = { official: true, source: ind.source, url: ind.url, vintage: ind.vintage, notes: ind.notes };
  }
  for (const key of G.INDICATOR_COLUMNS) M.indicatorSources[key] ??= { official: false, source: "Curated approximation (no free official data feed); see data/state-indicators.js" };
  M.indicatorSources.credit = { official: false, source: "S&P Global general-obligation ratings, curated (no free data feed)" };
  M.indicatorSources.pension = { official: false, source: "Pew Charitable Trusts / Equable pension funded ratios, curated (no free data feed)" };
  M.indicatorSources.realIncome = { official: !!OI.income && !!OI.rpp, source: "Median household income (Census ACS) ÷ regional price parity (BEA) × 100" };
  M.indicatorSources.approval = { official: true, source: "Average of independent polls (data/polling.js)" };
  M.indicatorSources.crossover = { official: true, source: "Approval minus partisan expectation (computed)" };

  M.states = Object.fromEntries(G.STATES_META.map(([fips, abbr, name, seats]) => [abbr, { fips, abbr, name, seats }]));
  M.stateByFips = Object.fromEntries(G.STATES_META.map(([fips, abbr]) => [fips, abbr]));
  M.partyName = { R: "Republican", D: "Democratic", I: "Independent", O: "Other" };

  // =====================================================================================
  // 1. PARTISAN-LEAN ALGORITHM
  // -------------------------------------------------------------------------------------
  // Inputs are real popular-vote results (2016, 2020, 2024 presidential by county; 2024 U.S.
  // House by district). For any area:
  //   a) Weighted history:  60% × 2024 + 30% × 2020 + 10% × 2016 vote shares.
  //   b) Momentum:          + 20% of the 2020→2024 shift (trend continuation, damped).
  //   c) Current climate:   half of (generic-ballot margin − 2024 national House margin) is added
  //                         to one party and taken from the other, scaled by "elasticity"
  //                         (lopsided areas move less than competitive ones).
  //   d) Independents:      60% of the recent third-party / non-major vote, plus "soft
  //                         independents" — up to 7% of voters in competitive areas who split
  //                         tickets — are classified Independent (taken proportionally from R/D).
  //   e) Other:             remaining 40% of minor-party / write-in / blank votes (+0.4% floor).
  // Results are normalized to sum to 100%.
  // =====================================================================================
  M.PARAMS = {
    yearWeights: { s24: 0.6, s20: 0.3, s16: 0.1 },
    momentum: 0.2,
    indepFromThird: 0.6,
    softIndependentMax: 0.07,
    otherFloor: 0.004,
    votesPerResident: 0.45,
  };

  const toShares = (v) => (v && v[3] > 0 ? { r: v[0] / v[3], d: v[1] / v[3], o: v[2] / v[3] } : null);
  const E = () => G.ELECTIONS;

  // 2024 national House popular-vote margin (D − R, in points): the baseline the generic ballot is compared to.
  M.houseNationalMargin24 = (() => {
    let r = 0, d = 0, t = 0;
    for (const h of Object.values(G.HOUSE24)) { r += h.R; d += h.D; t += h.total; }
    return ((d - r) / t) * 100;
  })();
  M.environmentShift = (climate = G.NATIONAL_OPINION.climate ?? G.NATIONAL_OPINION.genericBallot) => (climate - M.houseNationalMargin24) / 100;

  M.stateShares = (st) => {
    const s = E().states[st];
    return { s24: toShares(s?.v24), s20: toShares(s?.v20), s16: toShares(s?.v16) };
  };
  M.nationShares = () => ({ s24: toShares(E().nation.v24), s20: toShares(E().nation.v20), s16: toShares(E().nation.v16) });

  // County results; units missing a year (Alaska boroughs, Connecticut's pre-2022 counties)
  // borrow the state's result or carry an older year forward with the statewide swing.
  M.countyShares = (fips) => {
    const c = E().counties[fips];
    const st = M.stateShares(c.st);
    const s = { s24: toShares(c.v24), s20: toShares(c.v20), s16: toShares(c.v16) };
    if (!s.s24 && !s.s20) return { ...st, borrowed: true };
    if (!s.s24 && s.s20 && st.s24 && st.s20) {
      s.s24 = { r: s.s20.r + st.s24.r - st.s20.r, d: s.s20.d + st.s24.d - st.s20.d, o: Math.max(0, s.s20.o + st.s24.o - st.s20.o) };
      s.carried = true;
    }
    return s;
  };

  M.lean = (units, opts = {}) => {
    const P = M.PARAMS;
    let wsum = 0, r = 0, d = 0, o = 0;
    for (const [k, w] of Object.entries(P.yearWeights)) {
      if (!units[k]) continue;
      wsum += w; r += w * units[k].r; d += w * units[k].d; o += w * units[k].o;
    }
    r /= wsum; d /= wsum; o /= wsum;
    if (units.s24 && units.s20 && !opts.noMomentum) {
      r += P.momentum * (units.s24.r - units.s20.r);
      d += P.momentum * (units.s24.d - units.s20.d);
    }
    const elasticity = 1 - 0.5 * Math.min(1, Math.abs(d - r));
    const shift = ((opts.env ?? M.environmentShift()) / 2 + (opts.extraShiftD ?? 0) / 2) * elasticity;
    d += shift; r -= shift;
    const soft = P.softIndependentMax * Math.max(0, 1 - Math.abs(d - r) / 0.6);
    const major = Math.max(1e-9, r + d);
    r -= soft * (r / major); d -= soft * (d / major);
    let I = P.indepFromThird * o + soft;
    let O = (1 - P.indepFromThird) * o + P.otherFloor;
    r = Math.max(0, r); d = Math.max(0, d);
    const tot = r + d + I + O;
    const out = { R: round1((r / tot) * 100), D: round1((d / tot) * 100), I: round1((I / tot) * 100) };
    out.O = round1(100 - out.R - out.D - out.I);
    out.margin = round1(out.D - out.R); // positive = Democratic lead
    out.leader = out.D >= out.R ? "D" : "R";
    return out;
  };

  M.nationLean = (o) => M.lean(M.nationShares(), o);
  M.stateLean = (st, o) => M.lean(M.stateShares(st), o);
  M.countyLean = (fips, o) => M.lean(M.countyShares(fips), o);

  // Cities: start from the containing county and apply an urban-core adjustment. U.S. cities vote
  // more Democratic than the rest of their county; the gap grows with city size and shrinks as
  // the city makes up more of the county (a city that IS the county gets no adjustment).
  // Cities that span several counties are scored on the combined vote of all of them.
  M.MULTI_COUNTY_CITIES = { "New York|NY": ["36061", "36047", "36081", "36005", "36085"] };
  M.cityLean = (city, o = {}) => {
    const [name, st, pop, , , fips] = city;
    const multi = M.MULTI_COUNTY_CITIES[`${name}|${st}`];
    if (multi) {
      const add = (y) => multi.reduce((acc, f) => acc.map((v, i) => v + (E().counties[f][y]?.[i] ?? 0)), [0, 0, 0, 0]);
      return { ...M.lean({ s24: toShares(add("v24")), s20: toShares(add("v20")), s16: toShares(add("v16")) }, o), countyShare: 1, urbanShift: 0 };
    }
    const c = E().counties[fips];
    const countyPop = (c?.v24?.[3] ?? c?.v20?.[3] ?? 0) / M.PARAMS.votesPerResident;
    const share = countyPop ? Math.min(1, pop / countyPop) : 1;
    const sizeFactor = Math.min(1, Math.log10(pop / 50000 + 1));
    const urbanShift = (0.04 + 0.08 * sizeFactor) * (1 - share);
    return { ...M.lean(M.countyShares(fips), { ...o, extraShiftD: urbanShift }), countyShare: share, urbanShift };
  };

  // Congressional districts: 2024 House popular vote, blended 70/30 with the state's presidential
  // vote to strip out one-off candidate effects. Uncontested races use the state vote tilted 15
  // points toward the unopposed winner's party.
  M.districtLean = (st, district, o = {}) => {
    const h = G.HOUSE24[`${st}-${district}`];
    const ss = M.stateShares(st);
    if (!h || h.total === 0 || h.unopposed) {
      const tilt = h?.wp === "D" ? 0.15 : h?.wp === "R" ? -0.15 : 0;
      return M.lean(ss, { ...o, extraShiftD: (o.extraShiftD ?? 0) + tilt });
    }
    const hs = { r: h.R / h.total, d: h.D / h.total, o: (h.I + h.O) / h.total };
    const blend = (a, b) => (b ? { r: 0.7 * a.r + 0.3 * b.r, d: 0.7 * a.d + 0.3 * b.d, o: 0.7 * a.o + 0.3 * b.o } : a);
    return M.lean({ s24: blend(hs, ss.s24), s20: blend(hs, ss.s20), s16: blend(hs, ss.s16) }, { ...o, noMomentum: true });
  };

  // =====================================================================================
  // 2. GOVERNMENT PERFORMANCE RUBRIC — 1,000 points
  // -------------------------------------------------------------------------------------
  // Each indicator is scored against fixed goalposts (not against other states), so a state's
  // score only moves when its own performance moves:   points × (value − worst) / (best − worst),
  // capped to [0, points]. Category weights reflect how directly each area affects residents'
  // daily lives and how much state/federal government controls it.
  // =====================================================================================
  M.RUBRIC = [
    { id: "economy", name: "Economy & Jobs", points: 180,
      why: "The broadest measure of material well-being: jobs, growth, purchasing power and poverty all affect every resident.",
      items: [
        { key: "unemp", label: "Unemployment rate", points: 50, worst: 7, best: 2.5, unit: "%" },
        { key: "gdp", label: "Real GDP growth", points: 40, worst: -1, best: 4, unit: "%" },
        { key: "realIncome", label: "Median income, cost-of-living adjusted", points: 50, worst: 55, best: 95, unit: "k$" },
        { key: "poverty", label: "Poverty rate", points: 40, worst: 20, best: 7, unit: "%" },
      ] },
    { id: "opinion", name: "Public Opinion & Trust", points: 140,
      why: "Residents' own verdict. Weighted heavily, but below economy because approval can swing on partisanship rather than performance — the cross-partisan item corrects for that.",
      items: [
        { key: "approval", label: "Chief-executive job approval", points: 100, worst: 30, best: 75, unit: "%" },
        { key: "crossover", label: "Cross-partisan appeal (approval vs. partisan baseline)", points: 40, worst: -15, best: 20, unit: " pts" },
      ] },
    { id: "health", name: "Healthcare & Public Health", points: 120,
      why: "Life-or-death outcomes; strongly shaped by Medicaid, public-health and insurance policy.",
      items: [
        { key: "lifeexp", label: "Life expectancy", points: 50, worst: 72, best: 80.5, unit: " yrs" },
        { key: "unins", label: "Uninsured rate", points: 40, worst: 15, best: 3, unit: "%" },
        { key: "overdose", label: "Overdose deaths per 100k", points: 30, worst: 70, best: 10, unit: "" },
      ] },
    { id: "education", name: "Education", points: 120,
      why: "K-12 education is the largest item in most state budgets and drives long-run opportunity.",
      items: [
        { key: "naep", label: "NAEP 8th-grade math score", points: 45, worst: 255, best: 280, unit: "" },
        { key: "hsgrad", label: "High-school graduation rate", points: 40, worst: 75, best: 93, unit: "%" },
        { key: "bach", label: "Adults with a bachelor's degree", points: 35, worst: 22, best: 48, unit: "%" },
      ] },
    { id: "fiscal", name: "Fiscal Responsibility", points: 110,
      why: "Sound finances protect future services and taxpayers; measured by independent credit ratings and pension health.",
      items: [
        { key: "credit", label: "Credit rating (AAA = 10)", points: 60, worst: 3, best: 10, unit: "" },
        { key: "pension", label: "Public-pension funded ratio", points: 50, worst: 40, best: 100, unit: "%" },
      ] },
    { id: "safety", name: "Public Safety & Justice", points: 100,
      why: "Core government duty; violent crime weighted nearly 2:1 over property crime.",
      items: [
        { key: "violent", label: "Violent crimes per 100k", points: 65, worst: 800, best: 150, unit: "" },
        { key: "property", label: "Property crimes per 100k", points: 35, worst: 3000, best: 1000, unit: "" },
      ] },
    { id: "infrastructure", name: "Housing & Infrastructure", points: 90,
      why: "Affordable housing and safe roads/bridges are daily-life essentials heavily influenced by state zoning and transportation policy.",
      items: [
        { key: "homeRatio", label: "Home value ÷ household income", points: 50, worst: 9, best: 3, unit: "×" },
        { key: "bridges", label: "Bridges in poor condition", points: 40, worst: 15, best: 1, unit: "%" },
      ] },
    { id: "democracy", name: "Democracy & Civic Participation", points: 70,
      why: "Healthy self-government requires participation; turnout reflects access to and confidence in elections.",
      items: [{ key: "turnout", label: "2024 voter turnout (eligible population)", points: 70, worst: 50, best: 78, unit: "%" }] },
    { id: "environment", name: "Environment & Energy", points: 70,
      why: "Long-term stewardship and energy security; important, but outcomes accrue over decades, so weighted least.",
      items: [{ key: "renew", label: "Electricity from renewables", points: 70, worst: 0, best: 80, unit: "%" }] },
  ];
  M.RUBRIC_TOTAL = M.RUBRIC.reduce((a, c) => a + c.points, 0);

  M.indicators = (code) => {
    const row = G.STATE_INDICATORS[code];
    if (!row) return null;
    const v = Object.fromEntries(G.INDICATOR_COLUMNS.map((k, i) => [k, row[i]]));
    v.realIncome = round1((v.income / v.rpp) * 100);
    let party, approval;
    if (code === "US") { party = "R"; approval = G.NATIONAL_OPINION.presidentApproval; }
    else { party = G.GOVERNORS[code]?.party; approval = G.GOVERNORS[code]?.approval; }
    // Expected approval if people rated purely by party: 50% + half the executive party's lead.
    const l = code === "US" ? M.nationLean() : M.stateLean(code);
    const lead = party === "D" ? l.D - l.R : party === "R" ? l.R - l.D : 0;
    v.approval = approval;
    v.crossover = round1(approval - (50 + lead / 2));
    return v;
  };

  M.rubricScore = (code) => {
    const v = M.indicators(code);
    if (!v) return null;
    let total = 0;
    const categories = M.RUBRIC.map((cat) => {
      const items = cat.items.map((it) => {
        const pct = clamp((v[it.key] - it.worst) / (it.best - it.worst), 0, 1);
        const score = Math.round(it.points * pct * 10) / 10;
        return { ...it, value: v[it.key], score };
      });
      const score = Math.round(items.reduce((a, i) => a + i.score, 0));
      total += score;
      return { ...cat, items, score };
    });
    return { total, grade: M.grade(total), categories };
  };
  // Goalposts are deliberately demanding (a 1,000 would mean best-in-class on every measure).
  M.grade = (t) => (t >= 750 ? "A" : t >= 650 ? "B" : t >= 550 ? "C" : t >= 450 ? "D" : "F");
  M.rubricRanks = () => {
    const list = Object.keys(G.STATE_INDICATORS).filter((k) => k !== "US" && k !== "DC")
      .map((k) => [k, M.rubricScore(k).total]).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(list.map(([k], i) => [k, i + 1]));
  };

  // =====================================================================================
  // 3. QUALIFICATIONS, BIOGRAPHIES AND NEXT MOVES
  // -------------------------------------------------------------------------------------
  // Qualification score (0–100):
  //   up to 45  years in elected office (3 pts/yr)
  //   up to 35  number of prior public offices (12 each)
  //   up to 15  relevant professional background (law, military, medicine, business, education…)
  //   +5        current party-leadership role
  // =====================================================================================
  const ELECTED = /(Press Secretary|Chief of Staff|Director|Administrator|Commissioner|Senator|Representative|Governor|Mayor|Attorney General|Council|Commission|Assembly|Treasurer|Secretary of State|Lieutenant|Auditor|Comptroller|Executive|Legislat|Supervisor|Clerk|Sheriff|Judge|Justice|Delegate|Speaker|Alder|Board of|Regent|Controller|Superintendent|District Attorney|Prosecutor|President \(|Under Secretary|Secretary of)/i;
  const PROFESSIONAL = /(veteran|Navy|Army|Marine|Air Force|attorney|J\.D\.|prosecutor|physician|doctor|surgeon|engineer|CEO|founder|entrepreneur|business|teacher|educator|professor|principal|Rhodes|nurse|police|chief|CIA|diplomat|economist|scientist|rancher|farmer|journalist|anchor|social worker|veterinarian)/i;

  M.qualification = (p) => {
    const prior = p.prior ?? [];
    const yrsCurrent = Math.max(0, YEAR - (p.since ?? YEAR));
    const yrsCongress = (p.houseYears ?? 0) + (p.senateYears ?? 0);
    const years = Math.max(yrsCurrent, yrsCongress);
    const priorElected = prior.filter((x) => ELECTED.test(x)).length + (p.priorDistricts?.length ? 1 : 0);
    const professional = prior.filter((x) => !ELECTED.test(x) && PROFESSIONAL.test(x)).length;
    const parts = {
      experience: Math.min(45, years * 3),
      offices: Math.min(35, priorElected * 12),
      background: Math.min(15, professional * 6),
      leadership: p.leadership?.length ? 5 : 0,
    };
    return { score: Math.round(parts.experience + parts.offices + parts.background + parts.leadership), parts, years: round1(years) };
  };

  const age = (p) => (p.born ? YEAR - +String(p.born).slice(0, 4) : null);
  const NEXT_GOV_ELECTION = { KY: 2027, LA: 2027, MS: 2027, NJ: 2029, VA: 2029 };
  const nextGovYear = (st) => NEXT_GOV_ELECTION[st] ?? (G.GOVERNORS[st]?.status2026 === "not-up" ? 2028 : 2026);
  // Senators not seeking another term in 2026 (announced), or whose seat status is unsettled.
  M.SENATE_2026_STATUS = {
    AL: { status: "open", note: "Tommy Tuberville is running for Governor of Alabama." },
    IL: { status: "open", note: "Dick Durbin is retiring." },
    IA: { status: "open", note: "Joni Ernst is retiring." },
    KY: { status: "open", note: "Mitch McConnell is retiring." },
    MI: { status: "open", note: "Gary Peters is retiring." },
    ME: { status: "running", personal: -12, note: "Collins has historically run far ahead of her party (won by 8.6 pts in 2020 while Biden carried Maine by 9)." },
    MN: { status: "open", note: "Tina Smith is retiring." },
    NH: { status: "open", note: "Jeanne Shaheen is retiring." },
    NC: { status: "open", note: "Thom Tillis is retiring." },
    WY: { status: "open", note: "Cynthia Lummis is retiring." },
    TX: { status: "open", note: "John Cornyn lost the May 26, 2026 GOP runoff to Ken Paxton." },
    OK: { status: "uncertain", note: "Appointed senator; candidacy status not confirmed in this dataset." },
    SC: { status: "uncertain", note: "Appointed senator; candidacy status not confirmed in this dataset." },
    NE: { status: "running", challenger: "I", personal: 12, note: "Main challenger is independent Dan Osborn, who ran 13 pts ahead of the Democratic presidential ticket in 2024." },
  };

  M.nextMoves = (p, kind, ctx = {}) => {
    const moves = [];
    const a = age(p);
    const st = p.state;
    const lean = st && st !== "US" ? M.stateLean(st) : null;
    const homeParty = lean ? (lean.margin > 0 ? "D" : "R") : null;
    const fits = p.party === homeParty || p.party === "I";
    const prob = ctx.forecast ? Math.round(100 * (p.party === "D" ? ctx.forecast.pD : 1 - ctx.forecast.pD)) : null;

    if (kind === "governor") {
      const s = p.status2026;
      if (s === "running") moves.push(`Seeking re-election on November 3, 2026${prob != null ? ` — model gives ${prob}% chance to win` : ""}.`);
      if (s === "term-limited") moves.push("Term-limited; leaves office in January 2027.");
      if (s === "retiring") moves.push("Not seeking re-election; leaves office in January 2027.");
      if (s === "not-up") moves.push(`Next gubernatorial election: ${nextGovYear(st)}.`);
      if (s === "lost-primary") moves.push(p.event.text);
      if (p.event && s !== "lost-primary") moves.push(p.event.text);
      if (p.note) moves.push(p.note);
      if ((s === "term-limited" || s === "retiring" || s === "lost-primary") && a < 70) moves.push(fits ? "Strong position for a future U.S. Senate run, cabinet post, or national role." : "Could seek a federal appointment or private-sector role; a statewide federal race would be uphill given the state's lean.");
      if (a < 64 && (p.approval >= 55 || (lean && M.states[st].seats >= 13))) moves.push("Frequently mentioned as a potential 2028 presidential or vice-presidential contender.");
      if (s === "running" && a >= 75) moves.push("Likely final term if re-elected.");
    } else if (kind === "senator") {
      const up = p.cls === 2 || p.end?.startsWith("2026");
      const info = M.SENATE_2026_STATUS[st];
      if (up && info?.status === "open") moves.push(info.note + (st === "TX" ? " Leaves the Senate in January 2027." : " Seat is open in 2026."));
      else if (up) moves.push(`Up for election November 3, 2026${prob != null ? ` — model gives ${prob}% chance to hold the seat` : ""}.`);
      else moves.push(`Term runs through January ${p.end?.slice(0, 4)}.`);
      if (a >= 78 && !(up && info?.status === "open")) moves.push("Age makes retirement at the end of the current term a real possibility.");
      if (p.leadership?.length) moves.push(`Holds party leadership (${p.leadership.join(", ")}); positioned to stay in the leadership track.`);
      const gov = G.GOVERNORS[st];
      if (a < 66 && fits && gov && nextGovYear(st) <= 2028 && gov.status2026 !== "running") moves.push(`Possible candidate for Governor of ${M.states[st].name} when that seat opens.`);
      if (a < 60 && !p.leadership?.length) moves.push("Young enough to be considered for national office (presidential/VP shortlists or committee chairmanships).");
    } else if (kind === "representative") {
      const m = Math.abs(ctx.districtMargin ?? 30);
      moves.push(m < 8 ? `Faces a competitive 2026 re-election${prob != null ? ` (${prob}% chance in this model)` : ""}.` : `Strong favorite to hold the seat in 2026${prob != null ? ` (${prob}%)` : ""}.`);
      if (p.leadership?.length) moves.push(`In House leadership (${p.leadership.join(", ")}).`);
      const openSenate = M.SENATE_2026_STATUS[st]?.status === "open";
      const govOpen = ["term-limited", "retiring"].includes(G.GOVERNORS[st]?.status2026);
      if (a < 62 && fits && (openSenate || govOpen) && m > 10) moves.push(`Potential statewide candidate (${[openSenate && "open U.S. Senate seat", govOpen && "open governorship"].filter(Boolean).join(" / ")}).`);
      if (a >= 80) moves.push("Retirement at the end of the term is plausible given age.");
      if (a < 45 && m > 15) moves.push("Long runway in a safe seat — could rise to committee or party leadership.");
    } else if (kind === "mayor" || kind === "county") {
      if (p.up2026) moves.push("Office is on the ballot in 2026.");
      if (p.note) moves.push(p.note);
      if (a && a < 60 && fits) moves.push(kind === "mayor" ? "Big-city mayors often run for Congress or governor next; a plausible future statewide candidate." : "County executives frequently move up to Congress or statewide office.");
      if (a && a >= 72) moves.push("May retire at the end of the current term.");
      if (!moves.length) moves.push("Expected to serve out the current term.");
    } else if (kind === "national" && p.note) moves.push(p.note);
    return moves;
  };

  M.bio = (p, kind, ctx = {}) => {
    const q = M.qualification(p);
    const a = age(p);
    const prior = [...(p.prior ?? [])];
    if (kind === "senator" || kind === "representative") {
      if (p.houseYears >= 0.5) prior.unshift(`${p.houseYears} years in the U.S. House`);
      if (p.senateYears >= 0.5) prior.unshift(`${p.senateYears} years in the U.S. Senate`);
      if (p.priorDistricts?.length) prior.push(`Previously represented ${p.priorDistricts.join(", ")} in the House`);
      if (p.leadership?.length) prior.push(`Leadership: ${p.leadership.join(", ")}`);
    }
    const sinceYear = p.since ?? (p.firstElected ? +p.firstElected.slice(0, 4) : null);
    const summary = `${M.partyName[p.party] ?? "Nonpartisan"}${a ? `, age ${a}` : ""}${sinceYear ? `. In office since ${sinceYear}` : ""}.`;
    return { summary, qualifications: prior, qual: q, nextMoves: M.nextMoves(p, kind, ctx) };
  };

  // =====================================================================================
  // 4. 2026 MIDTERM FORECAST
  // -------------------------------------------------------------------------------------
  // For each race, an expected Democratic margin (points) is built from:
  //   baseline     partisan lean of the jurisdiction (Senate/Governor: state lean with neutral
  //                climate; House: 2024 House result blended with the state vote)
  //   climate      (special-election climate − 2024 House popular vote) × elasticity
  //   incumbency   +2.5 Senate / +3 Governor for a running incumbent; House baselines already
  //                include it, so open House seats subtract 3 from the departing party
  //   (no polls: head-to-head polls, the generic ballot and approval ratings are not used)
  //   personal     documented personal vote of specific candidates (e.g. Collins, Osborn)
  //   quality      (qualification score − 50) × 0.04 toward a running incumbent (max ±2)
  //   money        2 × ln(D ÷ R campaign receipts, FEC), max ±4
  //   economy      state unemployment and GDP growth vs. the nation (see M.economyEffect)
  // These "fundamentals" are then combined with expert ratings and prediction markets by
  // inverse-variance weighting (see addRace). Polls are not used.
  // Win probability = Φ(margin / σ) with σ = 6 (Senate), 6.5 (House, +3 where maps were redrawn
  // for 2026), 7 (Governor). Chamber control comes from 20,000 simulations that share a national
  // polling error (σ = 2.5) across all races.
  // =====================================================================================
  M.REDISTRICTED_2026 = ["TX", "CA", "MO", "NC", "OH", "UT"];
  const SIGMA = { senate: 6, house: 6.5, governor: 7, mayor: 8 };
  const INCUMBENCY = { senate: 2.5, governor: 3, house: 3, mayor: 3 };
  const NATIONAL_ERROR = 2.5;

  const erf = (x) => { // Abramowitz–Stegun 7.1.26
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  };
  M.normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  M.rating = (pD) => {
    const p = Math.max(pD, 1 - pD), side = pD >= 0.5 ? "D" : "R";
    if (p >= 0.95) return { label: `Safe ${side}`, side, tier: 3 };
    if (p >= 0.8) return { label: `Likely ${side}`, side, tier: 2 };
    if (p >= 0.62) return { label: `Lean ${side}`, side, tier: 1 };
    return { label: "Toss-up", side, tier: 0 };
  };

  M.congress = () => G.CONGRESS;
  M.senators = (st) => G.CONGRESS.filter((m) => m.type === "sen" && m.state === st);
  M.representative = (st, d) => G.CONGRESS.find((m) => m.type === "rep" && m.state === st && m.district === d);

  const elasticityOf = (marginPts) => 1 - 0.5 * Math.min(1, Math.abs(marginPts) / 100);

  // Inverse of the standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9).
  M.normInv = (p) => {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
    if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
    if (q > 1 - 0.02425) return -M.normInv(1 - q);
    const t = q - 0.5, r = t * t;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };

  const SIG = () => G.RACE_SIGNALS ?? { ratings: {}, markets: {}, money: {}, notRunning: { senate: {}, house: {} } };
  const indicator = (st, key) => G.STATE_INDICATORS[st]?.[G.INDICATOR_COLUMNS.indexOf(key)];

  // Campaign money: 2 × ln(Democratic receipts ÷ Republican receipts), capped at ±4 points.
  // Fundraising mostly follows competitiveness, so the effect is deliberately small.
  M.moneyEffect = (raceKey, dSide = "D") => {
    const m = SIG().money[raceKey];
    const d = m?.[dSide] ?? (dSide === "I" ? m?.D : null), r = m?.R;
    if (!d || !r || d.receipts < 25000 || r.receipts < 25000) return { effect: 0, d, r };
    return { effect: round1(clamp(2 * Math.log(d.receipts / r.receipts), -4, 4)), d, r };
  };
  // State economy vs. the nation (official BLS/BEA data already on the site).
  //   governor races: voters hold the governor's party responsible — each point of unemployment
  //   above the national rate costs it 0.6, each point of GDP growth above the nation adds 0.3 (max ±2)
  //   federal races: a weaker state economy helps the party out of the White House, 0.3 per point (max ±1.5)
  M.economyEffect = (st, office, governorParty) => {
    const du = (indicator(st, "unemp") ?? 0) - (indicator("US", "unemp") ?? 0);
    const dg = (indicator(st, "gdp") ?? 0) - (indicator("US", "gdp") ?? 0);
    if (office === "governor") return round1((governorParty === "D" ? 1 : -1) * clamp(-0.6 * du + 0.3 * dg, -2, 2));
    return round1(clamp(0.3 * du, -1.5, 1.5)); // president is a Republican, so this moves toward Democrats
  };

  // ---- People's photos ----
  // One key per person, so "Donald J. Trump", "SMITH, JOHN A." and "Susan Collins (inc.)" match the
  // names in data/generated/photos.js: no accents, nicknames, parentheticals, suffixes or initials.
  M.personKey = (name) => {
    let n = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)|"[^"]*"|“[^”]*”/g, " ");
    if (/^[^,]+,[^,]+$/.test(n) && n === n.toUpperCase()) n = n.replace(/^([^,]+),\s*(.+)$/, "$2 $1"); // FEC "LAST, FIRST"
    return n.toLowerCase().replace(/^(sen|rep|gov|dr|mr|mrs|ms)\.?\s+/, "").replace(/[.,'’]/g, " ").split(/[\s-]+/)
      .filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w) && w.length > 1).join(" ");
  };
  // Photo for a person: official congressional portrait or Wikipedia's lead image (see fetch-photos.mjs).
  M.photo = (p) => {
    const ph = G.PHOTOS;
    if (!ph || !p) return null;
    return (p.id && ph.byId[p.id]) || ph.byName[M.personKey(p.name)] || null;
  };

  // ---- Source groups for the equal-thirds forecast ----
  // Rule: a source is Democratic- (or Republican-) leaning when AllSides or Media Bias/Fact Check
  // rates its outlet left (or right) of center and neither rates it the other way. Everything else —
  // nonpartisan handicappers, data services, prediction markets and official statistics — is
  // independent. Ratings as published in 2025–26; see the Methodology tab for links.
  M.SIDE_LABEL = { D: "Democratic-leaning sources", I: "Independent sources", R: "Republican-leaning sources" };
  const CORR_THIRDS = 0.5;
  M.SOURCE_LEAN = {
    NBC: { name: "NBC News", side: "D", basis: "AllSides: Lean Left · MBFC: Left-Center", url: "https://www.allsides.com/news-source/nbc-news-media-bias" },
    Econ: { name: "The Economist", side: "D", basis: "AllSides: Lean Left · MBFC: Least Biased", url: "https://www.allsides.com/news-source/economist-media-bias" },
    Sabato: { name: "Sabato's Crystal Ball", side: "D", basis: "MBFC rates its publisher, the UVA Center for Politics, Left-Center · not rated by AllSides", url: "https://mediabiasfactcheck.com/uva-center-for-politics-bias/" },
    Fox: { name: "Fox News", side: "R", basis: "AllSides: Right · MBFC: Right", url: "https://www.allsides.com/news-source/fox-news-media-bias" },
    RCP: { name: "RealClearPolitics", side: "R", basis: "AllSides: Center (noted as center-right) · MBFC: Right-Center", url: "https://mediabiasfactcheck.com/real-clear-politics/" },
    Cook: { name: "Cook Political Report", side: "I", basis: "AllSides: Center · MBFC: Least Biased", url: "https://www.allsides.com/news-source/cook-report-media-bias" },
    Silver: { name: "Silver Bulletin", side: "I", basis: "MBFC: Least Biased", url: "https://mediabiasfactcheck.com/silver-bulletin-bias-and-credibility/" },

    IE: { name: "Inside Elections", side: "I", basis: "Nonpartisan newsletter; not rated left or right", url: "https://insideelections.com/" },
    DDHQ: { name: "Decision Desk HQ", side: "I", basis: "Nonpartisan results service; not rated left or right", url: "https://decisiondeskhq.com/" },
    FPO: { name: "FiftyPlusOne", side: "I", basis: "Not rated left or right", url: "https://fiftyplusone.news/" },
    ST: { name: "Split Ticket", side: "I", basis: "Not rated left or right", url: "https://split-ticket.org/" },
  };
  M.sourceLean = (by) => M.SOURCE_LEAN[String(by).replace(/\.$/, "")] ?? { name: by, side: "I", basis: "Not rated left or right" };

  // ---- Predicted popular vote ----
  // Vote margin: the same equal-thirds blend as the win probability, except that a signal sitting at
  // the top of its scale (a "Safe" rating is ±15, a 95%+ market ±9.8) only says "at least this much",
  // so there the larger of it and the fundamentals' margin is used — landslides are not pulled to 50-50.
  // Third-party share: the area's 2024 non-major vote (the district's House race when both parties
  // ran, otherwise the state's presidential vote), between 1% and 10%.
  // Turnout: midterms draw about 0.75 of the previous presidential vote (2018 House vote ÷ 2016
  // presidential 0.83, 2022 ÷ 2020 0.68), applied to the area's 2024 vote.
  M.MIDTERM_TURNOUT = 0.75;
  const MARKET_SAFE = 9.8; // a 95%+ market price, Φ⁻¹(0.95) × 6
  const stateVotes24 = {};
  const votes24 = (st) => (stateVotes24[st] ??= Object.values(E().counties).reduce((a, c) => a + (c.st === st ? c.v24?.[3] ?? 0 : 0), 0));
  M.predictedVote = (r) => {
    let vm = 0;
    for (const t of r.thirds) for (const sg of r.signals.filter((x) => x.side === t.side)) {
      const atCeiling = (sg.key.startsWith("ratings") && Math.abs(sg.margin) >= 15) || ((sg.key === "markets" || sg.key === "polymarket") && Math.abs(sg.margin) >= MARKET_SAFE);
      const m = atCeiling && Math.sign(sg.margin) === Math.sign(r.fundamentals) ? Math.sign(sg.margin) * Math.max(Math.abs(sg.margin), Math.abs(r.fundamentals)) : sg.margin;
      vm += t.weight * sg.within * m;
    }
    const h = r.office === "house" && !r.redistricted ? G.HOUSE24[`${r.state}-${r.district}`] : null;
    const contested = h && h.R > 0 && h.D > 0 && !h.unopposed;
    // New York and Connecticut count major-party candidates' votes on minor-party lines (Working
    // Families, Conservative) separately, so their House "other" vote isn't third-party support.
    const fusion = ["NY", "CT"].includes(r.state);
    const O = round1(clamp(100 * (contested && !fusion ? (h.I + h.O) / h.total : M.stateShares(r.state).s24?.o ?? 0.02), 1, 10));
    const two = 100 - O;
    const dShare = (m) => clamp(two / 2 + m / 2, 0.5, two - 0.5);
    const D = round1(dShare(vm));
    const z = 1.2816 * r.sigma; // 80% range
    const st = G.STATES_META.find((x) => x[1] === r.state);
    const base = r.office === "house" ? (contested ? h.total : votes24(r.state) / Math.max(1, st?.[3] ?? 1)) : r.office === "mayor" ? null : votes24(r.state);
    const total = base ? Math.round((base * M.MIDTERM_TURNOUT) / 1000) * 1000 : null;
    const out = { margin: round1(vm), D, R: round1(two - D), O, lo: round1(dShare(vm - z)), hi: round1(dShare(vm + z)), total };
    if (total) { out.votesD = Math.round((total * out.D) / 100); out.votesR = Math.round((total * out.R) / 100); out.votesO = total - out.votesD - out.votesR; }
    return out;
  };

  M.forecast = (opts = {}) => {
    const climate = M.climateParts(opts.climate);
    const swing = climate.value - M.houseNationalMargin24;
    const races = [];
    const addRace = (r) => {
      const el = elasticityOf(r.baseline);
      r.climate = round1(swing * el);
      r.personal ??= 0;
      let margin = r.baseline + r.climate + r.incumbency + r.qualityEffect + r.personal;
      r.moneyEffect ??= 0;
      r.economyEffect ??= 0;
      r.fundamentals = round1(margin + r.approvalEffect + r.moneyEffect + r.economyEffect);

      // ---- Equal thirds: Democratic-leaning, independent and Republican-leaning sources ----
      // Every piece of evidence is an estimated Democratic margin with an uncertainty (σ). Each source
      // is placed in one of three groups (M.SOURCE_LEAN); signals within a group are combined by
      // inverse-variance weighting, then the three groups count exactly one third each.
      // Governor races split from federal partisanship far more often (Scott, Ayotte, Beshear),
      // so their fundamentals carry more uncertainty.
      const fundSigma = r.office === "governor" ? 10 : r.sigma;
      const signals = [{ key: "fundamentals", side: "I", label: "Fundamentals (vote history, special-election climate, incumbency, qualifications, money, economy)", margin: r.fundamentals, sigma: fundSigma }];
      // Head-to-head polls are deliberately NOT used (owner's choice): the forecast relies on votes
      // already cast, money, the economy, expert ratings and prediction markets.
      const pr = P?.races[r.id];
      if (pr?.challenger) r.challenger = pr.challenger;
      if (pr) r.nominees = { D: pr.D, R: pr.R };
      const rt = SIG().ratings[r.id] ?? (r.office === "senate" ? SIG().ratings[r.id.replace(/-S$/, "")] : null);
      if (rt) {
        r.ratings = rt;
        for (const side of ["D", "I", "R"]) {
          const xs = rt.ratings.filter((x) => M.sourceLean(x.by).side === side);
          if (!xs.length) continue;
          const allSafe = xs.every((x) => Math.abs(x.margin) === 15);
          signals.push({ key: `ratings-${side}`, side, label: `Expert ratings: ${xs.map((x) => M.sourceLean(x.by).name).join(", ")}`, margin: round1(mean(xs.map((x) => x.margin))), sigma: allSafe ? 10 : 6, discount: 0.6 });
        }
      }
      const forState = (tbl) => tbl?.[r.id] ?? (r.office === "senate" ? tbl?.[r.id.replace(/-S$/, "")] : null); // markets list specials under the state
      const mk = forState(SIG().markets);
      const pm = forState(SIG().polymarkets);
      const sideName = r.challenger === "I" ? "Osborn" : "D";
      if (mk) {
        r.market = mk;
        signals.push({ key: "markets", side: "I", label: `Prediction market (Kalshi: ${Math.round(mk.pD * 100)}% ${sideName})`, margin: round1(M.normInv(clamp(mk.pD, 0.02, 0.98)) * 6), sigma: 5, discount: 0.6 });
      }
      if (pm) {
        r.polymarket = pm;
        signals.push({ key: "polymarket", side: "I", label: `Prediction market (Polymarket: ${Math.round(pm.pD * 100)}% ${sideName})`, margin: round1(M.normInv(clamp(pm.pD, 0.02, 0.98)) * 6), sigma: 5, discount: 0.6 });
      }
      // Markets sometimes list a party ("Democratic party", "Nixon (Democratic nominee)") instead of a person.
      const person = (n) => (n && /\S\s+\S/.test(n) && !/\b(party|nominee|democrats?|democratic|republicans?|candidate|other|independent)\b/i.test(n) ? n : null);
      const mD = person(pm?.D) ?? person(mk?.D), mR = person(pm?.R) ?? person(mk?.R);
      if (!r.nominees && mD && mR) r.nominees = { D: mD, R: mR, fromMarket: true };
      // Robustness: when race-specific evidence (ratings, markets) agrees and the fundamentals
      // sit more than 8 points away from its average, widen the fundamentals' σ in proportion.
      if (signals.length >= 2) {
        const others = signals.slice(1);
        const gap = Math.abs(r.fundamentals - mean(others.map((x) => x.margin)));
        if (gap > 8) { signals[0].sigma = round1(signals[0].sigma * (gap / 8)); signals[0].label += ` — down-weighted, ${round1(gap)} pts from the ratings and markets`; }
      }
      // Combine within each group.
      const thirds = [];
      for (const side of ["D", "I", "R"]) {
        const sg = signals.filter((x) => x.side === side);
        if (!sg.length) continue;
        let wsum = 0, msum = 0;
        // Signals that read the same news are discounted against each other — not when one stands alone.
        for (const x of sg) { x.w = (sg.length > 1 ? x.discount ?? 1 : 1) / x.sigma ** 2; wsum += x.w; msum += x.w * x.margin; }
        for (const x of sg) x.within = x.w / wsum;
        thirds.push({ side, label: M.SIDE_LABEL[side], margin: round1(msum / wsum), sigma: round1(1 / Math.sqrt(wsum)), n: sg.length });
      }
      // Both partisan groups or neither: if only one side rated a race, using it alone would tilt the
      // forecast, so the race falls back to the independent group.
      const balanced = thirds.length === 3 ? thirds : thirds.filter((t) => t.side === "I");
      for (const t of thirds) t.weight = balanced.includes(t) ? 1 / balanced.length : 0;
      for (const x of signals) x.share = Math.round((thirds.find((t) => t.side === x.side).weight * x.within) * 100);
      // The groups' errors are partly shared (forecasters and traders read the same news): ρ = 0.5.
      let m = 0, v = 0;
      for (const a of balanced) {
        m += a.weight * a.margin;
        for (const b of balanced) v += a.weight * b.weight * a.sigma * b.sigma * (a === b ? 1 : CORR_THIRDS);
      }
      r.thirds = thirds;
      r.balanced = balanced.length === 3;
      r.signals = signals;
      r.margin = round1(m);
      r.sigma = round1(Math.max(Math.sqrt(v), 3.5));
      r.pD = M.normCdf(r.margin / r.sigma);
      r.rating = M.rating(r.pD);
      r.elasticity = el;
      r.vote = M.predictedVote(r);
      races.push(r);
    };

    // --- Senate (class 2 + special elections for appointed seats ending Nov 2026) ---
    for (const s of G.CONGRESS.filter((m) => m.type === "sen" && (m.cls === 2 || m.end.startsWith("2026")))) {
      let info = M.SENATE_2026_STATUS[s.state] ?? { status: "running" };
      const bp = SIG().notRunning.senate[s.state];
      if (bp && info.status !== "open" && s.name.includes(bp.split(" ").pop())) info = { ...info, status: "open", note: `${bp} is not seeking re-election (Ballotpedia).` };
      const baseline = M.stateLean(s.state, { env: 0 }).margin;
      const party = s.caucus ?? s.party;
      const dir = party === "D" ? 1 : -1;
      const running = info.status === "running";
      const factor = running ? 1 : info.status === "uncertain" ? 0.5 : 0;
      const q = M.qualification(s);
      addRace({
        office: "senate", id: `SEN-${s.state}${s.cls === 2 ? "" : "-S"}`, state: s.state,
        title: `U.S. Senate — ${M.states[s.state].name}${s.cls === 2 ? "" : " (special)"}`,
        incumbent: { name: s.name, party: s.party, id: s.id }, status: info.status, note: info.note,
        challenger: info.challenger,
        baseline, incumbency: dir * INCUMBENCY.senate * factor, approvalEffect: 0,
        qualityEffect: round1(dir * clamp((q.score - 50) * 0.04, -2, 2) * factor), sigma: SIGMA.senate, personal: info.personal ?? 0,
        moneyEffect: M.moneyEffect(`SEN-${s.state}`, info.challenger === "I" ? "I" : "D").effect,
        money: M.moneyEffect(`SEN-${s.state}`, info.challenger === "I" ? "I" : "D"),
        economyEffect: M.economyEffect(s.state, "senate"),
      });
    }

    // --- Governors ---
    for (const [st, g] of Object.entries(G.GOVERNORS)) {
      if (st === "DC" || g.status2026 === "not-up") continue;
      const baseline = M.stateLean(st, { env: 0 }).margin;
      const dir = g.party === "D" ? 1 : -1;
      const running = g.status2026 === "running";
      const q = M.qualification({ ...g, state: st });
      const why = { "term-limited": "is term-limited.", retiring: "is not seeking re-election.", "lost-primary": "lost the 2026 primary." }[g.status2026];
      addRace({
        office: "governor", id: `GOV-${st}`, state: st, title: `Governor — ${M.states[st].name}`,
        incumbent: { name: g.name, party: g.party }, status: running ? "running" : "open",
        note: running ? null : `${g.name} ${why}`,
        baseline,
        incumbency: running ? dir * INCUMBENCY.governor : 0,
        // An unpopular departing governor still drags on their party a little (and vice-versa).
        approvalEffect: 0, // approval ratings come from polls, which the forecast does not use
        qualityEffect: running ? round1(dir * clamp((q.score - 50) * 0.04, -2, 2)) : 0,
        economyEffect: M.economyEffect(st, "governor", g.party),
        sigma: SIGMA.governor,
      });
    }

    // --- U.S. House: all 435 seats ---
    for (const [fips, st, , seats] of G.STATES_META) {
      if (!seats) continue;
      for (let d = seats === 1 ? 0 : 1; d <= (seats === 1 ? 0 : seats); d++) {
        const rep = M.representative(st, d);
        const h = G.HOUSE24[`${st}-${d}`];
        const id = `${st}-${d === 0 ? "AL" : String(d).padStart(2, "0")}`;
        const lean = M.districtLean(st, d, { env: 0 });
        const retiring = rep && SIG().notRunning.house[id];
        // Cook PVI on the 2026 lines (from the ratings table) replaces the 2024-based baseline in
        // redistricted states and is averaged with it elsewhere. PVI D+x ≈ a 2x-point margin
        // relative to the nation; the 2024 national presidential margin was R+1.5.
        const pvi = SIG().ratings[id]?.pvi;
        const pviBase = pvi != null ? 2 * pvi - 1.5 + (rep && !retiring ? (rep.party === "D" ? 1 : -1) * INCUMBENCY.house : 0) : null;
        const baseline = pviBase == null ? lean.margin : M.REDISTRICTED_2026.includes(st) ? pviBase : (lean.margin + pviBase) / 2;
        const prevParty = rep?.party ?? h?.wp ?? (baseline > 0 ? "D" : "R");
        const dir = prevParty === "D" ? 1 : -1;
        const q = rep ? M.qualification(rep) : null;
        addRace({
          office: "house", id, state: st, district: d,
          title: `${M.states[st].name} ${d === 0 ? "at-large" : `District ${d}`}`,
          incumbent: rep ? { name: rep.name, party: rep.party, id: rep.id } : { name: "Vacant", party: prevParty },
          status: rep && !retiring ? "running" : "open",
          note: !rep ? "Seat currently vacant." : retiring ? `${retiring} is not seeking re-election (Ballotpedia).` : null,
          redistricted: M.REDISTRICTED_2026.includes(st), pvi,
          baseline: round1(baseline), incumbency: rep && !retiring ? 0 : -dir * INCUMBENCY.house, approvalEffect: 0,
          qualityEffect: q && !retiring ? round1(dir * clamp((q.score - 50) * 0.02, -1, 1)) : 0,
          moneyEffect: M.moneyEffect(id).effect, money: M.moneyEffect(id),
          economyEffect: M.economyEffect(st, "house"),
          sigma: SIGMA.house + (M.REDISTRICTED_2026.includes(st) && pvi == null ? 3 : 0),
        });
      }
    }

    // --- Mayoral offices on the 2026 ballot (from data/leaders.js `up2026`) ---
    for (const [key, m] of Object.entries(G.MAYORS)) {
      if (!m.up2026) continue;
      const [cityName, st] = key.split("|");
      const city = G.CITIES.find((c) => c[0] === cityName && c[1] === st);
      if (!city) continue;
      const running = !m.note?.includes("Not seeking");
      // Nonpartisan/one-party cities: the real contest is between candidates of the dominant party,
      // so we report the chance the dominant party holds the office.
      addRace({
        office: "mayor", id: `MAYOR-${key}`, state: st, title: `Mayor — ${cityName}, ${st}`,
        incumbent: { name: m.name, party: m.party }, status: running ? "running" : "open", note: m.note,
        baseline: M.cityLean(city, { env: 0 }).margin, incumbency: running ? (m.party === "D" ? 1 : -1) * INCUMBENCY.mayor : 0,
        approvalEffect: 0, qualityEffect: 0, sigma: SIGMA.mayor,
      });
    }

    return { climate, swing: round1(swing), races, control: M.simulate(races) };
  };

  // Seeded RNG so the numbers are stable between page loads.
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rand) => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

  M.simulate = (races, n = 20000) => {
    const rand = rng(2026);
    const senate = races.filter((r) => r.office === "senate");
    const house = races.filter((r) => r.office === "house");
    const upIds = new Set(senate.map((r) => r.incumbent.id));
    const holdover = { D: 0, R: 0 };
    for (const m of G.CONGRESS) if (m.type === "sen" && !upIds.has(m.id)) holdover[(m.caucus ?? m.party) === "R" ? "R" : "D"]++;
    let houseD = 0, senD = 0, houseSeatsSum = 0, senSeatsSum = 0;
    const houseDist = new Array(436).fill(0);
    const resid = (r) => Math.sqrt(Math.max(1, r.sigma ** 2 - NATIONAL_ERROR ** 2));
    for (let i = 0; i < n; i++) {
      const nat = gauss(rand) * NATIONAL_ERROR;
      let h = 0, s = holdover.D;
      for (const r of house) if (r.margin + nat * r.elasticity + gauss(rand) * resid(r) > 0) h++;
      for (const r of senate) if (r.margin + nat * r.elasticity + gauss(rand) * resid(r) > 0) s++;
      if (h >= 218) houseD++;
      if (s >= 51) senD++; // a 50–50 Senate is broken by the Republican Vice President
      houseSeatsSum += h; senSeatsSum += s; houseDist[h]++;
    }
    return {
      house: { pD: houseD / n, expectedD: Math.round(houseSeatsSum / n), dist: houseDist.map((c) => c / n) },
      senate: { pD: senD / n, expectedD: Math.round(senSeatsSum / n), holdover },
    };
  };

  G.Model = M;
})();
