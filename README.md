# Rome WFC

A Roman town from a volume, in the manner of Townscaper. Run `npm run dev` and open http://localhost:5210/.

## Layer 1: the ground and the volume

- **Ground** (`topology.js`): points and the quads between them. Two grounds: a square grid, and
  the irregular grid of quads in a hexagon (`quadMap.js`), where three to six quads meet at a point.
- **Volume** (`volume.js`): on the points. Each point, on each level, is empty or one of three tiers.
  A level is as high as the tier of its block: classical 5 m, vernacular 3 m, temporary 2.4 m (the
  grid is 4 m). So a block stands on top of whatever is under it at its point, not at a fixed height.
  Nothing is suspended, for now: a block stands on the ground or on a block, and taking a block
  away takes away what stood on it.
- **Quarters**: every quad is cut into four quarters, one for each corner point (a kite: the point,
  the middles of its two sides, the middle of the quad). The block on a point is the quarters of all
  the quads round it: four on the square grid, three to six on the irregular one. The "Volume"
  button shows the blocks as their quarters.

## The three tiers

1. **Classical** (`classical.js`): the quads are the mince of the models, not the other way round.
   - **Models** (`models.js`, and the hard specials in `monuments.js`): every classical building
     is designed as a whole, once, at one size: shrine, tower, triumphal arch, stoa,
     pavilion, great tower, rotunda, basilica, temple, peripteral temple, loggia, and
     the hard specials (the Pantheon, the great basilica, the court with a peristyle).
   - **Design language** (`orders.js`): leaving the round shapes aside, the models are designed
     with very few things, so that their mince comes out as a small set of general pieces.
     The face of a point takes one structure: wall, pillars, arch, arched window, pillars on a
     wall, pillars on an arch (a blind arch, arch on wall, is rare). A corner is where two faces
     meet: of one structure (symmetric) or of two. A storey has a base and a head; a tall order
     over several levels is a foot (base, no head), shafts (neither) and a head. The roof and
     its parapet are a level of their own. A pillar stands in every corner of the building and
     two in every quad between two points, half a cell apart, none on the middle of such a
     quad: a side has an even number and its middle is a gap to go in by. The building goes
     out past its pillars at its edges and corners. A tall order is as much thicker as it is
     taller, and its two pillars of a quad stand against the borders of the quad. An arch or a window is
     centred on its point.
   - **Hard modelled** buildings are kept apart: the rotunda, the Pantheon and the triumphal
     arch (later perhaps theatres, amphitheatres, circuses). They are placed whole at their
     own sizes, are not minced and do not count among the pieces; their portals may use
     common elements later. Kept out of the quad parts too, though minced so that they can
     grow: the basilica, the great basilica and the court, which are not yet written in the
     language. The aqueduct is taken out for now; it will come back with a logic of its own.
   - **Mince** (`mince.js`): a model is cut along the points of its volume into the pieces of its
     quads, level by level, with what stands above the volume (the roof) as one more level. A
     model of w by d points lies over (w + 1) by (d + 1) quads. Pieces that come out the same
     are one piece, kept once and shared between models; each is named in the words of the
     design language (`describePiece`): corner, edge or inside; its structures; storey, foot,
     shaft, head or roof.
   - **Building**: the classical volume is read as formations (`formations.js`): the hard
     specials first, the largest first, then the largest boxes down to single points. A formation
     takes the model that fits its size (`chooseModel`) and is put together from that model's
     pieces, quad by quad. A model names the slice it can repeat or leave out (along its depth,
     upwards, or both ways), so one model makes every length and height; the design sees to it
     that the model looks the same where such a slice begins and ends (pillars a third of a cell
     apart with one on every centre line, arches centred on the points, gables along the depth).
     The loggia repeats both ways and upwards and takes every box no other model fits.
   - On top of a house only towers, stoas and loggias stand.
   - **Essential blocks**: a classical point alone is not cut: it is a round tholos where it
     stands free, an aedicule against a neighbour or under a block (back to the buildings,
     pediment to the open space), and the portal of a house, with a door, when a vernacular block
     stands on it or beside it.

   The platform and the cornice reach 0.35 m out past the centre line between the points. The
   eaves lie on the top of the volume; the roof rises above it.

   The collection of all pieces (`listPieceKinds` in `mince.js`, section P of the side panel)
   gathers every piece of every model by kind: pieces that are the same but for a turn or a
   mirror image are one kind. It is the place to generalize the pieces.

   Formations are found by position in a lattice, not by where they lie on the ground
   (`charts.js`): the square ground is one lattice, and on the irregular ground a lattice is laid
   out round every group of classical points, quad by quad. So the same figures (temples, stoas,
   the hard specials) are found on both grounds, and every piece of a building is warped into the
   quad it belongs to: on the irregular ground the classical buildings are skewed with the quads.
   The aedicule is put together from its pieces like every building, turned to the way of the
   lattice nearest its front; at the rim of the map the lattice is reckoned on past the last
   points. A point where three, five or six quads meet lies in no lattice: it is read alone (the rest of
   its group is read in the lattices of the parts it falls into), and what stands on it is a
   loggia put together round the point, one corner piece warped into each quad, so it has three,
   five or six sides (`buildFromMinceRoundAPoint`). Not skewed: the round tholos and the hard
   modelled buildings.

   Not done yet: buildings are boxes, so an L-shaped volume is two buildings; pieces of one kind are recognised in the
   collection, but each turn and mirror image is still kept as its own piece.

