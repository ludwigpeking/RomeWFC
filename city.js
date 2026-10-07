// Purpose: what the city does as a whole, beside its households (settlement.js). It collects a
// tax, a share of the worth of every lasting property (huts pay nothing), and spends it on:
//
// - Public buildings. Each has a bar: the number of households from which the city wants it (a
//   temple, an arch over a busy street, a basilica, a theatre, an amphitheatre, a Pantheon, a
//   circus, in that order). The city looks for the site that costs it least: every place the
//   building fits is priced by the worth of what would have to be cleared there, and by its
//   distance from the middle of the town. The households that are cleared away are paid. A
//   stretch of the aqueduct may be in the way too, at a price: it is then led round the new
//   building. Nothing is built across a wall.
//   The arch stands over a busy street, which goes on through it. Once there is a wall, the
//   temple, the basilica and the Pantheon are built within it; the theatre, the amphitheatre and
//   the circus look for their place by a gate instead of by the middle of the town, which as a
//   rule puts them outside the wall, where ground is cheap.
//   The buildings that are modelled whole (the theatre, the amphitheatre, the circus, the
//   Pantheon) do not follow the grid: each keeps its own size and may stand anywhere, turned any
//   way the quads near it run. The points it takes are those that lie under it; a point of which
//   it covers only a corner of the ground stays open. So they find their places on the irregular
//   ground as well as on the square one.
// - Water. From a number of households on, the city wants a fountain. An aqueduct brings the
//   water from outside the map, carried 8 m high, to the fountain it ends at; the fountain serves
//   the households within a radius. When enough households live out of reach of every fountain,
//   another one is built, with a branch of the aqueduct to it.
// - The wall. When the tax has paid for it, the city walls in everything lasting (not the huts).
//   A wall never bends inwards: it is the shortest ring round what it protects, its convex hull.
//   What lies far apart is walled in rings of its own, each convex; rings that would cross are
//   made one. The wall stands on the points round that ground. Where busy streets
//   cross it there are gates, and from then on journeys pass the wall only through its gates.
//   A wall once built stays for good. Only when the town has grown far beyond it (the lasting
//   blocks outside are a large share of those inside) is another wall built, round all of it; the
//   old one stays where it is, inside the new, with its gates: as Rome kept its Servian wall
//   inside the Aurelian one.
//
// The wall, the aqueduct and the fountains are not blocks of the volume: they lie on the points
// as works (volume.works), narrower than a block (works.js makes them).

import { TIER, WORK } from './volume';
import { latticePatch } from './charts';
import { cellSize } from './parts';

export const CITY_PARAMETER_DEFAULTS = {
  householdsScaleOfPublicBuildings: 1,     // all the bars of the public buildings, times this
  householdsForTheFirstFountain: 50,
  householdsUnservedForAnotherFountain: 40,
  fountainRadius: 26,                      // metres a fountain serves
  householdsForTheWall: 70,                // lasting households (not in huts) from which the city walls itself in
  blocksOutsideForANewWall: 60,            // lasting blocks outside the walls from which another wall is thought of ...
  shareOutsideForANewWall: 0.6,            // ... and they have to be this share of the blocks inside, too
  moneyForAWallPoint: 50,
  moneyForADuctPoint: 60,
  moneyForAFountain: 400,
  moneyForEachMetreFromTheCentre: 12,      // what a site further from the middle of the town counts as costing
};

// The public buildings in the order the city wants them: the households from which it does, the
// size in points, what building costs beside the clearing of the site, and where it looks for
// its place once the city has a wall (place: 'withinTheWalls' or 'byAGate').
// levelCountAt(column, row): how many classical levels stand on each point of the footprint.
export const PUBLIC_BUILDINGS = [
  { kind: 'temple', place: 'withinTheWalls', householdsNeeded: 30, widthPoints: 2, depthPoints: 4, levelCount: 2, money: 1500, opensToTheFront: true },
  { kind: 'cityArch', householdsNeeded: 50, widthPoints: 3, depthPoints: 1, levelCount: 2, money: 1200, standsOverABusyStreet: true },
  { kind: 'basilica', place: 'withinTheWalls', householdsNeeded: 80, widthPoints: 3, depthPoints: 5, levelCount: 2, money: 3000, opensToTheFront: true },
  { kind: 'theatre', standsFreeOfTheGrid: true, place: 'byAGate', householdsNeeded: 110, widthPoints: 5, depthPoints: 4, levelCount: 2, money: 4000 },
  { kind: 'amphitheatre', standsFreeOfTheGrid: true, place: 'byAGate', householdsNeeded: 140, widthPoints: 6, depthPoints: 8, levelCount: 3, money: 7000 },
  {
    kind: 'pantheon', standsFreeOfTheGrid: true, place: 'withinTheWalls', householdsNeeded: 170, widthPoints: 5, depthPoints: 5, levelCount: 4, money: 8000, opensToTheFront: true,
    levelCountAt: function (column, row) { return column >= 1 && column <= 3 && row >= 1 && row <= 3 ? 4 : 2; },
    // (the same where it stands free: by how far a point lies from its middle, across and along)
    levelCountAtOffset: function (across, along) { return Math.max(Math.abs(across), Math.abs(along)) <= 6.5 ? 4 : 2; },
  },
  { kind: 'circus', standsFreeOfTheGrid: true, place: 'byAGate', householdsNeeded: 200, widthPoints: 4, depthPoints: 12, levelCount: 1, money: 9000 },
];

