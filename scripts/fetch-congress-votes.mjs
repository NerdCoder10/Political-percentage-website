// Political orientation and issue positions for every current member of Congress, from their
// recorded votes. Writes data/generated/congress-votes.js:
//   • ideology — DW-NOMINATE first dimension for the 119th Congress (Voteview, UCLA): −1 most liberal,
//                +1 most conservative, estimated from every roll-call vote the member cast.
//   • keyVotes — roll calls on major 2025–26 bills, one per issue, described by what a Yea vote did.
//   • votes    — each member's Yea / Nay / not voting on those roll calls.
// Run with: npm run fetch:congress-votes   (add --refresh to re-download)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/raw/congress");
fs.mkdirSync(RAW, { recursive: true });
const UA = `Mozilla/5.0 (research script; contact ${process.env.DATA_CONTACT_EMAIL ?? "data@example.org"})`;
const REFRESH = process.argv.includes("--refresh");
await import(path.join(ROOT, "data/generated/congress.js"));

function download(name, url) {
  const file = path.join(RAW, name);
  if (REFRESH || !fs.existsSync(file) || Date.now() - fs.statSync(file).mtimeMs > 864e5) {
    try { execFileSync("curl", ["-sSfL", "-m", "300", "-A", UA, "-o", file + ".tmp", url]); fs.renameSync(file + ".tmp", file); }
    catch (e) { if (!fs.existsSync(file)) throw e; console.error(`! ${name}: download failed, using the cached copy`); }
  }
  return fs.readFileSync(file, "utf8");
}
// Minimal CSV parser (quoted fields, embedded commas).
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

const VV = "https://voteview.com/static/data/out";
const members = csv(download("HS119_members.csv", `${VV}/members/HS119_members.csv`));
const rollcalls = csv(download("HS119_rollcalls.csv", `${VV}/rollcalls/HS119_rollcalls.csv`));
const votesCsv = download("HS119_votes.csv", `${VV}/votes/HS119_votes.csv`);

// One roll call per issue and chamber: the decisive passage vote. "yes" says what a Yea vote did,
// in plain words that neither side would dispute.
const KEY = [
  { id: "obbba", issue: "Taxes, spending & Medicaid", title: "One Big Beautiful Bill Act (2025)", yes: "extend the 2017 tax cuts and cut spending, including Medicaid and food aid", House: { bill: "HR1", roll: 189 }, Senate: { bill: "HR1", roll: 372 } },
  { id: "laken", issue: "Immigration", title: "Laken Riley Act (2025)", yes: "require detention of undocumented immigrants charged with theft or violent crimes", House: { bill: "S5", roll: 22 }, Senate: { bill: "S5", roll: 7 } },
  { id: "rescind", issue: "Spending cuts", title: "Rescissions Act (2025)", yes: "cancel about $9 billion in approved foreign aid and public broadcasting funds", House: { bill: "HR4", roll: 167 }, Senate: { bill: "HR4", roll: 411 } },
  { id: "genius", issue: "Cryptocurrency", title: "GENIUS Act (2025)", yes: "create federal rules for dollar-backed stablecoins", House: { bill: "S1582", roll: 199 }, Senate: { bill: "S1582", roll: 318 } },
  { id: "shutdown", issue: "Government shutdown", title: "Continuing Appropriations Act, 2026 (Nov. 2025)", yes: "end the fall 2025 shutdown with the negotiated funding deal", House: { bill: "HR5371", roll: 284 }, Senate: { bill: "HR5371", roll: 618 } },
  { id: "iran", issue: "War powers", title: "Iran war powers resolution (H.Con.Res. 86, 2026)", yes: "direct the President to remove U.S. forces from hostilities with Iran", House: { bill: "HCONRES86", roll: 559 }, Senate: { bill: "HCONRES86", roll: 843 } },
  { id: "stocks", issue: "Ethics", title: "Stop Insider Trading Act (2026)", yes: "restrict stock trading by members of Congress and their families", House: { bill: "HR7008", roll: 640 }, Senate: { bill: "HR7008", roll: 912, note: "vote to begin debate" } },
  { id: "voterid", issue: "Elections", title: "SAVE Act (2025) / voter photo ID bill (2026)", yes: "require proof of citizenship to register (House) or photo ID to vote (Senate)", House: { bill: "HR22", roll: 101 }, Senate: { bill: "S5271", roll: 890, note: "vote to begin debate" } },
  { id: "epstein", issue: "Government transparency", title: "Epstein Files Transparency Act (2025)", yes: "require release of the Justice Department's Epstein files", House: { bill: "HR4405", roll: 288 } },
  { id: "ukraine", issue: "Foreign policy", title: "Ukraine Support Act (2026)", yes: "authorize more support for Ukraine", House: { bill: "HR2913", roll: 567 } },
  { id: "bba", issue: "Federal budget", title: "Balanced-budget constitutional amendment (2026)", yes: "send states an amendment requiring a balanced federal budget", House: { bill: "HJRES139", roll: 455 } },
  { id: "tariffs", issue: "Trade & tariffs", title: "Ending the emergency behind tariffs on Canada (S.J.Res. 37, 2025)", yes: "end the national emergency used to impose tariffs on Canadian goods", Senate: { bill: "SJRES37", roll: 160 } },
  { id: "russia", issue: "Foreign policy", title: "Russia sanctions bill (H.R. 5334, 2026)", yes: "impose new sanctions on Russia", Senate: { bill: "HR5334", roll: 883 } },
];

