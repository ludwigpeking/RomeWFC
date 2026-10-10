# The real estate model of the settlement: the author's instructions

This file keeps what Richard Qian Li decided about the economy, in his terms, so that the code
(`settlement.js`) is checked against it and not against anybody's guess. Sources: his notes in
`film/script_zh.md` (2026-10-06) and his answers in conversation the same day. Where something is
still open it is listed at the end, not filled in silently.

## Principle

To simulate a city, a real estate market has to be simulated first. Households do not trade with
each other and earn nothing from movement (decided: no income from journeys). They hold property,
take rent, pay tax and upkeep, and invest.

## Values

- **Building value** has only to do with the building itself: area × unit cost, plus an added unit
  cost for a higher level and for a higher class (tier).
- **Property value** comes from traffic, security and utility. Traffic and security are uniform for
  a parcel. Utility decays towards higher levels and for an interior (backward) tile, one that does
  not face a street.
- **Rent**: 7% of the total property value a year.
- **Land price** is the residual: property value − building value.
- **Land without utility** (a street, open land) is hard to value: assume a utility area on it (a
  building that could stand there). A street carries a very high penalty of cost.
- **Upkeep**, not depreciation: a running cost of the building. It makes T1 buildings harder to
  maintain.
- **Tax** on property; and a **transaction tax** on sales, so that buying back and forth is not
  predominant (in place of bans on buying back).

## The ground

- Traffic flow raises the traffic value along its way; settlements raise the security value near
  them; traffic × security gives the location its value (as in the earlier project, 2605_SpringShow).
  No terrain cost in the pathfinding yet.
- All land belongs to the city at first. Settling or expanding onto land means paying for it.
- Farmland has an even value on every parcel for now, before more factors are brought in.
- Cross-border traffic (two destinations on the rim) and farming households are brought in from
  SpringShow.

## Households

- Farmers travel only to the temple and the venues. Merchants travel to the venues, to the two
  cross-border destinations, and (kept) to other households about 30% of the time.
- How many journeys a household makes in a round is only a constant before normalisation.
- The starting money has no fixed scale yet; the present scheme is acceptable.
- A household's **home** is its property of the highest value, so the home can move. A household
  may sell its home and buy other land or property with the money.
- Management loss: holding property that is geometrically dispersed costs; measured from the home
  is acceptable.

## Investment

- With its funds a household may acquire, build upwards, or upgrade; it chooses the option with the
  highest rent for the investment. It searches every few rounds, looking at adjacent assets and a
  small random sample, not exhaustively.
- Building upwards goes floor by floor, six at the most; each floor costs more and is worth less
  (diminishing returns).
- A new build or an extension may be T3, T2 or T1, not necessarily the tier that was there: T2 and
  T3 can be the more cost-effective.
- Acquisition pays a premium of 30%.
- **Turning classical should be hard.** A partly classical house gets a value bonus, but only for
  one or two blocks; more of them only raise the expenses, with little added value. A house may turn
  wholly classical and stays its owner's (it does not become public, even if it looks like a temple).
- **Height should follow land value**: where land value is not uniform, height should not be
  uniform; a higher floor is still valuable where the land is.
- **Gardens**: an owner of T2 or better may make a parcel a garden. It adds 15% to the rent of the
  adjacent property and brings no rent itself. The owner does it whenever it increases its rent.
- **Occupying a street**: a street whose traffic is below a threshold may be bought, at the price
  plus a premium of twice the price, paid to the city. If a household can then not travel (no path),
  the city guarantees its passage: it demolishes by the cheapest scheme, turns those parcels back
  into road, and compensates the owners.

## Conflict

- In pathfinding an ordinary road has a cost; a building can be passed too, at a very high cost. If
  demolishing a building lowers the cost of the paths greatly, it is demolished; the city
  compensates the owner and the road is open again.

## Still open (asked 2026-10-06, not yet answered)

1. Whether utility depends on the tier (a hut less than a house, a classical floor more), or the
   tier only changes cost and upkeep.
2. Whether an investment needs a test of its own (for instance: the value it adds exceeds its cost)
   beside being the best rent for the money.
3. Which tiers may be mixed in one stack when building on an existing building.
4. How many steps of the simulation make a year (for the yearly rates).
5. The exact meaning of "差值越小的压力越大" for the pressure of traffic on a building.

## What the code assumes meanwhile (2026-10-06, marked ASSUMED in settlement.js)