const daysBetweenPlans = 10;
// a search that found nothing (no site for a building, no wall worth building) is not made
// again for a while: the town has to change first
const daysBeforeAFailedSearchIsRepeated = 150;

// The city of a settlement: its treasury and what it owns. It stands in the place of a household
// on the points of its buildings, so that nobody else builds or walks there.
export function createCity() {
  // chronicle: what the city has built, in the order it did: [{ day, text }]
  return { isCity: true, number: 0, pointIndices: [], money: 0, stage: 0, fountainPoints: [], moneyCollected: 0, moneySpent: 0, chronicle: [], dayOfNextSearch: {} };
}

// One day of the city: the tax, and every few days perhaps one thing built. Returns whether the
// volume or the works changed.
export function runTheCity(settlement) {
  if (settlement.dayCount % daysBetweenPlans !== 0) {
    return false;
  }
  // (the wall before the next public building: it is wanted first, and decides where they go)
  return buildAFountainIfNeeded(settlement) || buildTheWallIfDue(settlement) || buildAPublicBuildingIfDue(settlement);
}

function writeInTheChronicle(settlement, text) {
  settlement.city.chronicle.push({ day: settlement.dayCount, text: text });
}

function spend(settlement, money) {
  settlement.city.money -= money;
  settlement.city.moneySpent += money;
}

// What stands on a point is cleared away for the city, its household paid its worth
function clearForTheCity(settlement, pointIndex) {
  const household = settlement.ownerOfPoint[pointIndex];
  if (household === null || household.isCity) {
    return;
  }
  const worth = settlement.worthAsParcel(pointIndex);
  household.money += worth;
  spend(settlement, worth);
  settlement.takePoint(pointIndex);
  settlement.volume.setTier(pointIndex, 0, TIER.empty);
  settlement.pressure[pointIndex] = 0;
  settlement.clearedBuildingCount++;
}

// What clearing a point would cost the city; Infinity where it may not build at all
function costOfClearing(settlement, pointIndex, maybeOnABusyStreet) {
  const volume = settlement.volume;
  const household = settlement.ownerOfPoint[pointIndex];
  const works = volume.works[pointIndex];
  if (settlement.map.points[pointIndex].isOnBoundary || (works & (WORK.fountain | WORK.passage | WORK.wall | WORK.gate)) !== 0 || volume.publicBuildingOfPoint[pointIndex] !== 0) {
    return Infinity;
  }
  // a stretch of the aqueduct in the way has to be built again elsewhere
  let moneyForWorks = 0;
  if (works & WORK.duct) {
    moneyForWorks += 3 * settlement.parameters.moneyForADuctPoint;
  }
  if (household !== null) {
    return household.isCity ? Infinity : moneyForWorks + settlement.worthAsParcel(pointIndex);
  }
  if (moneyForWorks > 0) {
    return moneyForWorks;
  }
  // a street is dear to build over, a busy one dearer
  return (volume.streetGrades[pointIndex] === 2 && !maybeOnABusyStreet ? 8 : 3) * settlement.worthAsRoad(pointIndex);
}

function middleOfTheTown(settlement) {
  let sumX = 0;
  let sumZ = 0;
  settlement.households.forEach(function (household) {
    const point = settlement.map.points[household.pointIndices[0]];
    sumX += point.x;
    sumZ += point.z;
  });
  const count = Math.max(1, settlement.households.length);
  return { x: sumX / count, z: sumZ / count };
}

