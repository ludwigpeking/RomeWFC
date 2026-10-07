// Purpose: a town that settles by itself, run as a model of land and property. Households come,
// buy ground from the city, build on it, let it, and invest what the rents bring in. Nobody trades
// with anybody yet: the people travel, and their journeys give the ground its worth.
//
// The ground (after the author's earlier simulation, 2605_SpringShow):
// - Traffic. Every journey adds its weight to the traffic of the points it crosses (a merchant 2,
//   a farmer 1) and half of it to the points beside them. Traffic is slowly forgotten. A way once
//   trodden costs less to tread again, down to half: the roads form themselves.
// - Security. A household raises the security of the ground near it once, when it settles (a
//   farmer by 2, a merchant by 1, a public building by 15), and takes it away when it leaves.
// - The price of land, for each square metre: traffic × security × landPriceScale.
// - Two places on the rim of the map are where the roads lead to other towns. A road between them
//   is trodden from the first day.
//
// The people:
// - A farmer settles where the most free land lies near, the fewest other farmers and the most
//   security; it lives off that land, and travels only to the temple and the venues of the city.
//   When the ground it lives on has grown dear, it turns merchant.
// - A merchant settles where land is dearest that it can still pay for; it travels to the venues,
//   to the households of most worth, and to the two other towns.
//
// The property of a point: the land (its footprint at the price of land) and the building (each
// floor by its area and its kind: a hut, a house, a classical block). The building does not gain
// in worth; it wears and loses a little every day. Rent comes from the floors: each floor brings
// the price of the land under it and the worth of its building, the land counting less for a floor
// that does not face a street and less again for each floor up. A household with points far from
// its home manages them worse: their rent falls with the distance. A garden brings no rent of its
// own, but adds to the rent of the property beside it. Every day a household takes its rents and
// pays the city its tax on all it owns.
//
// What a household does with its money: every few days it looks over its own points, the ground
// beside them and a few points elsewhere, and of everything it could do (build a floor up, rebuild
// a floor or all of a block in another kind, lay out a garden, buy free land and build on it, buy a
// neighbour's parcel at a premium) it does the one that brings the most rent for its cost, if that
// is worth it at all. A floor higher up costs more and brings less: building up pays less and less.
//
// The city at first owns all the land: who settles or builds on new ground buys it from the city.
// A street can be bought only where it is not busy, and at three times the price of its land. A
// journey that could go through a building goes round it, and the difference presses on that
// building; when the pressure has outgrown its worth, the city buys it, pulls it down and opens the
// road again. Where a household could not get anywhere at all, the city opens a way at once, at the
// least cost.
//
// The simulation only writes the volume (which point holds which tier, how many levels, whose
// ground it is and how much it is used as street); the buildings come from it as always.

import { TIER, WORK, SeededRandom } from './volume';
import { nameOfHousehold } from './names';
import { pointsOfPublicBuilding, createCity, runTheCity, householdsWithoutWater, CITY_PARAMETER_DEFAULTS } from './city';

// The parameters a settlement is run with, and what they are when nothing else is asked for.
// (A "day" is one step of the simulation.)
export const SETTLEMENT_PARAMETER_DEFAULTS = {
  landPriceScale: 0.0005,            // price of a square metre of land = traffic × security × this
  rentRateEachDay: 0.002,            // rent of a day, as a share of what a floor is let for
  depreciationEachDay: 0.0004,       // the share of its worth a building loses every day
  // (above the rent rate: a building pays for itself only where the land under it brings rent enough)
  requiredReturnEachDay: 0.0026,     // an investment is made only where it brings at least this share of its cost back every day
  constructionCostGrowthPerLevel: 1.25, // each floor up costs so many times the one below
  upperFloorLandFactor: 0.8,         // the land counts so much less for each floor up
  // A floor lets for the land under it and for its building; of its building only this share: a
  // building pays for itself only where the land under it is worth something, so that a house rises
  // where land is dear and stays low where it is cheap
  buildingRentShare: 0.55,
  leastHurdleShare: 0.6,             // idle money lowers the return a household asks to this share of the required return at the least
  // Turning classical: a household gains by its first classical blocks (so many), which make it a
  // name in the town; more of them cost as much and keep as much, but let for no more than a house
  distinguishedClassicalBlocks: 2,
  classicalUpkeepEachDay: 0.0006,    // what a classical floor costs every day, as a share of its worth
  backStreetLandFactor: 0.55,        // ... and so much for a floor that faces no street
  managementLossPerCell: 0.05,       // the rent of a point falls by this for each cell it lies from its household's home
  acquisitionPremium: 0.3,           // a neighbour's parcel is bought at its worth and this much more
  streetPremium: 2,                  // a street is bought at its price and this many times its price more
  gardenRentBonus: 0.15,             // a garden adds this to the rent of every property beside it
  startingCapital: 250,
  shareOfFarmers: 0.5,               // of the newcomers
  farmYieldEachDay: 0.06,            // what a farmer takes in a day from each point of free land near it, shared with the other farmers there
  landPriceOfAMerchant: 12,          // a farmer whose land is this dear (a square metre) turns merchant
  daysBetweenInvestmentSearches: 7,
  householdsForEachTower: 150,       // the town has room for one tower (a classical block over three levels) for every so many households
  journeysPerHouseholdEachDay: 0.35,
  chanceOfAnArrivalEachDay: 0.45,
  mostGroundSettled: 0.45,           // share of the points that may be built on
  trafficKeptEachDay: 0.999,         // of the traffic that gives the ground its worth
  shareOfTheBusiestStreet: 0.4,      // a street is busy from this share of the traffic of the busiest point
  chanceOfAShopOpeningEachDay: 0.01, // for each front of a house that looks at a busy street
  stepsABuildingCosts: 8,            // a journey that crosses a building counts it as so many steps
  moneyWorthOfAStepSaved: 12,        // what a step saved by pulling a building down is worth to the city
};
Object.assign(SETTLEMENT_PARAMETER_DEFAULTS, CITY_PARAMETER_DEFAULTS); // what the city does as a whole: city.js

const floorArea = 16;                    // square metres of one floor of a point (a cell is 4 m wide)
const BUILDING_PRICE_OF_TIER = {         // what a square metre of floor costs to build, and is worth new
  [TIER.temporary]: 4, [TIER.vernacular]: 30, [TIER.classical]: 130,
};
const gardenPrice = 3;                   // a square metre of garden laid out
// How much of the worth of its location a floor brings in, by its kind (its grade): a hut lets
// for little whatever lies under it; a classical floor for more than a house
const LOCATION_SHARE_OF_TIER = { [TIER.temporary]: 0.4, [TIER.vernacular]: 1, [TIER.classical]: 1.5 };
const MOST_LEVELS_OF_TIER = { [TIER.temporary]: 2, [TIER.vernacular]: 6, [TIER.classical]: 3 };
const mostLevelsOfATower = 20;
const conditionOfAWornBuilding = 0.3;    // a building wears no further than this share of its worth
const SECURITY_BOOST = { farmer: 2, merchant: 1, publicBuilding: 15 };
const stepsOfASecurityBoost = 3;         // a household raises the security this many steps round it
const stepsOfAPublicSecurityBoost = 8;
const stepsOfFarmland = 5;               // a farmer works the free land this many steps round it
const tradeRouteWeight = 12;
const JOURNEY_WEIGHT = { farmer: 1, merchant: 2 };
const DRAW_OF_A_VENUE = { circus: 5, amphitheatre: 4, theatre: 3, basilica: 2.5, pantheon: 2.5, temple: 1.5 };
const mostJourneysToShow = 400;

// Streets. The recent traffic of a point is its journeys, the older ones counting less every day.
const recentTrafficKeptEachDay = 0.98;
export const roadRecentTraffic = 3;      // recent traffic from which a point counts as road
const STREET_GRADE = { yard: 0, street: 1, busyStreet: 2 };
const leastBusyStreetRecentTraffic = 8;
const shareOfTrafficThatKeepsAGrade = 0.6;
const pressureKeptEachDay = 0.995;
// What was settled stays settled for a while: a household does not buy back a parcel it sold so
// lately, and ground the city opened as road is not sold again so soon
const daysBeforeBuyingBack = 2000;
const daysAnOpenedRoadIsKept = 2000;
const daysAGardenIsKept = 1500;          // a garden is not built over so soon after it was laid out, nor a building turned to garden

let parametersInUse = Object.assign({}, SETTLEMENT_PARAMETER_DEFAULTS);

// Sets the parameters: the defaults, and over them whatever is given. Returns all of them.
export function setSettlementParameters(givenParameters) {
  parametersInUse = Object.assign({}, SETTLEMENT_PARAMETER_DEFAULTS, givenParameters || {});
  return parametersInUse;
}

// The tiers of a point from the ground up (empty where nothing stands)
function stackOf(volume, pointIndex) {
  const stack = [];
  for (let level = 0; level < volume.levelCount; level++) {
    const tier = volume.tierAt(pointIndex, level);
    if (tier === TIER.empty) {
      break;
    }
    stack.push(tier);
  }
  return stack;
}

// What it costs to build a floor of a tier at a level
function floorCost(tier, level) {
  return floorArea * BUILDING_PRICE_OF_TIER[tier] * Math.pow(parametersInUse.constructionCostGrowthPerLevel, level);
}

// The tier that names a stack: the classical where all of it is, the house where any of it is, else the hut
function kindOfStack(stack) {
  if (stack.length === 0) {
    return 'none';
  }
  if (stack[0] === TIER.garden) {
    return 'garden';
  }
  if (stack.every(function (tier) { return tier === TIER.classical; })) {
    return stack.length > 3 ? 'tower' : 'classical';
  }
  if (stack.indexOf(TIER.vernacular) >= 0) {
    return stack.indexOf(TIER.classical) >= 0 ? 'houseWithClassicalFloors' : 'house';
  }
  return 'hut';
}

