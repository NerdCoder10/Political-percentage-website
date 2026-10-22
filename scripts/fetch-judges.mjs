// Every sitting judge of the 13 U.S. Courts of Appeals, from the Federal Judicial Center's
// biographical directory (public bulk files), with their votes in the en banc cases of
// data/circuit-cases.js. Writes data/generated/judges.js.
// Run with: npm run fetch:judges   (add --refresh to re-download)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/judges");
fs.mkdirSync(RAW, { recursive: true });
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const REFRESH = process.argv.includes("--refresh");
await import(path.join(ROOT, "data/circuit-cases.js"));

function download(name) {
  const file = path.join(RAW, `${name}.csv`);
  if (REFRESH || !fs.existsSync(file) || Date.now() - fs.statSync(file).mtimeMs > 7 * 864e5) {
    try { execFileSync("curl", ["-sSfL", "-m", "300", "-A", UA, "-o", file + ".tmp", `https://www.fjc.gov/sites/default/files/history/${name}.csv`]); fs.renameSync(file + ".tmp", file); }
    catch (e) { if (!fs.existsSync(file)) throw e; console.error(`! ${name}: download failed, using the cached copy`); }
  }
  return fs.readFileSync(file, "utf8").replace(/^﻿/, "");
}
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

const service = csv(download("federal-judicial-service"));
const bios = new Map(csv(download("judges")).map((j) => [j.nid, j]));
const careers = new Map();
for (const c of csv(download("professional-career"))) (careers.get(c.nid) ?? careers.set(c.nid, []).get(c.nid)).push(c);

const CIRCUITS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "District of Columbia", "Federal"].map((c) => `${c} Circuit`);
const year = (d) => (d ? +d.slice(0, 4) : null);
const judges = [];
for (const s of service) {
  if (s["Court Type"] !== "U.S. Court of Appeals" || s["Termination Date"]) continue;
  const circuit = s["Court Name"].replace("U.S. Court of Appeals for the ", "");
  if (!CIRCUITS.includes(circuit)) continue;
  const b = bios.get(s.nid) ?? {};
  const [ayes, nays] = (s["Ayes/Nays"] || "").trim().split("/").map((x) => +x || null);
  const chief = s["Service as Chief Judge, Begin"] && !s["Service as Chief Judge, End"];
  // Up to three earlier positions, most recent first (FJC career entries are oldest first).
  const prior = (careers.get(s.nid) ?? []).map((c) => c["Professional Career"]).filter(Boolean).slice(-3).reverse();
  judges.push({
    nid: s.nid, last: b["Last Name"], first: b["First Name"], name: [b["First Name"], b["Middle Name"], b["Last Name"], b["Suffix"]].filter(Boolean).join(" ").replace(/\s+,/, ","),
    circuit, status: s["Senior Status Date"] ? "senior" : "active", chief: !!chief,
    appointedBy: s["Appointing President"], party: s["Party of Appointing President"] === "Republican" ? "R" : s["Party of Appointing President"] === "Democratic" ? "D" : "I",
    since: year(s["Commission Date"]), senior: year(s["Senior Status Date"]), born: +b["Birth Year"] || null,
    aba: s["ABA Rating"] || null, vote: ayes != null ? { ayes, nays } : s["Senate Vote Type"] === "Voice" ? "voice" : null, prior,
  });
}
// Match each en banc vote to a sitting judge by circuit, last name and first name.
const norm = (x) => (x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const votes = {};
const unmatched = [];
for (const [ci, c] of globalThis.CIRCUIT_CASES.entries()) {
  for (const [list, v] of [[c.yesJudges, "Y"], [c.noJudges, "N"]]) for (const full of list) {
    const [last, first] = full.split(", ");
    const same = judges.filter((x) => x.circuit === c.circuit && norm(x.last) === norm(last));
    // Same circuit and last name; the first name settles it when two judges share a last name.
    const j = same.length === 1 ? same[0] : same.find((x) => norm(x.first).startsWith(norm(first).slice(0, 3)) || norm(first).startsWith(norm(x.first).slice(0, 3)));
    if (j) (votes[j.nid] ??= {})[ci] = v;
    else unmatched.push(`${c.name}: ${full} (no longer on the court, or not matched)`);
  }
}
judges.sort((a, b) => CIRCUITS.indexOf(a.circuit) - CIRCUITS.indexOf(b.circuit) || (a.status > b.status ? 1 : -1) || a.last.localeCompare(b.last));
const out = { fetched: new Date().toISOString(), source: { name: "Federal Judicial Center, Biographical Directory of Article III Federal Judges", url: "https://www.fjc.gov/history/judges/biographical-directory-article-iii-federal-judges-export" }, circuits: CIRCUITS, judges, votes };
fs.writeFileSync(path.join(ROOT, "data/generated/judges.js"), `// Generated by scripts/fetch-judges.mjs — do not edit by hand.\nglobalThis.JUDGES = ${JSON.stringify(out)};\n`);
console.log(`judges: ${judges.length} (${judges.filter((j) => j.status === "active").length} active); en banc votes matched for ${Object.keys(votes).length} judges`);
for (const u of unmatched) console.log("  " + u);