2. **Vernacular** (`vernacular.js`): built in the quads. Inside a quad, the line from the middle of
   a side to the middle of the quad parts the quarters of two neighbouring points; a stretch of
   wall stands there when one point is raised and the other is not. So raised neighbours grow into
   one house whose outline runs through the middles of the quads, on any ground. The look of every
   stretch (door, shop arch, window, blank) is settled by wave function collapse along and up the
   walls. One tiled roof covers each group of raised points open to the sky, rising with the
   distance from its eaves.
3. **Temporary** (`temporary.js`): one building to a point, two levels at most. One level is a
   stall. Two levels are a shabby house: the lower level has no roof, carries the upper one and
   stays open as a shop; the upper level is a closed room with small windows under thatch.

`reference/sketch2.jpg` is the sketch the monuments follow. `node tools/screenshot.js name "script"`
takes pictures of the running app through `window.rome`.

## The settlement

`settlement.js`: a town that settles by itself, on either ground: the square one (30 by 30
points) or the large irregular one (8 rings, about 860 points). "New" in the toolbar starts one on
the ground that is shown, "Settle" stops it and lets it go on.

- People arrive one after another and put up a hut (temporary tier) on free ground near the town,
  choosing the place with the most traffic beside it.
- They travel to each other, rather to near and rich households, over free ground. A journey
  leaves traffic on every point it crosses; a trodden point costs less to tread again (down to
  half), so journeys gather into streets.
- A journey leaves money with the buildings beside the points it crosses and with both its ends.
  A small share of what a household holds is spent every day, so its money follows the trade at
  its door. With enough money it rebuilds: a second level, a house (vernacular) of one to three
  levels, and only the busiest places turn classical. What is built stays.
- Ground is fought over by its worth, every loss paid for by the gain it makes room for:
  - streets are not drawn by anyone; ground has a worth as road by how much it is used lately.
    A newcomer has nothing and cannot settle on a road; a household with enough money may build
    on it, paying what the road was worth;
  - a household grows by claiming the ground beside it: free ground for little, a road for its
    worth, the parcel of a poorer neighbour by buying it out for what it is worth;
  - journeys that would be shorter through a building go round it and press on it by what the
    detour costs them. When that has outgrown the worth of the building it is broken down, its
    household is paid its worth, and the road is open again.
- The rules of the ground follow the author's earlier simulation in `2605_SpringShow` (traffic
  that makes roads, the discount on a trodden way, settling where the traffic is).
- `node tools/record_settlement.js` records a settlement frame by frame (tools/film/frames) for
  a film; ffmpeg joins the frames.

## Stacking

- What stands on a classical building takes its roof away there.
- A classical block that carries a house or a hut is a part of that building (its portal): it
  takes the room of one of the building's levels, so the levels stay in line, and being taller it
  grows up out of that room. The overlap is meant.

## Z fighting

`coplanar.js` finds faces of different parts that lie in one plane, look the same way and cover
each other. In the browser console, `rome.findCoplanarOverlaps('models')` checks every classical
model and `rome.findCoplanarOverlaps('all')` the town as it stands; only fights between two
materials are listed, since two faces of one material look the same whichever is drawn.

## Names

