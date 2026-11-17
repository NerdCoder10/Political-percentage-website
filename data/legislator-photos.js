// Hand-checked portraits for state legislators whose legislature publishes no photo (or a blank
// silhouette) and who have none on Open States, Ballotpedia, Wikidata or Wikipedia. Each was
// confirmed to show the member and to come from a page about them, and is used only while no
// automatic source has a photo. Read by scripts/fetch-state-legislators.mjs.
// [state, chamber, name as Open States/Ballotpedia spell it, image URL, source page]
// Last reviewed: November 2026.
globalThis.LEGISLATOR_PHOTOS = [
  ["VT", "lower", "David Soucy", "https://vtdigger.org/wp-content/uploads/2018/06/DSoucy-e1775759220540.jpg",
    "https://vtdigger.org/2026/04/09/former-state-senator-appointed-to-fill-house-seat-vacated-by-topper-mcfaun/"],
  ["VT", "lower", "Jack Brigham", "https://assets.civicengine.com/uploads/candidate/headshot/842055/842055.jpg",
    "https://www.ballotready.org/people/john-jack-brigham"],
  ["NH", "lower", "Joseph Barton", "https://www.citizenscount.org/sites/default/files/2026-07/joseph-barton.jpg",
    "https://www.citizenscount.org/candidate/joseph-barton"],
  ["OH", "lower", "Caleb Stidham", "https://images.ivoterguide.com/candidates/097035.jpg",
    "https://ivoterguide.com/candidate/97035/race/30156/election/1452"],
];