export class Settlement {
  constructor(map, volume, seed, parameters) {
    this.parameters = setSettlementParameters(parameters);
    this.seed = seed;
    this.map = map;
    this.volume = volume;
    this.random = new SeededRandom(seed);
    this.dayCount = 0;
    this.households = [];
    const pointCount = map.points.length;
    this.ownerOfPoint = new Array(pointCount).fill(null);
    this.traffic = new Float32Array(pointCount);       // every journey that ever crossed a point
    this.recentTraffic = new Float32Array(pointCount); // the same, the older ones soon forgotten (for the streets)
    this.trafficValue = new Float32Array(pointCount);  // the same, slowly forgotten, and half of it beside the way (for the price of land)
    this.security = new Float32Array(pointCount).fill(1);
    this.condition = new Float32Array(pointCount).fill(1); // how much of its worth the building of a point still has
    this.pressure = new Float32Array(pointCount);      // steps of detour a building has cost the journeys
    this.brokenBuildingCount = 0;
    this.clearedBuildingCount = 0;
    this.journeysToShow = [];
    this.journeyCount = 0;
    this.journeysToVenues = 0;
    this.journeysToOtherTowns = 0;
    this.landSoldByTheCity = 0;
    this.acquisitionCount = 0;
    // for seeing whether the town stalls or bounces back: a parcel bought back by a household that
    // had it before, a building pulled down, a garden built over or a building turned to garden,
    // a farmer turned merchant
    this.formerOwnersOfPoint = new Map();
    this.dayOfSaleOfPoint = new Map();      // point -> { seller (number), day }
    this.dayARoadWasOpened = new Int32Array(pointCount).fill(-1000000);
    this.dayOfLastGardenChange = new Int32Array(pointCount).fill(-1000000);
    this.boughtBackCount = 0;
    this.demolitionCount = 0;
    this.gardenBuiltOverCount = 0;
    this.buildingTurnedToGardenCount = 0;
    this.farmersTurnedMerchantCount = 0;
    this.investmentCountOfKind = {};
    // the city as a whole (city.js): its treasury, its buildings, its wall
    this.city = createCity();
    this.isWithinWalls = new Uint8Array(pointCount);
    this.hasAWall = false;
    this.wallCount = 0;
    this.roadRecentTraffic = roadRecentTraffic;
    this.busyStreetRecentTraffic = leastBusyStreetRecentTraffic;
    this.namesTaken = new Set();
    this.householdCount = 0;
    this.isKeptOpen = new Uint8Array(pointCount);
    volume.streetGrades = new Uint8Array(pointCount);
    volume.shopFronts = new Map();
    this.neighboursOfPoint = map.points.map(function (point, pointIndex) {
      return Array.from(map.sideNeighboursOfPoint[pointIndex]);
    });
    // the middle of the map, where the first settler stops; and the two other towns, on the rim
    const middleX = (map.bounds.minX + map.bounds.maxX) / 2;
    const middleZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    let middlePoint = 0;
    let leastDistance = Infinity;
    map.points.forEach(function (point, pointIndex) {
      const distance = Math.hypot(point.x - middleX, point.z - middleZ);
      if (distance < leastDistance) {
        leastDistance = distance;
        middlePoint = pointIndex;
      }
    });
    this.middlePoint = middlePoint;
    this.forum = { isPlace: true, kind: 'forum', pointIndices: [middlePoint] };
    this.otherTowns = this.chooseTheOtherTowns();
    if (this.otherTowns.length === 2) {
      const route = this.findWay(this.otherTowns[0], this.otherTowns[1], false);
      if (route !== null) {
        this.leaveTraffic(route.points, tradeRouteWeight);
      }
    }
  }