// ---------------------------------------------------------------------------
// Public buildings
// ---------------------------------------------------------------------------
function buildAPublicBuildingIfDue(settlement) {
  const volume = settlement.volume;
  const builtKinds = new Set(volume.publicBuildings.map(function (building) { return building.kind; }));
  const scale = settlement.parameters.householdsScaleOfPublicBuildings;
  // the first of the buildings that are due for which there is the money and a site: one that
  // finds no place does not hold up the next
  let wanted = null;
  let site = null;
  for (const candidate of PUBLIC_BUILDINGS) {
    if (builtKinds.has(candidate.kind) || settlement.households.length < candidate.householdsNeeded * scale) {
      continue;
    }
    if (settlement.city.money < candidate.money) {
      break; // the city saves for it
    }
    if (settlement.dayCount < (settlement.city.dayOfNextSearch[candidate.kind] || 0)) {
      continue; // it was looked for lately, in vain
    }
    const siteOfIt = findTheCheapestSite(settlement, candidate);
    if (siteOfIt === null) {
      settlement.city.dayOfNextSearch[candidate.kind] = settlement.dayCount + daysBeforeAFailedSearchIsRepeated;
    }
    if (siteOfIt !== null && settlement.city.money >= candidate.money + siteOfIt.moneyForClearing) {
      wanted = candidate;
      site = siteOfIt;
      break;
    }
  }
  if (wanted === null) {
    return false;
  }
  const number = volume.publicBuildings.length + 1;
  let aqueductIsCut = false;
  const namesOfTheCleared = new Set();
  site.points.forEach(function (place) {
    const pointIndex = place.pointIndex;
    const householdThere = settlement.ownerOfPoint[pointIndex];
    if (householdThere !== null && !householdThere.isCity) {
      namesOfTheCleared.add(householdThere.name);
    }
    clearForTheCity(settlement, pointIndex);
    aqueductIsCut = aqueductIsCut || (volume.works[pointIndex] & WORK.duct) !== 0;
    volume.works[pointIndex] &= ~WORK.duct;
    for (let level = 0; level < place.levelCount; level++) {
      volume.setTier(pointIndex, level, TIER.classical);
    }
    volume.publicBuildingOfPoint[pointIndex] = number;
    if (place.isThePassage) {
      volume.works[pointIndex] |= WORK.passage; // the street goes on through the arch
    } else {
      settlement.ownerOfPoint[pointIndex] = settlement.city;
      settlement.city.pointIndices.push(pointIndex);
    }
  });
  // grid: the patch of the grid it lies in (with a ring round it), where it follows the grid;
  // free: its middle and the way its front looks, where it does not, and openPoints: the ground
  // before its front that is to stay open
  volume.publicBuildings.push({
    number: number, kind: wanted.kind, widthPoints: wanted.widthPoints, depthPoints: wanted.depthPoints, levelCount: wanted.levelCount,
    pointIndices: site.points.map(function (place) { return place.pointIndex; }),
    grid: site.grid || null, free: site.free || null, openPoints: site.openPoints || [], day: settlement.dayCount,
  });
  spend(settlement, wanted.money);
  settlement.raiseSecurityForAPublicBuilding(site.points[Math.floor(site.points.length / 2)].pointIndex);
  const firstPointOfIt = site.points[0].pointIndex;
  writeInTheChronicle(settlement, wanted.kind + ' built at ' + settlement.households.length + ' households, ' +
    (settlement.hasAWall ? (settlement.isWithinWalls[firstPointOfIt] ? 'within the walls' : 'outside the walls') : 'before there was a wall') +
    '; clearing its site cost ' + Math.round(site.moneyForClearing) +
    (namesOfTheCleared.size > 0 ? ' (paid to ' + Array.from(namesOfTheCleared).join(', ') + ')' : ''));
  if (aqueductIsCut) {
    leadTheAqueductsAnew(settlement);
  }
  return true;
}

