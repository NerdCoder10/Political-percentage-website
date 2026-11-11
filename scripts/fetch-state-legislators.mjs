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
    let text = null, url = null;
    for (const t of bpTitles(st, chamber, code, name)) {
      const cache = path.join(BP, `${t.replace(/[^\w-]/g, "_")}.html`);
      if (REFRESH || !fs.existsSync(cache) || Date.now() - fs.statSync(cache).mtimeMs > 864e5) {
        try { execFileSync("curl", ["-sSfL", "-m", "60", "-A", UA, "-o", cache, `https://ballotpedia.org/${t}`]); execFileSync("sleep", ["1"]); }
        catch { continue; }
      }
      text = fs.readFileSync(cache, "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
      url = `https://ballotpedia.org/${t}`;
      break;
    }
    if (!text) { filled.missing.push(`${st} ${name}`); continue; }
    const cur = text.match(/(?:is|are) (?:currently )?represented by ([A-Z][^()]{2,60}?) \(([A-Za-z]+)\)/);
    const won = [...text.matchAll(/([A-Z][\w.'’ -]{2,50}?) \(([A-Za-z]+)\) won (?:the )?(?:special )?election for the seat on ([A-Z][a-z]+ \d{1,2}, \d{4})/g)].pop();
    if (won) incoming[`${st}|${chamber}|${normDist(name)}`] = [won[1].trim(), bpParty(won[2]), won[3]];
    if (cur && !/vacant/i.test(cur[1])) {
      list.push([cur[1].trim(), bpParty(cur[2]), name, "", url, "Ballotpedia"]);
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

if (previous.length && Object.keys(out).length < previous.length * 0.8) { console.error("too few states this run; keeping the previous file"); process.exit(0); }
fs.writeFileSync(path.join(ROOT, "data/generated/state-legislators.js"), `// Generated by scripts/fetch-state-legislators.mjs from Open States and Ballotpedia — do not edit by hand.\nglobalThis.STATE_LEGISLATORS = ${JSON.stringify({ fetched: new Date().toISOString(), source: { name: "Open States (Plural Policy), current legislators; gaps from Ballotpedia district pages", url: "https://open.pluralpolicy.com/data/" }, states: out, vacancies, incoming })};\n`);
console.log(`state legislators: ${total} in ${Object.keys(out).length} states`);
