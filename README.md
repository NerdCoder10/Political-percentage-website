# Political Percentage

An interactive U.S. political map. It needs no build step: open `index.html` in a browser.

- **Map & Leaders tab.** A full-screen U.S. map colored red or blue by each state's current political lean. Click a state, then any county or city dot, to drill down. Every level shows:
  - **Republican / Democratic / Independent / Other popular-vote percentages**, from the lean algorithm.
  - **Current leaders** (President and national leadership, governors, all 100 senators, all 435 House members, mayors, county executives), each with a **short biography, qualification score and possible next moves**.
  - The **1,000-point Government Performance Rubric** for the nation and every state.
  - The House delegation, with a percentage breakdown for every congressional district.
- **2026 Midterm Forecast tab.** Win probabilities for all 35 Senate races, all 36 governor races, all 435 House seats, and big-city mayoral races. It also shows simulated chances of controlling each chamber. A generic-ballot slider re-runs every race.
- **Rubric & Methodology tab.** The full scoring rubric, weights and goalposts, state rankings, and every formula.

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
3. Shift by the national generic-ballot climate. Competitive areas move more than lopsided ones.
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

**Midterm forecast.** Each race's expected margin is:

partisan baseline + national climate + incumbency + public approval + qualification edge + documented personal vote

The win probability is Φ(margin ÷ σ). Chamber control comes from 20,000 simulations that share a national polling error.

## Public-opinion data and neutrality

`data/polling.js` holds every approval rating, national polling average and 2026 head-to-head poll the site uses. Each entry has its pollster, field date and a link. They were collected from news coverage of published polls in mid-October 2026, and these rules keep them neutral:

1. **Independent pollsters only** count toward averages: universities, news media and nonpartisan firms.
2. **Sponsored polls are excluded.** Polls paid for by campaigns, parties or advocacy groups are listed with their sponsor but don't count, whichever side paid.
3. **Simple averages.** No pollster grades or house-effect corrections.
4. **Neutral imputation.** Governors with no qualifying poll get the median of all sourced governors and are flagged.
5. **Several aggregators for national numbers.** President approval averages RealClearPolitics, Silver Bulletin, NYT and Poliwave; the generic ballot averages Silver Bulletin, RCP, FiftyPlusOne and USPollingData.
6. **Capped poll weight.** Head-to-head polls get at most 70% weight in the forecast; the rest comes from vote-history fundamentals.

The Methodology tab shows every governor's approval with its sources. Each race in the Midterm tab lists the polls behind it.

## Data sources

- County presidential results 2016–2024: [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24)
- 2024 U.S. House results: [fivethirtyeight/election-results](https://github.com/fivethirtyeight/election-results)
- Current members of Congress: [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
- Map: [us-atlas](https://github.com/topojson/us-atlas) (U.S. Census boundaries); 1,000 largest cities: plotly/datasets
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

## Limitations

Governors, mayors (about 85 of the largest cities), county executives, approval ratings and retirement statuses are curated by hand in `data/leaders.js` as of October 2026. Verify them against official sources. Counties and cities without a curated leader show their form of government instead. Mid-decade redistricting in TX, CA, MO, NC, OH and UT isn't fully reflected in district baselines, so those races get extra uncertainty. This is an educational model, not an official forecast.
