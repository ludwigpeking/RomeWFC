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
