// Collects the non-poll evidence the 2026 forecast combines, and writes data/generated/signals.js:
//   • Expert race ratings — every forecaster column in Wikipedia's 2026 Senate, governor and House
//     rating tables (Cook, Inside Elections, Sabato, Decision Desk HQ, The Economist, Fox News,
//     RealClearPolitics, Silver Bulletin, …), plus Cook PVI on the new district lines.
//   • Prediction markets — Kalshi and Polymarket winner markets for each Senate, governor and House race.
//   • Campaign money — FEC "current campaigns" summary (receipts and cash on hand) for every
//     House and Senate candidate.
//   • 2026 primary ballots — votes cast for each party's candidates in every race's primaries.
//   • Who is not running — Ballotpedia's list of members of Congress not seeking re-election.
// Run with: npm run fetch:signals   (add --refresh to re-download cached files)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/signals");
fs.mkdirSync(RAW, { recursive: true });
await import(path.join(ROOT, "data/states-meta.js"));
await import(path.join(ROOT, "data/leaders.js"));
const META = globalThis.STATES_META;
const byName = Object.fromEntries(META.map(([, a, n]) => [n.toLowerCase(), a]));
const seats = Object.fromEntries(META.map((m) => [m[1], m[3]]));
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const REFRESH = process.argv.includes("--refresh");