// Every place a building fits (a patch of the grid of its size with a ring of points round it,
// laid out from every point in every direction), priced; the cheapest, or null where none is found
function findTheCheapestSite(settlement, wanted) {
  const map = settlement.map;
  const volume = settlement.volume;
  const middle = middleOfTheTown(settlement);
  const roadRecentTraffic = settlement.roadRecentTraffic;
  const gates = [];
  for (let pointIndex = 0; pointIndex < map.points.length; pointIndex++) {
    if (volume.works[pointIndex] & WORK.gate) {
      gates.push(map.points[pointIndex]);
    }
  }
  const mustBeWithinTheWalls = wanted.place === 'withinTheWalls' && settlement.hasAWall;
  const looksForAGate = wanted.place === 'byAGate' && gates.length > 0;
  // what a place costs beside its clearing: by how far it lies from where the building wants to
  // be, the middle of the town or the nearest gate
  function moneyForItsDistance(x, z) {
    let distanceFromItsPlace = Math.hypot(x - middle.x, z - middle.z);
    if (looksForAGate) {
      distanceFromItsPlace = Infinity;
      gates.forEach(function (gate) {
        distanceFromItsPlace = Math.min(distanceFromItsPlace, Math.hypot(x - gate.x, z - gate.z));
      });
    }
    return distanceFromItsPlace * settlement.parameters.moneyForEachMetreFromTheCentre;
  }
  if (wanted.standsFreeOfTheGrid) {
    return findTheCheapestFreeSite(settlement, wanted, mustBeWithinTheWalls, moneyForItsDistance);
  }
  let best = null;
  for (let firstPoint = 0; firstPoint < map.points.length; firstPoint++) {
    for (const secondPoint of map.sideNeighboursOfPoint[firstPoint]) {
      const grid = latticePatch(map, firstPoint, secondPoint, wanted.widthPoints + 2, wanted.depthPoints + 2);
      if (grid === null) {
        continue;
      }
      let moneyForClearing = 0;
      let sumX = 0;
      let sumZ = 0;
      for (let row = 0; row < wanted.depthPoints && moneyForClearing < Infinity; row++) {
        for (let column = 0; column < wanted.widthPoints && moneyForClearing < Infinity; column++) {
          const pointIndex = grid[row + 1][column + 1];
          const isThePassage = wanted.standsOverABusyStreet && column === 1;
          if (isThePassage) {
            // the street itself: free, busy, and going on before and behind the arch
            const goesOn = [grid[row][column + 1], grid[row + 2][column + 1]].every(function (streetPoint) {
              return settlement.ownerOfPoint[streetPoint] === null && volume.works[streetPoint] === 0 && settlement.recentTraffic[streetPoint] >= roadRecentTraffic;
            });
            if (settlement.ownerOfPoint[pointIndex] !== null || volume.streetGrades[pointIndex] !== 2 || volume.works[pointIndex] !== 0 ||
              volume.publicBuildingOfPoint[pointIndex] !== 0 || !goesOn) {
              moneyForClearing = Infinity;
            }
          } else if (mustBeWithinTheWalls && !settlement.isWithinWalls[pointIndex]) {
            moneyForClearing = Infinity;
          } else {
            moneyForClearing += costOfClearing(settlement, pointIndex, false);
          }
          sumX += map.points[pointIndex].x;
          sumZ += map.points[pointIndex].z;
        }
      }
      // the ground before its steps will be kept open: what stands there counts too
      if (wanted.opensToTheFront && moneyForClearing < Infinity) {
        for (let column = 0; column < wanted.widthPoints; column++) {
          const pointIndex = grid[wanted.depthPoints + 1][column + 1];
          const household = settlement.ownerOfPoint[pointIndex];
          if (volume.works[pointIndex] !== 0 || volume.publicBuildingOfPoint[pointIndex] !== 0 || (household !== null && household.isCity)) {
            moneyForClearing = Infinity;
          } else if (household !== null) {
            moneyForClearing += settlement.worthAsParcel(pointIndex);
          }
        }
      }
      if (moneyForClearing === Infinity) {
        continue;
      }
      const pointCount = wanted.widthPoints * wanted.depthPoints;
      const price = moneyForClearing + moneyForItsDistance(sumX / pointCount, sumZ / pointCount);
      if (best === null || price < best.price) {
        best = { grid: grid, moneyForClearing: moneyForClearing, price: price };
      }
    }
  }
  // one that follows the grid but finds no patch of it (on the irregular ground the patches are
  // small) is placed free of it, whole; not the arch, which needs its street
  if (best === null && !wanted.standsOverABusyStreet) {
    return findTheCheapestFreeSite(settlement, wanted, mustBeWithinTheWalls, moneyForItsDistance);
  }
  if (best !== null) {
    best.points = [];
    for (let row = 0; row < wanted.depthPoints; row++) {
      for (let column = 0; column < wanted.widthPoints; column++) {
        best.points.push({
          pointIndex: best.grid[row + 1][column + 1],
          levelCount: wanted.levelCountAt ? wanted.levelCountAt(column, row) : wanted.levelCount,
          isThePassage: Boolean(wanted.standsOverABusyStreet) && column === 1,
        });
      }
    }
  }
  return best;
}

// The cheapest place for a building that does not follow the grid. It is tried with its middle
// on every point, on the middle of every quad and on the middle of every side of a quad, turned
// each of the four ways the quad there runs. The points it takes are those that lie under it,
// well inside its outline: of a point just outside, it covers only a corner of the ground, and
// that point stays open. Returns { points, free, openPoints, moneyForClearing, price }, or null.
function findTheCheapestFreeSite(settlement, wanted, mustBeWithinTheWalls, moneyForItsDistance) {
  const map = settlement.map;
  const volume = settlement.volume;
  const width = wanted.widthPoints * cellSize;
  const depth = wanted.depthPoints * cellSize;
  const marginInsideTheOutline = 0.6;
  const depthKeptOpenBeforeTheFront = cellSize;
  // the points by where they lie, in squares of two cells, to find those near a place quickly
  const squareSize = 2 * cellSize;
  const pointsOfSquare = new Map();
  function squareKey(x, z) {
    return Math.floor(x / squareSize) + ':' + Math.floor(z / squareSize);
  }
  map.points.forEach(function (point, pointIndex) {
    const key = squareKey(point.x, point.z);
    if (!pointsOfSquare.has(key)) {
      pointsOfSquare.set(key, []);
    }
    pointsOfSquare.get(key).push(pointIndex);
  });
  const reach = Math.hypot(width, depth) / 2 + depthKeptOpenBeforeTheFront;
  const leastPointCount = Math.ceil(0.85 * wanted.widthPoints * wanted.depthPoints); // (not hanging over the rim of the map)

  let best = null;
  function tryPlace(centreX, centreZ, frontX, frontZ) {
    const rightX = frontZ;   // across its width
    const rightZ = -frontX;
    const points = [];
    const openPoints = [];
    let moneyForClearing = 0;
    for (let squareX = Math.floor((centreX - reach) / squareSize); squareX <= Math.floor((centreX + reach) / squareSize); squareX++) {
      for (let squareZ = Math.floor((centreZ - reach) / squareSize); squareZ <= Math.floor((centreZ + reach) / squareSize); squareZ++) {
        const pointIndices = pointsOfSquare.get(squareX + ':' + squareZ);
        if (pointIndices === undefined) {
          continue;
        }
        for (const pointIndex of pointIndices) {
          const point = map.points[pointIndex];
          const across = (point.x - centreX) * rightX + (point.z - centreZ) * rightZ;
          const along = (point.x - centreX) * frontX + (point.z - centreZ) * frontZ;
          if (Math.abs(across) > width / 2 - marginInsideTheOutline) {
            continue;
          }
          if (Math.abs(along) <= depth / 2 - marginInsideTheOutline) {
            if (mustBeWithinTheWalls && !settlement.isWithinWalls[pointIndex]) {
              return;
            }
            moneyForClearing += costOfClearing(settlement, pointIndex, false);
            if (moneyForClearing === Infinity) {
              return;
            }
            points.push({ pointIndex: pointIndex, levelCount: wanted.levelCountAtOffset ? wanted.levelCountAtOffset(across, along) : wanted.levelCount, isThePassage: false });
          } else if (wanted.opensToTheFront && along > 0 && along <= depth / 2 + depthKeptOpenBeforeTheFront) {
            // the ground before its steps will be kept open: what stands there counts too
            const household = settlement.ownerOfPoint[pointIndex];
            if (volume.works[pointIndex] !== 0 || volume.publicBuildingOfPoint[pointIndex] !== 0 || (household !== null && household.isCity)) {
              return;
            }
            if (household !== null) {
              moneyForClearing += settlement.worthAsParcel(pointIndex);
            }
            openPoints.push(pointIndex);
          }
        }
      }
    }
    if (points.length < leastPointCount) {
      return;
    }
    const price = moneyForClearing + moneyForItsDistance(centreX, centreZ);
    if (best === null || price < best.price) {
      best = { points: points, openPoints: openPoints, free: { x: centreX, z: centreZ, frontX: frontX, frontZ: frontZ }, moneyForClearing: moneyForClearing, price: price };
    }
  }
  map.cells.forEach(function (cell) {
    // the four ways the quad runs: along its sides, either way
    const corners = cell.corners.map(function (pointIndex) { return map.points[pointIndex]; });
    const directions = [];
    [[0, 1], [1, 2]].forEach(function (side) {
      const sideX = corners[side[1]].x - corners[side[0]].x;
      const sideZ = corners[side[1]].z - corners[side[0]].z;
      const sideLength = Math.hypot(sideX, sideZ) || 1;
      directions.push([sideX / sideLength, sideZ / sideLength], [-sideX / sideLength, -sideZ / sideLength]);
    });
    const centres = [cell.middle, corners[0]].concat(cell.sideMiddles.slice(0, 2));
    centres.forEach(function (centre) {
      directions.forEach(function (direction) {
        tryPlace(centre.x, centre.z, direction[0], direction[1]);
      });
    });
  });
  return best;
}

