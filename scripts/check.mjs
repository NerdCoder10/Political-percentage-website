// Sanity checks for the data + model. Run with: npm run check
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of ["data/states-meta.js", "data/generated/elections.js", "data/generated/house2024.js", "data/generated/congress.js",
  "data/generated/cities.js", "data/leaders.js", "data/state-indicators.js", "data/polling.js", "data/generated/indicators.js", "js/model.js"]) await import(path.join(ROOT, f));
const M = globalThis.Model;
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error("FAIL", msg); } };
const sum = (l) => +(l.R + l.D + l.I + l.O).toFixed(1);

check(M.RUBRIC_TOTAL === 1000, `rubric totals ${M.RUBRIC_TOTAL}`);
for (const c of M.RUBRIC) check(c.items.reduce((a, i) => a + i.points, 0) === c.points, `category ${c.id} items != ${c.points}`);
for (const st of Object.keys(M.states)) {
  const l = M.stateLean(st);
  check(Math.abs(sum(l) - 100) < 0.05 && Math.min(l.R, l.D, l.I, l.O) >= 0, `state ${st} lean ${JSON.stringify(l)}`);
  check(globalThis.GOVERNORS[st], `governor missing ${st}`);
  check(globalThis.STATE_INDICATORS[st], `indicators missing ${st}`);
  const r = M.rubricScore(st); check(r.total >= 0 && r.total <= 1000, `rubric ${st}`);
}
for (const f of Object.keys(globalThis.ELECTIONS.counties)) { const l = M.countyLean(f); check(Math.abs(sum(l) - 100) < 0.05 && l.R >= 0 && l.D >= 0, `county ${f}`); }
for (const c of globalThis.CITIES) { const l = M.cityLean(c); check(Math.abs(sum(l) - 100) < 0.05, `city ${c[0]}`); }
for (const k of Object.keys(globalThis.MAYORS)) check(globalThis.CITIES.some((c) => `${c[0]}|${c[1]}` === k), `mayor city not on map: ${k}`);
for (const l of globalThis.NATIONAL_LEADERS) if (l.roster) check(globalThis.CONGRESS.some((m) => m.id === l.roster), `roster id ${l.roster}`);
const f = M.forecast();
const by = (o) => f.races.filter((r) => r.office === o);
check(by("house").length === 435, `house races ${by("house").length}`);
check(by("governor").length === 36, `governor races ${by("governor").length}`);
check(by("senate").length === 35, `senate races ${by("senate").length}`);
check(f.races.every((r) => Number.isFinite(r.pD)), "non-finite probability");

if (process.argv.includes("-v")) {
  console.log("US", M.nationLean(), "rubric", M.rubricScore("US").total);
  for (const st of ["CA", "TX", "PA", "GA", "VT", "WY", "NH"]) console.log(st, M.stateLean(st), M.rubricScore(st).total, M.rubricScore(st).grade);
  console.log("ranks", Object.entries(M.rubricRanks()).slice(0, 10).join(" | "));
  console.log("forecast", f.swing, f.control);
  for (const r of [...by("senate"), ...by("governor")].sort((a, b) => Math.abs(a.pD - 0.5) - Math.abs(b.pD - 0.5)).slice(0, 18))
    console.log(r.title.padEnd(36), r.incumbent.name.padEnd(24), r.status.padEnd(9), r.margin, (r.pD * 100).toFixed(0) + "%", r.rating.label);
  const nyc = globalThis.CITIES.find((c) => c[0] === "New York"); console.log("NYC", M.cityLean(nyc), "Austin", M.cityLean(globalThis.CITIES.find((c) => c[0] === "Austin")));
  console.log("PA-7", M.districtLean("PA", 7), "Ratings", Object.entries(by("house").reduce((a, r) => (a[r.rating.label] = (a[r.rating.label] ?? 0) + 1, a), {})).join(" "));
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