function download(name, url, { binary = false, maxAgeMin = 0, retries = 4 } = {}) {
  const file = path.join(RAW, name);
  const stale = !fs.existsSync(file) || (REFRESH && (!maxAgeMin || Date.now() - fs.statSync(file).mtimeMs > maxAgeMin * 60000));
  if (stale) {
    for (let attempt = 1; ; attempt++) {
      try { execFileSync("curl", ["-sSfL", "-m", "90", "-A", UA, "-o", file, url]); break; }
      catch (e) { if (attempt >= retries) throw e; execFileSync("sleep", [String(2 * attempt)]); }
    }
  }
  return binary ? fs.readFileSync(file) : fs.readFileSync(file, "utf8");
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const cellsOf = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")).split("'>").pop().replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim());
const rowsOf = (html) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cellsOf(m[1]));
const tablesOf = (html) => [...html.matchAll(/<table class="wikitable[\s\S]*?<\/table>/g)].map((m) => m[0]);
const step = (name, fn) => { try { return fn(); } catch (e) { console.error(`! ${name} failed: ${e.message}`); return null; } };
const sleep = (ms) => execFileSync("sleep", [String(ms / 1000)]);
const sid = (st, d) => `${st}-${d === 0 ? "AL" : String(d).padStart(2, "0")}`;

// ------------------------------------------------------------------ expert ratings
// Ratings become an implied margin (Democratic minus Republican, points). "Safe/Solid" ±15,
// "Likely" ±8, "Lean" ±4, "Tilt" ±1.5, "Tossup" 0. "(flip)" notes are ignored.
const RATING_MARGIN = { safe: 15, solid: 15, likely: 8, lean: 4, tilt: 1.5 };
function ratingToMargin(text) {
  const t = text.toLowerCase().replace(/\(flip\)/g, "").trim();
  if (/^toss/.test(t)) return 0;
  const m = t.match(/^(safe|solid|likely|lean|tilt)\s+([dri])/);
  if (!m) return null;
  return (m[2] === "r" ? -1 : 1) * RATING_MARGIN[m[1]]; // "I" (an independent backed by Democrats) counts as the D side
}
function ratingsTable(html, keyOf) {
  const table = tablesOf(html).find((t) => /Cook/.test(t.slice(0, 5000)) || /Sabato/.test(t.slice(0, 5000)) || /CPVI/.test(t.slice(0, 5000)));
  if (!table) throw new Error("ratings table not found");
  const rows = rowsOf(table);
  const header = rows.find((r) => r.some((c) => /PVI/.test(c)));
  // Forecaster names: the first link in each header cell (e.g. <a title="The Cook Political Report">Cook</a>).
  const rawHeader = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]).find((r) => /PVI/.test(r));
  const headerNames = [...rawHeader.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => {
    const a = m[1].match(/<a [^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/);
    return a ? { short: decode(a[2]).trim(), full: decode(a[1]).trim() } : null;
  });
  const pviCol = header.findIndex((c) => /PVI/.test(c));
  const firstRating = header.findIndex((c, i) => i > pviCol + 2 && /\d{4}|Cook|Sabato/.test(c));
  const names = headerNames.slice(firstRating).map((n, i) => n?.short ?? `Forecaster ${i + 1}`);
  const fullNames = headerNames.slice(firstRating).map((n) => n?.full);
  const out = {};
  for (const r of rows) {
    const key = keyOf(r[0]);
    if (!key) continue;
    const values = r.slice(firstRating, firstRating + names.length);
    const ratings = values.map((v, i) => ({ by: names[i] || `Forecaster ${i + 1}`, source: fullNames[i], rating: v, margin: ratingToMargin(v) })).filter((x) => x.margin != null);
    if (!ratings.length) continue;
    const pvi = r[pviCol]?.match(/^([DR])\+(\d+)|^EVEN/i);
    out[key] = {
      ratings,
      margin: Math.round((ratings.reduce((a, x) => a + x.margin, 0) / ratings.length) * 10) / 10,
      pvi: pvi ? (pvi[0].toUpperCase() === "EVEN" ? 0 : (pvi[1] === "D" ? 1 : -1) * +pvi[2]) : null,
      incumbentNote: r[2],
    };
  }
  return out;
}
const ratings = {};
const WIKI = "https://en.wikipedia.org/wiki/";
step("senate ratings", () => {
  const html = download("wiki-senate.html", WIKI + "2026_United_States_Senate_elections", { maxAgeMin: 360 });
  Object.assign(ratings, ratingsTable(html, (name) => {
    const st = byName[name.replace(/\s*\(.*\)$/, "").toLowerCase()];
    return st ? `SEN-${st}${/special/i.test(name) ? "-S" : ""}` : null;
  }));
});
step("governor ratings", () => {
  const html = download("wiki-governor.html", WIKI + "2026_United_States_gubernatorial_elections", { maxAgeMin: 360 });
  Object.assign(ratings, ratingsTable(html, (name) => { const st = byName[name.toLowerCase()]; return st ? `GOV-${st}` : null; }));
});
step("house ratings", () => {
  const html = download("wiki-house.html", WIKI + "2026_United_States_House_of_Representatives_election_ratings", { maxAgeMin: 360 });
  Object.assign(ratings, ratingsTable(html, (name) => {
    const m = name.match(/^(.*?)\s+(at-large|\d+)$/i);
    const st = m && byName[m[1].toLowerCase()];
    if (!st) return null;
    return sid(st, /at-large/i.test(m[2]) || seats[st] === 1 ? 0 : +m[2]);
  }));
});
console.log(`ratings: ${Object.keys(ratings).length} races`);

// ------------------------------------------------------------------ 2026 primary ballots
// The actual ballots cast in each race's 2026 primaries, summed by party, from the results tables on
// the race's Wikipedia article (statewide races) or the state's House article (one section per
// district). Partisan primaries ("Democratic primary results" + "Republican primary results") and
// top-two / blanket primaries (one table, every party) are both read; runoffs are skipped.
// State party names: "Democratic (DFL)" (MN), "Democratic–NPL" (ND), "Democratic / Progressive" (VT).
const PARTY_SUFFIX = String.raw`(?:\s*\(DFL\)|[–-]NPL|\s*\/\s*Progressive)?`;
const primaries = {};
const plainText = (html) => decode(html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/data-mw='[^']*'|data-mw="[^"]*"/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
function primaryTotals(text) {
  const out = {};
  for (const m of text.matchAll(/((?:[A-Z][\w-]*\s){0,3})[Pp]rimary (?:election )?results(?: \[ [\w ]+ \])* Party Candidate Votes %(.*?)Total votes ([\d,]+)/g)) {
    const head = m[1].trim();
    if (/runoff/i.test(head)) continue;
    const votes = { D: [], R: [] };
    for (const row of m[2].matchAll(new RegExp(`\\b(Democratic|Republican)${PARTY_SUFFIX}\\s+[A-Z][^\\d]{1,90}?\\s(\\d{1,3}(?:,\\d{3})*)\\s+\\d+(?:\\.\\d+)?%?`, "g"))) votes[row[1][0]].push(+row[2].replace(/,/g, ""));
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    // A party's primary was contested when at least two candidates won 10% of its vote.
    const contested = (a) => a.filter((v) => v >= 0.1 * sum(a)).length >= 2;
    if (/^Democratic/.test(head)) { if (out.D == null) { out.D = sum(votes.D); out.Dc = contested(votes.D); } }
    else if (/^Republican/.test(head)) { if (out.R == null) { out.R = sum(votes.R); out.Rc = contested(votes.R); } }
    else if (out.D == null && out.R == null) { out.D = sum(votes.D); out.R = sum(votes.R); out.blanket = true; }
  }
  if (!(out.D > 0 && out.R > 0)) return null;
  return out.blanket ? { D: out.D, R: out.R, type: "top-two" } : { D: out.D, R: out.R, type: out.Dc && out.Rc ? "both contested" : out.Dc || out.Rc ? "one side contested" : "neither contested" };
}
step("primaries", () => {
  const page = (title) => { try { const h = download(`wiki-${title.replace(/\W+/g, "_")}.html`, WIKI + title.replace(/ /g, "_"), { maxAgeMin: 1440, retries: 2 }); sleep(300); return plainText(h); } catch { return null; } };
  for (const [, st, name, n] of META) {
    if (st === "DC") continue;
    for (const [id, titles] of [[`SEN-${st}`, [`2026 United States Senate election in ${name}`, `2026 United States Senate special election in ${name}`]], [`GOV-${st}`, [`2026 ${name} gubernatorial election`]]]) {
      for (const t of titles) {
        const text = page(t);
        const res = text && primaryTotals(text);
        if (res) { primaries[t.includes("special") && primaries[id] ? `${id}-S` : id] = { ...res, url: WIKI + t.replace(/ /g, "_") }; break; }
      }
    }
    const houseTitle = `2026 United States House of Representatives election${n === 1 ? "" : "s"} in ${name}`;
    const text = page(houseTitle);
    if (!text) continue;
    if (n === 1) { const res = primaryTotals(text); if (res) primaries[sid(st, 0)] = { ...res, url: WIKI + houseTitle.replace(/ /g, "_") }; continue; }
    const parts = text.split(/District (\d{1,2}) \[ edit \]/);
    for (let i = 1; i < parts.length; i += 2) {
      const d = +parts[i];
      if (d < 1 || d > n || primaries[sid(st, d)]) continue;
      const res = primaryTotals(parts[i + 1]);
      if (res) primaries[sid(st, d)] = { ...res, url: `${WIKI}${houseTitle.replace(/ /g, "_")}#District_${d}` };
    }
  }
});
console.log(`primaries: ${Object.keys(primaries).length} races`);

// ------------------------------------------------------------------ governors' last elections
// Each sitting governor's most recent general-election result (votes by party), from the
// "<year> <State> gubernatorial election" article: an actual vote of the whole state, used to
// model approval without polls.
const governorElections = {};
step("governor elections", () => {
  for (const [st, g] of Object.entries(globalThis.GOVERNORS)) {
    if (st === "DC") continue;
    const name = META.find((m) => m[1] === st)[2];
    const last = g.name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III)$/.test(w)).pop();
    for (let y = 2025; y >= g.since - 1; y--) {
      const title = `${y} ${name} gubernatorial election`;
      let text;
      try { text = plainText(download(`wiki-${title.replace(/\W+/g, "_")}.html`, WIKI + title.replace(/ /g, "_"), { maxAgeMin: 10080, retries: 1 })); sleep(300); }
      catch { continue; }
      const tables = [...text.matchAll(/gubernatorial election(?: \[ [\w ]+ \])* Party Candidate Votes %(?: ±%)?(.*?)Total votes ([\d,]+)/g)];
      const t = tables.at(-1);
      if (!t) continue;
      const v = { D: 0, R: 0 };
      let winner = null, best = 0;
      for (const row of t[1].matchAll(new RegExp(`\\b(Democratic|Republican|Independent)${PARTY_SUFFIX}\\s+([A-Z][^\\d]{1,90}?)\\s(\\d{1,3}(?:,\\d{3})*)\\s+\\d+(?:\\.\\d+)?%?`, "g"))) {
        const n = +row[3].replace(/,/g, "");
        if (row[1] !== "Independent") v[row[1][0]] += n;
        if (n > best) { best = n; winner = row[2]; }
      }
      if (!winner?.includes(last) || !(v.D > 0 && v.R > 0)) continue;
      governorElections[st] = { year: y, D: v.D, R: v.R, total: +t[2].replace(/,/g, ""), url: WIKI + title.replace(/ /g, "_") };
      break;
    }
  }
});
console.log(`governor elections: ${Object.keys(governorElections).length} governors`);