// The points a building of the city stands on (also of one saved before they were kept)
export function pointsOfPublicBuilding(building) {
  if (building.pointIndices) {
    return building.pointIndices;
  }
  const pointIndices = [];
  for (let row = 0; row < building.depthPoints; row++) {
    for (let column = 0; column < building.widthPoints; column++) {
      pointIndices.push(building.grid[row + 1][column + 1]);
    }
  }
  return pointIndices;
}

// ---------------------------------------------------------------------------
// Water: fountains and the aqueduct
// ---------------------------------------------------------------------------
function isWithinReachOfAFountain(settlement, pointIndex) {
  const point = settlement.map.points[pointIndex];
  const radius = settlement.parameters.fountainRadius;
  return settlement.city.fountainPoints.some(function (fountainPoint) {
    const fountain = settlement.map.points[fountainPoint];
    return Math.hypot(fountain.x - point.x, fountain.z - point.z) <= radius;
  });
}

export function householdsWithoutWater(settlement) {
  return settlement.households.filter(function (household) {
    return !isWithinReachOfAFountain(settlement, household.pointIndices[0]);
  });
}

function buildAFountainIfNeeded(settlement) {
  const map = settlement.map;
  const volume = settlement.volume;
  const parameters = settlement.parameters;
  const city = settlement.city;
  const unserved = householdsWithoutWater(settlement);
  const isNeeded = city.fountainPoints.length === 0
    ? settlement.households.length >= parameters.householdsForTheFirstFountain
    : unserved.length >= parameters.householdsUnservedForAnotherFountain;
  if (!isNeeded || city.money < parameters.moneyForAFountain) {
    return false;
  }
  // the site: free ground, not a busy street, beside the town, within reach of the most
  // households that have no water yet
  let site = -1;
  let mostHouseholdsReached = 0;
  for (let pointIndex = 0; pointIndex < map.points.length; pointIndex++) {
    if (settlement.ownerOfPoint[pointIndex] !== null || volume.works[pointIndex] !== 0 || settlement.isKeptOpen[pointIndex] ||
      map.points[pointIndex].isOnBoundary || volume.streetGrades[pointIndex] === 2) {
      continue;
    }
    const point = map.points[pointIndex];
    let householdsReached = 0;
    unserved.forEach(function (household) {
      const home = map.points[household.pointIndices[0]];
      if (Math.hypot(home.x - point.x, home.z - point.z) <= parameters.fountainRadius * 0.85) {
        householdsReached++;
      }
    });
    if (householdsReached > mostHouseholdsReached) {
      mostHouseholdsReached = householdsReached;
      site = pointIndex;
    }
  }
  if (site === -1) {
    return false;
  }
  const route = findTheRouteOfTheAqueduct(settlement, site);
  if (route === null || city.money < parameters.moneyForAFountain + route.money) {
    return false;
  }
  route.points.forEach(function (pointIndex) {
    clearForTheCity(settlement, pointIndex);
    volume.works[pointIndex] |= WORK.duct;
  });
  volume.works[site] |= WORK.duct | WORK.fountain;
  city.fountainPoints.push(site);
  spend(settlement, parameters.moneyForAFountain + route.newPointCount * parameters.moneyForADuctPoint);
  writeInTheChronicle(settlement, 'fountain ' + city.fountainPoints.length + ' built for ' + mostHouseholdsReached + ' households without water; ' + route.newPointCount + ' points of aqueduct');
  return true;
}

