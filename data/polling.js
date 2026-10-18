// Sourced public-opinion data: approval ratings, national polling averages and 2026 race polls.
// Collected mid-October 2026 from news coverage of published polls. Every number keeps its
// pollster, field date and a link so it can be checked.
//
// NEUTRALITY RULES used to turn the raw polls into the single values the site uses
//   1. Prefer independent pollsters: universities, news media, and nonpartisan firms that publish
//      their methods (Morning Consult, Emerson, Siena, Marist, Quinnipiac, UNH, Marquette, etc.).
//   2. Polls paid for by a campaign, party or advocacy group are listed with `sponsor` and
//      EXCLUDED from the average. If only such polls exist, the value is imputed (rule 5) and the
//      partisan polls are shown for context.
//   3. When polls from Democratic- and Republican-aligned sources both exist and agree, the
//      agreement is noted, but they are still excluded from the average.
//   4. The value is the simple average of the qualifying polls listed: no house-effect
//      adjustments, no pollster "grades". Simple averages are easy to reproduce.
//   5. If no qualifying poll from 2025–2026 exists, the median of all other governors' sourced
//      approvals is imputed and marked `imputed: true`. A neutral middle value is used rather
//      than a guess in either direction.
//   6. National averages use several aggregators whose audiences lean in different directions
//      (RealClearPolitics, Silver Bulletin, New York Times, FiftyPlusOne, Poliwave), so no single
//      outlet's methodology dominates.

