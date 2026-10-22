// Local leaders for every place on the map, and New England towns as map points.
// Writes data/generated/local.js:
//   • towns   — every New England town and city (CT, MA, RI, VT, NH, ME) from the Census Bureau's
//               county-subdivision gazetteer, with its county (point-in-polygon on the map's own
//               county shapes) and population (Wikipedia infobox). Places already among the 1,000
//               largest cities are not repeated.
//   • leaders — for each of those towns and each of the 1,000 cities: the head of the local
//               (gaps filled from Wikidata's current "head of government" when unambiguous)
//               government from the place's Wikipedia infobox — the mayor or, where there is none,
//               the first selectman / selectboard chair (New England towns), supervisor, council
//               president or town manager — with party when the infobox gives one.
// Only regular article pages are read. Each place is re-checked after 30 days; a scheduled run looks
// up at most LOCAL_LOOKUPS places (default 150), so the full list fills in over several runs.
// Run with: npm run fetch:local   (LOCAL_LOOKUPS=3000 for a complete first pass)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import AdmZip from "adm-zip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/local");
fs.mkdirSync(RAW, { recursive: true });
for (const f of ["data/states-meta.js", "data/generated/cities.js", "data/generated/atlas.js", "data/generated/elections.js"]) await import(path.join(ROOT, f));
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const MAX = +(process.env.LOCAL_LOOKUPS ?? 150);
const RECHECK = 30 * 864e5;
const WIKI = "https://en.wikipedia.org/wiki/";
const stateName = Object.fromEntries(globalThis.STATES_META.map(([, a, n]) => [a, n]));
const NEW_ENGLAND = { "09": "CT", 23: "ME", 25: "MA", 33: "NH", 44: "RI", 50: "VT" };
const now = new Date().toISOString();

const file = path.join(ROOT, "data/generated/local.js");
const previous = fs.existsSync(file) ? (await import(`${pathToFileURL(file).href}?t=${Date.now()}`), globalThis.LOCAL) : null;
const prevLeaders = previous?.leaders ?? {};

// ---------------------------------------------------------------- New England towns (Census gazetteer)
const zipPath = path.join(RAW, "gaz-cousubs.zip");
if (!fs.existsSync(zipPath)) execFileSync("curl", ["-sSfL", "-m", "120", "-A", UA, "-o", zipPath, "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cousubs_national.zip"]);
const gaz = new AdmZip(zipPath).getEntries()[0].getData().toString("utf8").split(/\r?\n/).filter(Boolean);
const head = gaz[0].split("\t").map((h) => h.trim());
const col = (row, k) => row[head.indexOf(k)]?.trim();
const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
const counties = topojson.feature(globalThis.US_ATLAS, globalThis.US_ATLAS.objects.counties).features.filter((f) => globalThis.ELECTIONS.counties[f.id]);
const rings = (g) => (g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : []);
const countyOf = (xy) => counties.find((f) => rings(f.geometry).some((r) => d3.polygonContains(r, xy)))?.id;
const cityKey = (name, st) => `${name.replace(/ Town$/, "")}|${st}`;
const existing = new Set(globalThis.CITIES.map((c) => cityKey(c[0], c[1])));
const townRows = [];
for (const line of gaz.slice(1)) {
  const r = line.split("\t");
  const st = NEW_ENGLAND[col(r, "GEOID")?.slice(0, 2)];
  if (!st || col(r, "FUNCSTAT") !== "A") continue;
  const m = col(r, "NAME").match(/^(.+) (town|city)$/);
  if (!m) continue;
  const name = m[1];
  if (existing.has(`${name}|${st}`)) continue;
  const lat = +col(r, "INTPTLAT"), lon = +col(r, "INTPTLONG");
  const xy = projection([lon, lat]);
  const fips = xy && countyOf(xy);
  if (!fips) continue;
  townRows.push({ name, st, lon: Math.round(lon * 1e4) / 1e4, lat: Math.round(lat * 1e4) / 1e4, fips, kind: m[2] });
}
console.log(`New England towns: ${townRows.length}`);