// The whole aqueduct led anew, to every fountain in the order they were built: after something
// was built across it
function leadTheAqueductsAnew(settlement) {
  const volume = settlement.volume;
  for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
    volume.works[pointIndex] &= ~WORK.duct;
  }
  settlement.city.fountainPoints.forEach(function (fountainPoint) {
    volume.works[fountainPoint] |= WORK.duct;
    const route = findTheRouteOfTheAqueduct(settlement, fountainPoint);
    if (route === null) {
      return; // no way left to the water: the fountain stands dry
    }
    route.points.forEach(function (pointIndex) {
      clearForTheCity(settlement, pointIndex);
      volume.works[pointIndex] |= WORK.duct;
    });
    spend(settlement, route.newPointCount * settlement.parameters.moneyForADuctPoint);
  });
}

// The way of the aqueduct from a fountain to the water: to the aqueduct that is there already,
// or to the rim of the map, where it comes from outside. It goes over free ground and over
// streets (they pass under its arches) and through buildings only where that is worth clearing
// them. Returns { points (from beside the fountain to its source), newPointCount, money }, or null.
function findTheRouteOfTheAqueduct(settlement, site) {
  const map = settlement.map;
  const volume = settlement.volume;
  const pointCount = map.points.length;
  const moneyForADuctPoint = settlement.parameters.moneyForADuctPoint;
  const costTo = new Float64Array(pointCount).fill(Infinity);
  const cameFrom = new Int32Array(pointCount).fill(-1);
  const isSettled = new Uint8Array(pointCount);
  function moneyToPass(pointIndex) {
    const works = volume.works[pointIndex];
    if (works & WORK.duct) {
      return 0;
    }
    const household = settlement.ownerOfPoint[pointIndex];
    if ((works & (WORK.fountain | WORK.passage)) || volume.publicBuildingOfPoint[pointIndex] !== 0 || (household !== null && household.isCity)) {
      return Infinity;
    }
    let money = moneyForADuctPoint;
    if (household !== null) {
      money += settlement.worthAsParcel(pointIndex);
    }
    return money;
  }
  costTo[site] = 0;
  for (;;) {
    let nearest = -1;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      if (!isSettled[pointIndex] && costTo[pointIndex] < Infinity && (nearest === -1 || costTo[pointIndex] < costTo[nearest])) {
        nearest = pointIndex;
      }
    }
    if (nearest === -1) {
      return null;
    }
    isSettled[nearest] = 1;
    const isTheSource = nearest !== site && ((volume.works[nearest] & WORK.duct) || map.points[nearest].isOnBoundary);
    if (isTheSource) {
      const points = [];
      let newPointCount = 0;
      for (let step = nearest; step !== site; step = cameFrom[step]) {
        points.unshift(step);
        if (!(volume.works[step] & WORK.duct)) {
          newPointCount++;
        }
      }
      return { points: points, newPointCount: newPointCount + 1, money: costTo[nearest] + moneyForADuctPoint };
    }
    map.sideNeighboursOfPoint[nearest].forEach(function (neighbourPoint) {
      const cost = costTo[nearest] + moneyToPass(neighbourPoint);
      if (cost < costTo[neighbourPoint]) {
        costTo[neighbourPoint] = cost;
        cameFrom[neighbourPoint] = nearest;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------
function buildTheWallIfDue(settlement) {
  const volume = settlement.volume;
  const parameters = settlement.parameters;
  let lastingHouseholdCount = 0;
  settlement.households.forEach(function (household) {
    if (settlement.isLastingHousehold(household)) {
      lastingHouseholdCount++;
    }
  });
  if (lastingHouseholdCount < parameters.householdsForTheWall) {
    return false;
  }
  if (settlement.hasAWall) {
    let blocksOutside = 0;
    let blocksInside = 0;
    for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
      if (settlement.isLastingAt(pointIndex)) {
        if (settlement.isWithinWalls[pointIndex]) {
          blocksInside++;
        } else {
          blocksOutside++;
        }
      }
    }
    if (blocksOutside < parameters.blocksOutsideForANewWall || blocksOutside < parameters.shareOutsideForANewWall * blocksInside) {
      return false;
    }
  }
  if (settlement.dayCount < (settlement.city.dayOfNextSearch.wall || 0)) {
    return false;
  }
  const plan = planTheWall(settlement);
  if (plan === null) {
    return false;
  }
  let newPointCount = 0;
  plan.wallPoints.forEach(function (pointIndex) {
    if (!(volume.works[pointIndex] & (WORK.wall | WORK.gate))) {
      newPointCount++;
    }
  });
  if (newPointCount === 0) {
    settlement.city.dayOfNextSearch.wall = settlement.dayCount + daysBeforeAFailedSearchIsRepeated;
    return false;
  }
  if (settlement.city.money < newPointCount * parameters.moneyForAWallPoint) {
    return false;
  }
  // the new wall goes up (the walls that stand stay as they are); huts in its way are cleared
  const newWallPoints = plan.wallPoints.filter(function (pointIndex) {
    return !(volume.works[pointIndex] & (WORK.wall | WORK.gate));
  });
  newWallPoints.forEach(function (pointIndex) {
    clearForTheCity(settlement, pointIndex);
    volume.works[pointIndex] |= WORK.wall;
  });
  chooseTheGates(settlement, newWallPoints).forEach(function (pointIndex) {
    volume.works[pointIndex] = (volume.works[pointIndex] & ~WORK.wall) | WORK.gate;
  });
  settlement.wallCount++;
  writeInTheChronicle(settlement, 'wall ' + settlement.wallCount + ' built at ' + lastingHouseholdCount + ' lasting households: ' + newWallPoints.length + ' points');
  settlement.isWithinWalls.set(plan.isInside);
  settlement.hasAWall = true;
  spend(settlement, newPointCount * parameters.moneyForAWallPoint);
  return true;
}

// The ground to wall in and the points the wall stands on: { isInside, wallPoints }, or null
// where there is nothing to protect.
function planTheWall(settlement) {
  const map = settlement.map;
  const volume = settlement.volume;
  const pointCount = map.points.length;
  const neighboursOf = map.quadNeighboursOfPoint; // the points that share a quad: a wall has to pass between them too
  const isOnTheRim = function (pointIndex) { return map.points[pointIndex].isOnBoundary; };

  // what has to be protected: every lasting block, the city's own buildings, the fountains
  const mustBeInside = new Uint8Array(pointCount);
  let anythingToProtect = false;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const household = settlement.ownerOfPoint[pointIndex];
    const isLasting = settlement.isLastingAt(pointIndex) || (household !== null && household.isCity) ||
      (volume.works[pointIndex] & (WORK.fountain | WORK.passage)) !== 0;
    if (isLasting && !isOnTheRim(pointIndex)) {
      mustBeInside[pointIndex] = 1;
      anythingToProtect = true;
    }
  }
  if (!anythingToProtect) {
    return null;
  }

  // The groups of what is to be protected: what lies within a few points of each other is one
  // group (the protected ground grown by three points, and what then hangs together)
  const stepsThatJoinAGroup = 3;
  let grown = mustBeInside.slice();
  for (let step = 0; step < stepsThatJoinAGroup; step++) {
    const next = grown.slice();
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      if (grown[pointIndex]) {
        neighboursOf[pointIndex].forEach(function (neighbourPoint) {
          next[neighbourPoint] = 1;
        });
      }
    }
    grown = next;
  }
  const groupOfPoint = new Int32Array(pointCount).fill(-1);
  let groups = []; // each: the points to protect
  for (let startPoint = 0; startPoint < pointCount; startPoint++) {
    if (!grown[startPoint] || groupOfPoint[startPoint] !== -1) {
      continue;
    }
    const group = [];
    const pending = [startPoint];
    groupOfPoint[startPoint] = groups.length;
    while (pending.length > 0) {
      const pointIndex = pending.pop();
      if (mustBeInside[pointIndex]) {
        group.push(pointIndex);
      }
      map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (grown[neighbourPoint] && groupOfPoint[neighbourPoint] === -1) {
          groupOfPoint[neighbourPoint] = groups.length;
          pending.push(neighbourPoint);
        }
      });
    }
    groups.push(group);
  }
  groups = groups.filter(function (group) { return group.length > 0; });

  // the convex hull of a group, as places in order round it
  function hullOf(group) {
    const places = group.map(function (pointIndex) { return map.points[pointIndex]; }).sort(function (first, second) {
      return first.x === second.x ? first.z - second.z : first.x - second.x;
    });
    function turn(origin, first, second) {
      return (first.x - origin.x) * (second.z - origin.z) - (first.z - origin.z) * (second.x - origin.x);
    }
    const lower = [];
    places.forEach(function (place) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], place) <= 0) {
        lower.pop();
      }
      lower.push(place);
    });
    const upper = [];
    places.slice().reverse().forEach(function (place) {
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], place) <= 0) {
        upper.pop();
      }
      upper.push(place);
    });
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  // whether a place lies in a hull (on its rim counts), with a little to spare
  function liesInHull(hull, place) {
    if (hull.length === 1) {
      return Math.hypot(place.x - hull[0].x, place.z - hull[0].z) < 0.1;
    }
    for (let corner = 0; corner < hull.length; corner++) {
      const from = hull[corner];
      const to = hull[(corner + 1) % hull.length];
      const sideLength = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      const distanceOutside = -((to.x - from.x) * (place.z - from.z) - (to.z - from.z) * (place.x - from.x)) / sideLength;
      if (distanceOutside > 0.1) {
        return false;
      }
    }
    return true;
  }
  // The ground inside: every point in the hull of its group. Where two hulls take the same
  // point, their groups are made one and the hulls are drawn again.
  let isInside = new Uint8Array(pointCount);
  for (let round = 0; round < 50; round++) {
    isInside = new Uint8Array(pointCount);
    const hullOfPoint = new Int32Array(pointCount).fill(-1);
    let firstToJoin = -1;
    let secondToJoin = -1;
    for (let groupNumber = 0; groupNumber < groups.length && firstToJoin === -1; groupNumber++) {
      const hull = hullOf(groups[groupNumber]);
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
        if (isOnTheRim(pointIndex) || !liesInHull(hull, map.points[pointIndex])) {
          continue;
        }
        if (hullOfPoint[pointIndex] !== -1 && hullOfPoint[pointIndex] !== groupNumber) {
          firstToJoin = hullOfPoint[pointIndex];
          secondToJoin = groupNumber;
          break;
        }
        hullOfPoint[pointIndex] = groupNumber;
        isInside[pointIndex] = 1;
      }
    }
    if (firstToJoin === -1) {
      break;
    }
    groups[firstToJoin] = groups[firstToJoin].concat(groups[secondToJoin]);
    groups.splice(secondToJoin, 1);
  }
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    if (mustBeInside[pointIndex]) {
      isInside[pointIndex] = 1;
    }
  }

  // the wall stands on the points just outside
  function isWallPoint(pointIndex) {
    if (isInside[pointIndex]) {
      return false;
    }
    for (const neighbourPoint of neighboursOf[pointIndex]) {
      if (isInside[neighbourPoint]) {
        return true;
      }
    }
    return false;
  }

  const wallPoints = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    if (isWallPoint(pointIndex)) {
      wallPoints.push(pointIndex);
    }
  }
  return { isInside: isInside, wallPoints: wallPoints };
}

