// Every current state senator and state representative, from Open States' public bulk files
// (https://open.pluralpolicy.com/data/ — one CSV per state, no key). Writes
// data/generated/state-legislators.js:
//   { ST: { upper: [[name, party, district, photo, page, source?], …], lower: […] } }, plus vacancies and
//   the winners of the November 3, 2026 elections for districts filled from Ballotpedia
// Nebraska's one-house legislature is listed as "upper". Party: D, R, I (independent / other), N (nonpartisan).
// Run with: npm run fetch:state-legislators   (add --refresh to re-download)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/openstates");
fs.mkdirSync(RAW, { recursive: true });
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const REFRESH = process.argv.includes("--refresh");
await import(path.join(ROOT, "data/states-meta.js"));

function csv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const party = (p) => (/^Democratic/.test(p) ? "D" : /^Republican/.test(p) ? "R" : /Nonpartisan/i.test(p) ? "N" : "I");
// Prefer the legislature's own page for each member over third-party links.
const page = (links) => (links || "").split(";").find((u) => /\.(gov|us)\b|legis|senate|house|assembly/i.test(u)) ?? (links || "").split(";")[0] ?? "";

const out = {};
let total = 0;
const bpPerson = new Map(); // legislator row → their Ballotpedia profile URL (from Open States' sources)
const wdPerson = new Map(); // legislator row → Wikidata item (Q…), when Open States has one
const previous = (() => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data/generated/state-legislators.js"), "utf8").replace(/^[\s\S]*?= /, "").replace(/;\s*$/, "")).states ?? {}); } catch { return []; } })();
for (const [, st] of globalThis.STATES_META) {
  if (st === "DC") continue;
  const file = path.join(RAW, `${st}.csv`);
  if (REFRESH || !fs.existsSync(file) || Date.now() - fs.statSync(file).mtimeMs > 864e5) {
    try { execFileSync("curl", ["-sSfL", "-m", "120", "-A", UA, "-o", file + ".tmp", `https://data.openstates.org/people/current/${st.toLowerCase()}.csv`]); fs.renameSync(file + ".tmp", file); }
    catch { console.error(`! ${st}: download failed${fs.existsSync(file) ? ", using the cached copy" : ""}`); if (!fs.existsSync(file)) continue; }
  }
  const people = csv(fs.readFileSync(file, "utf8"));
  const s = (out[st] = { upper: [], lower: [] });
  for (const p of people) {
    const chamber = p.current_chamber === "lower" ? "lower" : p.current_chamber === "upper" || p.current_chamber === "legislature" ? "upper" : null;
    if (!chamber) continue;
    s[chamber].push([p.name, party(p.current_party), p.current_district, p.image || "", page(p.links)]);
    if (p.wikidata) wdPerson.set(s[chamber].at(-1), p.wikidata);
    bpPerson.set(s[chamber].at(-1), ((p.sources || "") + ";" + (p.links || "")).split(";").find((u) => /^https:\/\/ballotpedia\.org\/[^/]+$/.test(u)) ?? null);
    total++;
  }
  const byDistrict = (a, b) => a[2].localeCompare(b[2], "en", { numeric: true }) || a[0].localeCompare(b[0]);
  s.upper.sort(byDistrict); s.lower.sort(byDistrict);
}
// ---------------------------------------------------------------- gaps: Ballotpedia
// Districts on the map with no Open States member are looked up on the district's Ballotpedia page:
// "…is represented by NAME (P)", or a vacancy, plus who won the seat on November 3, 2026.
// Matching uses the same rule as the app (js/app.js normDist): same words in any order, leading
// zeros ignored, "South East" = "Southeast".
const normDist = (x) => String(x ?? "").toLowerCase().replace(/\b(north|south)\s+(east|west)\b/g, "$1$2")
  .replace(/\b(state|senate|house|assembly|senatorial|legislative|representative|delegates?|district|of|no|and|the)\b/g, " ")
  .replace(/\b0+(\d)/g, "$1").split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
const stateName = Object.fromEntries(globalThis.STATES_META.map(([, a, n]) => [a, n]));
const BP = path.join(RAW, "ballotpedia");
fs.mkdirSync(BP, { recursive: true });
function bpTitles(st, chamber, code, name) {
  const S = stateName[st].replace(/ /g, "_");
  const n = String(code).replace(/^0+(?=\w)/, "");
  const plain = name.replace(/\s*(State (Senate|House) District|Senatorial District|District|Assembly District)\s*/gi, " ").trim().replace(/\b0+(\d)/g, "$1");
  if (chamber === "upper") return [`${S}_State_Senate_District_${n}`, `${S}_State_Senate_${plain.replace(/ /g, "_")}_District`, `${S}_State_Senate_${plain.replace(/ /g, "_")}`];
  const lowerName = ["CA", "NV", "NY", "WI"].includes(st) ? "State_Assembly" : st === "NJ" ? "General_Assembly" : ["VA", "MD", "WV"].includes(st) ? "House_of_Delegates" : "House_of_Representatives";
  if (st === "NH") return [`${S}_House_of_Representatives_${plain.replace(/ /g, "_")}`];
  if (st === "MA") return [`${S}_House_of_Representatives_${name.replace(/ /g, "_")}`];
  return [`${S}_${lowerName}_District_${n}`];
}
const bpParty = (p) => (/^D/.test(p) ? "D" : /^R/.test(p) ? "R" : /Nonpartisan/i.test(p) ? "N" : "I");
const filled = { members: 0, vacant: 0, missing: [] };
const vacancies = {}, incoming = {};
for (const [layer, chamber] of [["sldu", "upper"], ["sldl", "lower"]]) {
  const file = path.join(ROOT, `data/generated/districts-${layer}.js`);
  if (!fs.existsSync(file)) continue;
  await import(file);
  for (const g of globalThis.DISTRICTS[layer].objects.d.geometries) {
    const { st, code, name } = g.properties;
    if (!out[st]) continue;
    const want = new Set([normDist(name), normDist(code)]);
    const list = out[st][chamber];
    if (list.some((l) => want.has(normDist(l[2])) || want.has(normDist(String(l[2]).replace(/[AB]$/, ""))))) continue;
    let text = null, url = null, profile = null;
    for (const t of bpTitles(st, chamber, code, name)) {
      const cache = path.join(BP, `${t.replace(/[^\w-]/g, "_")}.html`);
      if (REFRESH || !fs.existsSync(cache) || Date.now() - fs.statSync(cache).mtimeMs > 864e5) {
        try { execFileSync("curl", ["-sSfL", "-m", "60", "-A", UA, "-o", cache, `https://ballotpedia.org/${t}`]); execFileSync("sleep", ["1"]); }
        catch { continue; }
      }
      const raw = fs.readFileSync(cache, "utf8");
      profile = raw.match(/represented by <a href="(https:\/\/ballotpedia\.org\/[^"]+)"/)?.[1] ?? null;
      text = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
      url = `https://ballotpedia.org/${t}`;
      break;
    }
    if (!text) { filled.missing.push(`${st} ${name}`); continue; }
    const cur = text.match(/(?:is|are) (?:currently )?represented by ([A-Z][^()]{2,60}?) \(([A-Za-z]+)\)/);
    const won = [...text.matchAll(/([A-Z][\w.'’ -]{2,50}?) \(([A-Za-z]+)\) won (?:the )?(?:special )?election for the seat on ([A-Z][a-z]+ \d{1,2}, \d{4})/g)].pop();
    if (won) incoming[`${st}|${chamber}|${normDist(name)}`] = [won[1].trim(), bpParty(won[2]), won[3]];
    if (cur && !/vacant/i.test(cur[1])) {
      list.push([cur[1].trim(), bpParty(cur[2]), name, "", url, "Ballotpedia"]);
      if (profile) bpPerson.set(list.at(-1), profile); // their own profile page, e.g. "Walter_Price_(Florida)"
      filled.members++;
    } else if (/\bDistrict [\w -]+ is vacant\b|Incumbent Vacant/.test(text)) {
      // e.g. "District 149 is vacant. It was last represented by Donnie Brown (R)."
      //      "The seat became vacant after Ben Gilmore (R) resigned on June 30, 2026."
      const last = text.match(/is vacant\. It was last represented by ([^.]+?\))/)?.[1] ?? null;
      // Only a recent reason: older paragraphs on the page describe earlier vacancies.
      let why = [...text.matchAll(/(?:The )?seat became vacant (?:after|when|following) ([^.]{5,140})\./g)].map((m) => m[1]).find((w) => /\b202[5-9]\b/.test(w)) ?? null;
      // A sentence cut at an abbreviation ("…Secretary of U.S.", "…as Gov.") is trimmed to its last whole clause.
      if (why && /\b[A-Z][a-z]{0,2}$/.test(why)) why = why.replace(/,?\s+(?:to|after)\s[^,]*$/, "");
      ((vacancies[st] ??= {})[chamber] ??= []).push([name, url, last, why]);
      filled.vacant++;
    } else filled.missing.push(`${st} ${name}`);
  }
}
console.log(`Ballotpedia: ${filled.members} members added, ${filled.vacant} vacancies confirmed, ${Object.keys(incoming).length} Nov. 3 winners; still unknown: ${filled.missing.join(", ") || "none"}`);

// ---------------------------------------------------------------- photos: Ballotpedia
// Legislators with no photo in Open States, or whose photo is only on plain http:// (blocked as
// mixed content on this https site), get the official photo from their Ballotpedia profile, which
// is served over https. Results are remembered in scripts/raw/openstates/photos.json (rechecked
// after 30 days; 7 days when none was found); a run looks up at most BP_PHOTO_LOOKUPS profiles.
const PHOTOS_FILE = path.join(RAW, "photos.json");
const photoCache = (() => { try { return JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8")); } catch { return {}; } })();
const MAX_PHOTO_LOOKUPS = +(process.env.BP_PHOTO_LOOKUPS ?? 200);
let photoLookups = 0, photosFound = 0;
const SKIP_PHOTO = /silhouette|placeholder|default|BP-Initials|no[-_]?image|Ballotpedia[-_]?logo/i;
function bpPhoto(url) {
  const hit = photoCache[url];
  if (hit && Date.now() - Date.parse(hit.checked) < (hit.img ? 30 : 7) * 864e5) return hit.img;
  if (photoLookups >= MAX_PHOTO_LOOKUPS) return hit?.img ?? null;
  photoLookups++;
  let html = "";
  try { html = execFileSync("curl", ["-sSfL", "-m", "45", "-A", UA, url], { maxBuffer: 32 << 20 }).toString(); execFileSync("sleep", ["0.6"]); }
  catch { return hit?.img ?? null; } // not found or network trouble: keep what we had
  const img = html.match(/<img src="(https:\/\/s3\.amazonaws\.com\/ballotpedia-api[^"]+)" class="widget-img"/)?.[1] ?? null;
  photoCache[url] = { img: img && !SKIP_PHOTO.test(img) ? img : null, checked: new Date().toISOString() };
  return photoCache[url].img;
}
for (const st of Object.keys(out)) for (const chamber of ["upper", "lower"]) for (const row of out[st][chamber]) {
  if (row[3] && row[3].startsWith("https:")) continue;
  // Profile from Open States' sources; otherwise Ballotpedia's own "First_Last" page name.
  const url = bpPerson.get(row) ?? `https://ballotpedia.org/${row[0].replace(/\s+/g, "_")}`;
  const img = bpPhoto(url);
  if (img) { row[3] = img; photosFound++; }
}
// Still without an https photo: (1) the same http:// photo over https, when the legislature's site
// serves it; (2) the photo on the person's Wikidata item (Wikimedia Commons, https).
function httpsWorks(url) {
  const key = `https:${url}`;
  const hit = photoCache[key];
  if (hit && Date.now() - Date.parse(hit.checked) < 30 * 864e5) return hit.img;
  let ok = false;
  try { ok = /^2\d\d image\//.test(execFileSync("curl", ["-sSL", "-m", "20", "-A", UA, "-o", "/dev/null", "-w", "%{http_code} %{content_type}", url.replace(/^http:/, "https:")]).toString()); } catch { /* no https */ }
  photoCache[key] = { img: ok ? url.replace(/^http:/, "https:") : null, checked: new Date().toISOString() };
  return photoCache[key].img;
}
const needWd = [];
for (const st of Object.keys(out)) for (const chamber of ["upper", "lower"]) for (const row of out[st][chamber]) {
  if (row[3]?.startsWith("https:")) continue;
  const up = row[3]?.startsWith("http:") ? httpsWorks(row[3]) : null;
  if (up) { row[3] = up; photosFound++; continue; }
  if (wdPerson.has(row)) needWd.push(row);
}
if (needWd.length) {
  const ids = [...new Set(needWd.map((r) => wdPerson.get(r)))];
  const q = `SELECT ?item ?img WHERE { VALUES ?item { ${ids.map((i) => `wd:${i}`).join(" ")} } ?item wdt:P18 ?img }`;
  try {
    const res = JSON.parse(execFileSync("curl", ["-sSf", "-m", "120", "-A", UA, "-G", "https://query.wikidata.org/sparql", "--data-urlencode", `query=${q}`, "-H", "Accept: application/sparql-results+json"]).toString());
    const img = new Map(res.results.bindings.map((b) => [b.item.value.split("/").pop(), b.img.value.replace(/^http:/, "https:") + "?width=250"]));
    for (const row of needWd) { const u = img.get(wdPerson.get(row)); if (u) { row[3] = u; photosFound++; } }
  } catch { console.error("! wikidata photos unavailable this run"); }
}
// (3) Last resort: the portrait on the member's own legislature page (Open States' official link),
// recognized by its label ("representative", "senator", "Member Picture", a profile/headshot class).
// Placeholders, seals and logos are rejected, and the image must load over https.
const PORTRAIT = /<img\b[^>]*>/gi;
const isPortrait = (tag) => /alt="[^"]*(representative|senator|member picture|member photo|portrait|headshot|photo of)[^"]*"|class="[^"]*(profile-photo|member-photo|headshot|portrait)[^"]*"/i.test(tag);
const FAKE = /profile\.png|placeholder|silhouette|no[-_]?photo|seal|logo|dome|blank|default/i;
function officialPhoto(pageUrl) {
  const key = `official:${pageUrl}`;
  const hit = photoCache[key];
  if (hit && Date.now() - Date.parse(hit.checked) < (hit.img ? 30 : 7) * 864e5) return hit.img;
  let img = null;
  try {
    const html = execFileSync("curl", ["-sSfL", "-m", "45", "-A", UA, pageUrl], { maxBuffer: 32 << 20 }).toString();
    for (const tag of html.match(PORTRAIT) ?? []) {
      if (!isPortrait(tag)) continue;
      const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
      if (!src || FAKE.test(src)) continue;
      const abs = new URL(src, pageUrl).href.replace(/^http:/, "https:");
      const ok = /^2\d\d image\//.test(execFileSync("curl", ["-sSL", "-m", "20", "-A", UA, "-o", "/dev/null", "-w", "%{http_code} %{content_type}", abs]).toString());
      if (ok) { img = abs; break; }
    }
    execFileSync("sleep", ["0.5"]);
  } catch { /* site refused or unreachable */ }
  photoCache[key] = { img, checked: new Date().toISOString() };
  return img;
}
for (const st of Object.keys(out)) for (const chamber of ["upper", "lower"]) for (const row of out[st][chamber]) {
  if (row[3]?.startsWith("https:") || !row[4] || /ballotpedia\.org/.test(row[4])) continue;
  const img = officialPhoto(row[4]);
  if (img) { row[3] = img; photosFound++; }
}
fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photoCache));
const noPhoto = Object.values(out).flatMap((s) => [...s.upper, ...s.lower]).filter((r) => !r[3] || !r[3].startsWith("https:")).length;
console.log(`photos: ${photosFound} from Ballotpedia (${photoLookups} lookups); ${noPhoto} legislators still without an https photo`);

if (previous.length && Object.keys(out).length < previous.length * 0.8) { console.error("too few states this run; keeping the previous file"); process.exit(0); }
fs.writeFileSync(path.join(ROOT, "data/generated/state-legislators.js"), `// Generated by scripts/fetch-state-legislators.mjs from Open States and Ballotpedia — do not edit by hand.\nglobalThis.STATE_LEGISLATORS = ${JSON.stringify({ fetched: new Date().toISOString(), source: { name: "Open States (Plural Policy), current legislators; gaps from Ballotpedia district pages", url: "https://open.pluralpolicy.com/data/" }, states: out, vacancies, incoming })};\n`);
console.log(`state legislators: ${total} in ${Object.keys(out).length} states`);
