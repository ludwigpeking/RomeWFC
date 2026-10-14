# The history of the parameters

What the defaults of the economy were and when they changed, and why, gathered from the dated
notes in `settlement.js` and `city.js` (the rules themselves are in `ECONOMY_SPEC.md`). The panel
of the app keeps its own history: every change a user makes there, with its time, kept in the
browser and saved into every parameters file (Parameters → Save).

| date | parameter | before | after | why |
|---|---|---|---|---|
| 2026-10-09 | the table of tile costs, level multipliers, utilities, bonuses | — | the author's table | the first economy |
| 2026-10-09 | vacantLandFactor | 1.5 | 1.0 | vacant land too dear to buy |
| 2026-10-09 | the first ground of a newcomer | bought | free | the author: newcomers settle free |
| 2026-10-10 | publicWorksCostScale | 6 | 3 | the works came too late |
| 2026-10-10 | fortuneShareOfWealthAtMost | 0.1 (first idea) | 0.3 | to see a clear disparity between the households |
| 2026-10-10 | chanceOfAFortuneEachDay | — | 1/90 | fortune introduced: about four strokes a year |
| 2026-10-10 | the share of merchants' journeys to venues | — | 45% (choice 0.25–0.7) | the public buildings draw much of the traffic |
| 2026-10-12 | streetLandFactor | 4 | 2 | round 2 of the experiments: the price was the brake on taking streets |
| 2026-10-12 | the way-out rule (ground may be taken only where the neighbours keep a way out) | on | off | "let them occupy": demolition recovers the path |
| 2026-10-12 | bonusWithAClassicalPortal, bonusWithAClassicalTop | vernacular tiles only | every tile of the property, once | the portal and the top raise the whole property |
| 2026-10-12 | LAYER_BANDS.landPrice top | 512 | 2048 | a mature town passed 256 nearly everywhere |
| 2026-10-13 | SECURITY_BOOST.publicBuilding, its reach | 4 within 3 edges of the middle point | 10, twice within 3 edges and once within 5 of every point | the institutions are to bring much more security |
| 2026-10-13 | SECURITY_BOOST.fountain | — | 5, twice within 2 edges and once within 4 | a fountain with its square is an institution |
| 2026-10-13 | visitorsEachDayForEachDrawOfAVenue | — | 2 | the venues send out visitors of their own: much more traffic |
| 2026-10-13 | DRAW_OF_A_VENUE.fountain | — | 3 | the fountain draws people |
| 2026-10-13 | the fountain's footprint | 1 point | 3 by 2 points, the aqueduct at the middle of the back row | the author's design |
| 2026-10-13 | yearsOfTakingsTheCityMayOwe | — (no debt) | 5 | the city can have debt |
| 2026-10-13 | LAYER_BANDS.journeys top | 32000 | 256000 | a mature town passed 32000 nearly everywhere |