globalThis.POLLING = {
  asOf: "2026-10-16",

  national: {
    presidentApproval: {
      value: 37.8,
      polls: [
        { pollster: "RealClearPolitics average", date: "2026-10-08", approve: 37.6, url: "https://en.wikipedia.org/wiki/Opinion_polling_on_the_second_Trump_presidency" },
        { pollster: "Silver Bulletin average", date: "2026-10-08", approve: 36.6, url: "https://en.wikipedia.org/wiki/Opinion_polling_on_the_second_Trump_presidency" },
        { pollster: "New York Times average", date: "2026-10-08", approve: 37.0, url: "https://en.wikipedia.org/wiki/Opinion_polling_on_the_second_Trump_presidency" },
        { pollster: "Poliwave average", date: "2026-10-14", approve: 39.9, disapprove: 58.4, url: "https://www.poliwave.com/us/approval/donald-trump" },
      ],
    },
    genericBallot: {
      value: 8.1, // Democratic lead in points
      polls: [
        { pollster: "Silver Bulletin average", date: "2026-10-15", margin: 8.6, url: "https://www.natesilver.net/p/generic-ballot-average-2026-nate-silver-bulletin-congress-polls" },
        { pollster: "RealClearPolitics average", date: "2026-10-13", D: 50.0, R: 42.0, margin: 8.0, url: "https://www.realclearpolling.com/polls/state-of-the-union/generic-congressional-vote" },
        { pollster: "FiftyPlusOne average", date: "2026-10-16", D: 51.3, R: 43.1, margin: 8.2, url: "https://fiftyplusone.news/polls/generic-ballot/generic-ballot" },
        { pollster: "USPollingData average", date: "2026-10", D: 49.3, R: 41.9, margin: 7.4, url: "https://uspollingdata.com/polls/generic-ballot/" },
      ],
    },
  },

  // How Democrats ran in 2025–26 special elections compared with the 2024 presidential margin
  // of the same districts (points). Used as one of three measures of the national climate.
  specialElections: {
    value: 11.5,
    polls: [
      { pollster: "MultiState (42 contested 2026 state legislative specials, median)", date: "2026-10-14", margin: 10.4, url: "https://www.multistate.us/insider/2026/10/14/democrats-special-election-edge-still-points-to-a-big-year-democratic-wave" },
      { pollster: "MultiState (turnout-weighted)", date: "2026-10-14", margin: 12.6, url: "https://www.multistate.us/elections/special-elections-2026" },
      { pollster: "The Downballot / Brookings (2026 specials, mean)", date: "2026", margin: 11, url: "https://theconversation.com/do-special-election-results-spell-doom-for-republicans-in-2026-274912" },
    ],
  },

  // approve / disapprove in %. `scale: "rating"` = excellent/good vs fair/poor wording (reads lower);
  // `scale: "favorability"` = favorable/unfavorable rather than job approval.
  governorApproval: {
    AL: { polls: [{ pollster: "Morning Consult (via Cook Political Report)", date: "2026-04", approve: 60, disapprove: 34, url: "https://256today.com/poll-ranks-gov-kay-ivey-as-5th-most-popular-gop-governor-nationwide/" }] },
    AK: { polls: [{ pollster: "Morning Consult", date: "2025-12", approve: 37, disapprove: 49, url: "https://www.juneauindependent.com/post/dunleavy-is-least-popular-governor-in-the-us-with-sharp-drop-in-approval-since-fall-poll-finds" }] },
    AZ: { polls: [{ pollster: "AARP (bipartisan team)", date: "2026-08", approve: 45, disapprove: 41, scale: "favorability", url: "https://fox10phoenix.com/election/2026-election-hobbs-leads-biggs-aarp-commissioned-poll-arizona-governors-race" }] },
    AR: { polls: [{ pollster: "Talk Business & Politics–Hendrix College", date: "2024-09", approve: 50, disapprove: 43, url: "https://www.kait8.com/2024/09/17/50-arkansas-voters-approve-governors-job-performance/" }], note: "Most recent published job-approval question; 2026 polls asked only the ballot test." },
    CA: { polls: [
      { pollster: "UC Berkeley IGS", date: "2026-03", approve: 48, url: "https://californiaglobe.com/tag/gavin-newsom-45-approval-rating/" },
      { pollster: "Emerson College", date: "2026", approve: 47, disapprove: 39, url: "https://emersoncollegepolling.com/california-2026-new-poll/" }] },
    CO: { polls: [{ pollster: "Colorado Polling Institute", date: "2026-03", approve: 44, disapprove: 48, scale: "favorability", url: "https://gazette.com/?p=2015135" }],
      excluded: [{ pollster: "Magellan Strategies", sponsor: "Republican-leaning firm, undated", approve: 41, disapprove: 52 }] },
    CT: { polls: [
      { pollster: "Sacred Heart University / WFSB", date: "2026-07", approve: 50.6, url: "https://www.wfsb.com/2026/08/06/exclusive-poll-shows-lamonts-approval-above-50-republican-challenger-fazio-attacks-his-budget-record/" },
      { pollster: "UNH Survey Center", date: "2026-02", approve: 49, disapprove: 45, url: "https://ctmirror.org/2026/02/25/poll-lamont-elliott-stewart-fazio-governor-approval/" },
      { pollster: "Morning Consult", date: "2026-02", approve: 63, disapprove: 30, url: "https://ctmirror.org/2026/02/25/poll-lamont-elliott-stewart-fazio-governor-approval/" }] },
    DE: { polls: [], note: "No public job-approval poll of Gov. Meyer found." },
    FL: { polls: [
      { pollster: "Mason-Dixon", date: "2026-01", approve: 50, disapprove: 46, url: "https://floridaphoenix.com/2026/01/14/desantis-at-50-approval-in-latest-mason-dixon-poll/" },
      { pollster: "Emerson College", date: "2026", approve: 50, disapprove: 40, url: "https://emersoncollegepolling.com/florida-2026-poll-donalds-leads-gop-primary-for-governor-republicans-outpace-democrats-in-florida-elections/" }] },
    GA: { polls: [{ pollster: "Atlanta Journal-Constitution / UGA", date: "2025", approve: 60, url: "https://www.ajc.com/politics/georgia-senate-seat-would-be-toss-up-between-kemp-and-ossoff/ODLMO73SKZCT3IDYG3VWX2T4AE/" }] },
    HI: { polls: [
      { pollster: "Morning Consult", date: "2026", approve: 64, url: "https://www.yahoo.com/news/poll-shows-green-approval-rating-160800697.html" },
      { pollster: "Cook Political Report (cited)", date: "2026", approve: 56, url: "https://www.cookpolitical.com/governor/race/479491" }] },
    ID: { polls: [], note: "No 2025–26 public approval poll found. Little won the May 19, 2026 GOP primary with 59%." },
    IL: { polls: [{ pollster: "Victory Research", date: "2025-11", approve: 52.2, disapprove: 40.9, url: "https://www.fox32chicago.com/news/illinois-jb-pritzker-poll-nov-25" }],
      excluded: [{ pollster: "M3 Strategies", sponsor: "Illinois Policy Institute (advocacy group)", approve: 47.2, disapprove: 50.2, scale: "favorability" }] },
    IN: { polls: [{ pollster: "Morning Consult", date: "2025-12", approve: 45, note: "Net +4 reported; approve estimated from net and typical 12% undecided", url: "https://www.newsweek.com/map-most-least-popular-governors-11459814" }],
      excluded: [
        { pollster: "Public Policy Polling", sponsor: "Democratic-aligned firm", date: "2026-02", approve: 27, note: "reported as 'in the 20s'" },
        { pollster: "North Star Opinion Research", sponsor: "Republican-aligned firm, for Independent Indiana", date: "2025", approve: 24, disapprove: 43, scale: "favorability" }],
      note: "Pollsters aligned with both parties found him far lower than Morning Consult." },
    IA: { polls: [
      { pollster: "Emerson College", date: "2026", approve: 44, disapprove: 47, url: "https://emersoncollegepolling.com/iowa-2026-poll/" },
      { pollster: "Morning Consult", date: "2025-12", approve: 44, disapprove: 49, url: "https://www.newsweek.com/map-most-least-popular-governors-11459814" }] },
    KS: { polls: [
      { pollster: "Emerson College", date: "2026", approve: 46, disapprove: 39, url: "https://emersoncollegepolling.com/?p=3218" },
      { pollster: "Morning Consult", date: "2025-07", approve: 60, url: "https://kansasdems.org/press/new-poll-ks-gov-kelly" },
      { pollster: "Kansas Speaks (Fort Hays State)", date: "2025-10", approve: 47, url: "https://www2.ljworld.com/opinion/2025/oct/31/opinion-kansas-speaks-gov-kelly-still-on-top/" }] },
    KY: { polls: [
      { pollster: "Emerson College", date: "2026-02", approve: 50, disapprove: 37, url: "https://emersoncollegepolling.com/kentucky-2026-poll-gop-voters-split-in-three-way-primary-to-succeed-mcconnell/" },
      { pollster: "Morning Consult", date: "2025-12", approve: 65, url: "https://spectrumnews1.com/ky/louisville/news/2026/02/03/andy-beshear-morning-consult-poll" }] },
    LA: { polls: [{ pollster: "JMC Analytics", date: "2025-10", approve: 39, disapprove: 51, url: "https://www.kadn.com/news/politics/gov-landrys-approval-ratings-drop-across-louisiana-even-in-acadiana/article_10997b45-20b9-4315-872e-f6391540b970.html" }],
      excluded: [{ pollster: "Pelican Institute survey", sponsor: "Pelican Institute (conservative think tank)", date: "2026-02", approve: 43, url: "https://www.wbrz.com/news/poll-shows-approval-ratings-down-for-trump-landry-lawmakers-between-2025-and-2026" }] },
    ME: { polls: [
      { pollster: "UMass Lowell / YouGov", date: "2026", approve: 50, disapprove: 49, url: "https://www.uml.edu/docs/2026-Maine-Gen-Highlights_tcm18-419585.pdf" },
      { pollster: "UNH Survey Center", date: "2025-10", approve: 43, disapprove: 55 },
      { pollster: "Pan Atlantic Research", date: "2025-12", approve: 45, note: "reported 8 pts underwater", url: "https://www.bangordailynews.com/2025/12/10/politics/elections/janet-mills-graham-platner-tied-susan-collins-2026-race/" }] },
    MD: { polls: [{ pollster: "Gonzales Research", date: "2026-01", approve: 52, disapprove: 41, url: "https://marylandmatters.org/2026/01/13/poll-moore-approval-numbers-continue-downward-trend-even-as-most-voters-would-ok-second-term/" }] },
    MA: { polls: [
      { pollster: "UNH Bay State Poll", date: "2026-08", approve: 50, url: "https://scholars.unh.edu/survey_center_polls/992/" },
      { pollster: "Morning Consult", date: "2026-03", approve: 59, url: "https://www.yahoo.com/news/mass-gov-healey-popularity-gets-121435286.html" }] },
    MI: { polls: [{ pollster: "EPIC-MRA", date: "2026-08", approve: 41, disapprove: 55, scale: "rating", url: "https://www.sbam.org/?p=35216" }] },
    MN: { polls: [
      { pollster: "Star Tribune / KARE 11 Minnesota Poll", date: "2026-06", approve: 39, disapprove: 53, url: "https://newsweek.com/tim-walz-minnesota-governor-2026-poll-2133589" },
      { pollster: "KSTP / SurveyUSA", date: "2026-08", approve: 44, note: "net −9 reported", url: "https://kstp.com/wp-content/uploads/2026/08/News-Poll-8-19-26.pdf" }] },
    MS: { polls: [], note: "No public approval poll since 2023 (Siena favorability 46/49)." },
    MO: { polls: [
      { pollster: "Saint Louis University / YouGov", date: "2026-08", approve: 39, disapprove: 49, url: "https://missouriindependent.com/2026/09/10/trump-kehoe-post-first-negative-approval-ratings-in-new-missouri-poll/" },
      { pollster: "Saint Louis University / YouGov", date: "2026-02", approve: 47, disapprove: 42, url: "https://www.slu.edu/research/research-institute/big-ideas/slu-poll/previous-poll-results/february-2026-results.php" }] },
    MT: { polls: [{ pollster: "Montana Free Press / Rutgers-Eagleton", date: "2026-05", approve: 44, disapprove: 47, url: "https://montanafreepress.org/2026/05/28/mtfp-eagleton-poll-2026/" }] },
    NE: { polls: [], excluded: [{ pollster: "Public Policy Polling", sponsor: "Lynne Walz campaign (D)", date: "2026-04", approve: 32, url: "https://nebraskaexaminer.com/2026/04/14/walz-campaign-says-new-poll-shows-pillens-vulnerability/" }],
      note: "Morning Consult (Q4 2025) ranked him among the five least-popular governors; no independent 2026 figure published." },
    NV: { polls: [
      { pollster: "Emerson College", date: "2025-11", approve: 34, disapprove: 36, note: "30% neutral", url: "https://emersoncollegepolling.com/nevada-2026-poll/" },
      { pollster: "Noble Predictive Insights", date: "2026-10", approve: 45, disapprove: 38, scale: "favorability", url: "https://lasvegassun.com/news/2026/jul/22/aaron-ford-and-joe-lombardo-tie-at-44-in-new-nevad/" }],
      excluded: [{ pollster: "Public Policy Polling", sponsor: "Democratic Governors Association", date: "2026-07", approve: 39, disapprove: 45, scale: "favorability" }] },
    NH: { polls: [
      { pollster: "UNH Granite State Poll", date: "2026-08", approve: 49, disapprove: 42, url: "https://indepthnh.org/2026/08/27/ayottes-approval-improves-lead-over-warmington-grows-in-new-hampshire-gubernatorial-race/" },
      { pollster: "Emerson College", date: "2026-03", approve: 38, disapprove: 40 }] },
    NJ: { polls: [
      { pollster: "Morning Consult", date: "2026-07", approve: 55, disapprove: 30, url: "https://newjerseyglobe.com/governor/sherrill-among-nations-most-popular-governors-as-trump-sinks-in-new-jersey/" },
      { pollster: "Fairleigh Dickinson University", date: "2026-03", approve: 58, disapprove: 34, url: "https://newjerseyglobe.com/governor/sherrill-job-approvals-at-58-new-fdu-poll-shows/" },
      { pollster: "Rutgers-Eagleton", date: "2026-04", approve: 45, disapprove: 29, url: "https://njbia.org/poll-nj-residents-give-sherrill-solid-ratings-at-100-days/" }] },
    NM: { polls: [{ pollster: "Albuquerque Journal Poll", date: "2026", approve: 46, url: "https://www.abqjournal.com/tag/journalpollfall2026" }] },
    NY: { polls: [
      { pollster: "Siena Research Institute", date: "2026-06", approve: 53, disapprove: 42, url: "https://spectrumlocalnews.com/nys/capital-region/politics/2026/06/24/poll--hochul-lead-over-blakeman-now-20-points" },
      { pollster: "Siena Research Institute", date: "2026-04", approve: 48, disapprove: 44 },
      { pollster: "Siena Research Institute", date: "2026-03", approve: 53, disapprove: 41 }] },
    NC: { polls: [
      { pollster: "High Point University", date: "2026-08", approve: 52, disapprove: 25, url: "https://www.highpoint.edu/blog/2026/08/hpu-poll-126-majority-of-north-carolina-voters-say-country-headed-in-wrong-direction/" },
      { pollster: "Catawba College / YouGov", date: "2026-08", approve: 58, disapprove: 30, url: "https://www.ncspin.com/new-catawba-college-yougov-poll-shows-trump-disapproval-growing-in-north-carolina" }] },
    ND: { polls: [
      { pollster: "North Dakota Poll (ND News Cooperative)", date: "2025-08", approve: 66, url: "https://www.newscoopnd.org/poll-trump-armstrong-support-firm-fedorchak-cramer-slip/" },
      { pollster: "Morning Consult", date: "2025", approve: 60, url: "https://www.newsweek.com/map-most-least-popular-governors-11459814" }] },
    OH: { polls: [
      { pollster: "Emerson College", date: "2025-12", approve: 26, disapprove: 45, url: "https://emersoncollegepolling.com/ohio-2026-poll-democrats-make-gains-in-races-for-governor-and-us-senate/" },
      { pollster: "Bowling Green State University", date: "2025", approve: 40, disapprove: 53, url: "https://bgindependentmedia.org/?p=119419" }] },
    OK: { polls: [], note: "No 2025–26 public approval poll; Morning Consult (Q4 2025) ranked him among the five least-popular governors." },
    OR: { polls: [
      { pollster: "DHM Research", date: "2026-09", approve: 37, disapprove: 59, note: "Sponsor: Grow Oregon (business coalition), nonpartisan pollster", url: "https://opb.org/article/2026/09/15/oregon-governors-race-tina-kotek-christine-drazan-poll" },
      { pollster: "OPB poll", date: "2026-10", approve: 38, scale: "favorability", url: "https://www.opb.org/article/2026/10/08/new-polls-kotek-may-lead/" }],
      excluded: [{ pollster: "Public Opinion Strategies", sponsor: "Christine Drazan campaign (R)", date: "2026-06", approve: 38, disapprove: 57 }] },
    PA: { polls: [
      { pollster: "Franklin & Marshall College", date: "2026-06", approve: 48, scale: "rating", url: "https://inquirer.com/politics/pennsylvania/shapiro-garrity-pennsylvania-governor-poll-approval-rating-20260618.html" },
      { pollster: "Quinnipiac University", date: "2026", approve: 56, disapprove: 29 }] },
    RI: { polls: [
      { pollster: "UNH Survey Center", date: "2026-08", approve: 20, note: "8 in 10 disapprove", url: "https://www.newsfromthestates.com/node/424749" },
      { pollster: "Pell Center (Salve Regina)", date: "2025-06", approve: 25, url: "https://www.ripbs.org/the-publics-radio/approval-for-mckee-matos-falls-in-new-pell-center-poll?p=56" }] },
    SC: { polls: [{ pollster: "Winthrop University", date: "2025-10", approve: 50, url: "https://www.winthrop.edu/winthroppoll/2025-october-winthroppoll-results.aspx" }] },
    SD: { polls: [{ pollster: "Emerson College / KELOLAND", date: "2026", approve: 26, disapprove: 39, url: "https://emersoncollegepolling.com/south-dakota-2026-poll-toby-doeden-dusty-johnson-lead-primary-for-governor/" }] },
    TN: { polls: [{ pollster: "Vanderbilt University", date: "2026-05", approve: 56, url: "https://www.wkms.org/government-politics/2026-05-20/tennessees-trump-approval-rating-drops-gubernatorial-candidates-lag-behind-outgoing-gov-lee" }] },
    TX: { polls: [{ pollster: "ReconMR", date: "2026-10", approve: 48, disapprove: 51, url: "https://www.kxan.com/wp-content/uploads/sites/40/2026/09/ReconMR-Texas-Poll-September-Release-Final.pdf" }] },
    UT: { polls: [{ pollster: "Deseret News / Hinckley Institute", date: "2026-08", approve: 41, disapprove: 49, url: "https://www.deseret.com/politics/2026/08/17/utah-voters-disapprove-of-governor-cox-senator-lee-and-senator-curtis-in-new-poll/" }] },
    VT: { polls: [
      { pollster: "Vermont Public", date: "2026-09", approve: 45, url: "https://www.vermontpublic.org/local-news/2026-09-28/poll-shows-amanda-janoo-closing-on-phil-scott-governors-race" },
      { pollster: "UNH Survey Center", date: "2026-06", approve: 51, disapprove: 43, url: "https://www.wcax.com/2026/06/30/gov-scotts-approval-4-year-low-according-unh-poll/" }] },
    VA: { polls: [
      { pollster: "VCU Wilder School", date: "2026-07", approve: 44, disapprove: 46, url: "https://cardinalnews.org/2026/07/16/vcu-poll-voters-like-spanbergers-key-policies-but-are-mixed-on-the-governor-herself-heres-why/" },
      { pollster: "Morning Consult", date: "2026-06", approve: 54, disapprove: 37, url: "https://cardinalnews.org/2026/08/18/new-poll-shows-spanberger-approval-rating-has-rebounded-is-it-right/" },
      { pollster: "Washington Post–Schar School", date: "2026-04", approve: 47, disapprove: 46 }] },
    WA: { polls: [
      { pollster: "Cascade PBS / Elway", date: "2025-07", approve: 32, scale: "rating", url: "https://www.cascadepbs.org/news/2025/07/poll-gov-fergusons-first-approval-rate-lowest-in-over-20-years" },
      { pollster: "DHM Research", date: "2025-04", approve: 38, scale: "rating" }] },
    WV: { polls: [], note: "Only district-level 2026 polling found (State Navigate); no statewide approval figure." },
    WI: { polls: [
      { pollster: "Marquette Law School", date: "2026-03", approve: 47, disapprove: 47, url: "https://law.marquette.edu/assets/community/poll/MLSP88/MLSP88ToplinesRV.html" },
      { pollster: "Marquette Law School", date: "2026-02", approve: 49, disapprove: 45, url: "https://law.marquette.edu/assets/community/poll/MLSP87/MLSP87ToplinesRV.html" }] },
    WY: { polls: [
      { pollster: "Morning Consult", date: "2025-12", approve: 64, note: "net +43 reported", url: "https://newsweek.com/map-most-least-popular-governors-11459814" },
      { pollster: "University of Wyoming", date: "2024-11", approve: 41, disapprove: 22, note: "37% no opinion", url: "https://www.uwyo.edu/news/2024/11/uw-survey-finds-disapproval-of-federal-leadership-higher-reviews-for-state-officials.html" }] },
    DC: { polls: [], note: "No recent public approval poll found." },
  },

  // 2026 general-election polling. margin = Democratic (or Democratic-backed independent) lead in points.
  // `basis` explains which polls/averages produced the margin; sponsor-funded polls are listed but excluded.
  races: {
    // ---------- Senate ----------
    "SEN-ME": { D: "Troy Jackson", R: "Susan Collins (inc.)", basis: "RealClearPolitics average, Marist and Washington Post–Schar polls",
      polls: [{ pollster: "RCP average", margin: 1.5 }, { pollster: "Marist", date: "2026-10", D: 51, R: 47, url: "https://maristpoll.marist.edu/polls/midterm-elections-in-maine-october-2026/" }, { pollster: "Washington Post–Schar School", D: 50, R: 46 }] },
    "SEN-TX": { D: "James Talarico", R: "Ken Paxton", basis: "NYT/Siena and Quantus Insights", note: "Ken Paxton defeated Sen. John Cornyn in the May 26 GOP runoff, so the seat is effectively open.",
      polls: [{ pollster: "New York Times / Siena", date: "2026-10", D: 51, R: 45, url: "https://www.realclearpolling.com/latest-polls/senate" }, { pollster: "Quantus Insights", D: 47, R: 47 }] },
    "SEN-OH-S": { D: "Sherrod Brown", R: "Jon Husted (inc.)", basis: "BGSU/YouGov and CNN polls",
      polls: [{ pollster: "Bowling Green State Univ. / YouGov", date: "2026-10", D: 48, R: 42, url: "https://www.newsmax.com/newsfront/senate-democrats-republicans/2026/10/16/id/1273030/" }, { pollster: "CNN", D: 49, R: 43 }] },
    "SEN-GA": { D: "Jon Ossoff (inc.)", R: "Mike Collins", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 8.1, url: "https://www.cnn.com/2026/10/05/politics/10-senate-seats-most-likely-to-flip-2026" }, { pollster: "Trafalgar Group", D: 51, R: 43 }] },
    "SEN-MI": { D: "Abdul El-Sayed", R: "Mike Rogers", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 2.7, url: "https://news.kalshi.com/p/who-will-control-the-senate-2026" }] },
    "SEN-IA": { D: "Josh Turek", R: "Ashley Hinson", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 0.9 }, { pollster: "YouGov", D: 47, R: 46 }, { pollster: "Emerson College", margin: -2 }] },
    "SEN-AK": { D: "Mary Peltola", R: "Dan Sullivan (inc.)", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 1.4 }, { pollster: "New York Times / Siena", date: "2026-10-03", D: 50, R: 43 }] },
    "SEN-NE": { D: "Dan Osborn (independent)", R: "Pete Ricketts (inc.)", basis: "YouGov (only independent poll)", challenger: "I",
      polls: [{ pollster: "YouGov", date: "2026-10", D: 48, R: 47, url: "https://decisiondeskhq.substack.com/p/nebraska-senate-independent-dan-osborn-pete-ricketts" }],
      excluded: [{ pollster: "National Public Affairs", sponsor: "Republican-aligned", D: 43, R: 46 }] },
    "SEN-NH": { D: "Chris Pappas", R: "John E. Sununu", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 6.7 }, { pollster: "YouGov", D: 51, R: 43 }] },
    "SEN-NC": { D: "Roy Cooper", R: "Michael Whatley", basis: "RealClearPolitics average", polls: [{ pollster: "RCP average", margin: 9.5, url: "https://www.realclearpolling.com/polls/senate/general/2026/north-carolina/cooper-vs-whatley" }, { pollster: "WRAL / WSOC", margin: 14, url: "https://www.wral.com/news/nccapitol/wral-nc-us-senate-poll-cooper-whatley-tillis-trump-stein-approval-midterm-october-2026/" }, { pollster: "Trafalgar Group", D: 48.8, R: 40.9 }] },
    "SEN-MN": { D: "Peggy Flanagan", R: "Michele Tafoya", basis: "Poliwave average", polls: [{ pollster: "Poliwave average", margin: 3.8, url: "https://www.poliwave.com/us/fed/projection" }] },
    "SEN-FL-S": { D: "Nixon (Democratic nominee)", R: "Ashley Moody (inc.)", basis: "Stetson University poll and Poliwave average",
      polls: [{ pollster: "Stetson University", D: 41, R: 52 }, { pollster: "Poliwave average", margin: -6.3 }] },

    // ---------- Governor ----------
    "GOV-AZ": { D: "Katie Hobbs (inc.)", R: "Andy Biggs", basis: "Noble Predictive, HighGround and AARP polls (no aggregator average with dates)",
      polls: [{ pollster: "Noble Predictive Insights", date: "2026-08", D: 48, R: 35, url: "https://www.azfamily.com/2026/08/24/new-poll-shows-double-digit-lead-hobbs-over-biggs-arizona-governors-race/" }, { pollster: "HighGround", date: "2026-08", D: 49.5, R: 34.3 }, { pollster: "AARP (bipartisan)", date: "2026-08", margin: 8 }] },
    "GOV-AR": { D: "Fred Love", R: "Sarah Huckabee Sanders (inc.)", basis: "Talk Business & Politics–Hendrix College poll",
      polls: [{ pollster: "Talk Business–Hendrix", date: "2026-08", D: 40, R: 45, url: "https://talkbusiness.net/2026/08/poll-gov-sanders-holds-lead-over-two-opponents/" }] },
    "GOV-CT": { D: "Ned Lamont (inc.)", R: "Fazio (Republican nominee)", basis: "Quinnipiac and Sacred Heart polls",
      polls: [{ pollster: "Quinnipiac University", date: "2026-09", D: 55, R: 38, url: "https://www.fingerlakes1.com/2026/09/16/poll-lamont-leads-fazio-by-17-points-in-connecticut-governor-race/" }, { pollster: "Sacred Heart University", date: "2026-09", D: 48.2, R: 33.9, url: "https://wfsb.com/2026/09/14/exclusive-poll-lamont-maintains-clear-lead-over-fazio-gap-narrows/" }] },
    "GOV-FL": { D: "David Jolly", R: "Byron Donalds", basis: "Stetson University and Mason-Dixon polls",
      polls: [{ pollster: "Stetson University", date: "2026-10-09", D: 41, R: 52, url: "https://newsweek.com/byron-donalds-chances-of-winning-florida-governors-seat-new-poll-shows-12088300" },
        { pollster: "Mason-Dixon / NBC6", date: "2026-10", D: 41, R: 48, url: "https://www.nbcmiami.com/elections/donalds-leads-jolly-in-2026-florida-governors-race-new-poll-finds/3869116/" }],
      excluded: [{ pollster: "James Madison Institute", sponsor: "conservative think tank", D: 42, R: 52 },
        { pollster: "Change Research", sponsor: "Democratic-aligned firm", D: 47, R: 47 }] },
    "GOV-GA": { D: "Keisha Lance Bottoms", R: "Rick Jackson", basis: "Polling average (16 polls, uspollingdata) and InsiderAdvantage",
      polls: [{ pollster: "Average of 16 polls (uspollingdata)", margin: -0.9, url: "https://uspollingdata.com/governors-2026/" }, { pollster: "InsiderAdvantage", date: "2026-10-13", note: "Jackson slim lead", url: "https://www.wrdw.com/2026/10/14/new-poll-shows-ga-governor-candidates-tight-race/" }] },
    "GOV-IA": { D: "Rob Sand", R: "Zach Lahn", basis: "Polling average (18 polls) and Marist",
      polls: [{ pollster: "Average of 18 polls (uspollingdata)", margin: 6.8 }, { pollster: "Marist", D: 52, R: 45 }, { pollster: "Emerson College", D: 48, R: 43 }] },
    "GOV-KS": { D: "Cindy Holscher", R: "Ty Masterson", basis: "Polling average (3 polls)", polls: [{ pollster: "Average of 3 polls (uspollingdata)", margin: -5.4, url: "https://uspollingdata.com/governors-2026/" }] },
    "GOV-MI": { D: "Jocelyn Benson", R: "John James", basis: "Polling average (21 polls)", polls: [{ pollster: "Average of 21 polls (uspollingdata)", margin: 8.5, url: "https://uspollingdata.com/governors-2026/" }] },
    "GOV-NH": { D: "Cinde Warmington", R: "Kelly Ayotte (inc.)", basis: "UNH Granite State Poll",
      polls: [{ pollster: "UNH Granite State Poll", date: "2026-08", D: 39, R: 49, url: "https://www.wcax.com/2026/08/28/unh-poll-shows-ayotte-leads-warmington-nh-governors-race/" }] },
    "GOV-NV": { D: "Aaron Ford", R: "Joe Lombardo (inc.)", basis: "Emerson and Noble Predictive polls",
      polls: [{ pollster: "Emerson College", D: 41, R: 41, url: "https://emersoncollegepolling.com/nevada-2026-poll/" }, { pollster: "Noble Predictive Insights", D: 37, R: 40 }],
      excluded: [{ pollster: "Public Policy Polling", sponsor: "Democratic Governors Association", D: 44, R: 44 }] },
    "GOV-NY": { D: "Kathy Hochul (inc.)", R: "Bruce Blakeman", basis: "Siena Research Institute",
      polls: [{ pollster: "Siena Research Institute", date: "2026-06", D: 52, R: 32, url: "https://spectrumlocalnews.com/nys/capital-region/politics/2026/06/24/poll--hochul-lead-over-blakeman-now-20-points" }] },
    "GOV-OH": { D: "Amy Acton", R: "Vivek Ramaswamy", basis: "Polling average (13 polls)", polls: [{ pollster: "Average of 13 polls (uspollingdata)", margin: 2.9, url: "https://uspollingdata.com/governors-2026/" }] },
    "GOV-OR": { D: "Tina Kotek (inc.)", R: "Christine Drazan", basis: "Oregonian, OPB and DHM Research polls",
      polls: [{ pollster: "The Oregonian / OregonLive", date: "2026-10-08", D: 46, R: 44, url: "https://politicalwire.com/2026/10/08/close-race-for-oregon-governor/" },
        { pollster: "OPB (DHM Research)", date: "2026-09-27", D: 44, R: 46, url: "https://opb.org/pressroom/oregon-governors-race-remains-tight-with-share-of-undecideds-shrinking-according-to-new-opb-commissioned-poll" },
        { pollster: "DHM Research for Grow Oregon", date: "2026-09-11", D: 43, R: 45, url: "https://wweek.com/news/state/2026/09/15/new-poll-shows-drazan-with-slight-lead-in-governors-race" }],
      excluded: [{ pollster: "Public Opinion Strategies", sponsor: "Christine Drazan campaign (R)", D: 44, R: 48 }] },
    "GOV-PA": { D: "Josh Shapiro (inc.)", R: "Stacy Garrity", basis: "Quinnipiac and Franklin & Marshall polls",
      polls: [{ pollster: "Quinnipiac University", date: "2026-10", D: 59, R: 34, url: "https://hoodline.com/2026/10/shapiro-crushes-garrity-by-25-points-in-new-pennsylvania-poll/" }, { pollster: "Franklin & Marshall College", date: "2026-06", D: 50, R: 28 }] },
    "GOV-TX": { D: "Gina Hinojosa", R: "Greg Abbott (inc.)", basis: "Marist, UT/Texas Politics Project and Univision/YouGov polls",
      polls: [{ pollster: "Marist", D: 45, R: 49 }, { pollster: "UT / Texas Politics Project", date: "2026-08", D: 40, R: 45 }, { pollster: "N+ Univision / YouGov", D: 47, R: 47, url: "https://www.newsweek.com/greg-abbott-chances-gina-hinojosa-flip-texas-poll-12559858" }],
      excluded: [{ pollster: "Overton Insights", sponsor: "Texas Public Policy Foundation (conservative)", D: 45.8, R: 46.9 }] },
    "GOV-VT": { D: "Amanda Janoo", R: "Phil Scott (inc.)", basis: "Vermont Public (Scott +10) and UNH (Janoo +6) polls",
      polls: [{ pollster: "Vermont Public", date: "2026-09", D: 34, R: 44, url: "https://www.vermontpublic.org/local-news/2026-09-28/poll-shows-amanda-janoo-closing-on-phil-scott-governors-race" }, { pollster: "UNH Survey Center", date: "2026-09", D: 49, R: 43 }] },
    "GOV-WI": { D: "David Crowley", R: "Tom Tiffany", basis: "Polling average (18 polls)", polls: [{ pollster: "Average of 18 polls (uspollingdata)", margin: 4.0, url: "https://uspollingdata.com/governors-2026/" }] },
  },

  // Nominees / status changes confirmed in 2026 news coverage (used by the bios and forecast).
  events: {
    RI: { governor: "lost-primary", text: "Lost the Sept. 9, 2026 Democratic primary to Helena Foulkes (62%–38%); leaves office in January 2027.", nominee: "Helena Foulkes", url: "https://www.pbs.org/newshour/amp/politics/foulkes-defeats-rhode-islands-mckee-1st-governor-in-8-years-to-lose-a-primary" },
    SD: { governor: "nominated", text: "Won the July 28, 2026 GOP runoff over Toby Doeden (71%–29%); faces Democrat Dan Ahlers.", url: "https://southdakotasearchlight.com/2026/07/28/south-dakota-governor-wins-republican-nomination-to-seek-his-own-term-after-succeeding-noem/" },
    TX: { senator: "lost-primary", text: "Lost the May 26, 2026 GOP runoff to Attorney General Ken Paxton; leaves the Senate in January 2027.", url: "https://abc7.com/post/texas-attorney-general-ken-paxton-wins-gop-runoff-us-senate-ousting-longtime-sen-john-cornyn-ap-projects/19177494/" },
    ME: { governorNote: "Ended her 2026 U.S. Senate campaign; term-limited as governor.", url: "https://www.news5cleveland.com/politics/midterm-elections/maine-gov-mills-ends-senate-bid-paving-way-for-platner-in-democratic-primary" },
    ID: { governor: "nominated", text: "Won the May 19, 2026 GOP primary with 59%; faces Democrat Terri Pickens." },
  },

  // Rubric indicators now come directly from the agencies (data/generated/indicators.js);
  // this hook remains for one-off corrections sourced from news coverage.
  indicatorUpdates: {},
};
