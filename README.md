# Political Percentage

An interactive U.S. political map. It needs no build step: open `index.html` in a browser.

- **Map & Leaders tab.** A full-screen U.S. map colored red or blue by each state's current political lean. Click a state, then any county or city dot, to drill down. Every level shows:
  - **Republican / Democratic / Independent / Other popular-vote percentages**, from the lean algorithm.
  - **Current leaders** (President and national leadership, governors, all 100 senators, all 435 House members, mayors, county executives), each with a **short biography, qualification score and possible next moves**.
  - The **1,000-point Government Performance Rubric** for the nation and every state.
  - The House delegation, with a percentage breakdown for every congressional district.
- **2026 Midterm Forecast tab.** Win probabilities for all 35 Senate races, all 36 governor races, all 435 House seats, and big-city mayoral races. It also shows simulated chances of controlling each chamber. The national lean is neutral: no tilt toward either party.
- **Races by State tab.** Only one state's governor, Senate and House races, plus a **My state** panel of its governor, senators and representatives that is available on every tab.
- **Rubric & Methodology tab.** The full scoring rubric, weights and goalposts, state rankings, and every formula.

## Install it on your phone

The site is an installable web app: it has a manifest, home-screen icons, offline support through a service worker, and an **Install app** button.

1. **Get it a public address (one time).** Merge into `main`, then in GitHub go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The `Deploy app to GitHub Pages` workflow publishes it at `https://nerdcoder10.github.io/political-percentage-website/` and redeploys after every data refresh.
2. **Install it.**
   - **Android (Chrome):** open the link and tap **Install app**, or use ⋮ → *Install app*.
   - **iPhone/iPad (Safari):** open the link, tap **Share** → **Add to Home Screen**. The app's **Install app** button shows these steps.

The installed app opens full-screen from its icon, works offline with the last data it saw, and picks up new data automatically.

## Statistics & Sources tab

The **Stats** tab shows every statistic behind the 1,000-point rubric.
- Pick a measure to see a ranked dot plot of all 50 states with the national figure. Dashed lines mark the scoring goalposts, and hovering or tapping a state shows its points.
- A card names the source agency, dataset, data year and link.
- A full table lists every measure for every state, ranked by total score. Each column is footnoted to a numbered source list, followed by the other datasets the app uses.

## Races by State tab

The **Races** tab researches one state at a time. Pick a state to see only its 2026 **governor, Senate and House** races. You can filter to Senate or House and sort by district or by closest race. Each race card shows:
- the incumbent, the nominees with their photos, the rating and the win probability;
- expandable evidence: fundamentals, expert ratings, Kalshi markets, FEC money and the district's lean;
- the incumbent's biography.

**My state (every tab).** The **My state** button in the top bar opens a panel with that state's governor, two senators and every House member, with photos and bios. It works from any tab. The state is remembered on the device, and it updates whenever you pick a state in the Races tab, the Midterms state filter or the map.

## Run it

