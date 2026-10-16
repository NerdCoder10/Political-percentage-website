// Pulls the Government Performance Rubric indicators straight from official U.S. statistical
// agencies and writes data/generated/indicators.js (value + source + vintage for every number).
// Run with: npm run fetch:indicators   (add --refresh to re-download cached files)
//
// Only bulk-download endpoints that need no API key are used, so anyone can reproduce the data.
// Credit ratings (S&P) and pension funding (Pew/Equable) have no free official feed and stay
// curated in data/state-indicators.js.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import { csvParse } from "d3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/official");
fs.mkdirSync(RAW, { recursive: true });
await import(path.join(ROOT, "data/states-meta.js"));
const META = globalThis.STATES_META;
const ABBR = META.map((m) => m[1]);
const byName = Object.fromEntries(META.map(([, a, n]) => [n.toUpperCase(), a]));
byName["UNITED STATES"] = "US";
const byFips = Object.fromEntries(META.map(([f, a]) => [f, a]));
// BLS rejects requests whose user agent has no contact address; set DATA_CONTACT_EMAIL to your own.
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;

// curl honours the environment's proxy settings and BLS/Census user-agent requirements.
function download(name, url, { binary = false } = {}) {
  const file = path.join(RAW, name);
  if (!fs.existsSync(file) || process.argv.includes("--refresh")) {
    for (let attempt = 1; ; attempt++) {
      try { execFileSync("curl", ["-sSfL", "-m", "120", "-A", UA, "-o", file, url]); break; }
      catch (e) { if (attempt === 3) throw e; execFileSync("sleep", [String(2 * attempt)]); }
    }
  }
  return binary ? fs.readFileSync(file) : fs.readFileSync(file, "utf8");
}
const getJSON = (name, url) => JSON.parse(download(name, url));
const cellsOf = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
const rowsOf = (html) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cellsOf(m[1]));
const num = (s) => (s == null || s === "" ? NaN : +String(s).replace(/[,%$]/g, ""));
const r1 = (v) => Math.round(v * 10) / 10;

const out = {};   // out[key] = { source, url, vintage, values: { ST: number } }
const put = (key, meta, values) => {
  const missing = [...ABBR, "US"].filter((a) => !Number.isFinite(values[a]));
  out[key] = { ...meta, values: Object.fromEntries(Object.entries(values).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, r1(v)])) };
  console.log(`${key.padEnd(10)} ${Object.keys(out[key].values).length} values${missing.length ? `  (missing: ${missing.join(" ")})` : ""}`);
};
const step = (name, fn) => { try { fn(); } catch (e) { console.error(`! ${name} failed: ${e.message}`); } };

// ---------------------------------------------------------------- Census ACS 1-year (table-based summary file)
const ACS_YEAR = 2024;
const acs = (table) => {
  const base = `https://www2.census.gov/programs-surveys/acs/summary_file/${ACS_YEAR}/table-based-SF/data/1YRData/`;
  const lines = download(`acs${ACS_YEAR}-${table}.dat`, `${base}acsdt1y${ACS_YEAR}-${table}.dat`).trim().split("\n");
  const head = lines[0].split("|");
  const res = {};
  for (const l of lines.slice(1)) {
    const c = l.split("|");
    const geo = c[0];
    const st = geo === "0100000US" ? "US" : geo.startsWith("0400000US") ? byFips[geo.slice(9)] : null;
    if (st) res[st] = Object.fromEntries(head.map((h, i) => [h, num(c[i])]));
  }
  return res;
};
const ACS_META = (what, table) => ({ source: `U.S. Census Bureau, American Community Survey ${ACS_YEAR} 1-year (table ${table.toUpperCase()})`, url: `https://www2.census.gov/programs-surveys/acs/summary_file/${ACS_YEAR}/table-based-SF/`, vintage: String(ACS_YEAR), what });
let population = {};
step("acs", () => {
  const inc = acs("b19013"), pov = acs("b17001"), ins = acs("b27001"), edu = acs("b15003"), home = acs("b25077"), pop = acs("b01003");
  const map = (src, f) => Object.fromEntries(Object.entries(src).map(([st, r]) => [st, f(r, st)]));
  put("income", ACS_META("Median household income ($ thousands)", "b19013"), map(inc, (r) => r.B19013_E001 / 1000));
  put("poverty", ACS_META("Share of people below the poverty line", "b17001"), map(pov, (r) => (100 * r.B17001_E002) / r.B17001_E001));
  const NO_COVER = [5, 8, 11, 14, 17, 20, 23, 26, 29, 33, 36, 39, 42, 45, 48, 51, 54, 57].map((n) => `B27001_E${String(n).padStart(3, "0")}`);
  put("unins", ACS_META("Share of people with no health insurance", "b27001"), map(ins, (r) => (100 * NO_COVER.reduce((a, k) => a + r[k], 0)) / r.B27001_E001));
  put("bach", ACS_META("Adults 25+ with a bachelor's degree or higher", "b15003"), map(edu, (r) => (100 * (r.B15003_E022 + r.B15003_E023 + r.B15003_E024 + r.B15003_E025)) / r.B15003_E001));
  put("homeRatio", ACS_META("Median home value ÷ median household income", "b25077 / b19013"), map(home, (r, st) => r.B25077_E001 / inc[st].B19013_E001));
  population = map(pop, (r) => r.B01003_E001);
});