The side panel (`catalogue.js`) lists every tile and special combination with a code, a name and a
picture: E1 and E2 the essential classical blocks; M1 to M21 the classical models, each beside
its mince, and opened, every piece of it alone (M6.1, M6.2, ...); V1 to V20 all the vernacular
blocks of a quad (its four corners raised 0, 1 or 2 levels, nothing suspended; turns and mirror
images counted once);
W1 to W5 the looks
of a stretch of wall, T1 to T3 the temporary buildings.

## Owners, rules for the houses, open ground, data layers

- **Owners.** Every point of the volume has an owner (`volume.owners`; 0 in a town drawn by hand).
  Houses grow together only inside the ground of one owner: between two owners stands a party
  wall, and each house has its own roof, plaster and door. A buy-out makes two parcels one house.
  Classical buildings grow together whoever owns them.
- **Faces of the houses** (`vernacular.js`) follow from the place of each stretch of wall, with no
  chance in it: a shop arch towards a busy street, one door for every house, tall windows on the
  second and third floor towards the street, smaller ones towards a yard, blank where the wall
  looks at another building. The settlement tells how much a point is used as street
  (`volume.streetGrades`), with some hold so that the faces do not flicker. Shops are a matter of
  time (`volume.shopFronts`, `Settlement.openShops`): along a street that has become busy the
  houses open shops one front after another, and a shop once opened stays while its house stands.
- **Block by block.** A household raises one block at a time (`raiseABlockIfRicher`), the one
  with the most traffic beside it first; every further block at a stage asks for more money. So a
  holding has blocks of different heights, and it turns classical one block at a time
  (`BUILDING_STAGES`): the ground floor of a block first, then its top floor too, then the whole. A classical floor under or on a house is a stoa,
  a loggia, a tower or an aedicule, never a temple.
- **Connectors.** A classical block under a house keeps its 5 m and so fills 2 m of the 3 m level
  above it; the 1 m left of that level is a connector, a low block without windows
  (`volume.heightEatenFromBelowAt`). The levels of the house stay in line with its neighbours.
- **Open ground.** The temples, basilicas, rotundas and the Pantheon keep the ground before their
  steps open, the triumphal arch the ground on both sides of its passage (`classical.js` names the
  points, `Settlement.keepOpen` clears them, paying the households, and lets nobody build there).
  In a town drawn by hand nothing is cleared.
- **Data layers** (toolbar, DATA LAYER; `rome.dataLayer(name)`): traffic, streets (and the ground
  kept open), owners, stage, money, worth, pressure.

## Materials from one small picture

All materials are painted in `textures/atlas.png` (256 x 128 pixels: a grid of 32-pixel tiles, one
for each material; `textures/atlas.json` tells which tile is which and how many metres it covers).
`tools/make_atlas.py` paints it; it may be painted over by hand (running the script again
overwrites it). The tile of a material is repeated over its surfaces, laid out in metres along and
up each surface (`layOutOnItsTile` in `parts.js`), so courses of stone, brick and roof tiles run
level. The window tile is laid once into every window of a house, as a pane in the middle of the
wall. Bare brick is used where a house wall shows no face (party walls, walls that look at another
building). Every roof carries a slight tint of its own, and each point's part of it a slighter one
(`buildRoofs` in `quadBlocks.js`, `roofTint` for the classical roofs).

## Batches of runs

`node tools/run_batch.js [runCount] [dayCount]` runs settlements one after another in headless
Chrome, each with its own parameters (`SETTLEMENT_PARAMETER_DEFAULTS` in `settlement.js`; the
spans they are drawn from are in the script), with nothing drawn on the way. Each run leaves in
`tools/runs` its parameters, numbers, monuments and full final state (`run_NNN.json`) and a
picture (`run_NNN.jpg`); `runs.csv` holds one line for each run. `python tools/make_run_gallery.py`
makes `gallery.html` (a sortable table with the pictures) and `contact_sheet.jpg`. The app loads a
saved run under SAVED RUNS: the town as it stood, in space, with its data layers, ready to live on.

## The city as a whole: public buildings, water, the wall

`city.js` is what the city does beside its households. It collects a tax (a share of the worth of
every lasting property; huts pay nothing) and spends it. All its numbers are parameters
(`CITY_PARAMETER_DEFAULTS`, and the list `PUBLIC_BUILDINGS` with the bar of each building).