  // Two points on the rim of the map, far apart, where the roads lead to other towns
  chooseTheOtherTowns() {
    const map = this.map;
    const rimPoints = [];
    map.points.forEach(function (point, pointIndex) {
      if (point.isOnBoundary) {
        rimPoints.push(pointIndex);
      }
    });
    if (rimPoints.length < 2) {
      return [];
    }
    const width = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ);
    for (let attempt = 0; attempt < 200; attempt++) {
      const first = rimPoints[this.random.nextInt(rimPoints.length)];
      const second = rimPoints[this.random.nextInt(rimPoints.length)];
      const distance = Math.hypot(map.points[first].x - map.points[second].x, map.points[first].z - map.points[second].z);
      if (distance > 0.8 * width) {
        return [{ isPlace: true, kind: 'otherTown', pointIndices: [first] }, { isPlace: true, kind: 'otherTown', pointIndices: [second] }];
      }
    }
    return [];
  }

  isFree(pointIndex) {
    return this.ownerOfPoint[pointIndex] === null;
  }

  isRoad(pointIndex) {
    return this.isFree(pointIndex) && this.recentTraffic[pointIndex] >= roadRecentTraffic;
  }

  // ---------------------------------------------------------------------------
  // Prices and worth
  // ---------------------------------------------------------------------------
  // The price of a square metre of land at a point
  landPriceAt(pointIndex) {
    return this.trafficValue[pointIndex] * this.security[pointIndex] * parametersInUse.landPriceScale;
  }

  // What the land of a point is worth: its footprint at the price of land
  landValueAt(pointIndex) {
    return floorArea * this.landPriceAt(pointIndex);
  }

  // What the building on a point is worth, worn as it is
  buildingValueOf(stack, condition) {
    let value = 0;
    stack.forEach(function (tier) {
      if (tier === TIER.garden) {
        value += floorArea * gardenPrice;
      } else {
        value += floorArea * BUILDING_PRICE_OF_TIER[tier] * condition;
      }
    });
    return value;
  }

  // What a point is worth, land and building
  worthAsParcel(pointIndex) {
    return this.landValueAt(pointIndex) + this.buildingValueOf(stackOf(this.volume, pointIndex), this.condition[pointIndex]);
  }

  // What a road is worth, if it were sold: the price of its land
  worthAsRoad(pointIndex) {
    return this.landValueAt(pointIndex);
  }

  // Whether a point faces a street (a free point beside it that is used as road)
  facesAStreet(pointIndex) {
    const settlement = this;
    return this.neighboursOfPoint[pointIndex].some(function (neighbourPoint) {
      return settlement.isFree(neighbourPoint) && settlement.recentTraffic[neighbourPoint] >= roadRecentTraffic;
    });
  }

  // How well a household manages a point: less the further it lies from its home
  managementOf(household, pointIndex) {
    const home = this.map.points[household.homePoint];
    const point = this.map.points[pointIndex];
    const cellsAway = Math.hypot(point.x - home.x, point.z - home.z) / 4;
    return 1 / (1 + parametersInUse.managementLossPerCell * cellsAway);
  }

  // Whether a classical floor on a point brings its household the bonus of standing: only on its
  // first so many blocks with classical floors (the point itself counted among them)
  isDistinguished(household, pointIndex) {
    const volume = this.volume;
    let otherClassicalBlocks = 0;
    household.pointIndices.forEach(function (otherPoint) {
      if (otherPoint !== pointIndex && stackOf(volume, otherPoint).indexOf(TIER.classical) >= 0) {
        otherClassicalBlocks++;
      }
    });
    return otherClassicalBlocks < parametersInUse.distinguishedClassicalBlocks;
  }

  // What a stack on a point would let for in a day, for a household: each floor the land under it
  // (by the grade of the floor, less off the street, less for each floor up) and a share of the worth
  // of its building; times how well it is managed, and more beside gardens. A garden lets for
  // nothing. A classical floor lets for more than a house only on the household's first classical blocks.
  rentOf(pointIndex, stack, condition, household) {
    if (stack.length === 0 || stack[0] === TIER.garden) {
      return 0;
    }
    const parameters = parametersInUse;
    const landPrice = this.landPriceAt(pointIndex);
    const streetFactor = this.facesAStreet(pointIndex) ? 1 : parameters.backStreetLandFactor;
    const isDistinguished = stack.indexOf(TIER.classical) < 0 || this.isDistinguished(household, pointIndex);
    let lettingValue = 0;
    stack.forEach(function (tier, level) {
      const locationShare = tier === TIER.classical && !isDistinguished ? LOCATION_SHARE_OF_TIER[TIER.vernacular] : LOCATION_SHARE_OF_TIER[tier];
      const buildingShare = tier === TIER.classical && !isDistinguished ? BUILDING_PRICE_OF_TIER[TIER.vernacular] : BUILDING_PRICE_OF_TIER[tier];
      lettingValue += floorArea * landPrice * locationShare * streetFactor * Math.pow(parameters.upperFloorLandFactor, level);
      lettingValue += floorArea * buildingShare * condition * parameters.buildingRentShare;
    });
    let gardensBeside = 0;
    const volume = this.volume;
    this.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
      if (volume.tierAt(neighbourPoint, 0) === TIER.garden) {
        gardensBeside++;
      }
    });
    const gardenFactor = 1 + parameters.gardenRentBonus * Math.min(2, gardensBeside);
    return lettingValue * parameters.rentRateEachDay * this.managementOf(household, pointIndex) * gardenFactor;
  }

  rentOfPoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household === null || household.isCity) {
      return 0;
    }
    return this.rentOf(pointIndex, stackOf(this.volume, pointIndex), this.condition[pointIndex], household);
  }

  // ---------------------------------------------------------------------------
  // A day
  // ---------------------------------------------------------------------------
  step() {
    this.dayCount++;
    const parameters = parametersInUse;
    let volumeChanged = false;
    if (this.random.nextFloat() < parameters.chanceOfAnArrivalEachDay && this.settledPointCount() < parameters.mostGroundSettled * this.map.points.length) {
      volumeChanged = this.settleANewHousehold() || volumeChanged;
    }
    const journeyCount = Math.ceil(this.households.length * parameters.journeysPerHouseholdEachDay);
    for (let journey = 0; journey < journeyCount; journey++) {
      volumeChanged = this.travel() || volumeChanged;
    }
    // the streets: busy is measured against the busiest point of the town
    let highestRecentTraffic = 0;
    for (let pointIndex = 0; pointIndex < this.traffic.length; pointIndex++) {
      highestRecentTraffic = Math.max(highestRecentTraffic, this.recentTraffic[pointIndex]);
    }
    this.busyStreetRecentTraffic = Math.max(leastBusyStreetRecentTraffic, parameters.shareOfTheBusiestStreet * highestRecentTraffic);
    for (let pointIndex = 0; pointIndex < this.traffic.length; pointIndex++) {
      this.recentTraffic[pointIndex] *= recentTrafficKeptEachDay;
      this.trafficValue[pointIndex] *= parameters.trafficKeptEachDay;
      this.pressure[pointIndex] *= pressureKeptEachDay;
      if (this.condition[pointIndex] > conditionOfAWornBuilding) {
        this.condition[pointIndex] = Math.max(conditionOfAWornBuilding, this.condition[pointIndex] - parameters.depreciationEachDay);
      }
      this.volume.streetGrades[pointIndex] = this.streetGradeFor(this.recentTraffic[pointIndex], this.volume.streetGrades[pointIndex]);
    }
    volumeChanged = this.openShops() || volumeChanged;
    // the households: rents and farm yield in, tax out; now and then an investment
    const settlement = this;
    this.households.slice().forEach(function (household) {
      if (household.pointIndices.length === 0) {
        return;
      }
      settlement.keepTheBooks(household);
      if (household.livelihood === 'farmer' && settlement.landPriceAt(household.homePoint) >= parameters.landPriceOfAMerchant) {
        household.livelihood = 'merchant'; // the land it lives on has become too dear to farm
        settlement.farmersTurnedMerchantCount++;
      }
      if (settlement.dayCount >= household.dayOfNextSearch) {
        household.dayOfNextSearch = settlement.dayCount + parameters.daysBetweenInvestmentSearches;
        volumeChanged = settlement.investPerhaps(household) || volumeChanged;
      }
    });
    volumeChanged = runTheCity(this) || volumeChanged;
    return volumeChanged;
  }

  // A household's day in money: its rents, its farm yield if it farms, less its tax. onlyCounting:
  // the rents and the worth are reckoned (for the pictures), but no money changes hands.
  keepTheBooks(household, onlyCounting) {
    const settlement = this;
    let rent = 0;
    let worth = 0;
    let upkeep = 0;
    household.pointIndices.forEach(function (pointIndex) {
      rent += settlement.rentOfPoint(pointIndex);
      worth += settlement.worthAsParcel(pointIndex);
      upkeep += settlement.upkeepOf(stackOf(settlement.volume, pointIndex));
    });
    let farmYield = 0;
    if (household.livelihood === 'farmer') {
      farmYield = parametersInUse.farmYieldEachDay * this.farmlandShareAt(household.homePoint);
    }
    const tax = worth * this.parameters.taxShareOfPropertyEachDay;
    household.rentOfTheDay = rent + farmYield;
    household.worth = worth;
    if (onlyCounting) {
      return;
    }
    household.money += rent + farmYield - tax - upkeep;
    household.upkeepOfTheDay = upkeep;
    this.city.money += tax;
    this.city.moneyCollected += tax;
  }

  // What the classical floors of a stack cost to keep up in a day
  upkeepOf(stack) {
    let upkeep = 0;
    stack.forEach(function (tier) {
      if (tier === TIER.classical) {
        upkeep += floorArea * BUILDING_PRICE_OF_TIER[TIER.classical] * parametersInUse.classicalUpkeepEachDay;
      }
    });
    return upkeep;
  }

  // The free land a farmer at a point can work: the free points round it, shared with the other farmers there
  farmlandShareAt(pointIndex) {
    let freeLand = 0;
    let farmers = 0;
    const settlement = this;
    this.pointsWithinSteps(pointIndex, stepsOfFarmland).forEach(function (nearPoint) {
      const household = settlement.ownerOfPoint[nearPoint];
      if (household === null) {
        if (!settlement.isRoad(nearPoint) && settlement.volume.works[nearPoint] === 0 && !settlement.map.points[nearPoint].isOnBoundary) {
          freeLand++;
        }
      } else if (household.livelihood === 'farmer' && household.homePoint === nearPoint) {
        farmers++;
      }
    });
    return freeLand / (1 + farmers);
  }

  // The points within so many steps of a point (along the sides of the quads)
  pointsWithinSteps(pointIndex, stepCount) {
    const found = [pointIndex];
    const seen = new Set(found);
    let ring = [pointIndex];
    for (let step = 0; step < stepCount; step++) {
      const next = [];
      for (const ringPoint of ring) {
        for (const neighbourPoint of this.neighboursOfPoint[ringPoint]) {
          if (!seen.has(neighbourPoint)) {
            seen.add(neighbourPoint);
            next.push(neighbourPoint);
            found.push(neighbourPoint);
          }
        }
      }
      ring = next;
    }
    return found;
  }

  // A public building raises the security round it
  raiseSecurityForAPublicBuilding(pointIndex) {
    this.raiseSecurity(pointIndex, SECURITY_BOOST.publicBuilding, stepsOfAPublicSecurityBoost);
  }

  // Security raised (or, with a negative amount, taken away) round a point
  raiseSecurity(pointIndex, amount, stepCount) {
    const settlement = this;
    this.pointsWithinSteps(pointIndex, stepCount).forEach(function (nearPoint) {
      settlement.security[nearPoint] = Math.max(1, settlement.security[nearPoint] + amount);
    });
  }

  // ---------------------------------------------------------------------------
  // Streets and shops
  // ---------------------------------------------------------------------------
  streetGradeFor(recentTraffic, gradeBefore) {
    const keeps = shareOfTrafficThatKeepsAGrade;
    const busyStreetRecentTraffic = this.busyStreetRecentTraffic;
    if (recentTraffic >= busyStreetRecentTraffic || (gradeBefore === STREET_GRADE.busyStreet && recentTraffic >= busyStreetRecentTraffic * keeps)) {
      return STREET_GRADE.busyStreet;
    }
    if (recentTraffic >= roadRecentTraffic || (gradeBefore >= STREET_GRADE.street && recentTraffic >= roadRecentTraffic * keeps)) {
      return STREET_GRADE.street;
    }
    return STREET_GRADE.yard;
  }

  openShops() {
    let shopOpened = false;
    const shopFronts = this.volume.shopFronts;
    for (let facedPoint = 0; facedPoint < this.traffic.length; facedPoint++) {
      if (this.volume.streetGrades[facedPoint] !== STREET_GRADE.busyStreet || this.ownerOfPoint[facedPoint] !== null) {
        continue;
      }
      for (const raisedPoint of this.neighboursOfPoint[facedPoint]) {
        if (this.volume.tierAt(raisedPoint, 0) !== TIER.vernacular || this.volume.hasShopFront(raisedPoint, facedPoint) ||
          this.random.nextFloat() >= parametersInUse.chanceOfAShopOpeningEachDay) {
          continue;
        }
        if (!shopFronts.has(raisedPoint)) {
          shopFronts.set(raisedPoint, new Set());
        }
        shopFronts.get(raisedPoint).add(facedPoint);
        shopOpened = true;
      }
    }
    return shopOpened;
  }

  // The ground the monuments want open before them: what stands there (but nothing classical) is
  // bought by the city and cleared; nobody settles or builds there. Returns whether the volume changed.
  keepOpen(pointIndices) {
    this.isKeptOpen.fill(0);
    let volumeChanged = false;
    const settlement = this;
    pointIndices.forEach(function (pointIndex) {
      settlement.isKeptOpen[pointIndex] = 1;
      const household = settlement.ownerOfPoint[pointIndex];
      if (household === null || household.isCity || settlement.volume.tierAt(pointIndex, 0) === TIER.classical) {
        return;
      }
      settlement.clearForTheCity(pointIndex);
      settlement.clearedBuildingCount++;
      volumeChanged = true;
    });
    return volumeChanged;
  }

  // A point bought by the city at its worth and cleared
  clearForTheCity(pointIndex) {
    this.demolitionCount++;
    const household = this.ownerOfPoint[pointIndex];
    const worth = this.worthAsParcel(pointIndex);
    household.money += worth;
    this.city.money -= worth;
    this.city.moneySpent += worth;
    this.takePoint(pointIndex);
    this.volume.setTier(pointIndex, 0, TIER.empty);
    this.pressure[pointIndex] = 0;
  }

  settledPointCount() {
    let count = 0;
    this.households.forEach(function (household) {
      count += household.pointIndices.length;
    });
    return count;
  }

  // Whether a point may be taken by a household: free, not on the rim, not kept open or under a
  // work, and leaving every building beside it some open ground. A road only where its traffic is
  // not that of a busy street (isRoadAllowed).
  mayTake(pointIndex, isRoadAllowed) {
    if (!this.isFree(pointIndex) || this.isKeptOpen[pointIndex] || this.volume.works[pointIndex] !== 0 || this.map.points[pointIndex].isOnBoundary) {
      return false;
    }
    if (this.dayCount - this.dayARoadWasOpened[pointIndex] < daysAnOpenedRoadIsKept) {
      return false; // the city opened it for the traffic lately
    }
    if (this.isRoad(pointIndex) && (!isRoadAllowed || this.volume.streetGrades[pointIndex] === STREET_GRADE.busyStreet)) {
      return false;
    }
    const settlement = this;
    function keepsOpenGround(ofPoint) {
      return settlement.neighboursOfPoint[ofPoint].some(function (neighbourPoint) {
        return neighbourPoint !== pointIndex && settlement.isFree(neighbourPoint);
      });
    }
    return keepsOpenGround(pointIndex) && this.neighboursOfPoint[pointIndex].every(function (neighbourPoint) {
      return settlement.isFree(neighbourPoint) || keepsOpenGround(neighbourPoint);
    });
  }

  // What the city asks for a free point: the price of its land; a street three times as much
  landPriceToPay(pointIndex) {
    const price = this.landValueAt(pointIndex);
    return this.isRoad(pointIndex) ? price * (1 + parametersInUse.streetPremium) : price;
  }

  // ---------------------------------------------------------------------------
  // Newcomers
  // ---------------------------------------------------------------------------
  // A newcomer: a farmer or a merchant. It looks at some free places near the town (and a few
  // anywhere) and settles where it does best and can pay for the land and a hut.
  settleANewHousehold() {
    const parameters = parametersInUse;
    const livelihood = this.households.length === 0 || this.random.nextFloat() >= parameters.shareOfFarmers ? 'merchant' : 'farmer';
    const capital = parameters.startingCapital;
    const hutCost = floorCost(TIER.temporary, 0);
    let site = -1;
    if (this.households.length === 0) {
      site = this.middlePoint;
    } else {
      let bestValue = -Infinity;
      for (let attempt = 0; attempt < 40; attempt++) {
        let candidate = -1;
        if (attempt % 5 === 4) {
          candidate = this.random.nextInt(this.map.points.length);
        } else {
          const host = this.households[this.random.nextInt(this.households.length)];
          candidate = host.pointIndices[this.random.nextInt(host.pointIndices.length)];
          const stepCount = 1 + this.random.nextInt(livelihood === 'farmer' ? 6 : 3);
          for (let step = 0; step < stepCount; step++) {
            const neighbours = this.neighboursOfPoint[candidate];
            candidate = neighbours[this.random.nextInt(neighbours.length)];
          }
        }
        if (!this.mayTake(candidate, false) || this.landPriceToPay(candidate) + hutCost > capital) {
          continue;
        }
        // a farmer: free land near, few farmers, some security; a merchant: the dearest land it can pay
        const value = livelihood === 'farmer'
          ? this.farmlandShareAt(candidate) * Math.sqrt(this.security[candidate])
          : this.landPriceAt(candidate);
        if (value + this.random.nextFloat() * 1e-6 > bestValue) {
          bestValue = value;
          site = candidate;
        }
      }
    }
    if (site === -1) {
      return false;
    }
    this.householdCount++;
    const household = {
      number: this.householdCount, name: nameOfHousehold(this.householdCount, this.seed, this.namesTaken), dayOfArrival: this.dayCount,
      livelihood: livelihood, homePoint: site, pointIndices: [], money: capital, rentOfTheDay: 0, worth: 0,
      dayOfNextSearch: this.dayCount + 1 + this.random.nextInt(parameters.daysBetweenInvestmentSearches),
    };
    this.households.push(household);
    this.buyLand(site, household);
    this.buildOnPoint(site, [TIER.temporary]);
    household.money -= hutCost;
    this.condition[site] = 1;
    this.raiseSecurity(site, SECURITY_BOOST[livelihood], stepsOfASecurityBoost);
    household.securityBoost = SECURITY_BOOST[livelihood];
    return true;
  }

  // A free point bought from the city
  buyLand(pointIndex, household) {
    const price = this.landPriceToPay(pointIndex);
    household.money -= price;
    this.city.money += price;
    this.city.moneyCollected += price;
    this.landSoldByTheCity += price;
    this.givePoint(pointIndex, household);
  }

  givePoint(pointIndex, household) {
    this.ownerOfPoint[pointIndex] = household;
    this.volume.setOwner(pointIndex, household.number);
    household.pointIndices.push(pointIndex);
    this.pressure[pointIndex] = 0;
  }

  // A point is taken from its household; a household without ground is gone, and the security it
  // brought goes with it
  takePoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    household.pointIndices.splice(household.pointIndices.indexOf(pointIndex), 1);
    this.ownerOfPoint[pointIndex] = null;
    this.volume.shopFronts.delete(pointIndex);
    this.volume.setOwner(pointIndex, 0);
    if (household.pointIndices.length === 0) {
      this.raiseSecurity(household.homePoint, -household.securityBoost, stepsOfASecurityBoost);
      this.households.splice(this.households.indexOf(household), 1);
    } else if (household.homePoint === pointIndex) {
      household.homePoint = household.pointIndices[0];
    }
  }

  buildOnPoint(pointIndex, stack) {
    this.volume.setTier(pointIndex, 0, TIER.empty); // takes away what stood there, all of it
    const volume = this.volume;
    stack.forEach(function (tier, level) {
      volume.setTier(pointIndex, level, tier);
    });
  }

  // ---------------------------------------------------------------------------
  // Investment
  // ---------------------------------------------------------------------------
  // Whether a household may begin a tower: it has none, and the town has fewer than it has room for
  mayBeginATower(household) {
    const volume = this.volume;
    function isATower(pointIndex) {
      return kindOfStack(stackOf(volume, pointIndex)) === 'tower';
    }
    if (household.pointIndices.some(isATower)) {
      return false;
    }
    let towerCount = 0;
    for (let pointIndex = 0; pointIndex < this.map.points.length; pointIndex++) {
      if (volume.tierAt(pointIndex, 3) === TIER.classical && isATower(pointIndex)) {
        towerCount++;
      }
    }
    return towerCount < Math.floor(this.households.length / parametersInUse.householdsForEachTower);
  }

  // What could be built on a point that has a stack: [{ kind, stack, cost }]. A floor more on
  // top (of the same kind, or a classical top floor on a house), a floor or all of it rebuilt in
  // another kind, or, from nothing (or from a garden), a first floor of any kind.
  buildingChoicesFor(household, stack, condition) {
    const choices = [];
    // the building renewed as it is: what it has lost of its worth, paid again
    if (stack.length > 0 && stack[0] !== TIER.garden && condition !== undefined && condition < 0.7) {
      const newWorth = this.buildingValueOf(stack, 1);
      choices.push({ kind: 'renew', stack: stack.slice(), cost: newWorth - this.buildingValueOf(stack, condition) });
    }
    if (stack.length === 0 || stack[0] === TIER.garden) {
      [TIER.temporary, TIER.vernacular, TIER.classical].forEach(function (tier) {
        choices.push({ kind: 'build', stack: [tier], cost: floorCost(tier, 0) });
      });
      return choices;
    }
    const top = stack[stack.length - 1];
    const levelCount = stack.length;
    const isAllClassical = stack.every(function (tier) { return tier === TIER.classical; });
    const isAllHut = stack.every(function (tier) { return tier === TIER.temporary; });
    // a floor more on top
    if (top === TIER.temporary && levelCount < MOST_LEVELS_OF_TIER[TIER.temporary]) {
      choices.push({ kind: 'buildUp', stack: stack.concat([TIER.temporary]), cost: floorCost(TIER.temporary, levelCount) });
    }
    if (top === TIER.vernacular && levelCount < MOST_LEVELS_OF_TIER[TIER.vernacular]) {
      choices.push({ kind: 'buildUp', stack: stack.concat([TIER.vernacular]), cost: floorCost(TIER.vernacular, levelCount) });
      if (levelCount >= 2) {
        choices.push({ kind: 'classicalTopFloor', stack: stack.concat([TIER.classical]), cost: floorCost(TIER.classical, levelCount) });
      }
    }
    if (isAllClassical && (levelCount < MOST_LEVELS_OF_TIER[TIER.classical] ||
      (levelCount < mostLevelsOfATower && (levelCount > 3 || this.mayBeginATower(household))))) {
      choices.push({ kind: levelCount >= 3 ? 'tower' : 'buildUp', stack: stack.concat([TIER.classical]), cost: floorCost(TIER.classical, levelCount) });
    }
    // rebuilt in another kind
    if (isAllHut) {
      const rebuilt = stack.map(function () { return TIER.vernacular; });
      choices.push({ kind: 'rebuildAsHouse', stack: rebuilt, cost: rebuilt.reduce(function (sum, tier, level) { return sum + floorCost(tier, level); }, 0) });
    }
    if (stack[0] === TIER.vernacular && levelCount >= 2) {
      choices.push({ kind: 'classicalGroundFloor', stack: [TIER.classical].concat(stack.slice(1)), cost: floorCost(TIER.classical, 0) });
    }
    if (!isAllClassical) {
      // (a house taller than a classical block may be, rebuilt lower)
      const rebuilt = stack.slice(0, MOST_LEVELS_OF_TIER[TIER.classical]).map(function () { return TIER.classical; });
      choices.push({ kind: 'rebuildAsClassical', stack: rebuilt, cost: rebuilt.reduce(function (sum, tier, level) { return sum + floorCost(tier, level); }, 0) });
    }
    return choices;
  }

  // The return a household asks of an investment: the required return, less where money lies idle.
  // A household that holds as much money as its property is worth asks half as much; one that holds
  // little asks the full return. So money that has nowhere to go goes after smaller returns, and a
  // household rich in money buys from one that is not.
  hurdleOf(household) {
    const worth = Math.max(1, household.worth || 0);
    const parameters = parametersInUse;
    return parameters.requiredReturnEachDay * Math.max(parameters.leastHurdleShare, 1 / (1 + Math.max(0, household.money) / worth));
  }

  // A household looks over what it could do and does the best of it, if anything is worth doing:
  // the one that brings the most rent for its cost, and at least the required return. Returns
  // whether the volume changed.
  investPerhaps(household) {
    const parameters = parametersInUse;
    const settlement = this;
    const volume = this.volume;
    const ownsAHouse = household.pointIndices.some(function (pointIndex) {
      const kind = kindOfStack(stackOf(volume, pointIndex));
      return kind !== 'hut' && kind !== 'garden' && kind !== 'none';
    });
    let best = null;
    const hurdle = this.hurdleOf(household);
    function consider(option) {
      if (option.cost <= 0 || option.cost > household.money) {
        return;
      }
      const returnEachDay = option.rentGained / option.cost;
      if (returnEachDay >= hurdle && (best === null || returnEachDay > best.returnEachDay)) {
        option.returnEachDay = returnEachDay;
        best = option;
      }
    }
    // its own points: build, build up, rebuild, or lay out as a garden
    household.pointIndices.forEach(function (pointIndex) {
      const stack = stackOf(volume, pointIndex);
      const rentNow = settlement.rentOf(pointIndex, stack, settlement.condition[pointIndex], household);
      const gardenIsSettled = settlement.dayCount - settlement.dayOfLastGardenChange[pointIndex] < daysAGardenIsKept;
      settlement.buildingChoicesFor(household, stack, settlement.condition[pointIndex]).forEach(function (choice) {
        if (gardenIsSettled && stack[0] === TIER.garden) {
          return; // a garden laid out lately stays a garden
        }
        const rentAfter = settlement.rentOf(pointIndex, choice.stack, 1, household) - settlement.upkeepOf(choice.stack);
        consider({ kind: choice.kind, pointIndex: pointIndex, stack: choice.stack, cost: choice.cost, rentGained: rentAfter - (rentNow - settlement.upkeepOf(stack)) });
      });
      if (ownsAHouse && pointIndex !== household.homePoint && stack[0] !== TIER.garden && !gardenIsSettled) {
        // a garden: its own rent is lost, the rent of the household's points beside it grows
        let rentGainedBeside = 0;
        settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
          if (settlement.ownerOfPoint[neighbourPoint] === household) {
            rentGainedBeside += parameters.gardenRentBonus * settlement.rentOfPoint(neighbourPoint);
          }
        });
        consider({ kind: 'garden', pointIndex: pointIndex, stack: [TIER.garden], cost: floorArea * gardenPrice, rentGained: rentGainedBeside - rentNow });
      }
    });
    // the ground beside its points, and a few points elsewhere
    const candidates = new Set();
    household.pointIndices.forEach(function (pointIndex) {
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        candidates.add(neighbourPoint);
      });
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      candidates.add(this.random.nextInt(this.map.points.length));
    }
    candidates.forEach(function (pointIndex) {
      const owner = settlement.ownerOfPoint[pointIndex];
      if (owner === household) {
        return;
      }
      if (owner === null) {
        // free land, bought from the city and built on
        if (!settlement.mayTake(pointIndex, true)) {
          return;
        }
        const landCost = settlement.landPriceToPay(pointIndex);
        settlement.buildingChoicesFor(household, []).forEach(function (choice) {
          consider({
            kind: 'buyLandAndBuild', pointIndex: pointIndex, stack: choice.stack, cost: landCost + choice.cost,
            rentGained: settlement.rentOf(pointIndex, choice.stack, 1, household) - settlement.upkeepOf(choice.stack),
          });
        });
        return;
      }
      if (owner.isCity || volume.publicBuildingOfPoint[pointIndex] !== 0) {
        return;
      }
      // a neighbour's parcel, at its worth and a premium, as it stands
      // The owner sells only where the price brings it more than keeping the parcel would: where
      // its own rent from it is less than the return it asks (hurdleOf) on the price. (Without this, two
      // neighbours buy the same parcel from each other again and again.) Nobody sells its home.
      const stack = stackOf(volume, pointIndex);
      const price = settlement.worthAsParcel(pointIndex) * (1 + parameters.acquisitionPremium);
      const rentOfTheSeller = settlement.rentOf(pointIndex, stack, settlement.condition[pointIndex], owner);
      const lastSale = settlement.dayOfSaleOfPoint.get(pointIndex);
      const isABuyingBack = lastSale !== undefined && lastSale.seller === household.number && settlement.dayCount - lastSale.day < daysBeforeBuyingBack;
      if (isABuyingBack || pointIndex === owner.homePoint || rentOfTheSeller >= settlement.hurdleOf(owner) * price) {
        return;
      }
      consider({
        kind: 'acquire', pointIndex: pointIndex, stack: stack, seller: owner, cost: price,
        rentGained: settlement.rentOf(pointIndex, stack, settlement.condition[pointIndex], household) - settlement.upkeepOf(stack),
      });
    });
    if (best === null) {
      return false;
    }
    this.investmentCountOfKind[best.kind] = (this.investmentCountOfKind[best.kind] || 0) + 1;
    if (best.kind === 'acquire') {
      const formerOwners = this.formerOwnersOfPoint.get(best.pointIndex) || [];
      if (formerOwners.indexOf(household.number) >= 0) {
        this.boughtBackCount++;
      }
      formerOwners.push(best.seller.number);
      this.dayOfSaleOfPoint.set(best.pointIndex, { seller: best.seller.number, day: this.dayCount });
      this.formerOwnersOfPoint.set(best.pointIndex, formerOwners.slice(-4));
      household.money -= best.cost;
      best.seller.money += best.cost;
      this.takePoint(best.pointIndex);
      this.givePoint(best.pointIndex, household);
      this.acquisitionCount++;
      return true;
    }
    if (best.kind === 'buyLandAndBuild') {
      const landCost = this.landPriceToPay(best.pointIndex);
      this.buyLand(best.pointIndex, household);
      household.money -= best.cost - landCost;
    } else {
      household.money -= best.cost;
      this.volume.shopFronts.delete(best.pointIndex);
      const wasAGarden = this.volume.tierAt(best.pointIndex, 0) === TIER.garden;
      if (wasAGarden !== (best.kind === 'garden')) {
        this.dayOfLastGardenChange[best.pointIndex] = this.dayCount;
      }
      if (wasAGarden && best.kind !== 'garden') {
        this.gardenBuiltOverCount++;
      } else if (!wasAGarden && best.kind === 'garden' && this.volume.tierAt(best.pointIndex, 0) !== TIER.empty) {
        this.buildingTurnedToGardenCount++;
      }
    }
    this.buildOnPoint(best.pointIndex, best.stack);
    this.condition[best.pointIndex] = 1;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Journeys
  // ---------------------------------------------------------------------------
  // The venues people travel to: the city's buildings, each with its points and its draw
  venues() {
    const publicBuildings = this.volume.publicBuildings;
    const venueBuildings = publicBuildings.filter(function (building) { return DRAW_OF_A_VENUE[building.kind] !== undefined; });
    if (!this.venuesKnown || this.venuesKnown.length !== venueBuildings.length) {
      this.venuesKnown = venueBuildings.map(function (building) {
        return { isVenue: true, kind: building.kind, draw: DRAW_OF_A_VENUE[building.kind], pointIndices: pointsOfPublicBuilding(building) };
      });
    }
    return this.venuesKnown;
  }

  // Where a household goes today. A farmer: to a venue of the city (by their draw), or to the
  // forum while there is none. A merchant: to another town, to a venue, or to a household of
  // worth (the worthier the likelier).
  destinationFor(household) {
    const settlement = this;
    const venues = this.venues();
    function aVenue() {
      if (venues.length === 0) {
        return settlement.forum;
      }
      let totalDraw = 0;
      venues.forEach(function (venue) { totalDraw += venue.draw; });
      let pick = settlement.random.nextFloat() * totalDraw;
      for (const venue of venues) {
        pick -= venue.draw;
        if (pick <= 0) {
          return venue;
        }
      }
      return venues[venues.length - 1];
    }
    if (household.livelihood === 'farmer') {
      return aVenue();
    }
    const choice = this.random.nextFloat();
    if (choice < 0.4 && this.otherTowns.length === 2) {
      return this.otherTowns[this.random.nextInt(2)];
    }
    if (choice < 0.7) {
      return aVenue();
    }
    // a household of worth: of a few, each as likely as its worth
    let totalWorth = 0;
    const candidates = [];
    for (let candidateNumber = 0; candidateNumber < 6; candidateNumber++) {
      const candidate = this.households[this.random.nextInt(this.households.length)];
      if (candidate !== household) {
        candidates.push(candidate);
        totalWorth += candidate.worth || 1;
      }
    }
    let pick = this.random.nextFloat() * totalWorth;
    for (const candidate of candidates) {
      pick -= candidate.worth || 1;
      if (pick <= 0) {
        return candidate;
      }
    }
    return candidates.length > 0 ? candidates[candidates.length - 1] : aVenue();
  }

  // Traffic left along a way: its weight on the points of the way, half of it beside them
  leaveTraffic(points, weight) {
    const settlement = this;
    const besideTheWay = new Set();
    points.forEach(function (pointIndex) {
      settlement.traffic[pointIndex] += 1;
      settlement.recentTraffic[pointIndex] += 1;
      settlement.trafficValue[pointIndex] += weight;
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        besideTheWay.add(neighbourPoint);
      });
    });
    points.forEach(function (pointIndex) { besideTheWay.delete(pointIndex); });
    besideTheWay.forEach(function (pointIndex) {
      settlement.trafficValue[pointIndex] += weight * 0.5;
    });
  }

  // One journey of a household. It would like to go the shortest way, through buildings if need
  // be (each costing as many steps); it has to go round them, and the difference presses on them.
  // A building whose pressure outgrows its worth is bought by the city and pulled down. Where no
  // way is left at all, the city opens one at once through the cheapest building. Returns
  // whether the volume changed.
  travel() {
    if (this.households.length === 0) {
      return false;
    }
    const origin = this.households[this.random.nextInt(this.households.length)];
    const destination = this.destinationFor(origin);
    if (destination === null || destination === origin) {
      return false;
    }
    const settlement = this;
    const wished = this.findWay(origin, destination, true);
    let taken = wished;
    let buildingFell = false;
    if (wished !== null && wished.crossedBuildings.length > 0) {
      taken = this.findWay(origin, destination, false);
      if (taken === null) {
        // no way left: the city opens one through the cheapest of the buildings in the way
        let cheapest = -1;
        wished.crossedBuildings.forEach(function (pointIndex) {
          const owner = settlement.ownerOfPoint[pointIndex];
          if (owner !== null && !owner.isCity && (cheapest === -1 || settlement.worthAsParcel(pointIndex) < settlement.worthAsParcel(cheapest))) {
            cheapest = pointIndex;
          }
        });
        if (cheapest !== -1) {
          this.breakDown(cheapest);
          buildingFell = true;
        }
      } else {
        const stepsSaved = Math.max(0, taken.cost - (wished.cost - wished.crossedBuildings.length * parametersInUse.stepsABuildingCosts));
        wished.crossedBuildings.forEach(function (pointIndex) {
          if (settlement.ownerOfPoint[pointIndex] === null) {
            return;
          }
          settlement.pressure[pointIndex] += stepsSaved;
          // (the city buys the building only when it has the money for it)
          const worth = settlement.worthAsParcel(pointIndex);
          if (settlement.pressure[pointIndex] * parametersInUse.moneyWorthOfAStepSaved >= worth && settlement.city.money >= worth) {
            settlement.breakDown(pointIndex);
            buildingFell = true;
          }
        });
      }
    }
    if (taken === null || origin.pointIndices.length === 0) {
      return buildingFell;
    }
    this.leaveTraffic(taken.points, JOURNEY_WEIGHT[origin.livelihood]);
    this.journeyCount++;
    if (destination.isVenue) {
      this.journeysToVenues++;
    } else if (destination.kind === 'otherTown') {
      this.journeysToOtherTowns++;
    }
    this.journeysToShow.push(taken.points.slice().reverse());
    if (this.journeysToShow.length > mostJourneysToShow) {
      this.journeysToShow.shift();
    }
    return buildingFell;
  }

  // A building in the way: the city buys it at its worth, pulls it down, and the ground is road again
  breakDown(pointIndex) {
    this.clearForTheCity(pointIndex);
    this.dayARoadWasOpened[pointIndex] = this.dayCount;
    this.recentTraffic[pointIndex] = Math.max(this.recentTraffic[pointIndex], roadRecentTraffic);
    this.brokenBuildingCount++;
  }

  // The way from one place to another that costs the least: a step onto a point costs from 1 (the
  // first time it is trodden) down to half; a building of somebody else, where it may be crossed,
  // costs as many steps more. Nobody walks through the wall (only its gates), a fountain, or what
  // the city has built. A place is a household, a venue, the forum or another town: anything with
  // pointIndices. Returns { points, cost, crossedBuildings }, or null where there is no way.
  findWay(origin, destination, mayCrossBuildings) {
    const settlement = this;
    const pointCount = this.map.points.length;
    const costTo = new Float64Array(pointCount).fill(Infinity);
    const cameFrom = new Int32Array(pointCount).fill(-1);
    const isGoal = new Uint8Array(pointCount);
    const stepsABuildingCosts = parametersInUse.stepsABuildingCosts;
    function mayStepOnto(pointIndex) {
      const works = settlement.volume.works[pointIndex];
      if ((works & WORK.wall) !== 0 || (works & WORK.fountain) !== 0) {
        return false;
      }
      const owner = settlement.ownerOfPoint[pointIndex];
      if (owner !== null && owner.isCity) {
        return false;
      }
      return owner === null || (mayCrossBuildings && owner !== origin && owner !== destination);
    }
    function costOfStepOnto(pointIndex) {
      const journeyCount = Math.max(1, settlement.traffic[pointIndex]);
      return 1 / (2 * journeyCount) + 0.5 + (settlement.ownerOfPoint[pointIndex] === null ? 0 : stepsABuildingCosts);
    }
    // a place that is a point of free ground (another town, the forum) is a goal itself; a
    // building is reached at the free ground beside it
    destination.pointIndices.forEach(function (pointIndex) {
      if (settlement.ownerOfPoint[pointIndex] === null && mayStepOnto(pointIndex)) {
        isGoal[pointIndex] = 1;
      }
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (mayStepOnto(neighbourPoint)) {
          isGoal[neighbourPoint] = 1;
        }
      });
    });
    const heap = [];
    function push(cost, pointIndex) {
      heap.push([cost, pointIndex]);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (heap[parent][0] <= heap[child][0]) {
          break;
        }
        const swapped = heap[parent];
        heap[parent] = heap[child];
        heap[child] = swapped;
        child = parent;
      }
    }
    function pop() {
      const least = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let parent = 0;
        for (;;) {
          let smallest = parent;
          const left = 2 * parent + 1;
          const right = left + 1;
          if (left < heap.length && heap[left][0] < heap[smallest][0]) {
            smallest = left;
          }
          if (right < heap.length && heap[right][0] < heap[smallest][0]) {
            smallest = right;
          }
          if (smallest === parent) {
            break;
          }
          const swapped = heap[parent];
          heap[parent] = heap[smallest];
          heap[smallest] = swapped;
          parent = smallest;
        }
      }
      return least;
    }
    origin.pointIndices.forEach(function (pointIndex) {
      if (settlement.ownerOfPoint[pointIndex] === null && costTo[pointIndex] === Infinity) {
        costTo[pointIndex] = 0; // (a place that is free ground itself)
        push(0, pointIndex);
      }
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (mayStepOnto(neighbourPoint) && costTo[neighbourPoint] === Infinity) {
          costTo[neighbourPoint] = costOfStepOnto(neighbourPoint);
          push(costTo[neighbourPoint], neighbourPoint);
        }
      });
    });
    while (heap.length > 0) {
      const least = pop();
      const pointIndex = least[1];
      if (least[0] > costTo[pointIndex]) {
        continue;
      }
      if (isGoal[pointIndex]) {
        const points = [];
        const crossedBuildings = [];
        for (let step = pointIndex; step !== -1; step = cameFrom[step]) {
          if (this.ownerOfPoint[step] === null) {
            points.push(step);
          } else {
            crossedBuildings.push(step);
          }
        }
        return { points: points, cost: least[0], crossedBuildings: crossedBuildings };
      }
      this.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (!mayStepOnto(neighbourPoint)) {
          return;
        }
        const cost = least[0] + costOfStepOnto(neighbourPoint);
        if (cost < costTo[neighbourPoint]) {
          costTo[neighbourPoint] = cost;
          cameFrom[neighbourPoint] = pointIndex;
          push(cost, neighbourPoint);
        }
      });
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // For people and pictures
  // ---------------------------------------------------------------------------
  // Whether a point holds something that lasts (anything but a hut): for the wall and the tax of the city
  isLastingAt(pointIndex) {
    const kind = kindOfStack(stackOf(this.volume, pointIndex));
    return kind !== 'none' && kind !== 'hut';
  }

  // Whether a household owns anything that lasts
  isLastingHousehold(household) {
    const settlement = this;
    return household.pointIndices.some(function (pointIndex) { return settlement.isLastingAt(pointIndex); });
  }

  describeStack(stack) {
    const kind = kindOfStack(stack);
    if (kind === 'garden') {
      return 'a garden';
    }
    const tierNames = { [TIER.temporary]: 'hut', [TIER.vernacular]: 'house', [TIER.classical]: 'classical' };
    const levels = stack.map(function (tier) { return tierNames[tier]; });
    const isOfOneKind = levels.every(function (level) { return level === levels[0]; });
    return isOfOneKind ? levels.length + (levels.length === 1 ? ' level of ' : ' levels of ') + levels[0] : levels.join(' / ');
  }

  // A household in words, for whoever points at its building
  describePoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household === null) {
      return null;
    }
    if (household.isCity) {
      return 'The city';
    }
    return household.name + ' (' + household.livelihood + ') · here: ' + this.describeStack(stackOf(this.volume, pointIndex)) +
      ' · holding ' + household.pointIndices.length + (household.pointIndices.length === 1 ? ' point' : ' points') +
      ' · money ' + Math.round(household.money) + ' · income ' + (Math.round(household.rentOfTheDay * 100) / 100) + ' a day · arrived on day ' + household.dayOfArrival;
  }

  // Everything the settlement knows of a point, as lines of words
  describeDataAt(pointIndex) {
    const lines = [];
    const household = this.ownerOfPoint[pointIndex];
    const works = this.volume.works[pointIndex];
    function rounded(value) {
      return Math.round(value * 100) / 100;
    }
    if (household === null) {
      const grade = this.volume.streetGrades[pointIndex];
      lines.push(grade === STREET_GRADE.busyStreet ? 'A busy street' : grade === STREET_GRADE.street ? 'A street' : 'Free ground (the city\'s)');
      lines.push('price of the land: ' + Math.round(this.landPriceToPay(pointIndex)) + (this.isRoad(pointIndex) ? ' (a street: three times its land)' : ''));
    } else if (household.isCity) {
      const building = this.volume.publicBuildings[this.volume.publicBuildingOfPoint[pointIndex] - 1];
      lines.push('The city' + (building ? ': ' + building.kind + ', built on day ' + building.day : ''));
    } else {
      this.describePoint(pointIndex).split(' · ').forEach(function (part) {
        lines.push(part);
      });
      lines.push('worth of this parcel: ' + Math.round(this.worthAsParcel(pointIndex)) + ' (land ' + Math.round(this.landValueAt(pointIndex)) +
        ', building ' + Math.round(this.buildingValueOf(stackOf(this.volume, pointIndex), this.condition[pointIndex])) + ', ' + Math.round(this.condition[pointIndex] * 100) + '% kept)');
      lines.push('rent here: ' + rounded(this.rentOfPoint(pointIndex)) + ' a day · managed at ' + Math.round(this.managementOf(household, pointIndex) * 100) + '%' +
        (this.facesAStreet(pointIndex) ? ' · faces a street' : ' · off the street'));
      lines.push('pressure of traffic: ' + Math.round(100 * this.pressure[pointIndex] * parametersInUse.moneyWorthOfAStepSaved / Math.max(1, this.worthAsParcel(pointIndex))) + '% of what breaks it through');
    }
    lines.push('land: ' + rounded(this.landPriceAt(pointIndex)) + ' a m² = traffic ' + Math.round(this.trafficValue[pointIndex]) + ' × security ' + rounded(this.security[pointIndex]) + ' × ' + parametersInUse.landPriceScale);
    lines.push('journeys: ' + (Math.round(this.recentTraffic[pointIndex] * 10) / 10) + ' lately, ' + Math.round(this.traffic[pointIndex]) + ' in all');
    const workNames = [];
    [[WORK.wall, 'wall'], [WORK.gate, 'gate'], [WORK.duct, 'aqueduct'], [WORK.fountain, 'fountain'], [WORK.passage, 'passage of the arch']].forEach(function (work) {
      if (works & work[0]) {
        workNames.push(work[1]);
      }
    });
    if (workNames.length > 0) {
      lines.push('works: ' + workNames.join(', '));
    }
    if (this.isKeptOpen[pointIndex]) {
      lines.push('kept open before a monument');
    }
    if (this.hasAWall) {
      lines.push(this.isWithinWalls[pointIndex] ? 'within the walls' : 'outside the walls');
    }
    return lines;
  }

  richestHouseholds(count) {
    return this.households.slice().sort(function (first, second) {
      return (second.money + (second.worth || 0)) - (first.money + (first.worth || 0));
    }).slice(0, count).map(function (household) {
      return { name: household.name, money: Math.round(household.money + (household.worth || 0)), points: household.pointIndices.length, livelihood: household.livelihood };
    });
  }

  // What a data layer shows at a point: a number from 0 to 1 (for 'owners' the number of the
  // household), or null where it has nothing to show there.
  layerValueAt(layerName, pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household !== null && household.isCity) {
      return null;
    }
    function onALogarithmicScale(value, highest) {
      return Math.max(0, Math.min(1, Math.log(1 + value) / Math.log(1 + highest)));
    }
    if (layerName === 'traffic') {
      return household === null && this.recentTraffic[pointIndex] >= 0.5 ? Math.min(1, this.recentTraffic[pointIndex] / (4 * roadRecentTraffic)) : null;
    }
    if (layerName === 'streets') {
      const grade = this.volume.streetGrades[pointIndex];
      return household === null && grade > STREET_GRADE.yard ? grade / STREET_GRADE.busyStreet : null;
    }
    if (layerName === 'security') {
      return this.security[pointIndex] > 1.01 ? onALogarithmicScale(this.security[pointIndex] - 1, 60) : null;
    }
    if (layerName === 'landPrice') {
      const price = this.landPriceAt(pointIndex);
      return price > 0.05 ? onALogarithmicScale(price, 400) : null;
    }
    if (household === null) {
      return null;
    }
    if (layerName === 'owners') {
      return household.number;
    }
    if (layerName === 'livelihood') {
      return household.livelihood === 'farmer' ? 0.15 : 0.9;
    }
    if (layerName === 'worth') {
      return onALogarithmicScale(this.worthAsParcel(pointIndex), 60000);
    }
    if (layerName === 'rent') {
      return onALogarithmicScale(this.rentOfPoint(pointIndex), 60);
    }
    if (layerName === 'money') {
      return onALogarithmicScale(household.money, 100000);
    }
    if (layerName === 'pressure') {
      return Math.min(1, this.pressure[pointIndex] * parametersInUse.moneyWorthOfAStepSaved / Math.max(1, this.worthAsParcel(pointIndex)));
    }
    return null;
  }

  // The numbers that show whether the town grows, stalls or bounces back, and how varied it is
  studyNumbers() {
    const settlement = this;
    const volume = this.volume;
    const worths = [];
    const moneys = [];
    const levels = [];
    const countOfKind = {};
    this.households.forEach(function (household) {
      worths.push(household.worth || 0);
      moneys.push(household.money);
    });
    for (let pointIndex = 0; pointIndex < this.map.points.length; pointIndex++) {
      const household = this.ownerOfPoint[pointIndex];
      if (household === null || household.isCity) {
        continue;
      }
      const stack = stackOf(volume, pointIndex);
      const kind = kindOfStack(stack);
      countOfKind[kind] = (countOfKind[kind] || 0) + 1;
      if (kind !== 'garden') {
        levels.push(stack.length);
      }
    }
    // Gini of a list: 0 all alike, 1 one has all
    function gini(values) {
      const sorted = values.slice().sort(function (first, second) { return first - second; });
      const total = sorted.reduce(function (sum, value) { return sum + Math.max(0, value); }, 0);
      if (sorted.length === 0 || total <= 0) {
        return 0;
      }
      let weighted = 0;
      sorted.forEach(function (value, index) { weighted += (index + 1) * Math.max(0, value); });
      return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
    }
    // how evenly the blocks are spread over their kinds: 0 all of one kind, 1 evenly over all
    const kinds = Object.keys(countOfKind);
    const blockCount = kinds.reduce(function (sum, kind) { return sum + countOfKind[kind]; }, 0);
    let entropy = 0;
    kinds.forEach(function (kind) {
      const share = countOfKind[kind] / blockCount;
      entropy -= share * Math.log(share);
    });
    const meanLevels = levels.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, levels.length);
    const spreadOfLevels = Math.sqrt(levels.reduce(function (sum, value) { return sum + (value - meanLevels) * (value - meanLevels); }, 0) / Math.max(1, levels.length));
    const sortedMoney = moneys.slice().sort(function (first, second) { return first - second; });
    // how closely the height of a block follows the price of its land (a correlation, -1 to 1), and
    // the mean height of the blocks on the dearest and on the cheapest fifth of the land
    const pairs = [];
    for (let pointIndex = 0; pointIndex < this.map.points.length; pointIndex++) {
      const household = this.ownerOfPoint[pointIndex];
      if (household !== null && !household.isCity) {
        const stack = stackOf(volume, pointIndex);
        if (stack.length > 0 && stack[0] !== TIER.garden) {
          pairs.push([this.landPriceAt(pointIndex), stack.length]);
        }
      }
    }
    let heightFollowsLand = 0;
    let levelsOnDearLand = 0;
    let levelsOnCheapLand = 0;
    if (pairs.length > 5) {
      const meanPrice = pairs.reduce(function (sum, pair) { return sum + pair[0]; }, 0) / pairs.length;
      const meanHeight = pairs.reduce(function (sum, pair) { return sum + pair[1]; }, 0) / pairs.length;
      let covariance = 0;
      let priceVariance = 0;
      let heightVariance = 0;
      pairs.forEach(function (pair) {
        covariance += (pair[0] - meanPrice) * (pair[1] - meanHeight);
        priceVariance += (pair[0] - meanPrice) * (pair[0] - meanPrice);
        heightVariance += (pair[1] - meanHeight) * (pair[1] - meanHeight);
      });
      heightFollowsLand = covariance / Math.sqrt(Math.max(1e-9, priceVariance * heightVariance));
      pairs.sort(function (first, second) { return first[0] - second[0]; });
      const fifth = Math.max(1, Math.floor(pairs.length / 5));
      levelsOnCheapLand = pairs.slice(0, fifth).reduce(function (sum, pair) { return sum + pair[1]; }, 0) / fifth;
      levelsOnDearLand = pairs.slice(-fifth).reduce(function (sum, pair) { return sum + pair[1]; }, 0) / fifth;
    }
    let householdsWithManyClassical = 0;
    this.households.forEach(function (household) {
      let classicalBlocks = 0;
      household.pointIndices.forEach(function (pointIndex) {
        if (stackOf(volume, pointIndex).indexOf(TIER.classical) >= 0) {
          classicalBlocks++;
        }
      });
      if (classicalBlocks > 2) {
        householdsWithManyClassical++;
      }
    });
    return {
      worthGini: Math.round(gini(worths) * 1000) / 1000,
      heightFollowsLand: Math.round(heightFollowsLand * 1000) / 1000,
      levelsOnDearLand: Math.round(levelsOnDearLand * 100) / 100,
      levelsOnCheapLand: Math.round(levelsOnCheapLand * 100) / 100,
      householdsWithManyClassical: householdsWithManyClassical,
      kindEntropy: Math.round(entropy / Math.log(6) * 1000) / 1000,
      spreadOfLevels: Math.round(spreadOfLevels * 100) / 100,
      medianMoney: Math.round(sortedMoney.length > 0 ? sortedMoney[Math.floor(sortedMoney.length / 2)] : 0),
      boughtBack: this.boughtBackCount,
      demolitions: this.demolitionCount,
      gardensBuiltOver: this.gardenBuiltOverCount,
      buildingsTurnedToGarden: this.buildingTurnedToGardenCount,
      farmersTurnedMerchant: this.farmersTurnedMerchantCount,
      investmentsOfKind: Object.assign({}, this.investmentCountOfKind),
      treasury: Math.round(this.city.money),
    };
  }

  // Every point as it stands, for maps of the town: where it lies, the price of its land, how many
  // floors stand on it and of what kind, its rent, and its owner (0: none)
  pointsForMaps() {
    const settlement = this;
    return this.map.points.map(function (point, pointIndex) {
      const household = settlement.ownerOfPoint[pointIndex];
      const stack = stackOf(settlement.volume, pointIndex);
      return {
        x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10,
        landPrice: Math.round(settlement.landPriceAt(pointIndex) * 100) / 100,
        levels: stack[0] === TIER.garden ? 0 : stack.length, kind: kindOfStack(stack),
        rent: Math.round(settlement.rentOfPoint(pointIndex) * 100) / 100,
        owner: household === null ? 0 : household.isCity ? -1 : household.number,
        isStreet: household === null && settlement.recentTraffic[pointIndex] >= roadRecentTraffic,
      };
    });
  }

  // The town in numbers, for comparing one run with another
  statistics() {
    const settlement = this;
    const volume = this.volume;
    const householdsByKind = { hut: 0, house: 0, classical: 0 };
    let farmers = 0;
    let largestHoldingPoints = 0;
    let settledPoints = 0;
    let moneyOfAll = 0;
    let worthOfAll = 0;
    let rentOfAll = 0;
    this.households.forEach(function (household) {
      let best = 'hut';
      household.pointIndices.forEach(function (pointIndex) {
        const kind = kindOfStack(stackOf(volume, pointIndex));
        if (kind === 'classical' || kind === 'tower') {
          best = 'classical';
        } else if ((kind === 'house' || kind === 'houseWithClassicalFloors') && best === 'hut') {
          best = 'house';
        }
      });
      householdsByKind[best]++;
      if (household.livelihood === 'farmer') {
        farmers++;
      }
      largestHoldingPoints = Math.max(largestHoldingPoints, household.pointIndices.length);
      settledPoints += household.pointIndices.length;
      moneyOfAll += household.money;
      worthOfAll += household.worth || 0;
      rentOfAll += household.rentOfTheDay || 0;
    });
    const blocksOfKind = { none: 0, hut: 0, house: 0, houseWithClassicalFloors: 0, classical: 0, tower: 0, garden: 0 };
    let roadPoints = 0;
    let busyStreetPoints = 0;
    let levelsOfAllBlocks = 0;
    let highestBlockLevels = 0;
    let landPriceOfAll = 0;
    for (let pointIndex = 0; pointIndex < this.map.points.length; pointIndex++) {
      const household = this.ownerOfPoint[pointIndex];
      if (household !== null && !household.isCity) {
        const stack = stackOf(volume, pointIndex);
        const kind = kindOfStack(stack);
        blocksOfKind[kind]++;
        if (kind !== 'garden') {
          levelsOfAllBlocks += stack.length;
          highestBlockLevels = Math.max(highestBlockLevels, stack.length);
        }
        landPriceOfAll += this.landPriceAt(pointIndex);
      } else if (household === null && this.recentTraffic[pointIndex] >= roadRecentTraffic) {
        roadPoints++;
        if (volume.streetGrades[pointIndex] === STREET_GRADE.busyStreet) {
          busyStreetPoints++;
        }
      }
    }
    let shopFronts = 0;
    volume.shopFronts.forEach(function (facedPoints) {
      shopFronts += facedPoints.size;
    });
    function rounded(value) {
      return Math.round(value * 100) / 100;
    }
    return {
      days: this.dayCount,
      households: this.households.length,
      farmers: farmers,
      merchants: this.households.length - farmers,
      householdsInHuts: householdsByKind.hut,
      householdsInHouses: householdsByKind.house,
      householdsClassical: householdsByKind.classical,
      largestHoldingPoints: largestHoldingPoints,
      meanHoldingPoints: rounded(settledPoints / Math.max(1, this.households.length)),
      shareOfGroundSettled: rounded(settledPoints / settlement.map.points.length),
      hutBlocks: blocksOfKind.hut,
      houseBlocks: blocksOfKind.house,
      houseBlocksWithClassicalFloors: blocksOfKind.houseWithClassicalFloors,
      classicalBlocks: blocksOfKind.classical + blocksOfKind.tower,
      towerBlocks: blocksOfKind.tower,
      gardenPoints: blocksOfKind.garden,
      mostLevelsOfABlock: highestBlockLevels,
      meanLevelsOfABlock: rounded(levelsOfAllBlocks / Math.max(1, settledPoints - blocksOfKind.garden)),
      meanLandPriceOfAParcel: rounded(landPriceOfAll / Math.max(1, settledPoints)),
      worthOfAllProperty: Math.round(worthOfAll),
      rentOfAllEachDay: Math.round(rentOfAll),
      meanMoneyOfAHousehold: Math.round(moneyOfAll / Math.max(1, this.households.length)),
      acquisitions: this.acquisitionCount,
      investments: JSON.stringify(this.investmentCountOfKind),
      shareOfJourneysToVenues: rounded(this.journeysToVenues / Math.max(1, this.journeyCount)),
      shareOfJourneysToOtherTowns: rounded(this.journeysToOtherTowns / Math.max(1, this.journeyCount)),
      roadPoints: roadPoints,
      busyStreetPoints: busyStreetPoints,
      shopFronts: shopFronts,
      buildingsBrokenThrough: this.brokenBuildingCount,
      buildingsClearedBeforeMonuments: this.clearedBuildingCount,
      landSoldByTheCity: Math.round(this.landSoldByTheCity),
      publicBuildings: volume.publicBuildings.map(function (building) { return building.kind; }).join(' '),
      fountains: this.city.fountainPoints.length,
      householdsWithoutWater: this.city.fountainPoints.length > 0 ? householdsWithoutWater(this).length : this.households.length,
      aqueductPoints: this.countOfWork(WORK.duct),
      walls: this.wallCount,
      wallPoints: this.countOfWork(WORK.wall),
      gates: this.countOfWork(WORK.gate),
      taxCollected: Math.round(this.city.moneyCollected),
      moneySpentByTheCity: Math.round(this.city.moneySpent),
    };
  }

  countOfWork(work) {
    let count = 0;
    for (let pointIndex = 0; pointIndex < this.volume.works.length; pointIndex++) {
      if (this.volume.works[pointIndex] & work) {
        count++;
      }
    }
    return count;
  }

  // Everything that has to be kept to take the settlement up again later
  save() {
    const shopFronts = [];
    this.volume.shopFronts.forEach(function (facedPoints, raisedPoint) {
      shopFronts.push([raisedPoint, Array.from(facedPoints)]);
    });
    function roundedList(values) {
      return Array.from(values, function (value) { return Math.round(value * 1000) / 1000; });
    }
    return {
      economyVersion: 2, seed: this.seed, parameters: this.parameters, dayCount: this.dayCount, randomState: this.random.state,
      householdCount: this.householdCount, brokenBuildingCount: this.brokenBuildingCount, clearedBuildingCount: this.clearedBuildingCount,
      households: this.households.map(function (household) {
        return {
          number: household.number, name: household.name, dayOfArrival: household.dayOfArrival, livelihood: household.livelihood,
          homePoint: household.homePoint, pointIndices: household.pointIndices.slice(), money: Math.round(household.money * 100) / 100,
          securityBoost: household.securityBoost, dayOfNextSearch: household.dayOfNextSearch,
        };
      }),
      traffic: roundedList(this.traffic), recentTraffic: roundedList(this.recentTraffic), trafficValue: roundedList(this.trafficValue),
      security: roundedList(this.security), condition: roundedList(this.condition), pressure: roundedList(this.pressure),
      otherTowns: this.otherTowns.map(function (town) { return town.pointIndices[0]; }),
      isKeptOpen: Array.from(this.isKeptOpen),
      levelCount: this.volume.levelCount, tiers: Array.from(this.volume.tiers), owners: Array.from(this.volume.owners),
      streetGrades: Array.from(this.volume.streetGrades), shopFronts: shopFronts,
      works: Array.from(this.volume.works), publicBuildings: this.volume.publicBuildings,
      publicBuildingOfPoint: Array.from(this.volume.publicBuildingOfPoint),
      city: {
        money: Math.round(this.city.money), fountainPoints: this.city.fountainPoints, moneyCollected: Math.round(this.city.moneyCollected),
        moneySpent: Math.round(this.city.moneySpent), chronicle: this.city.chronicle,
      },
      isWithinWalls: Array.from(this.isWithinWalls), hasAWall: this.hasAWall, wallCount: this.wallCount,
    };
  }

  // A saved settlement taken up again on the same ground. A run saved under the earlier economy
  // keeps its town and its households; what that economy did not know (security, the worth of
  // the traffic, the wear of the buildings) is made up from what it did.
  static restore(map, volume, saved) {
    const settlement = new Settlement(map, volume, saved.seed, saved.parameters);
    const isOfThisEconomy = saved.economyVersion === 2;
    settlement.dayCount = saved.dayCount;
    settlement.random.state = saved.randomState;
    settlement.householdCount = saved.householdCount;
    settlement.brokenBuildingCount = saved.brokenBuildingCount;
    settlement.clearedBuildingCount = saved.clearedBuildingCount;
    settlement.traffic.set(saved.traffic);
    settlement.recentTraffic.set(saved.recentTraffic);
    settlement.pressure.set(saved.pressure);
    if (isOfThisEconomy) {
      settlement.trafficValue.set(saved.trafficValue);
      settlement.security.set(saved.security);
      settlement.condition.set(saved.condition);
      if (saved.otherTowns && saved.otherTowns.length === 2) {
        settlement.otherTowns = saved.otherTowns.map(function (pointIndex) { return { isPlace: true, kind: 'otherTown', pointIndices: [pointIndex] }; });
      }
    } else {
      settlement.trafficValue.set(saved.traffic);
      settlement.security.fill(1);
    }
    settlement.households = saved.households.map(function (household) {
      const restored = {
        number: household.number, name: household.name || nameOfHousehold(household.number, saved.seed, settlement.namesTaken),
        dayOfArrival: household.dayOfArrival || 0, livelihood: household.livelihood || 'merchant',
        homePoint: household.homePoint !== undefined ? household.homePoint : household.pointIndices[0],
        pointIndices: household.pointIndices.slice(), money: household.money, rentOfTheDay: 0, worth: 0,
        securityBoost: household.securityBoost || SECURITY_BOOST.merchant, dayOfNextSearch: household.dayOfNextSearch || saved.dayCount + 1,
      };
      settlement.namesTaken.add(restored.name);
      restored.pointIndices.forEach(function (pointIndex) {
        settlement.ownerOfPoint[pointIndex] = restored;
      });
      if (!isOfThisEconomy) {
        settlement.raiseSecurity(restored.homePoint, restored.securityBoost, stepsOfASecurityBoost);
      }
      return restored;
    });
    settlement.isKeptOpen.set(saved.isKeptOpen);
    volume.tiers.set(saved.tiers);
    volume.owners.set(saved.owners);
    volume.streetGrades.set(saved.streetGrades);
    saved.shopFronts.forEach(function (entry) {
      volume.shopFronts.set(entry[0], new Set(entry[1]));
    });
    if (saved.works) {
      volume.works.set(saved.works);
      volume.publicBuildings = saved.publicBuildings;
      volume.publicBuildingOfPoint.set(saved.publicBuildingOfPoint);
      Object.assign(settlement.city, saved.city);
      settlement.isWithinWalls.set(saved.isWithinWalls);
      settlement.hasAWall = saved.hasAWall;
      settlement.wallCount = saved.wallCount || (saved.hasAWall ? 1 : 0);
      for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
        if (volume.publicBuildingOfPoint[pointIndex] !== 0 && !(volume.works[pointIndex] & WORK.passage)) {
          settlement.ownerOfPoint[pointIndex] = settlement.city;
          settlement.city.pointIndices.push(pointIndex);
        }
      }
    }
    settlement.households.forEach(function (household) {
      settlement.keepTheBooks(household, true); // (the rents and worths of the day, for the pictures)
    });
    return settlement;
  }

  summary() {
    const statistics = this.statistics();
    return 'day ' + this.dayCount + ' · ' + statistics.households + ' households (' + statistics.farmers + ' farmers, ' + statistics.merchants + ' merchants): ' +
      statistics.householdsInHuts + ' in huts, ' + statistics.householdsInHouses + ' in houses, ' + statistics.householdsClassical + ' classical · ' +
      statistics.acquisitions + ' parcels bought from neighbours · ' + this.brokenBuildingCount + ' buildings broken through · treasury ' + Math.round(this.city.money) +
      ' · public: ' + (statistics.publicBuildings || 'none') + ' · ' + statistics.fountains + ' fountains' + (this.hasAWall ? ' · walled, ' + statistics.gates + ' gates' : '');
  }
}