```bash
open index.html            # or double-click it; everything is bundled locally
npm run serve              # optional: http://localhost:8080
```

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css`, `js/app.js` | The page and its UI (map, panels, tabs) |
| `js/model.js` | **All algorithms**: lean model, 1,000-pt rubric, qualification score, bios/next moves, midterm forecast |
| `data/leaders.js` | Curated governors, mayors, county executives, national leaders, approval ratings |
| `data/state-indicators.js` | Rubric inputs (economy, health, education, safety, etc.) for every state and the U.S. |
| `data/generated/*.js` | Built by `npm run build:data` from public sources (see below) |
| `scripts/build-data.mjs` | Downloads and compiles election results, the Congress roster, cities and the map |
| `scripts/check.mjs` | Sanity checks (`npm run check`, add `-v` for a summary) |

## The algorithms (short version)

**Political orientation.** Each area's vote shares are built as follows:
1. Weight the presidential vote shares at 60% (2024), 30% (2020) and 10% (2016).
2. Add 20% of the 2020→2024 trend.
3. Shift to a neutral national lean (an even national vote). Competitive areas move more than lopsided ones.
4. Split the non-major vote into **Independent** (60% of third-party voters, plus up to 7% ticket-splitters in competitive areas) and **Other**.

Congressional districts blend the 2024 House vote with the state vote. Cities start from their county's vote plus an urban-core adjustment.

**Rubric (1,000 pts).** The rubric covers nine areas:

| Area | Points |
| --- | --- |
| Economy & Jobs | 180 |
| Public Opinion & Trust | 140 |
| Healthcare | 120 |
| Education | 120 |
| Fiscal Responsibility | 110 |
| Public Safety | 100 |
| Housing & Infrastructure | 90 |
| Democracy & Participation | 70 |
| Environment & Energy | 70 |

Each indicator is scored against fixed best and worst goalposts, so a state's score never depends on how other states do.

**Midterm forecast.** Each race's fundamentals margin is:

partisan baseline + neutral national lean + incumbency + public approval + qualification edge + documented personal vote

The fundamentals are then averaged with expert ratings and prediction markets in three equal thirds (Democratic-leaning, independent, Republican-leaning sources; see below). The win probability is Φ(margin ÷ σ). Chamber control comes from 20,000 simulations that share a national polling error.

## No public polls: real-vote measures and our own modeled polls

The site uses **no public opinion polls** anywhere. Even the largest opinion polls reach well under 0.1% of voters. Instead it relies on measures where **at least 7% of voters** took part, all of them actual ballots:

1. **2026 primary ballots.** Votes cast for each party's candidates in every race's primaries, read from each race's Wikipedia results tables by `scripts/fetch-signals.mjs`. A race uses them only if they reach 7% of its 2024 electorate; today's range is 10–57%.
   - Primary turnout runs high for whichever party is more energized everywhere at once, and the forecast keeps a neutral national lean. So only each race's gap *relative to the average race* counts, at half strength. The correction is the same for both parties.
   - Uncertainty: σ 5 for top-two primaries, 8 when both parties' primaries were contested, and 11 otherwise.
2. **A neutral national lean** replaces the generic-ballot poll: an even national vote, with no tilt toward either party.
3. **Each governor's own last general election.**
   - It gives incumbents running again a personal vote: ½ × (their last margin − their party's presidential margin in the state that cycle).
   - It also feeds their modeled approval.

**Our own modeled polls:**
- **Approval** for every governor and the President comes from one formula for both parties:

  95% × (50 + support ÷ 2 + economy)

  - *Support* is the governor's 2026 forecast margin, or their own last election margin if they are not on the ballot. For the President it is the neutral national lean.
  - *Economy* is the state's unemployment and GDP growth compared with the nation.

  Modeled approval feeds the rubric's Public Opinion category.
- **A modeled likely-voter poll** for every race. It is the predicted vote with an undecided share (3–9%) that grows with the race's uncertainty.

`data/polling.js` still holds primary-season events and official indicator updates. The poll numbers stored there are not used.

## How the forecast combines evidence (no polls, equal thirds)

The forecast uses **no polls**: no head-to-head race polls, generic ballot or approval ratings. Every piece of evidence becomes an estimated margin with an uncertainty, and it is sorted into **three groups that each count exactly one third**:

| Group | Evidence |
| --- | --- |
| **Democratic-leaning sources** (⅓) | Expert ratings from The Economist and Sabato's Crystal Ball (and NBC News whenever it publishes ratings) |
| **Independent sources** (⅓) | Fundamentals (vote history, Cook PVI, neutral national lean, incumbency, qualifications, FEC money, state economy, governors' personal vote); 2026 primary ballots; ratings from Cook, Inside Elections, Decision Desk HQ, Silver Bulletin, Split Ticket and FiftyPlusOne; prediction markets (Kalshi, Polymarket) |
| **Republican-leaning sources** (⅓) | Expert ratings from Fox News and RealClearPolitics |

- **Classification rule.** An outlet is Democratic- or Republican-leaning when [AllSides](https://www.allsides.com/media-bias/ratings) or [Media Bias/Fact Check](https://mediabiasfactcheck.com/) rates it left or right of center and neither rates it the other way. Everything else is independent. The full table, with each rating, is on the Methodology tab and in `M.SOURCE_LEAN` in `js/model.js`.
- **Inside a group.** Signals are combined by precision (1 ÷ σ²). Ratings and markets get a 0.6 discount when a group holds several, and fundamentals far from the ratings and markets are down-weighted.
- **Combining the groups.** The forecast is the plain average of the three groups. Its uncertainty assumes the groups' errors are 50% correlated.
- **Keeping it balanced.** If only one partisan side rates a race, both partisan groups are set aside and the independent group decides it. House seats that no forecaster rates as competitive rest on the independent group alone.

**Predicted popular vote.** Every race also shows each side's predicted vote share, an 80% range and an estimated vote count:
- **Margin:** the same equal-thirds blend as the win probability. A signal at the top of its scale (a Safe rating, or a 95%+ market) is raised to the fundamentals' margin when they agree, so landslides aren't pulled toward 50–50.
- **Third-party share:** the 2024 non-major vote, from the district's House race or otherwise the state's presidential vote. New York and Connecticut use the presidential vote because of fusion voting.
- **Turnout:** 0.75 × the 2024 vote, the average midterm drop-off in 2018 and 2022.

**Following races:** tap ☆ next to any race, then the **Following** filter shows only your races. The list is saved on the device.

## Photos

`scripts/fetch-photos.mjs` (`npm run fetch:photos`) finds photos and writes `data/generated/photos.js`:
- **Members of Congress:** official portraits from [@unitedstates/images](https://github.com/unitedstates/images), which are public domain. Members too new to be in that set get their Wikipedia photo.
- **Governors, national leaders, mayors and 2026 nominees:** the lead image of their Wikipedia article, hosted on Wikimedia Commons and credited on each card.
- **Matching nominees:** a nominee is matched through the links on that race's own Wikipedia article, so common names resolve to the right person. A direct lookup is accepted only when the article names the person's state and describes a politician or candidate.
- **No photo:** people without a photo show their initials.

The scheduled refresh looks up at most 150 people per run. Each result, including "no photo", is re-checked after a week.

## Data sources

- County presidential results 2016–2024: [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24)
- 2024 U.S. House results: [fivethirtyeight/election-results](https://github.com/fivethirtyeight/election-results)
- Current members of Congress: [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
- Map: [us-atlas](https://github.com/topojson/us-atlas) (U.S. Census boundaries); 1,000 largest cities: plotly/datasets
- Prediction markets: [Kalshi](https://kalshi.com/category/elections) and [Polymarket](https://polymarket.com/predictions/midterms) public APIs (no key)
- Rubric indicators: downloaded from the official agencies by `scripts/fetch-indicators.mjs`. Only no-key bulk files are used, so anyone can rerun it.

| Indicator | Source (latest data year) |
| --- | --- |
| Median income, poverty, uninsured, bachelor's degrees, home value ÷ income | Census Bureau, American Community Survey 1-year (2024) |
| Unemployment | Bureau of Labor Statistics, Local Area Unemployment Statistics (latest month) |
| Real GDP growth, regional price parities | Bureau of Economic Analysis (GDP 2025, prices 2024) |
| 8th-grade math | NAEP (2024) |
| Graduation rate | NCES Digest table 219.46 (2021–22) |
| Life expectancy | CDC/NCHS state life tables (2021) |
| Overdose deaths | CDC provisional counts (latest 12 months) |
| Violent and property crime | FBI Crime Data Explorer (2025) |
| Bridges in poor condition | FHWA National Bridge Inventory (2026) |
| Turnout | University of Florida Election Lab (2024) |
| Renewable electricity | Energy Information Administration (2024) |

Credit ratings (S&P) and pension funding (Pew/Equable) have no free official feed, so they stay curated in `data/state-indicators.js`. The site marks them "approx."

```bash
npm install
npm run build:data -- --refresh                 # elections, Congress roster, cities, map
DATA_CONTACT_EMAIL=you@example.com npm run fetch:indicators -- --refresh   # official statistics (BLS asks for a contact address)
npm run check
```

## Automatic refresh (every 30 minutes)

- **Server side:** `.github/workflows/refresh-data.yml` runs `npm run refresh` every 30 minutes and can also be started by hand from the Actions tab. It re-downloads the election results, the Congress roster and all official statistics. Unchanged files are skipped via If-Modified-Since. Then it runs the sanity checks, and it commits `data/generated/` only when a value actually changed.
- **Browser side:** `js/refresh.js` checks `data/generated/version.js`, a hash of all data files, every 30 minutes, and again when a hidden tab becomes visible. If the hash changed, the page reloads itself and stays on the same view.
- **Setup:**
  - GitHub only runs scheduled workflows from the repository's **default branch**, so the schedule starts once this branch is merged into `main`.
  - Add a repository secret `DATA_CONTACT_EMAIL` (Settings → Secrets and variables → Actions). The labor statistics bureau requires a contact address.
  - For visitors to see refreshed data, host the site from `main`, for example with GitHub Pages.
- **What doesn't auto-refresh:** curated officeholders (`data/leaders.js`) are reviewed by hand.
- **Source update frequency:** most agencies publish monthly or annually, so most 30-minute runs find nothing new and make no commit.

## Limitations

Governors, mayors (about 85 of the largest cities), county executives, approval ratings and retirement statuses are curated by hand in `data/leaders.js` as of October 2026. Verify them against official sources. Counties and cities without a curated leader show their form of government instead. Mid-decade redistricting in TX, CA, MO, NC, OH and UT isn't fully reflected in district baselines, so those races get extra uncertainty. This is an educational model, not an official forecast.