- **Public buildings.** From a number of households on, the city wants a temple (30), an arch
  over a busy street (50), a basilica (80), a theatre (110), an amphitheatre (140), a Pantheon
  (170), a circus (200). Every place the building fits (`latticePatch` in `charts.js`) is priced by
  what would be cleared there and by its distance from the middle of the town; the cheapest is
  taken, the households there are paid. They are kept in `volume.publicBuildings`, not read from
  the volume as formations. The arch, the theatre, the amphitheatre and the circus are hard
  modelled (`publicModels.js`). Blocks of households never make a triumphal arch.
- **Water.** Fountains serve a radius; an aqueduct 8 m high brings the water from the rim of the
  map, and branches to each further fountain. Streets pass under its arches.
- **The wall.** Round everything lasting: the ground is rounded off, closed and shortened
  (`planTheWall`), the wall stands on the points round it, perhaps in more than one ring. Gates
  where the busiest streets cross it; journeys pass the wall only through gates. A town that has
  outgrown its wall builds a new one.
- The wall, the gates, the aqueduct and the fountains are works on the points (`volume.works`,
  `WORK` flags), 2 m wide, built by `works.js`; they are not blocks.

## Later changes to the look and the panel

- Windows are wooden shutters (two tiles of the atlas: closed, and one leaf open). Houses are
  plastered or show their brick (`HOUSE_WALL_MATERIALS`). Every roof has its own shade of tile:
  darker rather than lighter, and from a deep red to a yellower orange.
- What stands on a roof is a **roof tower** (closed, an arched window to every point), not an open
  loggia; a tholos stands on the ground only.
- The theatre and the amphitheatre have arcades of arches, and people on their seats; the circus
  has people on its banks.
- Pillars of an order one level tall are an eighth of their height thick.
- The panel of settings has tabs (Build, Ground, Settle, City, Data). The grounds have sizes
  (Ground tab; `rome.setGroundSize`), and the parameters of a settlement and the bars of the
  public buildings are set in the Settle and City tabs.

## Streets, walls that stay, places of the public buildings, the city in numbers

- **Streets are ground**: on every free point used as street, the patch of ground round the point
  (skewed with the grid), cobbled; busy streets are paved with slabs (`showStreets` in `main.js`,
  tiles `cobble` and `paving`). The Traffic data layer now shows only the paths that are not yet
  streets.
- **The aqueduct** is of rough stone (tile `roughStone`); over its piers the channels open into a
  round of water, so the water runs on unbroken. The fountain stays marble.
- **Gates** take the place of the wall on their point: a gatehouse with a tall arch and a tower
  at each end; the wall begins again beyond the towers. A gate stands only where the wall runs
  straight through its point.
- **Walls stay.** A wall once built is never taken down. Another is built only when the lasting
  blocks outside are many (`blocksOutsideForANewWall`) and a large share of those inside
  (`shareOutsideForANewWall`); the old one stays inside the new. The wall is built before the
  next public building.
- **Places of the public buildings** once there is a wall: temple, basilica and Pantheon within
  it; theatre, amphitheatre and circus priced by their distance from the nearest gate.
- **The city in numbers**: a line at the foot of the window, and in the Data tab a chart of the
  households over the days, a table of all the statistics and the chronicle of what the city
  built (`city.chronicle`, `rome.chronicle()`).

## Names, six storeys, towers

- Every household has a Roman name of three parts (`names.js`: 20 praenomina, 144 nomina, 152
  cognomina, over 400,000 names; no two households of a settlement bear the same). Point at a
  building of a settlement to read whose it is; the Data tab lists the richest households, and
  the chronicle names the households the city paid to clear a site.
- A house has six storeys at the most. A classical block has no such limit: while its household
  holds the money it rises level by level into a tower, up to 20 levels (100 m), each further
  level asking for 2,000 more (`BUILDING_STAGES` in `settlement.js`). The volume is 22 levels high.

## Gardens, roof terraces, people walking, walking in the city

- **Gardens** (`TIER.garden`, `gardens.js`): a household of two storeys or more may lay out
  claimed free ground as a garden, the more readily beside a garden it has. Grass, trees, and a
  wall only towards what is not its owner's. A garden adds to the worth of the property (and so
  to the visits it draws and to its tax), earns nothing from passers-by and costs its keep each
  day (`chanceOfAGardenAmongClaims`, `moneyForAGardenEachDay`).
- **Roof terraces**: about one top storey in seven of a house of two storeys or more is a terrace:
  a low parapet, a pergola under a cloth, no roof (`chanceOfARoofTerrace` in `vernacular.js`).