// ---------------------------------------------------------------- BLS unemployment (latest month, seasonally adjusted)
step("unemp", () => {
  const html = download("bls-laumstrk.htm", "https://www.bls.gov/web/laus/laumstrk.htm");
  const rows = rowsOf(html);
  const month = rows[0]?.[1]?.replace(/rate$/i, "").trim();
  const values = {};
  for (const c of rows) { const st = byName[c[0]?.toUpperCase()]; if (st) values[st] = num(c[1].split(" ")[0]); }
  const us = download("bls-LNS14000000.htm", "https://data.bls.gov/timeseries/LNS14000000").replace(/<[^>]+>/g, "|").replace(/[\s|]+/g, " ");
  const latest = us.match(/ 2026 ((?:[\d.]+(?:\(\d+\))? ?)+)/);
  if (latest) values.US = num(latest[1].trim().split(" ").pop().replace(/\(\d+\)/, ""));
  put("unemp", { source: `Bureau of Labor Statistics, Local Area Unemployment Statistics (${month}, seasonally adjusted); U.S. rate from CPS series LNS14000000`, url: "https://www.bls.gov/web/laus/laumstrk.htm", vintage: month, what: "Unemployment rate" }, values);
});

// ---------------------------------------------------------------- BEA real GDP growth and regional price parities
// BEA CSVs pad quoted fields with a leading space (` "01000"`), which a strict CSV parser keeps.
const beaCsv = (entry) => csvParse(entry.getData().toString("latin1").replace(/(^|,)\s+"/gm, '$1"').replace(/"\s+(,|$)/gm, '"$1'), (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), (v ?? "").trim()])));
step("bea", () => {
  const gdpZip = new AdmZip(download("bea-SAGDP.zip", "https://apps.bea.gov/regional/zip/SAGDP.zip", { binary: true }));
  const gdpEntry = gdpZip.getEntries().find((e) => /^SAGDP9__ALL_AREAS_\d+_\d+\.csv$/.test(e.entryName));
  const gdpRows = beaCsv(gdpEntry);
  const years = gdpRows.columns.filter((c) => /^\d{4}$/.test(c));
  const last = years.at(-1), prev = years.at(-2);
  const g = {};
  for (const r of gdpRows) {
    if (r.LineCode !== "1") continue;
    const st = r.GeoFIPS === "00000" ? "US" : r.GeoFIPS.endsWith("000") ? byFips[r.GeoFIPS.slice(0, 2)] : null;
    if (st) g[st] = 100 * (num(r[last]) / num(r[prev]) - 1);
  }
  put("gdp", { source: `Bureau of Economic Analysis, real GDP by state (SAGDP9, chained dollars), ${prev}→${last}`, url: "https://apps.bea.gov/regional/zip/SAGDP.zip", vintage: last, what: "Real GDP growth" }, g);

  const rppZip = new AdmZip(download("bea-SARPP.zip", "https://apps.bea.gov/regional/zip/SARPP.zip", { binary: true }));
  const rppEntry = rppZip.getEntries().find((e) => /^SARPP_STATE_\d+_\d+\.csv$/.test(e.entryName));
  const rr = beaCsv(rppEntry);
  const ry = rr.columns.filter((c) => /^\d{4}$/.test(c)).at(-1);
  const rpp = {};
  for (const r of rr) if (r.LineCode === "1") { const st = r.GeoFIPS === "00000" ? "US" : byFips[r.GeoFIPS.slice(0, 2)]; if (st) rpp[st] = num(r[ry]); }
  put("rpp", { source: `Bureau of Economic Analysis, Regional Price Parities (SARPP, all items), ${ry}`, url: "https://apps.bea.gov/regional/zip/SARPP.zip", vintage: ry, what: "Regional price parity (U.S. = 100)" }, rpp);
});

// ---------------------------------------------------------------- NAEP 8th-grade math
step("naep", () => {
  const jur = [...ABBR, "NP"].join(",");
  const d = getJSON("naep-math8-2024.json", `https://www.nationsreportcard.gov/DataService/GetAdhocData.aspx?type=data&subject=mathematics&grade=8&subscale=MRPCM&variable=TOTAL&jurisdiction=${jur}&stattype=MN:MN&Year=2024`);
  const v = {};
  for (const r of d.result) v[r.jurisdiction === "NP" ? "US" : r.jurisdiction] = r.value;
  put("naep", { source: "NCES, National Assessment of Educational Progress, 2024 grade 8 mathematics (average scale score; U.S. = national public)", url: "https://www.nationsreportcard.gov/", vintage: "2024", what: "NAEP 8th-grade math score" }, v);
});

// ---------------------------------------------------------------- NCES graduation rate (ACGR)
step("hsgrad", () => {
  const html = download("nces-dt23_219.46.htm", "https://nces.ed.gov/programs/digest/d23/tables/dt23_219.46.asp");
  const rows = rowsOf(html);
  const v = {};
  // Column 11 holds the latest school year (2021-22) for all students; names may carry footnote digits.
  // States that did not report 2021-22 (IL "‡", TX "---") fall back to 2020-21 (column 10).
  const notes = {};
  for (const c of rows) {
    const st = byName[c[0]?.replace(/\d+$/, "").trim().toUpperCase()];
    if (!st || c.length <= 11) continue;
    v[st] = num(c[11]);
    if (!Number.isFinite(v[st]) && Number.isFinite(num(c[10]))) { v[st] = num(c[10]); notes[st] = "2020-21 (2021-22 not reported)"; }
  }
  put("hsgrad", { source: "NCES Digest of Education Statistics table 219.46, adjusted cohort graduation rate, 2021–22", url: "https://nces.ed.gov/programs/digest/d23/tables/dt23_219.46.asp", vintage: "2021-22", what: "4-year high-school graduation rate", notes }, v);
});

// ---------------------------------------------------------------- CDC life expectancy and overdose deaths
step("lifeexp", () => {
  const d = getJSON("cdc-life-exp-2021.json", "https://data.cdc.gov/resource/it4f-frdc.json?sex=Total&$limit=100");
  const v = {};
  for (const r of d) { const st = byName[r.area.toUpperCase()]; if (st) v[st] = num(r.leb); }
  // The state file has no national row; NCHS Data Brief 456 reports 76.4 years for 2021.
  const brief = download("cdc-db456.htm", "https://www.cdc.gov/nchs/products/databriefs/db456.htm").replace(/<[^>]+>/g, "");
  const us = brief.match(/In 2021, life expectancy at birth was (\d+\.\d) years for the total U/);
  if (us) v.US = num(us[1]);
  put("lifeexp", { source: "CDC/NCHS, U.S. State Life Expectancy by Sex, 2021 (latest machine-readable release); U.S. from NCHS Data Brief 456", url: "https://data.cdc.gov/d/it4f-frdc", vintage: "2021", what: "Life expectancy at birth" }, v);
});
step("overdose", () => {
  const d = getJSON("cdc-overdose.json", "https://data.cdc.gov/resource/xkb8-kh2a.json?indicator=Number%20of%20Drug%20Overdose%20Deaths&period=12%20month-ending&$where=year>='2025'&$limit=5000");
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const latest = {};
  for (const r of d) {
    const t = +r.year * 12 + MONTHS.indexOf(r.month);
    if (!latest[r.state] || t > latest[r.state].t) latest[r.state] = { t, deaths: num(r.predicted_value ?? r.data_value), label: `${r.month} ${r.year}` };
  }
  const v = {};
  for (const [st, x] of Object.entries(latest)) { const a = st === "US" ? "US" : st; if (population[a]) v[a] = (100000 * x.deaths) / population[a]; }
  const label = latest.US?.label ?? Object.values(latest)[0]?.label;
  put("overdose", { source: `CDC/NCHS, Provisional Drug Overdose Death Counts (12 months ending ${label}, predicted), per 100k residents (ACS ${ACS_YEAR} population)`, url: "https://data.cdc.gov/d/xkb8-kh2a", vintage: label, what: "Drug-overdose deaths per 100k" }, v);
});

// ---------------------------------------------------------------- FBI crime rates (Crime Data Explorer)
step("crime", () => {
  const YEAR = 2025;
  const violent = {}, property = {};
  for (const st of ABBR) {
    for (const [kind, store] of [["violent-crime", violent], ["property-crime", property]]) {
      const d = getJSON(`fbi-${kind}-${st}-${YEAR}.json`, `https://cde.ucr.cjis.gov/LATEST/summarized/state/${st}/${kind}?from=01-${YEAR}&to=12-${YEAR}&type=rates`);
      const rates = d.offenses.rates;
      const own = Object.entries(rates).find(([k]) => k.endsWith("Offenses") && !k.startsWith("United States"));
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      if (own && Object.keys(own[1]).length === 12) store[st] = sum(own[1]);
      if (!store.US && rates["United States Offenses"]) store.US = sum(rates["United States Offenses"]);
    }
  }
  const meta = (w) => ({ source: `FBI Crime Data Explorer, ${YEAR} offenses per 100k (sum of monthly rates for reporting agencies)`, url: "https://cde.ucr.cjis.gov/", vintage: String(YEAR), what: w });
  put("violent", meta("Violent crimes per 100k"), violent);
  put("property", meta("Property crimes per 100k"), property);
});

// ---------------------------------------------------------------- FHWA bridge condition
step("bridges", () => {
  const html = download("fhwa-condition26.htm", "https://www.fhwa.dot.gov/bridge/nbi/no10/condition26.cfm");
  const firstTable = html.match(/<table[\s\S]*?<\/table>/)[0]; // "All Bridges"
  const v = {};
  for (const c of rowsOf(firstTable)) {
    const st = c[0] === "TOTALS" ? "US" : byName[c[0]?.toUpperCase()];
    if (st && c.length >= 5) v[st] = (100 * num(c[4])) / num(c[1]);
  }
  put("bridges", { source: "FHWA National Bridge Inventory, Bridge Condition by Highway System 2026 (all bridges, share rated poor by count)", url: "https://www.fhwa.dot.gov/bridge/nbi/no10/condition26.cfm", vintage: "2026", what: "Bridges rated poor" }, v);
});

// ---------------------------------------------------------------- 2024 turnout (University of Florida Election Lab)
step("turnout", () => {
  const csv = download("ufl-turnout-2024.csv", "https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_2024G_v0.4.csv");
  const lines = csv.trim().split("\n").map((l) => l.match(/("[^"]*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "")));
  const h = lines[0];
  const iAbv = h.indexOf("STATE_ABV"), iVep = h.indexOf("VEP_TURNOUT_RATE");
  const v = {};
  for (const c of lines.slice(1)) if (c[iAbv]) v[c[iAbv]] = num(c[iVep]);
  put("turnout", { source: "University of Florida Election Lab (U.S. Elections Project), 2024 general election turnout v0.4, voting-eligible population", url: "https://election.lab.ufl.edu/2024-general-election-turnout/", vintage: "2024", what: "2024 voter turnout (VEP)" }, v);
});

// ---------------------------------------------------------------- EIA renewable share of generation
step("renew", () => {
  const wb = XLSX.read(download("eia-annual_generation_state.xls", "https://www.eia.gov/electricity/data/state/annual_generation_state.xls", { binary: true }));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const year = Math.max(...rows.map((r) => (typeof r[0] === "number" ? r[0] : 0)));
  const RENEW = new Set(["Hydroelectric Conventional", "Wind", "Solar Thermal and Photovoltaic", "Geothermal", "Wood and Wood Derived Fuels", "Other Biomass"]);
  const tot = {}, ren = {};
  for (const r of rows) {
    if (r[0] !== year || r[2] !== "Total Electric Power Industry") continue;
    const st = r[1] === "US-TOTAL" || r[1] === "US-Total" ? "US" : r[1];
    if (r[3] === "Total") tot[st] = r[4];
    if (RENEW.has(r[3])) ren[st] = (ren[st] ?? 0) + (r[4] || 0);
  }
  const v = Object.fromEntries(Object.keys(tot).map((st) => [st, (100 * (ren[st] ?? 0)) / tot[st]]));
  put("renew", { source: `U.S. Energy Information Administration, Net Generation by State (${year}), hydro + wind + solar + geothermal + biomass share`, url: "https://www.eia.gov/electricity/data/state/", vintage: String(year), what: "Electricity from renewables" }, v);
});

const file = path.join(ROOT, "data/generated/indicators.js");
fs.writeFileSync(file, `// Generated by scripts/fetch-indicators.mjs on ${new Date().toISOString().slice(0, 10)} — do not edit by hand.\nglobalThis.OFFICIAL_INDICATORS = ${JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), indicators: out })};\n`);
console.log(`wrote ${path.relative(ROOT, file)} (${Object.keys(out).length} indicators)`);