// The gates: where the busiest streets cross the wall, not two close together, and one at least
// in every ring of wall. A gate stands where the wall runs straight through its point (a wall
// point with one on either side, opposite each other), so that it joins the wall on both sides.
function chooseTheGates(settlement, wallPoints) {
  const map = settlement.map;
  const leastDistanceBetweenGates = 30; // metres
  const gates = [];
  const byTraffic = wallPoints.slice().sort(function (first, second) {
    return settlement.recentTraffic[second] - settlement.recentTraffic[first];
  });
  const isOfTheWallSet = new Set(wallPoints);
  function runsStraightThrough(pointIndex) {
    const point = map.points[pointIndex];
    const neighbours = Array.from(map.sideNeighboursOfPoint[pointIndex]).filter(function (neighbourPoint) { return isOfTheWallSet.has(neighbourPoint); });
    if (neighbours.length !== 2) {
      return false;
    }
    const first = map.points[neighbours[0]];
    const second = map.points[neighbours[1]];
    const cosine = ((first.x - point.x) * (second.x - point.x) + (first.z - point.z) * (second.z - point.z)) /
      (Math.hypot(first.x - point.x, first.z - point.z) * Math.hypot(second.x - point.x, second.z - point.z));
    return cosine < -0.85;
  }
  function isFarFromTheGates(pointIndex) {
    const point = map.points[pointIndex];
    return gates.every(function (gatePoint) {
      const gate = map.points[gatePoint];
      return Math.hypot(gate.x - point.x, gate.z - point.z) >= leastDistanceBetweenGates;
    });
  }
  byTraffic.forEach(function (pointIndex) {
    if (settlement.recentTraffic[pointIndex] >= settlement.roadRecentTraffic && runsStraightThrough(pointIndex) && isFarFromTheGates(pointIndex)) {
      gates.push(pointIndex);
    }
  });
  // the rings of the wall, each of the points that hang together
  const isOfTheWall = new Set(wallPoints);
  const isSeen = new Set();
  wallPoints.forEach(function (startPoint) {
    if (isSeen.has(startPoint)) {
      return;
    }
    const ring = [];
    const pending = [startPoint];
    isSeen.add(startPoint);
    while (pending.length > 0) {
      const pointIndex = pending.pop();
      ring.push(pointIndex);
      map.quadNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (isOfTheWall.has(neighbourPoint) && !isSeen.has(neighbourPoint)) {
          isSeen.add(neighbourPoint);
          pending.push(neighbourPoint);
        }
      });
    }
    const hasAGate = ring.some(function (pointIndex) { return gates.indexOf(pointIndex) >= 0; });
    if (!hasAGate) {
      // the busiest of its points where it runs straight, or of all of them if it never does
      const straightPoints = ring.filter(runsStraightThrough);
      const candidates = straightPoints.length > 0 ? straightPoints : ring;
      let busiest = candidates[0];
      candidates.forEach(function (pointIndex) {
        if (settlement.recentTraffic[pointIndex] > settlement.recentTraffic[busiest]) {
          busiest = pointIndex;
        }
      });
      gates.push(busiest);
    }
  });
  return gates;
}
