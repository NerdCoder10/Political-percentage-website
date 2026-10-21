// Finds a photo for every officeholder and 2026 nominee the site shows, and writes data/generated/photos.js.
//   • Members of Congress — official portraits from the @unitedstates/images project (public domain),
//     falling back to the Wikipedia lead image for members too new to be in it.
//   • Governors, national leaders, mayors and nominees — the lead image of their Wikipedia article.
//     Nominees are matched through the links on each 2026 race's own Wikipedia article, so a common
//     name ("Mike Collins") resolves to the right person; a direct article lookup is accepted only when
//     the page names the person's state and describes a politician or candidate, and a nominee's page
//     must mention 2026.
// Only regular article pages are read (no API key, no API rate limit). Results — including people with
// no photo — are remembered for a week, so scheduled runs only look up new names.
// Run with: npm run fetch:photos   (add --refresh to re-check everyone)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of ["data/states-meta.js", "data/generated/elections.js", "data/generated/house2024.js", "data/generated/congress.js",
  "data/generated/cities.js", "data/leaders.js", "data/state-indicators.js", "data/polling.js", "data/generated/indicators.js", "data/generated/signals.js", "js/model.js"]) await import(path.join(ROOT, f));
const M = globalThis.Model;
const S = globalThis.RACE_SIGNALS;
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const REFRESH = process.argv.includes("--refresh");
const WEEK = 7 * 864e5;
const MAX_LOOKUPS = +(process.env.PHOTO_LOOKUPS ?? 150); // bounds one scheduled run; the rest wait for the next
const WIKI = "https://en.wikipedia.org/wiki/";
const stateName = Object.fromEntries(globalThis.STATES_META.map(([, a, n]) => [a, n]));
const wikiName = (s) => s.replace(/ /g, "_");

const file = path.join(ROOT, "data/generated/photos.js");
const previous = fs.existsSync(file) ? (await import(`${pathToFileURL(file).href}?t=${Date.now()}`), globalThis.PHOTOS) : null;
const fresh = (e) => e && !REFRESH && Date.now() - Date.parse(e.checked) < WEEK;

let lookups = 0, failures = 0;
const TMP = path.join(ROOT, "scripts/raw/photo-page.html");
fs.mkdirSync(path.dirname(TMP), { recursive: true });
// Returns the page, null when it does not exist, or undefined when it could not be read
// (rate limit, network) — a person is never marked "no photo" because of a failed request.
function get(url) {
  lookups++;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let code = "000";
    try { code = execFileSync("curl", ["-sSL", "-m", "45", "-A", UA, "-o", TMP, "-w", "%{http_code}", url]).toString(); } catch { /* network */ }
    if (code === "200") return fs.readFileSync(TMP, "utf8");
    if (code === "404") return null;
    execFileSync("sleep", [String(code === "429" ? 20 * attempt : 3 * attempt)]);
  }
  failures++;
  return undefined;
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// Lead image of an article → a 250-px thumbnail plus its Commons file page (for credit).
const SKIP_IMAGE = /seal|flag|logo|map|signature|coat_of_arms|emblem|\.svg/i;
function leadImage(html) {
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m) return null;
  const url = decode(m[1]).replace(/\?.*$/, "");
  const thumb = url.match(/^https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/(\w+)\/thumb\/(\w\/\w\w)\/([^/]+)\/\d+px-[^/]+$/);
  const orig = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/(\w+)\/(\w\/\w\w)\/([^/]+)$/);
  const [, project, dir, name] = thumb ?? orig ?? [];
  if (!name || SKIP_IMAGE.test(name)) return null;
  return {
    src: thumb ? `https://upload.wikimedia.org/wikipedia/${project}/thumb/${dir}/${name}/250px-${name}` : url,
    file: `https://${project === "commons" ? "commons.wikimedia.org" : "en.wikipedia.org"}/wiki/File:${name}`,
  };
}

// Person links on an article: personKey(link text or title) → article name.
const linkCache = new Map();
function personLinks(article) {
  if (linkCache.has(article)) return linkCache.get(article);
  const page = get(WIKI + wikiName(article));
  if (page === undefined) return new Map(); // not cached: retried by the next person who needs it
  const html = page ?? "";
  const map = new Map();
  // Links may be relative ("/wiki/X") or absolute ("https://en.wikipedia.org/wiki/X"), with other attributes first.
  for (const [, href, title, text] of html.matchAll(/<a [^>]*?href="(?:https:\/\/en\.wikipedia\.org)?\/wiki\/([^"#:?]+)"[^>]*?title="([^"]+)"[^>]*>([^<]{3,60})<\/a>/g)) {
    for (const k of [M.personKey(decode(text)), M.personKey(decode(title))]) if (k.includes(" ") && !map.has(k)) map.set(k, decodeURIComponent(href));
  }
  linkCache.set(article, map);
  return map;
}
function findInLinks(name, articles) {
  const key = M.personKey(name);
  for (const a of articles) { const t = personLinks(a).get(key); if (t) return t; }
  // Same first and last name with a different middle name or initial.
  const w = key.split(" ");
  for (const a of articles) {
    const hits = [...personLinks(a)].filter(([k]) => { const v = k.split(" "); return v[0] === w[0] && v.at(-1) === w.at(-1); });
    if (hits.length === 1) return hits[0][1];
  }
  return null;
}

const byId = {}, byName = {};
const now = new Date().toISOString();
let found = 0, missing = 0, skipped = 0;
// Resolve one person to a photo. `articles` are race pages that link the person; `place` must appear
// on a directly looked-up article page.
function resolve(store, key, { name, wiki, articles = [], place, mention }) {
  const prev = (store === byId ? previous?.byId : previous?.byName)?.[key];
  if (fresh(prev)) { store[key] = prev; skipped++; return; }
  if (lookups >= MAX_LOOKUPS) { if (prev) store[key] = prev; return; }
  const failedBefore = failures;
  let title = wiki ?? findInLinks(name, articles);
  let html = title ? get(WIKI + wikiName(title)) : null;
  // A nominee's article must mention the 2026 race, so a namesake from another era is never used.
  if (html && mention && !mention.test(html.replace(/<[^>]+>/g, " "))) html = null;
  if (!html) {
    for (const t of [name, `${name} (politician)`, `${name} (American politician)`]) {
      const h = get(WIKI + wikiName(t.replace(/\s*\([^)]*inc[^)]*\)/, "")));
      if (!h || /id="disambigbox"/.test(h)) continue; // (every article has "mw-disambig" hatnote links)
      const body = h.replace(/<[^>]+>/g, " ");
      if (place && !body.includes(place)) continue;
      if (!/politician|candidate|Governor|Senate|House of Representatives|mayor|Mayor|nominee/.test(body)) continue;
      if (mention && !mention.test(body)) continue;
      html = h; title = t; break;
    }
  }
  const img = html ? leadImage(html) : null;
  if (img) { store[key] = { ...img, page: WIKI + wikiName(title), checked: now }; found++; }
  else if (failures > failedBefore) { if (prev?.src) store[key] = prev; } // try again next run
  else { store[key] = { src: null, checked: now }; missing++; }
  execFileSync("sleep", ["0.4"]);
}