// ------------------------------------------------------------------ prediction markets (Kalshi)
const markets = {};
step("kalshi", () => {
  const series = JSON.parse(download("kalshi-series.json", "https://api.elections.kalshi.com/trade-api/v2/series?category=Elections", { maxAgeMin: 1440 })).series.map((s) => s.ticker);
  const wanted = series.filter((t) => /^(SENATE[A-Z]{2}|GOVPARTY[A-Z]{2}|HOUSE[A-Z]{2}\d{1,2}|HOUSE[A-Z]{2}AL)$/.test(t));
  for (const s of wanted) {
    const ticker = `${s}-26`;
    let ev;
    try { ev = JSON.parse(download(`kalshi-${ticker}.json`, `https://api.elections.kalshi.com/trade-api/v2/events/${ticker}?with_nested_markets=true`, { maxAgeMin: 25, retries: 2 })); }
    catch { continue; }
    sleep(150); // stay well inside the public rate limit
    const mk = ev.event?.markets ?? ev.markets ?? [];
    const price = (m) => {
      const bid = +m.yes_bid_dollars, ask = +m.yes_ask_dollars, last = +m.last_price_dollars;
      return bid > 0 && ask > 0 && ask - bid <= 0.1 ? (bid + ask) / 2 : last || 0;
    };
    let pD = 0, pR = 0;
    const names = {};
    for (const m of mk) {
      const side = m.ticker.split("-").pop();
      const p = price(m);
      if (side.startsWith("D")) { pD += p; if (p >= (names.Dp ?? 0)) { names.D = m.yes_sub_title; names.Dp = p; } }
      else if (side.startsWith("R")) { pR += p; if (p >= (names.Rp ?? 0)) { names.R = m.yes_sub_title; names.Rp = p; } }
    }
    if (pD + pR < 0.5) continue; // illiquid or not a two-party market
    let id;
    let m;
    if ((m = s.match(/^SENATE([A-Z]{2})$/))) id = `SEN-${m[1]}`;
    else if ((m = s.match(/^GOVPARTY([A-Z]{2})$/))) id = `GOV-${m[1]}`;
    else if ((m = s.match(/^HOUSE([A-Z]{2})(AL|\d{1,2})$/))) id = sid(m[1], m[2] === "AL" || seats[m[1]] === 1 ? 0 : +m[2]);
    if (!id) continue;
    markets[id] = { pD: Math.round((pD / (pD + pR)) * 100) / 100, D: names.D, R: names.R, ticker, url: `https://kalshi.com/markets/${s.toLowerCase()}` };
  }
});
console.log(`markets: ${Object.keys(markets).length} races`);