- **On a roof** a classical row of one level is a stoa three times in ten, otherwise a roof tower.
- **Awnings** are undyed linen, hemp, or a faded madder cloth: no stripes, no blue.
- **Journeys** go to households by the worth of their property and to the city's venues, which
  draw more and from further away (`DRAW_OF_A_VENUE`); what a venue takes goes to the city.
- **People walking** (`letThePeopleWalk` in `main.js`): the ways of the latest journeys are kept
  (`settlement.journeysToShow`) and walked afterwards at a walking pace, up to 180 people at once.
- **Walking in the city**: the Walk button puts the camera at eye height; W A S D or the arrow
  keys walk, dragging looks round, Shift runs, Esc leaves (`rome.walk(true)`).

- **Reading a data layer**: with a layer other than Traffic on, the town is drawn faint, the
  pointer reads the ground (a ring marks the point) and a note beside it tells everything known
  of that point (`settlement.describeDataAt`); nothing is built by clicking meanwhile.
- **Garden trees** are of few faces: cypress, stone pine, olive, a clipped hedge.

- **Towers are rare**: the town has room for one tower (a classical block over three levels) for
  every 150 households (`householdsForEachTower`), a household builds one only, and every further
  level asks for 1.3 times the money of the one below.
- **Public buildings free of the grid**: the theatre, the amphitheatre, the circus and the
  Pantheon keep their own size and may stand anywhere, turned as the quads near them run
  (`findTheCheapestFreeSite` in `city.js`); the points they take are those well inside their
  outline. A building that follows the grid but finds no patch of it falls back to that, and a
  building without a site does not hold up the next.
- **Batches elsewhere**: `tools/run_batch.js` takes its prefix, ground sizes, seeds and port from
  the environment (see its head); `python tools/make_run_gallery.py big` makes `gallery_big.html`,
  a page of cards to sort and filter.

- **The wall is convex**: it is the ring round the convex hull of what it protects (`planTheWall`
  in `city.js`); what lies far apart gets rings of its own, and rings that would cross are made
  one. The Works data layer shows walls, gates, the aqueduct, fountains and the ground within.

## The economy (settlement.js, second version)

Households no longer earn from passers-by; the town is a model of land and property.
- Land price (a m²) = traffic × security × `landPriceScale`. Traffic: every journey adds its weight
  (merchant 2, farmer 1) along its way, half beside it, slowly forgotten. Security: a farmer adds 2
  within 3 steps of its home, a merchant 1, a public building 15 within 8 steps.
- Worth of a point = land (16 m² × price) + building (each floor 16 m² × the price of its kind: hut
  4, house 30, classical 90; worn a little every day). Rent of a day = `rentRateEachDay` × what its
  floors let for: each floor the land under it times the share of its grade (hut 0.4, house 1,
  classical 1.5), less off the street and less for each floor up, plus its building; times how well
  it is managed (less far from home) and more beside gardens. Tax = `taxShareOfPropertyEachDay` × worth.
- Every few days a household does the one investment with the best rent for its cost, if it beats
  `requiredReturnEachDay`: build up, rebuild in another kind (a classical ground floor, a classical
  top floor, all classical), a garden, free land bought from the city and built on, or a
  neighbour's parcel at a premium. Floors higher up cost more and let for less.
- Farmers settle by free land, few farmers and security, live off the land and go to the temple and
  the venues; merchants settle on the dearest land they can pay and go also to two other towns on
  the rim. A farmer on dear land turns merchant.
- The city sells the land, takes the tax, buys buildings in the way of traffic and opens ways.

### Checked by a study (tools/economy_study.js, tools/analyse_study.py)

29 runs of 6,000 days (the usual parameters with three seeds, and every parameter lower and higher)
showed, and led to:
- parcels bought back and forth between neighbours → an owner sells only where the price is worth
  more to it than its own rent; nobody sells its home; nobody buys back what it sold in 2,000 days;
- a stall once land prices levelled off (money piling up, nothing worth building) → the return a
  household asks falls where money lies idle (`hurdleOf`: required return ÷ (1 + money ÷ worth));
- every worn house turned into a house with a classical ground floor → a building can be renewed as
  it is, and a house of any height can be rebuilt classical (at three levels);
- the city pulling down and the town building again on the same ground → ground opened as road is
  not sold again for 2,000 days.