// ---- Members of Congress ----
const usImg = (id) => `https://unitedstates.github.io/images/congress/225x275/${id}.jpg`;
for (const m of globalThis.CONGRESS) {
  const prev = previous?.byId?.[m.id];
  if (fresh(prev)) { byId[m.id] = prev; skipped++; continue; }
  let ok = false;
  try { ok = execFileSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-I", "-m", "20", usImg(m.id)]).toString() === "200"; } catch { /* network */ }
  if (ok) { byId[m.id] = { src: usImg(m.id), file: "https://github.com/unitedstates/images", page: m.wiki ? WIKI + wikiName(m.wiki) : null, checked: now }; found++; }
  else resolve(byId, m.id, { name: m.name, wiki: m.wiki, place: stateName[m.state] });
}

// ---- Governors, national leaders, mayors ----
const govList = ["List of current United States governors"];
for (const [st, g] of Object.entries(globalThis.GOVERNORS)) resolve(byName, M.personKey(g.name), { name: g.name, articles: govList, place: stateName[st] });
for (const l of globalThis.NATIONAL_LEADERS) if (!l.roster) resolve(byName, M.personKey(l.name), { name: l.name, place: "United States" });
for (const [k, mayor] of Object.entries(globalThis.MAYORS)) {
  const [city] = k.split("|");
  resolve(byName, M.personKey(mayor.name), { name: mayor.name, articles: [`List of mayors of ${city}`], place: city });
}

// ---- 2026 nominees, through each race's Wikipedia article ----
const titleCase = (n) => n.toLowerCase().replace(/(^|[\s,.'-])\w/g, (c) => c.toUpperCase()).replace(/^([^,]+), (.+)$/, "$2 $1");
const forecast = M.forecast();
for (const r of forecast.races) {
  if (!["senate", "governor", "house"].includes(r.office)) continue;
  const state = stateName[r.state];
  const articles = r.office === "senate" ? [`2026 United States Senate election in ${state}`, `2026 United States Senate special election in ${state}`, `2026 United States Senate elections`]
    : r.office === "governor" ? [`2026 ${state} gubernatorial election`, "2026 United States gubernatorial elections"]
    : [`2026 United States House of Representatives election${r.district === 0 ? "" : "s"} in ${state}`];
  const names = new Set();
  for (const src of [r.nominees, r.polymarket, r.market]) for (const side of ["D", "R"]) if (src?.[side]) names.add(src[side]);
  if (!r.nominees && !r.polymarket?.D && !r.market?.D) for (const x of [r.money?.d, r.money?.r]) if (x) names.add(titleCase(x.name));
  for (const n of names) {
    const key = M.personKey(n);
    if (!key.includes(" ") || byName[key]) continue;
    // Sitting members of Congress already have an official portrait.
    const member = globalThis.CONGRESS.find((m) => M.personKey(m.name) === key);
    if (member && byId[member.id]?.src) { byName[key] = byId[member.id]; continue; }
    resolve(byName, key, { name: n.replace(/\s*\([^)]*\)/g, ""), articles, place: state, mention: /\b2026\b/ });
  }
}

// Keep anything a cut-short run did not reach.
for (const [k, v] of Object.entries(previous?.byName ?? {})) byName[k] ??= v;
for (const [k, v] of Object.entries(previous?.byId ?? {})) byId[k] ??= v;
const strip = (o) => Object.fromEntries(Object.entries(o).sort());
const payload = { source: "U.S. Congress official portraits (@unitedstates/images) and Wikipedia / Wikimedia Commons lead images", byId: strip(byId), byName: strip(byName) };
const { fetched: _f, ...prevBody } = previous ?? {};
console.log(`photos: ${found} found, ${missing} without a photo, ${skipped} reused; ${lookups} page lookups, ${failures} failed (retried next run)`);
if (previous && JSON.stringify(prevBody) === JSON.stringify(payload)) console.log("photos unchanged");
else {
  fs.writeFileSync(file, `// Generated by scripts/fetch-photos.mjs — do not edit by hand.\nglobalThis.PHOTOS = ${JSON.stringify({ fetched: now, ...payload })};\n`);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