// ------------------------------------------------------------------ prediction markets (Polymarket)
// A second, independently traded market. Party-winner events for each Senate, governor and House race.
const polymarkets = {};
step("polymarket", () => {
  const events = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const page = JSON.parse(download(`polymarket-${offset}.json`, `https://gamma-api.polymarket.com/events?tag_slug=midterms&closed=false&limit=100&offset=${offset}`, { maxAgeMin: 25, retries: 2 }));
    events.push(...page);
    if (page.length < 100) break;
  }
  const stateOf = (slug) => byName[slug.replace(/-/g, " ")];
  for (const ev of events) {
    let id, m;
    if ((m = ev.slug.match(/^([a-z-]+)-senate-election-winner(-\d+)?$/)) && stateOf(m[1])) id = `SEN-${stateOf(m[1])}`;
    else if ((m = ev.slug.match(/^([a-z-]+)-governor-(?:winner-2026|election-winner)$/)) && stateOf(m[1])) id = `GOV-${stateOf(m[1])}`;
    else if ((m = ev.slug.match(/^(?:which-party-will-win-the-house-race-for-the-)?([a-z]{2})-(\d{2}|al)(?:-house-election-winner|-seat)$/))) {
      const st = m[1].toUpperCase();
      if (seats[st]) id = sid(st, m[2] === "al" || seats[st] === 1 ? 0 : +m[2]);
    }
    if (!id) continue;
    const price = (mk) => {
      const bid = +mk.bestBid, ask = +mk.bestAsk, last = +mk.lastTradePrice;
      return bid > 0 && ask > 0 && ask - bid <= 0.1 ? (bid + ask) / 2 : last || 0;
    };
    let pD = 0, pR = 0, pI = 0;
    const names = {};
    const nameOf = (g) => (/\((D|R|I)\)/.test(g) ? g.replace(/\s*\((D|R|I)\)\s*/, "").replace(/^Sen\.\s*/, "").trim() : null);
    for (const mk of ev.markets ?? []) {
      if (!mk.active || mk.closed) continue;
      const q = `${mk.question} ${mk.groupItemTitle ?? ""}`;
      const p = price(mk);
      if (/Democrat|\(D\)/.test(q)) { pD += p; names.D ??= nameOf(mk.groupItemTitle ?? ""); }
      else if (/Republican|\(R\)/.test(q)) { pR += p; names.R ??= nameOf(mk.groupItemTitle ?? ""); }
      else if (/independent/i.test(q)) pI += p;
    }
    if (pD + pR + pI < 0.5 || pR === 0) continue; // candidate-only or illiquid markets are skipped
    // An independent backed by Democrats (e.g. Nebraska) counts on the non-Republican side.
    polymarkets[id] = { pD: Math.round(((pD + pI) / (pD + pI + pR)) * 100) / 100, ...(names.D && { D: names.D }), ...(names.R && { R: names.R }), url: `https://polymarket.com/event/${ev.slug}`, volume: Math.round(+ev.volume || 0) };
  }
});
console.log(`polymarket: ${Object.keys(polymarkets).length} races`);