So that the model could be built for the film before the open points were answered:
1. Utility by tier: hut 0.3, house 1, classical 1 (and 1.5 on a household's first two classical blocks).
2. An investment is made only where it yields at least 3% of its cost a year (5% until 2026-10-07:
   with 5%, huts on weak ground were never rebuilt as houses).
3. Stacks: huts, houses, classical blocks, and a house with a classical ground or top floor.
4. A year is 360 steps.
Unit costs (a m²): hut 12, house 16, classical 110 (house 30, classical 130 until 2026-10-07: the
user found too many huts before the town formalised); each level up × 1.25. A merchant arrives with
500 and builds a house where the money reaches; a farmer arrives with 260 and builds a hut. A public
building raises security by 4 over 5 steps (15 over 8 before: temples were too dominant). Tax 1% of the property
value a year; upkeep 1% of the building value a year, 5% for classical floors; transaction tax 5%.
Location value scale 0.003. All of these are parameters or constants at the head of settlement.js.

## The value table of 2026-10-09 (the author's, as given; it replaces the numbers above where they differ)

```
property value = sum(tileValue); minimum = farmland value
tileValue = trafficValue at entrance cell x securityValue at entrance cell x Utility x BonusMultiplier
trafficValue = traffic on the path registered to a shorter influence circle (consider 3 edges)
securityValue = each establishment registered to a shorter influence circle (consider 3 edges)
Utility: onStreet 1; second floor 0.6; third 0.5; fourth 0.4; fifth 0.35; sixth 0.3;
         backward tile, no street access x0.7; roof terrace x0.3 (a tile block with its own cost and utility)
Bonus:   T3 x0.7; T2 x1; T1 x1.3; T2 with T1 portal in property x1.1; T2 with T1 top in property x1.1;
         with garden in property x1.15; with tower 1.02 x (towerLevel - 6), tower at most 15 levels
tileConstructionCost = TypeBase x CostLevelMultiplier
TypeBase: T3 0.3; T2 1; T1 3; garden 0.5; roof terrace 0.3
CostLevelMultiplier: L1 1; L2 1.4; L3 1.2; L4 1.25; L5 1.3; L6 1.35
rent = property value x 0.7; tax = property value x 0.1
landValue = property value - construction value
landValue of a vacant vertex = traffic x security x 1.5; of a street vertex = traffic x security x 6; minimum = farm value
```

What the code assumes to run it (ASSUMED in settlement.js):
- Money: a tile of base cost 1 costs 256; the value of a location, for a tile, = traffic x security x 0.007.
- Farmland value: 30 a point.
- Rent and tax: 7% and 1% of the value a year (the author, 2026-10-09: "rent should 7% a year, tax 1% a year").
- The tower bonus is taken as written: 1.02 x (levels - 6), so 1.02 at 7 levels and 2.04 at 8.
- Above the sixth level: cost multiplier 0.05 more with each level; utility as on the sixth.
- A property is the ground a household holds in one piece; an entrance cell is the street beside a
  tile with the most valuable location (a backward tile: beside any point of its property).
- An establishment is a household's home or a public building (both over 3 edges).
- Kept from before, not in the table: upkeep (1%, classical 5%), management loss, acquisition
  premium 30%, transaction tax 5%, the 3% yield test. Dropped: the bonus only on a household's
  first two classical blocks; a garden's 15% on the rent beside it (now: in the property).
- Garden bonus by size (the author, 2026-10-09: "the garden size growth should add bonus to the
  property, but when too large (more than 10 cells, the margin reduced to little)"): the bonus on
  every tile of the property is 1 + 0.03 for each cell of garden up to 10 cells, and 0.003 for each
  cell beyond (ASSUMED steps: 1.30 at 10 cells, in place of the flat 1.15).
- Towers (the author, 2026-10-09: "the taller tower has not appeared, maybe tweak the parameters
  to encourage it to appear occasionally"): a level more on a tower never pays by rent (utility
  0.3 up there, cost 3x, upkeep 5%), so it is built for its own sake: a household whose money is
  4x the cost of the level raises it, with a chance of 25% at each search, accepting a loss of up
  to 6% of the cost a year; the town allows one tower for every 120 households (ASSUMED numbers).
- Public works (the author, 2026-10-09: "the public works should spend a large chunk of money.
  they should not be built before the municipality has enough money"): the city always waited
  until it had the money, but the costs were small against what it takes in, so everything went
  up as soon as its household bar was reached. Every cost of the city is now scaled by
  publicWorksCostScale (ASSUMED 6: temple 9,000, arch 7,200, basilica 18,000, theatre 24,000,
  amphitheatre 42,000, pantheon 48,000, circus 54,000, fountain 2,400, a point of aqueduct 360,
  of wall 300).
- 2026-10-09, nine points from the author: (1) the arch stands over the busiest street (of the
  places within 90% of the busiest, the cheapest), and the street goes on through it; (2) a temple
  or basilica at the busiest front (within 70% of the busiest), clearing whatever stands there;
  (3) vacant land cheaper (location x 1.0, a street x 4) and the premium on another's property 40%,
  so that land is the better buy; (4) a tower at most 10 levels; (5) an aqueduct led in anew over
  the rim costs moneyForANewAqueductSource (2,500, x the works scale) more; (6) the classical ground
  floor of a house is a closed portal; (7) garden bonus 0.08 a cell up to 10, 0.01 beyond; (8) the
  bonus of a classical top floor 1.15; (9) no aqueduct on a monument's ground, before it or on the
  ring round it; one that ran there is cut and led anew when the monument is built.
- 2026-10-09 (the author): "the first settlement of a household should be free, allowing it to
  choose the most desirable unoccupied land": a newcomer pays nothing for its first point and takes
  the best free point of the whole map (a merchant by location value, a farmer by farmland). A
  farmer now arrives with 150 (ASSUMED), less than a house costs, so that it still begins in a hut.
- 2026-10-10 (the author): the public works came too late: every cost of the city is now x3 (was
  x6); the public buildings draw more traffic (merchants: other towns 25%, venues 45%, households
  30%; temple 2, basilica 3, pantheon 3); another temple for every 250 households beyond the
  first; the basilica is the tall one (3 x 5, three levels); the square before a public building
  (every point within two edges of its front) is cleared and kept open; the free ground is
  farmland until it becomes parcels and streets.
- 2026-10-10, found while testing: the city went bankrupt on forced demolitions (a household with
  no way out: the city opens the cheapest building, the point was bought again, and so on; 1.4M by
  day 2,400). Now a passage the city opens stays open for good (isAGuaranteedPassage), and ground
  may be taken only where it and every building beside it keep free ground that reaches a road
  within six steps. The city's spending is kept by cause (spentOn: public buildings, their sites,
  the squares, the aqueduct, the wall and its clearing, forced and pressure demolitions).
