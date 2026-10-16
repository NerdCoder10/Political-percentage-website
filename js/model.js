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
  M.environmentShift = (genericBallot = G.NATIONAL_OPINION.genericBallot) => (genericBallot - M.houseNationalMargin24) / 100;

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
    TX: { status: "uncertain", note: "Incumbent faced a contested Republican primary; nominee may differ from the incumbent." },
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
      if ((s === "term-limited" || s === "retiring") && a < 70) moves.push(fits ? "Strong position for a future U.S. Senate run, cabinet post, or national role." : "Could seek a federal appointment or private-sector role; a statewide federal race would be uphill given the state's lean.");
      if (a < 64 && (p.approval >= 55 || (lean && M.states[st].seats >= 13))) moves.push("Frequently mentioned as a potential 2028 presidential or vice-presidential contender.");
      if (s === "running" && a >= 75) moves.push("Likely final term if re-elected.");
    } else if (kind === "senator") {
      const up = p.cls === 2 || p.end?.startsWith("2026");
      const info = M.SENATE_2026_STATUS[st];
      if (up && info?.status === "open") moves.push(info.note + " Seat is open in 2026.");
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
  //   climate      (generic ballot − 2024 House popular vote) × elasticity
  //   incumbency   +2.5 Senate / +3 Governor for a running incumbent; House baselines already
  //                include it, so open House seats subtract 3 from the departing party
  //   approval     running governors: the partisan margin is pulled toward an approval-implied
  //                margin of 3 × (approval − 48) — 40% of the way when approval helps the incumbent
  //                (popular governors win in opposite-party states), 25% when it hurts (unpopular
  //                incumbents in one-party states usually still win the general election);
  //                departing governors: (approval − 50) × 0.1 for their party
  //   personal     documented personal vote of specific candidates (e.g. Collins, Osborn)
  //   quality      (qualification score − 50) × 0.04 toward a running incumbent (max ±2)
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

  M.forecast = (opts = {}) => {
    const gb = opts.genericBallot ?? G.NATIONAL_OPINION.genericBallot;
    const swing = gb - M.houseNationalMargin24;
    const races = [];
    const addRace = (r) => {
      const el = elasticityOf(r.baseline);
      r.climate = round1(swing * el);
      r.personal ??= 0;
      let margin = r.baseline + r.climate + r.incumbency + r.qualityEffect + r.personal;
      if (r.approvalWeight) { // blend partisanship with the incumbent's approval-implied margin
        const dir = r.incumbent.party === "D" ? 1 : -1;
        const approvalMargin = dir * 3 * (r.approval - 48);
        const helps = (approvalMargin - margin) * dir > 0;
        r.approvalEffect = round1((helps ? 0.4 : 0.25) * (approvalMargin - margin));
      }
      r.margin = round1(margin + r.approvalEffect);
      r.pD = M.normCdf(r.margin / r.sigma);
      r.rating = M.rating(r.pD);
      r.elasticity = el;
      races.push(r);
    };

    // --- Senate (class 2 + special elections for appointed seats ending Nov 2026) ---
    for (const s of G.CONGRESS.filter((m) => m.type === "sen" && (m.cls === 2 || m.end.startsWith("2026")))) {
      const info = M.SENATE_2026_STATUS[s.state] ?? { status: "running" };
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
      });
    }

    // --- Governors ---
    for (const [st, g] of Object.entries(G.GOVERNORS)) {
      if (st === "DC" || g.status2026 === "not-up") continue;
      const baseline = M.stateLean(st, { env: 0 }).margin;
      const dir = g.party === "D" ? 1 : -1;
      const running = g.status2026 === "running";
      const q = M.qualification({ ...g, state: st });
      addRace({
        office: "governor", id: `GOV-${st}`, state: st, title: `Governor — ${M.states[st].name}`,
        incumbent: { name: g.name, party: g.party }, status: running ? "running" : "open",
        note: running ? null : g.status2026 === "term-limited" ? `${g.name} is term-limited.` : `${g.name} is not seeking re-election.`,
        baseline,
        incumbency: running ? dir * INCUMBENCY.governor : 0,
        // An unpopular departing governor still drags on their party a little (and vice-versa).
        approvalEffect: running ? 0 : round1(dir * (g.approval - 50) * 0.1),
        approvalWeight: running ? 1 : 0, approval: g.approval,
        qualityEffect: running ? round1(dir * clamp((q.score - 50) * 0.04, -2, 2)) : 0,
        sigma: SIGMA.governor,
      });
    }

    // --- U.S. House: all 435 seats ---
    for (const [fips, st, , seats] of G.STATES_META) {
      if (!seats) continue;
      for (let d = seats === 1 ? 0 : 1; d <= (seats === 1 ? 0 : seats); d++) {
        const rep = M.representative(st, d);
        const h = G.HOUSE24[`${st}-${d}`];
        const lean = M.districtLean(st, d, { env: 0 });
        const prevParty = rep?.party ?? h?.wp ?? (lean.margin > 0 ? "D" : "R");
        const dir = prevParty === "D" ? 1 : -1;
        const q = rep ? M.qualification(rep) : null;
        addRace({
          office: "house", id: `${st}-${d === 0 ? "AL" : String(d).padStart(2, "0")}`, state: st, district: d,
          title: `${M.states[st].name} ${d === 0 ? "at-large" : `District ${d}`}`,
          incumbent: rep ? { name: rep.name, party: rep.party, id: rep.id } : { name: "Vacant", party: prevParty },
          status: rep ? "running" : "open", note: rep ? null : "Seat currently vacant.",
          redistricted: M.REDISTRICTED_2026.includes(st),
          baseline: lean.margin, incumbency: rep ? 0 : -dir * INCUMBENCY.house, approvalEffect: 0,
          qualityEffect: q ? round1(dir * clamp((q.score - 50) * 0.02, -1, 1)) : 0,
          sigma: SIGMA.house + (M.REDISTRICTED_2026.includes(st) ? 3 : 0),
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

    return { genericBallot: gb, swing: round1(swing), races, control: M.simulate(races) };
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