// ------------------------------------------------------------------ campaign money (FEC)
const money = {};
step("fec", () => {
  const zip = new AdmZip(download("fec-webl26.zip", "https://www.fec.gov/files/bulk-downloads/2026/webl26.zip", { binary: true, maxAgeMin: 360 }));
  const lines = zip.getEntries()[0].getData().toString("latin1").trim().split("\n").map((l) => l.split("|"));
  const best = {};
  for (const c of lines) {
    const [id, name, ici, , party, receipts] = c;
    const st = c[18], dist = +c[19];
    const office = id[0];
    if (office !== "H" && office !== "S") continue;
    if (!seats[st]) continue;
    const key = office === "S" ? `SEN-${st}` : sid(st, seats[st] === 1 ? 0 : dist);
    const side = party === "DEM" ? "D" : party === "REP" ? "R" : party === "IND" ? "I" : null;
    if (!side) continue;
    const entry = { name: name.replace(/\s+/g, " ").trim(), receipts: +receipts, cash: +c[10], incumbent: ici === "I", id };
    best[key] ??= {};
    (best[key][side] ??= []).push(entry);
  }
  for (const [key, sides] of Object.entries(best)) {
    const pick = (list) => list?.sort((a, b) => b.receipts - a.receipts)[0];
    money[key] = { D: pick(sides.D), R: pick(sides.R), I: pick(sides.I) };
  }
});
console.log(`money: ${Object.keys(money).length} races`);

