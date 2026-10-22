// The nine sitting Supreme Court justices and how each voted in landmark cases (2022–2025 terms).
// Every lineup is from the published opinion; links go to each case's Wikipedia article, which cites
// the slip opinion. "Y" = voted for the outcome described in `yes`; "N" = against; "P" = concurred
// only in part (counted as neither); "-" = not on the Court / recused.
// `dir` says which side the `yes` outcome is generally described as taking: "C" conservative, "L" liberal.
// Last reviewed: October 2026. Cases from the 2025–26 term will be added once reviewed.

globalThis.SCOTUS = {
  justices: [
    { id: "roberts", name: "John G. Roberts Jr.", role: "Chief Justice", born: 1955, since: 2005, appointedBy: "George W. Bush", party: "R", prior: ["Judge, U.S. Court of Appeals for the D.C. Circuit (2003–2005)", "Principal Deputy Solicitor General"], wiki: "John_Roberts" },
    { id: "thomas", name: "Clarence Thomas", role: "Associate Justice", born: 1948, since: 1991, appointedBy: "George H. W. Bush", party: "R", prior: ["Judge, U.S. Court of Appeals for the D.C. Circuit (1990–1991)", "Chair, Equal Employment Opportunity Commission"], wiki: "Clarence_Thomas" },
    { id: "alito", name: "Samuel A. Alito Jr.", role: "Associate Justice", born: 1950, since: 2006, appointedBy: "George W. Bush", party: "R", prior: ["Judge, U.S. Court of Appeals for the Third Circuit (1990–2006)", "U.S. Attorney for New Jersey"], wiki: "Samuel_Alito" },
    { id: "sotomayor", name: "Sonia Sotomayor", role: "Associate Justice", born: 1954, since: 2009, appointedBy: "Barack Obama", party: "D", prior: ["Judge, U.S. Court of Appeals for the Second Circuit (1998–2009)", "U.S. District Judge, S.D.N.Y."], wiki: "Sonia_Sotomayor" },
    { id: "kagan", name: "Elena Kagan", role: "Associate Justice", born: 1960, since: 2010, appointedBy: "Barack Obama", party: "D", prior: ["Solicitor General of the United States (2009–2010)", "Dean, Harvard Law School"], wiki: "Elena_Kagan" },
    { id: "gorsuch", name: "Neil M. Gorsuch", role: "Associate Justice", born: 1967, since: 2017, appointedBy: "Donald Trump", party: "R", prior: ["Judge, U.S. Court of Appeals for the Tenth Circuit (2006–2017)"], wiki: "Neil_Gorsuch" },
    { id: "kavanaugh", name: "Brett M. Kavanaugh", role: "Associate Justice", born: 1965, since: 2018, appointedBy: "Donald Trump", party: "R", prior: ["Judge, U.S. Court of Appeals for the D.C. Circuit (2006–2018)", "White House Staff Secretary"], wiki: "Brett_Kavanaugh" },
    { id: "barrett", name: "Amy Coney Barrett", role: "Associate Justice", born: 1972, since: 2020, appointedBy: "Donald Trump", party: "R", prior: ["Judge, U.S. Court of Appeals for the Seventh Circuit (2017–2020)", "Professor, Notre Dame Law School"], wiki: "Amy_Coney_Barrett" },
    { id: "jackson", name: "Ketanji Brown Jackson", role: "Associate Justice", born: 1970, since: 2022, appointedBy: "Joe Biden", party: "D", prior: ["Judge, U.S. Court of Appeals for the D.C. Circuit (2021–2022)", "U.S. District Judge, D.D.C.", "Vice Chair, U.S. Sentencing Commission"], wiki: "Ketanji_Brown_Jackson" },
  ],
  // Votes in order: roberts, thomas, alito, sotomayor, kagan, gorsuch, kavanaugh, barrett, jackson
  cases: [
    { name: "Dobbs v. Jackson Women's Health Organization", year: 2022, issue: "Abortion", yes: "overturn Roe v. Wade", votes: "PYYNNYYY-", dir: "C", note: "Roberts upheld Mississippi's law but would not have overturned Roe. Jackson had not yet joined the Court.", wiki: "Dobbs_v._Jackson_Women%27s_Health_Organization" },
    { name: "New York State Rifle & Pistol Ass'n v. Bruen", year: 2022, issue: "Guns", yes: "strike down New York's limits on carrying handguns in public", votes: "YYYNNYYY-", dir: "C", wiki: "New_York_State_Rifle_%26_Pistol_Association,_Inc._v._Bruen" },
    { name: "Students for Fair Admissions v. Harvard / UNC", year: 2023, issue: "Affirmative action", yes: "end race-conscious college admissions", votes: "YYYNNYYYN", dir: "C", note: "Jackson sat out the Harvard case and dissented in the UNC case.", wiki: "Students_for_Fair_Admissions_v._Harvard" },
    { name: "Biden v. Nebraska", year: 2023, issue: "Student loans", yes: "block the Biden administration's student-loan forgiveness plan", votes: "YYYNNYYYN", dir: "C", wiki: "Biden_v._Nebraska" },
    { name: "303 Creative LLC v. Elenis", year: 2023, issue: "Free speech & LGBTQ rights", yes: "let a web designer refuse to create same-sex wedding websites", votes: "YYYNNYYYN", dir: "C", wiki: "303_Creative_LLC_v._Elenis" },
    { name: "Loper Bright Enterprises v. Raimondo", year: 2024, issue: "Federal agencies", yes: "end \"Chevron\" deference to agencies' readings of the law", votes: "YYYNNYYYN", dir: "C", note: "Jackson sat out Loper Bright and dissented in the companion case, Relentless v. Department of Commerce.", wiki: "Loper_Bright_Enterprises_v._Raimondo" },
    { name: "Trump v. United States", year: 2024, issue: "Presidential power", yes: "give former presidents immunity for official acts", votes: "YYYNNYYYN", dir: "C", note: "Barrett joined all but one part of the majority opinion.", wiki: "Trump_v._United_States_(2024)" },
    { name: "Trump v. Anderson", year: 2024, issue: "Elections", yes: "keep Trump on Colorado's ballot (states can't disqualify federal candidates under the 14th Amendment)", votes: "YYYYYYYYY", dir: "C", note: "Unanimous; Sotomayor, Kagan and Jackson agreed with the result but not all of the reasoning.", wiki: "Trump_v._Anderson" },
    { name: "Fischer v. United States", year: 2024, issue: "January 6 prosecutions", yes: "narrow the obstruction charge used against Jan. 6 defendants", votes: "YYYNNYYNY", dir: "C", wiki: "Fischer_v._United_States" },
    { name: "Murthy v. Missouri", year: 2024, issue: "Social media & government", yes: "dismiss the challenge to federal contacts with social-media companies (no standing)", votes: "YNNYYNYYY", dir: "L", wiki: "Murthy_v._Missouri" },
    { name: "City of Grants Pass v. Johnson", year: 2024, issue: "Homelessness", yes: "allow cities to ban sleeping outdoors in public places", votes: "YYYNNYYYN", dir: "C", wiki: "City_of_Grants_Pass_v._Johnson" },
    { name: "United States v. Skrmetti", year: 2025, issue: "Transgender care", yes: "uphold Tennessee's ban on gender-affirming medical care for minors", votes: "YYYNNYYYN", dir: "C", wiki: "United_States_v._Skrmetti" },
    { name: "Trump v. CASA", year: 2025, issue: "Courts' powers", yes: "limit nationwide (universal) injunctions by federal judges", votes: "YYYNNYYYN", dir: "C", wiki: "Trump_v._CASA,_Inc." },
    { name: "FCC v. Consumers' Research", year: 2025, issue: "Federal agencies", yes: "uphold the Universal Service Fund that pays for rural and low-income phone and internet service", votes: "YNNYYNYYY", dir: "L", wiki: "FCC_v._Consumers%27_Research" },
    { name: "Free Speech Coalition v. Paxton", year: 2025, issue: "Online speech", yes: "uphold Texas's age-verification law for pornography websites", votes: "YYYNNYYYN", dir: "C", wiki: "Free_Speech_Coalition_v._Paxton" },
    { name: "Mahmoud v. Taylor", year: 2025, issue: "Religion & schools", yes: "let parents opt their children out of LGBTQ-themed lessons", votes: "YYYNNYYYN", dir: "C", wiki: "Mahmoud_v._Taylor" },
  ],
};
