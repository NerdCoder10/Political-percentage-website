// Full-court ("en banc") decisions of the U.S. Courts of Appeals, with how every participating judge
// voted. Each lineup was read from the court's own opinion or order (linked); judges are named
// "Last, First" as in the Federal Judicial Center's directory.
// `yes` describes the outcome a "Yes" vote supported. `dir` marks that outcome as the side generally
// described as conservative ("C") or liberal ("L"), or null when the split did not follow that line.
// Last reviewed: October 2026. Only the circuits below have a recent en banc ruling on file; more
// will be added as lineups are verified.

globalThis.CIRCUIT_CASES = [
  {
    circuit: "District of Columbia Circuit", name: "Harris v. Bessent / Wilcox v. Trump", year: 2025, issue: "Presidential power",
    yes: "let fired members of independent agencies (MSPB, NLRB) return to work while their cases proceed", dir: "L",
    yesJudges: ["Srinivasan, Srikanth", "Millett, Patricia", "Pillard, Cornelia", "Wilkins, Robert", "Childs, J. Michelle", "Pan, Florence", "Garcia, Bradley"],
    noJudges: ["Henderson, Karen", "Katsas, Gregory", "Rao, Neomi", "Walker, Justin"],
    url: "https://media.cadc.uscourts.gov/orders/docs/2025/04/25-5037.25-5057.EN1.pdf",
  },
  {
    circuit: "Fourth Circuit", name: "Bianchi v. Brown", year: 2024, issue: "Guns",
    yes: "uphold Maryland's ban on assault weapons", dir: "L",
    yesJudges: ["Wilkinson, J. Harvie", "Diaz, Albert", "King, Robert", "Gregory, Roger", "Wynn, James", "Thacker, Stephanie", "Harris, Pamela", "Heytens, Toby", "Benjamin, DeAndrea", "Berner, Nicole"],
    noJudges: ["Richardson, Julius", "Niemeyer, Paul", "Agee, G. Steven", "Quattlebaum, A. Marvin", "Rushing, Allison"],
    url: "https://www.ca4.uscourts.gov/opinions/211255.P.pdf",
  },
  {
    circuit: "Fifth Circuit", name: "Roake v. Brumley", year: 2026, issue: "Religion & schools",
    yes: "let Louisiana's Ten Commandments classroom-display law take effect (the challenge was ruled premature)", dir: "C",
    yesJudges: ["Elrod, Jennifer", "Jones, Edith", "Smith, Jerry", "Stewart, Carl", "Richman, Priscilla", "Southwick, Leslie", "Willett, Don", "Ho, James", "Duncan, Stuart", "Engelhardt, Kurt", "Oldham, Andrew", "Wilson, Cory"],
    noJudges: ["Dennis, James", "Graves, James", "Higginson, Stephen", "Douglas, Dana", "Ramirez, Irma", "Haynes, Catharina"],
    url: "https://ffrf.org/wp-content/uploads/2026/02/2026-02-20-EN-BANC-PUBLISHED-OPINION-FILED.-24-30706-Vacated-Roake-v.-Brumley-ca5-2024-30706-00507873701.pdf",
  },
  {
    circuit: "Ninth Circuit", name: "Duncan v. Bonta", year: 2025, issue: "Guns",
    yes: "uphold California's ban on magazines holding more than 10 rounds", dir: "L",
    yesJudges: ["Murguia, Mary", "Thomas, Sidney", "Graber, Susan", "Wardlaw, Kim", "Paez, Richard", "Berzon, Marsha", "Hurwitz, Andrew"],
    noJudges: ["Ikuta, Sandra", "Nelson, Ryan", "Bumatay, Patrick", "VanDyke, Lawrence"],
    note: "An 11-judge en banc panel; the Ninth Circuit's other active judges did not sit.",
    url: "https://en.wikipedia.org/wiki/Duncan_v._Bonta",
  },
  {
    circuit: "Federal Circuit", name: "V.O.S. Selections v. Trump", year: 2025, issue: "Trade & tariffs",
    yes: "hold that the emergency-powers law (IEEPA) does not authorize the 2025 tariffs", dir: null,
    yesJudges: ["Lourie, Alan", "Dyk, Timothy", "Reyna, Jimmie", "Hughes, Todd", "Stoll, Kara", "Cunningham, Tiffany", "Stark, Leonard"],
    noJudges: ["Taranto, Richard", "Moore, Kimberly", "Prost, Sharon", "Chen, Raymond"],
    note: "The majority included judges appointed by presidents of both parties, so this case is not counted as left or right.",
    url: "https://www.cafc.uscourts.gov/opinions-orders/25-1812.OPINION.8-29-2025_2566151.pdf",
  },
];