// ------------------------------------------------------------------ members not seeking re-election (Ballotpedia)
const notRunning = { senate: {}, house: {} };
step("ballotpedia", () => {
  const html = download("bp-not-running.html", "https://ballotpedia.org/List_of_U.S._Congress_incumbents_who_are_not_running_for_re-election_in_2026", { maxAgeMin: 360 });
  for (const t of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const rows = rowsOf(t);
    if (!rows[0] || rows[0][0] !== "Name" || !/Date announced/.test(rows[0].join("|"))) continue;
    for (const [name, party, seat] of rows.slice(1)) {
      if (!seat) continue;
      const hm = seat.match(/^(.*?)['’]s? (\d+)(?:st|nd|rd|th) Congressional District|^(.*?)['’]s? At-Large Congressional District/i);
      if (hm) {
        const st = byName[(hm[1] ?? hm[3]).toLowerCase()];
        if (st) notRunning.house[sid(st, hm[2] && seats[st] > 1 ? +hm[2] : 0)] = name;
      } else {
        const st = byName[seat.toLowerCase()];
        if (st) notRunning.senate[st] = name;
      }
    }
  }
});
console.log(`not running: ${Object.keys(notRunning.senate).length} senators, ${Object.keys(notRunning.house).length} House members`);

const file = path.join(ROOT, "data/generated/signals.js");
const payload = {
  sources: {
    ratings: { name: "Expert ratings compiled in Wikipedia's 2026 Senate, gubernatorial and House rating tables", url: WIKI + "2026_United_States_Senate_elections" },
    markets: { name: "Kalshi prediction markets (mid-point of bid/ask)", url: "https://kalshi.com/category/elections" },
    polymarkets: { name: "Polymarket prediction markets (mid-point of bid/ask)", url: "https://polymarket.com/predictions/midterms" },
    governorElections: { name: "Each sitting governor's most recent general election (votes by party), from the state's gubernatorial election article on Wikipedia", url: WIKI + "List_of_current_United_States_governors" },
    primaries: { name: "2026 primary election results (ballots cast by party), as tabulated on each race's Wikipedia article from state election offices", url: WIKI + "2026_United_States_elections" },
    money: { name: "Federal Election Commission, 2025–26 current campaigns summary (webl26)", url: "https://www.fec.gov/data/browse-data/?tab=bulk-data" },
    notRunning: { name: "Ballotpedia, members of Congress not running for re-election in 2026", url: "https://ballotpedia.org/List_of_U.S._Congress_incumbents_who_are_not_running_for_re-election_in_2026" },
  },
  ratings, markets, polymarkets, primaries, governorElections, money, notRunning,
};
const previous = fs.existsSync(file) ? (await import(`${pathToFileURL(file).href}?t=${Date.now()}`), globalThis.RACE_SIGNALS) : null;
// A source that failed or came back nearly empty this run keeps its previous data.
for (const key of ["ratings", "markets", "polymarkets", "primaries", "governorElections", "money"]) {
  const before = Object.keys(previous?.[key] ?? {}).length, now = Object.keys(payload[key]).length;
  if (before && now < before * 0.5) { payload[key] = previous[key]; console.log(`${key}: only ${now} this run (had ${before}); kept previous`); }
}
if (previous && !Object.keys(payload.notRunning.house).length) payload.notRunning = previous.notRunning;
const { fetched: _ignored, ...prevBody } = previous ?? {};
if (previous && JSON.stringify(prevBody) === JSON.stringify(payload)) console.log("signals unchanged");
else {
  fs.writeFileSync(file, `// Generated by scripts/fetch-signals.mjs — do not edit by hand.\nglobalThis.RACE_SIGNALS = ${JSON.stringify({ fetched: new Date().toISOString(), ...payload })};\n`);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