const keyVotes = [];
for (const k of KEY) for (const chamber of ["House", "Senate"]) {
  const spec = k[chamber];
  if (!spec) continue;
  const rc = rollcalls.find((r) => r.chamber === chamber && +r.rollnumber === spec.roll);
  // Guard against renumbering: the roll call must still be the named bill.
  if (!rc || rc.bill_number.replace(/\s/g, "").toUpperCase() !== spec.bill) { console.error(`! ${chamber} ${spec.bill}: roll call ${spec.roll} not found`); continue; }
  keyVotes.push({
    id: k.id, chamber, roll: spec.roll, date: rc.date, issue: k.issue, title: k.title, yes: k.yes, note: spec.note ?? null,
    question: rc.vote_question, result: rc.vote_result, yea: +rc.yea_count, nay: +rc.nay_count,
    url: `https://voteview.com/rollcall/RH119${String(spec.roll).padStart(4, "0")}`.replace("RH", chamber === "House" ? "RH" : "RS"),
  });
}

// Current members, matched by Bioguide ID.
const current = new Map(globalThis.CONGRESS.map((m) => [m.id, m]));
const icpsrToBio = new Map();
const ideology = {};
for (const m of members) {
  if (!m.bioguide_id || !current.has(m.bioguide_id) || (m.chamber !== "House" && m.chamber !== "Senate")) continue;
  const want = current.get(m.bioguide_id).type === "sen" ? "Senate" : "House";
  if (m.chamber !== want) continue;
  icpsrToBio.set(`${m.chamber}|${m.icpsr}`, m.bioguide_id);
  if (m.nominate_dim1 !== "") ideology[m.bioguide_id] = { dim1: +m.nominate_dim1, dim2: +m.nominate_dim2, votes: +m.nominate_number_of_votes || null };
}
// cast_code: 1–3 Yea, 4–6 Nay, 7–9 present / not voting.
const wanted = new Map(keyVotes.map((k, i) => [`${k.chamber}|${k.roll}`, i]));
const votes = {};
for (const line of votesCsv.split("\n").slice(1)) {
  const [, chamber, roll, icpsr, code] = line.split(",");
  const i = wanted.get(`${chamber}|${+roll}`);
  if (i == null) continue;
  const bio = icpsrToBio.get(`${chamber}|${icpsr}`);
  if (!bio) continue;
  const c = +code;
  (votes[bio] ??= {})[keyVotes[i].id] = c >= 1 && c <= 3 ? "Y" : c >= 4 && c <= 6 ? "N" : "-";
}
const out = {
  fetched: new Date().toISOString(),
  sources: {
    ideology: { name: "DW-NOMINATE scores, 119th Congress (Voteview, Lewis, Poole, Rosenthal, Boche, Rudkin & Sonnet)", url: "https://voteview.com/data" },
    votes: { name: "Roll-call votes, 119th Congress (Voteview)", url: "https://voteview.com/data" },
  },
  keyVotes, ideology, votes,
};
console.log(`ideology: ${Object.keys(ideology).length} of ${current.size} members; key votes: ${keyVotes.length}; members with votes: ${Object.keys(votes).length}`);
for (const k of keyVotes) console.log(`  ${k.chamber.padEnd(6)} ${String(k.roll).padStart(4)} ${k.date} ${k.title.slice(0, 50).padEnd(50)} ${k.yea}-${k.nay} ${k.result}`);
fs.writeFileSync(path.join(ROOT, "data/generated/congress-votes.js"), `// Generated by scripts/fetch-congress-votes.mjs — do not edit by hand.\nglobalThis.CONGRESS_VOTES = ${JSON.stringify(out)};\n`);
console.log("wrote data/generated/congress-votes.js");