// ---------------------------------------------------------------- Wikipedia infobox
let lookups = 0, failures = 0;
const TMP = path.join(RAW, "page.html");
function page(title) {
  lookups++;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let code = "000";
    try { code = execFileSync("curl", ["-sSL", "-m", "45", "-A", UA, "-o", TMP, "-w", "%{http_code}", WIKI + encodeURIComponent(title.replace(/ /g, "_"))]).toString(); } catch { /* network */ }
    if (code === "200") return fs.readFileSync(TMP, "utf8");
    if (code === "404") return null;
    execFileSync("sleep", [String(code === "429" ? 20 * attempt : 3 * attempt)]);
  }
  failures++;
  return undefined;
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#91;/g, "[").replace(/&#93;/g, "]");
const text = (h) => decode(h.replace(/<sup[\s\S]*?<\/sup>|<style[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>/g, "; ").replace(/<[^>]+>/g, " ")).replace(/\[\d+\]|\[[a-z]\]/g, "").replace(/\s+/g, " ").trim();
// Head of the local government, by preference.
const TITLES = [
  [/^(acting |interim )?mayor$/i, "Mayor"],
  [/^mayor\s*-\s*president$/i, "Mayor-President"],
  [/^first select(man|woman|person)$/i, "First Selectman"],
  [/(chair|chairman|chairwoman|chairperson).*(select|board of selectmen)|^select ?board chair|^selectboard chair/i, "Selectboard Chair"],
  [/^(town |village |township )?supervisor$/i, "Supervisor"],
  [/(council|commission) (president|chair)|president of the (city |town )?council|chair of the (city |town )?council/i, "Council President"],
  [/^(acting |interim )?(town|city|village) (manager|administrator)$/i, null],
];
const PARTY = { D: "D", DFL: "D", Democratic: "D", R: "R", Republican: "R", I: "I", Independent: "I", L: "I", G: "I", P: "I", Libertarian: "I", Green: "I", Progressive: "I" };
function infobox(html) {
  const box = html.match(/<table class="infobox[\s\S]*?<\/table>/)?.[0];
  if (!box) return null;
  let popHeader = false, pop = null, leader = null, rank = 99, board = null;
  for (const [, row] of box.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const th = row.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1], td = row.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1];
    const label = th ? text(th).replace(/;\s*/g, " ").replace(/^•\s*/, "").trim() : ""; // "Town<br>Manager" → "Town Manager"
    if (/^Population/i.test(label) && !td) { popHeader = true; continue; }
    if (popHeader && pop == null && td && /^(Total|City|Town|Population)$/i.test(label)) { const n = text(td).match(/^[\d,]+/); if (n) pop = +n[0].replace(/,/g, ""); }
    if (!td || /deputy|vice|pro tem|assistant/i.test(label)) continue;
    // A board listed member by member (most Massachusetts towns): kept as a fallback, since the
    // infobox does not say which member chairs it.
    if (/^(select ?board|board of selectmen|board of select ?persons|selectmen|town council|city council)$/i.test(label)) {
      const members = text(td.replace(/<br\s*\/?>|<li>/g, ";")).split(/;/).map((x) => x.replace(/\(.*?\)/g, "").trim()).filter((x) => /^[A-Z][\p{L}.'’ -]{2,60}$/u.test(x) && x.split(" ").length >= 2 && x.split(" ").length <= 5);
      if (members.length >= 2 && !board) board = { title: /council/i.test(label) ? label.replace(/^./, (c) => c.toUpperCase()) : "Select Board", members: members.slice(0, 7) };
      continue;
    }
    const i = TITLES.findIndex(([re]) => re.test(label));
    if (i < 0 || i >= rank) continue;
    const v = text(td).split(/;/)[0];
    const pm = v.match(/\(\s*(D|R|I|L|G|P|DFL|Democratic|Republican|Independent|Libertarian|Green|Progressive)\b[^)]*\)/);
    const name = v.replace(/\(.*$/, "").replace(/[,–—-]\s*(acting|interim).*$/i, "").trim();
    if (!/^[A-Z][\p{L}.'’ -]{2,60}$/u.test(name) || name.split(" ").length < 2 || name.split(" ").length > 6) continue;
    leader = { name, title: TITLES[i][1] ?? label.replace(/^(.)/, (c) => c.toUpperCase()), party: pm ? PARTY[pm[1]] ?? "I" : "N" };
    rank = i;
  }
  if (!leader && board) leader = { name: board.members.join(", "), title: board.title, party: "N", board: true };
  return { leader, pop };
}
function lookup(name, st, extraTitles = []) {
  for (const t of [...extraTitles, `${name}, ${stateName[st]}`]) {
    const h = page(t);
    if (h === undefined) return undefined;
    if (!h || /id="disambigbox"/.test(h)) continue;
    const info = infobox(h);
    if (info) return { ...info, url: WIKI + t.replace(/ /g, "_") };
  }
  return null;
}

// ---------------------------------------------------------------- run
const leaders = {};
const places = [
  ...globalThis.CITIES.map((c) => ({ key: cityKey(c[0], c[1]), name: c[0].replace(/ Town$/, ""), st: c[1], titles: c[0] === "New York" ? ["New York City"] : c[0] === "Washington" && c[1] === "DC" ? ["Washington, D.C."] : [] })),
  ...townRows.map((t) => ({ key: `${t.name}|${t.st}`, name: t.name, st: t.st, titles: [], town: t })),
];
// Oldest first, so every place is refreshed in turn.
places.sort((a, b) => (Date.parse(prevLeaders[a.key]?.checked ?? 0) || 0) - (Date.parse(prevLeaders[b.key]?.checked ?? 0) || 0));
let found = 0;
const only = process.env.LOCAL_ONLY?.split(",");
for (const p of places) {
  const prev = prevLeaders[p.key];
  if (only && !only.includes(p.key)) { if (prev) leaders[p.key] = prev; continue; }
  if ((prev && Date.now() - Date.parse(prev.checked) < RECHECK) || lookups >= MAX) { if (prev) leaders[p.key] = prev; continue; }
  const r = lookup(p.name, p.st, p.titles);
  if (r === undefined) { if (prev) leaders[p.key] = prev; continue; } // network trouble: keep and retry later
  leaders[p.key] = { ...(r?.leader ?? { name: null }), ...(r?.pop && { pop: r.pop }), ...(r?.url && { url: r.url }), checked: now };
  if (r?.leader) found++;
  execFileSync("sleep", ["0.25"]);
}
// ---------------------------------------------------------------- gaps: Wikidata
// Places whose Wikipedia infobox names no leader get the current "head of government" (P6, no end
// date) from Wikidata, one query per state, refreshed weekly. A place with several current heads is
// used only if exactly one has the latest start date; otherwise it stays unfilled rather than guessed.
const STATE_QID = { AL: "Q173", AK: "Q797", AZ: "Q816", AR: "Q1612", CA: "Q99", CO: "Q1261", CT: "Q779", DE: "Q1393", DC: "Q3551781", FL: "Q812", GA: "Q1428", HI: "Q782", ID: "Q1221", IL: "Q1204", IN: "Q1415", IA: "Q1546", KS: "Q1558", KY: "Q1603", LA: "Q1588", ME: "Q724", MD: "Q1391", MA: "Q771", MI: "Q1166", MN: "Q1527", MS: "Q1494", MO: "Q1581", MT: "Q1212", NE: "Q1553", NV: "Q1227", NH: "Q759", NJ: "Q1408", NM: "Q1522", NY: "Q1384", NC: "Q1454", ND: "Q1207", OH: "Q1397", OK: "Q1649", OR: "Q824", PA: "Q1400", RI: "Q1387", SC: "Q1456", SD: "Q1211", TN: "Q1509", TX: "Q1439", UT: "Q829", VT: "Q16551", VA: "Q1370", WA: "Q1223", WV: "Q1371", WI: "Q1537", WY: "Q1214" };
const wdParty = (p) => (/Democratic/.test(p) ? "D" : /Republican/.test(p) ? "R" : p ? "I" : "N");
const wdTitle = (office) => {
  const t = (office || "").replace(/\s+of\s+.*$/i, "").trim();
  return /^mayor$/i.test(t) ? "Mayor" : /first select/i.test(t) ? "First Selectman" : t ? t.replace(/^./, (c) => c.toUpperCase()) : "Mayor";
};
let wdFilled = 0;
const missingStates = new Set(places.filter((p) => !leaders[p.key]?.name).map((p) => p.st));
for (const st of missingStates) {
  const qid = STATE_QID[st];
  if (!qid) continue;
  const cache = path.join(RAW, `wikidata-${st}.csv`);
  if (!fs.existsSync(cache) || Date.now() - fs.statSync(cache).mtimeMs > 7 * 864e5) {
    const q = `SELECT ?place ?placeLabel ?headLabel ?start ?partyLabel ?officeLabel WHERE { ?place wdt:P131* wd:${qid} . ?place p:P6 ?s . ?s ps:P6 ?head . FILTER NOT EXISTS { ?s pq:P582 ?end } FILTER NOT EXISTS { ?head wdt:P570 ?died } OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?head wdt:P102 ?party } OPTIONAL { ?place wdt:P1313 ?office } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    try { execFileSync("curl", ["-sSf", "-m", "120", "-A", UA, "-G", "https://query.wikidata.org/sparql", "--data-urlencode", `query=${q}`, "-H", "Accept: text/csv", "-o", cache]); execFileSync("sleep", ["1"]); }
    catch { console.error(`! wikidata ${st} failed`); continue; }
  }
  const rows = fs.readFileSync(cache, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const cells = []; let cur = "", q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; }
    cells.push(cur);
    const [uri, place, head, start, party, office] = cells;
    return { uri, place, head, start, party, office };
  }).filter((r) => r.head && !/^Q\d+$/.test(r.head));
  const byPlace = new Map();
  for (const r of rows) (byPlace.get(r.place.toLowerCase()) ?? byPlace.set(r.place.toLowerCase(), []).get(r.place.toLowerCase())).push(r);
  for (const p of places) {
    if (p.st !== st || leaders[p.key]?.name) continue;
    const cands = byPlace.get(p.name.toLowerCase());
    if (!cands?.length) continue;
    const dated = cands.filter((c) => c.start).sort((a, b) => b.start.localeCompare(a.start));
    const pick = cands.length === 1 ? cands[0] : dated.length && (dated.length === 1 || dated[0].start !== dated[1].start) ? dated[0] : null;
    if (!pick || (pick.start && pick.start < "2010")) continue; // ambiguous or likely stale
    leaders[p.key] = { ...(leaders[p.key] ?? {}), name: pick.head, title: wdTitle(pick.office), party: wdParty(pick.party), source: "Wikidata", url: pick.uri.replace("http://", "https://"), checked: leaders[p.key]?.checked ?? now };
    wdFilled++;
  }
}
console.log(`Wikidata filled ${wdFilled} more places`);

const towns = townRows.filter((t) => leaders[`${t.name}|${t.st}`]).map((t) => [t.name, t.st, leaders[`${t.name}|${t.st}`].pop ?? 0, t.lon, t.lat, t.fips, t.kind]);
const sorted = Object.fromEntries(Object.entries(leaders).sort(([a], [b]) => a.localeCompare(b)));
console.log(`local leaders: ${Object.values(sorted).filter((l) => l.name).length} of ${places.length} places (${found} found this run, ${lookups} lookups, ${failures} failed); towns on the map: ${towns.length}`);
const payload = { source: "Leaders: each place's Wikipedia infobox. Towns: U.S. Census Bureau 2024 county-subdivision gazetteer.", towns, leaders: sorted };
const { fetched: _f, ...prevBody } = previous ?? {};
if (previous && JSON.stringify(prevBody) === JSON.stringify(payload)) console.log("local leaders unchanged");
else {
  fs.writeFileSync(file, `// Generated by scripts/fetch-local-leaders.mjs — do not edit by hand.\nglobalThis.LOCAL = ${JSON.stringify({ fetched: now, ...payload })};\n`);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
