# Political Percentage — working notes for Claude

## Always ship to the owner's phone
The owner uses the installed phone app at https://nerdcoder10.github.io/Political-percentage-website/
(GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`). Every change they ask for
must reach that app in the same session, without asking first:

1. Make the change, run `npm run stamp` (so open apps notice it) and `npm run check`.
2. Commit and push to the working branch.
3. Open a pull request into `main` and merge it.
4. Confirm the "Deploy app to GitHub Pages" run succeeds and the live URL serves the change.
5. Tell the owner it is live on their phone. The app reloads itself within 30 minutes, or immediately
   when reopened.

If the working branch's earlier PR is already merged, start the next change from the latest `main`.

## Project layout
- `index.html`, `css/`, `js/app.js` — UI; `js/model.js` — all algorithms; `js/pwa.js`, `sw.js`, `manifest.webmanifest` — installable app.
- `data/leaders.js`, `data/polling.js` — curated, sourced data (neutrality rules at the top of polling.js).
- `data/generated/*` — built by `npm run refresh` (elections, official indicators, ratings/markets/FEC signals, version hash).
- Scheduled refresh: `.github/workflows/refresh-data.yml` every 30 minutes.
