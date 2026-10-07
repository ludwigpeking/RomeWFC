// Purpose: a town that settles by itself, run as a real estate market. The model is the author's
// (ECONOMY_SPEC.md); this file follows it and marks where it had to assume something the
// specification leaves open (ASSUMED).
//
// The ground:
// - Traffic. Every journey adds its weight to the traffic value of the points it crosses and half
//   of it to the points beside them. A step onto a point costs less the more often the point has
//   been trodden, down to half: the roads form themselves.
// - Security. A household raises the security of the ground round its home; a public building
//   raises it more.
// - The value of a location (a square metre) = traffic × security × locationValueScale.
// - Two places on the rim are the ways to other towns (cross-border traffic).
//
// The two values of a property:
// - Building value: for each floor, area × the unit cost of its tier × a surcharge for its level.
//   It is what the floor costs to build, and has to do with the building only.
// - Property value: for each floor, area × location value × utility. The location value is the
//   same for the whole parcel; the utility falls with each level up and is lower on a tile that
//   faces no street.
// - Land price = property value − building value. Land with nothing on it is valued as if a
//   standard building stood there; a street costs its price and twice as much again.
//
// A household's books: rent, 7% of its property value a year (less where its property lies
// dispersed, far from its home; more beside gardens); tax on the property value; upkeep on the
// building value, at a higher rate for classical floors. A farmer has the yield of the farmland,
// the same for every parcel. Journeys bring no income.
//
// Investment: every few days a household looks over its own points, the ground beside them and a
// few points elsewhere, and does what brings the most rent for its cost: a floor more, a rebuilding
// in another tier, land bought from the city and built on, somebody else's property at a premium
// of 30% and a transaction tax, or a garden. A household's home is its property of the highest
// value; it may sell even its home and buy elsewhere.
//
// The city owns all land at first, sells it, takes the taxes, and pays for what it pulls down:
// a building that journeys would cross, when crossing it would save them enough, and whatever
// stands in the way of a household that has no way out at all.
//
// The simulation only writes the volume; the buildings come from it as always.

import { TIER, WORK, SeededRandom } from './volume';
import { nameOfHousehold } from './names';
import { pointsOfPublicBuilding, createCity, runTheCity, householdsWithoutWater, CITY_PARAMETER_DEFAULTS } from './city';

// The parameters a settlement is run with, and what they are when nothing else is asked for.
// (A "day" is one step of the simulation; a year is daysInAYear of them: ASSUMED 360.)
export const SETTLEMENT_PARAMETER_DEFAULTS = {
  locationValueScale: 0.003,         // value of a location, a square metre = traffic × security × this
  rentShareOfValueEachYear: 0.07,    // the rent of a year, as a share of the property value
  taxShareOfValueEachYear: 0.01,     // the tax of a year, as a share of the property value
  transactionTaxShare: 0.05,         // of the price, paid by the buyer to the city when property changes hands
  upkeepShareEachYear: 0.01,         // the upkeep of a year, as a share of the building value ...
  classicalUpkeepShareEachYear: 0.05, // ... and of a classical floor
  // ASSUMED (the specification leaves open whether an investment needs a test of its own): it is
  // made only where the rent it adds in a year is at least this share of its cost
  requiredYieldEachYear: 0.05,
  levelCostGrowth: 1.25,             // each floor up costs so many times the one below
  upperFloorUtility: 0.8,            // the utility of a floor, for each level it lies above the ground
  interiorUtility: 0.55,             // the utility of a tile that faces no street
  // Turning classical: a household gains by its first classical blocks (so many); more of them
  // cost and keep as dear, but are worth no more than a house
  distinguishedClassicalBlocks: 2,
  classicalUtilityBonus: 1.5,
  managementLossPerCell: 0.05,       // the rent of a point falls by this for each cell it lies from its household's home
  acquisitionPremium: 0.3,           // somebody else's property is bought at its value and this much more
  streetPremium: 2,                  // a street is bought at its price and this many times its price more
  gardenRentBonus: 0.15,             // a garden adds this to the rent of every property beside it
  startingCapital: 250,
  shareOfFarmers: 0.5,               // of the newcomers
  farmYieldEachDay: 0.06,            // what a farmer takes in a day from each parcel of farmland near it, shared with the other farmers there
  locationValueOfAMerchant: 60,      // a farmer whose home stands on a location of this value turns merchant
  daysBetweenInvestmentSearches: 7,
  householdsForEachTower: 150,       // the town has room for one tower (a classical block over three levels) for every so many households
  journeysPerHouseholdEachDay: 0.35,
  chanceOfAnArrivalEachDay: 0.45,
  mostGroundSettled: 0.45,           // share of the points that may be built on
  trafficKeptEachDay: 0.999,         // of the traffic value
  shareOfTheBusiestStreet: 0.4,      // a street is busy from this share of the traffic of the busiest point
  chanceOfAShopOpeningEachDay: 0.01, // for each front of a house that looks at a busy street
  stepsABuildingCosts: 8,            // a journey that crosses a building counts it as so many steps
  moneyWorthOfAStepSaved: 12,        // what a step saved by pulling a building down is worth to the city
};
Object.assign(SETTLEMENT_PARAMETER_DEFAULTS, CITY_PARAMETER_DEFAULTS); // what the city does as a whole: city.js

const daysInAYear = 360;
const floorArea = 16;                    // square metres of one floor of a point (a cell is 4 m wide)
const UNIT_COST_OF_TIER = {              // what a square metre of floor costs to build on the ground
  [TIER.temporary]: 12, [TIER.vernacular]: 30, [TIER.classical]: 130,
};
const gardenPrice = 3;                   // a square metre of garden laid out
// ASSUMED (the specification leaves open whether utility depends on the tier): a hut offers less
// than a house on the same location. A classical floor offers as much as a house, and the bonus
// (classicalUtilityBonus) on a household's first classical blocks only.
const UTILITY_OF_TIER = { [TIER.temporary]: 0.3, [TIER.vernacular]: 1, [TIER.classical]: 1 };
const STANDARD_BUILDING = [TIER.vernacular, TIER.vernacular]; // what open land is valued by
const leastLandPrice = 10;               // a parcel of land is never sold for less
const MOST_LEVELS_OF_TIER = { [TIER.temporary]: 2, [TIER.vernacular]: 6, [TIER.classical]: 3 };
const mostLevelsOfATower = 20;
const SECURITY_BOOST = { farmer: 2, merchant: 1, publicBuilding: 15 };
const stepsOfASecurityBoost = 3;         // a household raises the security this many steps round its home
const stepsOfAPublicSecurityBoost = 8;
const stepsOfFarmland = 5;               // a farmer works the land this many steps round it
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
  return floorArea * UNIT_COST_OF_TIER[tier] * Math.pow(parametersInUse.levelCostGrowth, level);
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
    this.landlessHouseholds = [];           // households that sold all they had, and look for something to buy
    this.transactionTaxCollected = 0;
    this.homeMoveCount = 0;
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
  // The value of a location, a square metre: traffic × security
  locationValueAt(pointIndex) {
    return this.trafficValue[pointIndex] * this.security[pointIndex] * parametersInUse.locationValueScale;
  }

  // Whether a point faces a street (a free point beside it that is used as road)
  facesAStreet(pointIndex) {
    const settlement = this;
    return this.neighboursOfPoint[pointIndex].some(function (neighbourPoint) {
      return settlement.isFree(neighbourPoint) && settlement.recentTraffic[neighbourPoint] >= roadRecentTraffic;
    });
  }

  // Whether a classical floor on a point brings its household the bonus: only on its first so many
  // blocks with classical floors (the point itself counted among them)
  isDistinguished(household, pointIndex) {
    if (!household) {
      return false;
    }
    const volume = this.volume;
    let otherClassicalBlocks = 0;
    household.pointIndices.forEach(function (otherPoint) {
      if (otherPoint !== pointIndex && stackOf(volume, otherPoint).indexOf(TIER.classical) >= 0) {
        otherClassicalBlocks++;
      }
    });
    return otherClassicalBlocks < parametersInUse.distinguishedClassicalBlocks;
  }

  // The building value of a stack: each floor its area × the unit cost of its tier × the
  // surcharge of its level. It has to do with the building only.
  buildingValueOf(stack) {
    let value = 0;
    stack.forEach(function (tier, level) {
      value += tier === TIER.garden ? floorArea * gardenPrice : floorCost(tier, level);
    });
    return value;
  }

  // The property value of a stack on a point: each floor its area × the value of the location ×
  // its utility. The utility falls with each level up and is lower on a tile that faces no
  // street; a hut offers less than a house; a classical floor more only on the first classical
  // blocks of its household.
  propertyValueOf(pointIndex, stack, household) {
    if (stack.length === 0 || stack[0] === TIER.garden) {
      return 0;
    }
    const parameters = parametersInUse;
    const locationValue = this.locationValueAt(pointIndex);
    const streetUtility = this.facesAStreet(pointIndex) ? 1 : parameters.interiorUtility;
    const classicalBonus = stack.indexOf(TIER.classical) >= 0 && this.isDistinguished(household, pointIndex) ? parameters.classicalUtilityBonus : 1;
    let value = 0;
    stack.forEach(function (tier, level) {
      const utility = UTILITY_OF_TIER[tier] * (tier === TIER.classical ? classicalBonus : 1) * Math.pow(parameters.upperFloorUtility, level) * streetUtility;
      value += floorArea * locationValue * utility;
    });
    return value;
  }

  // The land value of a point: its property value less its building value; where nothing stands
  // (or a garden), as if a standard building stood there. Never less than nothing.
  landValueAt(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    let stack = stackOf(this.volume, pointIndex);
    if (stack.length === 0 || stack[0] === TIER.garden || household === null || household.isCity) {
      stack = STANDARD_BUILDING;
    }
    return Math.max(0, this.propertyValueOf(pointIndex, stack, household && !household.isCity ? household : null) - this.buildingValueOf(stack));
  }

  // The price of land, a square metre: the land value over the footprint
  landPriceAt(pointIndex) {
    return this.landValueAt(pointIndex) / floorArea;
  }

  // What a point is worth to whoever buys or clears it: its property value, or, for a garden or a
  // building that the location does not carry, what was built there and the land
  worthAsParcel(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    const stack = stackOf(this.volume, pointIndex);
    const propertyValue = this.propertyValueOf(pointIndex, stack, household);
    return Math.max(propertyValue, this.buildingValueOf(stack) + (stack[0] === TIER.garden ? this.landValueAt(pointIndex) : 0));
  }

  // What a road is worth, if it were sold: the value of its land
  worthAsRoad(pointIndex) {
    return this.landValueAt(pointIndex);
  }

  // How well a household manages a point: less the further it lies from its home
  managementOf(household, pointIndex) {
    if (household.homePoint < 0) {
      return 1;
    }
    const home = this.map.points[household.homePoint];
    const point = this.map.points[pointIndex];
    const cellsAway = Math.hypot(point.x - home.x, point.z - home.z) / 4;
    return 1 / (1 + parametersInUse.managementLossPerCell * cellsAway);
  }

  // How much the gardens beside a point add to its rent
  gardenFactorAt(pointIndex, exceptPoint) {
    let gardensBeside = 0;
    const volume = this.volume;
    this.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
      if (neighbourPoint !== exceptPoint && volume.tierAt(neighbourPoint, 0) === TIER.garden) {
        gardensBeside++;
      }
    });
    return 1 + parametersInUse.gardenRentBonus * Math.min(2, gardensBeside);
  }

  // The rent of a day of a stack on a point, for a household: the yearly share of its property
  // value, less where it is managed from afar, more beside gardens
  rentOf(pointIndex, stack, household) {
    return this.propertyValueOf(pointIndex, stack, household) * parametersInUse.rentShareOfValueEachYear / daysInAYear *
      this.managementOf(household, pointIndex) * this.gardenFactorAt(pointIndex, -1);
  }

  rentOfPoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household === null || household.isCity) {
      return 0;
    }
    return this.rentOf(pointIndex, stackOf(this.volume, pointIndex), household);
  }

  // The upkeep of a day of a stack: the yearly share of its building value, more for classical floors
  upkeepOf(stack) {
    const parameters = parametersInUse;
    let upkeep = 0;
    stack.forEach(function (tier, level) {
      if (tier !== TIER.garden) {
        upkeep += floorCost(tier, level) * (tier === TIER.classical ? parameters.classicalUpkeepShareEachYear : parameters.upkeepShareEachYear) / daysInAYear;
      }
    });
    return upkeep;
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
      this.volume.streetGrades[pointIndex] = this.streetGradeFor(this.recentTraffic[pointIndex], this.volume.streetGrades[pointIndex]);
    }
    volumeChanged = this.openShops() || volumeChanged;
    // the households: rents and farm yield in, tax out; now and then an investment
    const settlement = this;
    this.households.concat(this.landlessHouseholds).forEach(function (household) {
      if (household.pointIndices.length === 0) {
        // it holds nothing: it looks for something to buy
        if (settlement.dayCount >= household.dayOfNextSearch) {
          household.dayOfNextSearch = settlement.dayCount + parameters.daysBetweenInvestmentSearches;
          volumeChanged = settlement.investPerhaps(household) || volumeChanged;
        }
        return;
      }
      settlement.keepTheBooks(household);
      if (household.livelihood === 'farmer' && settlement.locationValueAt(household.homePoint) >= parameters.locationValueOfAMerchant) {
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

  // A household's day in money: rent and, for a farmer, the yield of the farmland come in; tax
  // and upkeep go out. Its home is its property of the highest value: where that has changed, the
  // home moves, and the security it brings moves with it. onlyCounting: nothing changes hands.
  keepTheBooks(household, onlyCounting) {
    const settlement = this;
    let rent = 0;
    let worth = 0;
    let upkeep = 0;
    let mostValuablePoint = -1;
    let highestValue = -1;
    household.pointIndices.forEach(function (pointIndex) {
      const stack = stackOf(settlement.volume, pointIndex);
      const value = settlement.propertyValueOf(pointIndex, stack, household);
      rent += settlement.rentOfPoint(pointIndex);
      worth += value;
      upkeep += settlement.upkeepOf(stack);
      if (value > highestValue) {
        highestValue = value;
        mostValuablePoint = pointIndex;
      }
    });
    let farmYield = 0;
    if (household.livelihood === 'farmer' && household.homePoint >= 0) {
      farmYield = parametersInUse.farmYieldEachDay * this.farmlandShareAt(household.homePoint);
    }
    const tax = worth * parametersInUse.taxShareOfValueEachYear / daysInAYear;
    household.rentOfTheDay = rent + farmYield;
    household.upkeepOfTheDay = upkeep;
    household.taxOfTheDay = tax;
    household.worth = worth;
    if (onlyCounting) {
      return;
    }
    household.money += rent + farmYield - tax - upkeep;
    this.city.money += tax;
    this.city.moneyCollected += tax;
    // the home: the property of the highest value (it moves only for a clearly more valuable one)
    if (mostValuablePoint !== -1 && mostValuablePoint !== household.homePoint &&
      (household.homePoint < 0 || highestValue > 1.1 * this.propertyValueOf(household.homePoint, stackOf(this.volume, household.homePoint), household))) {
      this.moveHome(household, mostValuablePoint);
    }
  }

  // A household's home moves to another of its points; the security it brings moves with it
  moveHome(household, pointIndex) {
    if (household.homePoint >= 0) {
      this.raiseSecurity(household.homePoint, -household.securityBoost, stepsOfASecurityBoost);
      this.homeMoveCount++;
    }
    household.homePoint = pointIndex;
    this.raiseSecurity(pointIndex, household.securityBoost, stepsOfASecurityBoost);
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

  // What the city asks for a free point: the value of its land; a street its price and twice as much again
  landPriceToPay(pointIndex) {
    const price = Math.max(leastLandPrice, this.landValueAt(pointIndex));
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
        // a farmer: farmland near, few farmers, some security; a merchant: the most valuable location it can pay
        const value = livelihood === 'farmer'
          ? this.farmlandShareAt(candidate) * Math.sqrt(this.security[candidate])
          : this.locationValueAt(candidate);
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
      livelihood: livelihood, homePoint: -1, pointIndices: [], money: capital, rentOfTheDay: 0, worth: 0,
      securityBoost: SECURITY_BOOST[livelihood],
      dayOfNextSearch: this.dayCount + 1 + this.random.nextInt(parameters.daysBetweenInvestmentSearches),
    };
    this.households.push(household);
    this.buyLand(site, household);
    this.buildOnPoint(site, [TIER.temporary]);
    household.money -= hutCost;
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

  // A point passes to a household. A household that held nothing has its home there, and is of
  // the town again.
  givePoint(pointIndex, household) {
    this.ownerOfPoint[pointIndex] = household;
    this.volume.setOwner(pointIndex, household.number);
    household.pointIndices.push(pointIndex);
    this.pressure[pointIndex] = 0;
    if (household.homePoint < 0) {
      const landlessAt = this.landlessHouseholds.indexOf(household);
      if (landlessAt >= 0) {
        this.landlessHouseholds.splice(landlessAt, 1);
        this.households.push(household);
      }
      this.moveHome(household, pointIndex);
    }
  }

  // A point is taken from its household. Where that was its home, its home is another of its
  // points; a household left with nothing keeps its money and looks for something to buy.
  takePoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    household.pointIndices.splice(household.pointIndices.indexOf(pointIndex), 1);
    this.ownerOfPoint[pointIndex] = null;
    this.volume.shopFronts.delete(pointIndex);
    this.volume.setOwner(pointIndex, 0);
    if (household.homePoint === pointIndex) {
      this.raiseSecurity(pointIndex, -household.securityBoost, stepsOfASecurityBoost);
      household.homePoint = -1;
      if (household.pointIndices.length > 0) {
        this.moveHome(household, household.pointIndices[0]);
      } else {
        this.households.splice(this.households.indexOf(household), 1);
        this.landlessHouseholds.push(household);
      }
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

  // What could be built on a point: [{ kind, stack, cost }]. A floor more on top (of the same
  // tier, or a classical top floor on a house), a rebuilding in another tier, or, where nothing
  // stands (or a garden), a first floor of any tier.
  // ASSUMED (the specification leaves open which tiers may be mixed in one stack): the stacks the
  // town can show: huts, houses, classical blocks, and a house with a classical ground or top floor.
  buildingChoicesFor(household, stack) {
    const choices = [];
    function costOfAll(newStack) {
      return newStack.reduce(function (sum, tier, level) { return sum + floorCost(tier, level); }, 0);
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
    const isAllHouse = stack.every(function (tier) { return tier === TIER.vernacular; });
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
    // a rebuilding in another tier
    if (isAllHut) {
      const rebuilt = stack.map(function () { return TIER.vernacular; });
      choices.push({ kind: 'rebuildAsHouse', stack: rebuilt, cost: costOfAll(rebuilt) });
    }
    if (isAllHouse && levelCount <= MOST_LEVELS_OF_TIER[TIER.temporary]) {
      const rebuilt = stack.map(function () { return TIER.temporary; });
      choices.push({ kind: 'rebuildAsHut', stack: rebuilt, cost: costOfAll(rebuilt) });
    }
    if (stack[0] === TIER.vernacular && levelCount >= 2) {
      choices.push({ kind: 'classicalGroundFloor', stack: [TIER.classical].concat(stack.slice(1)), cost: floorCost(TIER.classical, 0) });
    }
    if (!isAllClassical) {
      const rebuilt = stack.slice(0, MOST_LEVELS_OF_TIER[TIER.classical]).map(function () { return TIER.classical; });
      choices.push({ kind: 'rebuildAsClassical', stack: rebuilt, cost: costOfAll(rebuilt) });
    }
    return choices;
  }

  // A household looks over what it could do and does the one that brings the most rent for its
  // cost (the rent of a year it adds, less the upkeep it adds, over what it costs), if that reaches
  // the required yield. Returns whether the volume changed.
  investPerhaps(household) {
    const parameters = parametersInUse;
    const settlement = this;
    const volume = this.volume;
    const ownsAHouse = household.pointIndices.some(function (pointIndex) {
      const kind = kindOfStack(stackOf(volume, pointIndex));
      return kind !== 'hut' && kind !== 'garden' && kind !== 'none';
    });
    let best = null;
    function consider(option) {
      if (option.cost <= 0 || option.cost > household.money) {
        return;
      }
      const yieldEachYear = option.rentGainedEachDay * daysInAYear / option.cost;
      if (yieldEachYear >= parameters.requiredYieldEachYear && (best === null || yieldEachYear > best.yieldEachYear)) {
        option.yieldEachYear = yieldEachYear;
        best = option;
      }
    }
    // what the gardens' bonus on the household's points beside a point is worth in a day: gained
    // where the point becomes a garden, lost where a garden is built over
    function gardenBonusBeside(pointIndex) {
      let rentOfTheBonus = 0;
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (settlement.ownerOfPoint[neighbourPoint] !== household) {
          return;
        }
        const stack = stackOf(volume, neighbourPoint);
        const rentWithoutGardens = settlement.propertyValueOf(neighbourPoint, stack, household) * parameters.rentShareOfValueEachYear / daysInAYear *
          settlement.managementOf(household, neighbourPoint);
        rentOfTheBonus += rentWithoutGardens * (settlement.gardenFactorAt(neighbourPoint, pointIndex) + parameters.gardenRentBonus - settlement.gardenFactorAt(neighbourPoint, pointIndex));
      });
      return rentOfTheBonus;
    }
    // its own points: a floor more, a rebuilding, or a garden
    household.pointIndices.forEach(function (pointIndex) {
      const stack = stackOf(volume, pointIndex);
      const isAGarden = stack[0] === TIER.garden;
      const netNow = settlement.rentOf(pointIndex, stack, household) - settlement.upkeepOf(stack) + (isAGarden ? gardenBonusBeside(pointIndex) : 0);
      settlement.buildingChoicesFor(household, stack).forEach(function (choice) {
        const netAfter = settlement.rentOf(pointIndex, choice.stack, household) - settlement.upkeepOf(choice.stack);
        consider({ kind: choice.kind, pointIndex: pointIndex, stack: choice.stack, cost: choice.cost, rentGainedEachDay: netAfter - netNow });
      });
      if (ownsAHouse && !isAGarden && household.pointIndices.length > 1) {
        consider({ kind: 'garden', pointIndex: pointIndex, stack: [TIER.garden], cost: floorArea * gardenPrice, rentGainedEachDay: gardenBonusBeside(pointIndex) - netNow });
      }
    });
    // the ground beside its points, and a few points elsewhere (more of them for a household that holds nothing)
    const candidates = new Set();
    household.pointIndices.forEach(function (pointIndex) {
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        candidates.add(neighbourPoint);
      });
    });
    const randomCandidateCount = household.pointIndices.length === 0 ? 12 : 3;
    for (let attempt = 0; attempt < randomCandidateCount; attempt++) {
      candidates.add(this.random.nextInt(this.map.points.length));
    }
    candidates.forEach(function (pointIndex) {
      const owner = settlement.ownerOfPoint[pointIndex];
      if (owner === household) {
        return;
      }
      if (owner === null) {
        // free land, bought from the city and built on, in any tier
        if (!settlement.mayTake(pointIndex, true)) {
          return;
        }
        const landCost = settlement.landPriceToPay(pointIndex);
        settlement.buildingChoicesFor(household, []).forEach(function (choice) {
          consider({
            kind: 'buyLandAndBuild', pointIndex: pointIndex, stack: choice.stack, cost: landCost + choice.cost,
            rentGainedEachDay: settlement.rentOf(pointIndex, choice.stack, household) - settlement.upkeepOf(choice.stack),
          });
        });
        return;
      }
      if (owner.isCity || volume.publicBuildingOfPoint[pointIndex] !== 0) {
        return;
      }
      // somebody else's property, as it stands: its value and the premium to the owner, and the
      // transaction tax on that to the city
      const stack = stackOf(volume, pointIndex);
      const price = settlement.worthAsParcel(pointIndex) * (1 + parameters.acquisitionPremium);
      consider({
        kind: 'acquire', pointIndex: pointIndex, stack: stack, seller: owner, price: price, cost: price * (1 + parameters.transactionTaxShare),
        rentGainedEachDay: settlement.rentOf(pointIndex, stack, household) - settlement.upkeepOf(stack),
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
      this.formerOwnersOfPoint.set(best.pointIndex, formerOwners.slice(-4));
      const transactionTax = best.cost - best.price;
      household.money -= best.cost;
      best.seller.money += best.price;
      this.city.money += transactionTax;
      this.city.moneyCollected += transactionTax;
      this.transactionTaxCollected += transactionTax;
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
      if (wasAGarden && best.kind !== 'garden') {
        this.gardenBuiltOverCount++;
      } else if (!wasAGarden && best.kind === 'garden') {
        this.buildingTurnedToGardenCount++;
      }
    }
    this.buildOnPoint(best.pointIndex, best.stack);
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
      const stack = stackOf(this.volume, pointIndex);
      lines.push('property value ' + Math.round(this.propertyValueOf(pointIndex, stack, household)) + ' = building ' + Math.round(this.buildingValueOf(stack)) +
        ' + land ' + Math.round(this.landValueAt(pointIndex)));
      lines.push('rent ' + rounded(this.rentOfPoint(pointIndex) * daysInAYear) + ' a year (7% of the value, managed at ' + Math.round(this.managementOf(household, pointIndex) * 100) + '%)' +
        ' · upkeep ' + rounded(this.upkeepOf(stack) * daysInAYear) + ' a year' + (this.facesAStreet(pointIndex) ? ' · faces a street' : ' · faces no street') +
        (household.homePoint === pointIndex ? ' · the home' : ''));
      lines.push('pressure of traffic: ' + Math.round(100 * this.pressure[pointIndex] * parametersInUse.moneyWorthOfAStepSaved / Math.max(1, this.worthAsParcel(pointIndex))) + '% of what breaks it through');
    }
    lines.push('location: ' + rounded(this.locationValueAt(pointIndex)) + ' a m² = traffic ' + Math.round(this.trafficValue[pointIndex]) + ' × security ' + rounded(this.security[pointIndex]) + ' × ' + parametersInUse.locationValueScale);
    lines.push('land price: ' + rounded(this.landPriceAt(pointIndex)) + ' a m² (property value − building value)');
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
    if (layerName === 'location') {
      const value = this.locationValueAt(pointIndex);
      return value > 0.05 ? onALogarithmicScale(value, 400) : null;
    }
    if (layerName === 'landPrice') {
      const price = this.landPriceAt(pointIndex);
      return price > 0.05 ? onALogarithmicScale(price, 400) : null;
    }
    if (layerName === 'height') {
      const stack = household === null ? [] : stackOf(this.volume, pointIndex);
      return stack.length > 0 && stack[0] !== TIER.garden ? stack.length / MOST_LEVELS_OF_TIER[TIER.vernacular] : null;
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
      return onALogarithmicScale(this.rentOfPoint(pointIndex) * daysInAYear, 20000);
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
          pairs.push([this.locationValueAt(pointIndex), stack.length]);
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
        landPrice: Math.round(settlement.locationValueAt(pointIndex) * 100) / 100,
        residualLandPrice: Math.round(settlement.landPriceAt(pointIndex) * 100) / 100,
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
        landPriceOfAll += this.locationValueAt(pointIndex);
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
      economyVersion: 3, seed: this.seed, parameters: this.parameters, dayCount: this.dayCount, randomState: this.random.state,
      householdCount: this.householdCount, brokenBuildingCount: this.brokenBuildingCount, clearedBuildingCount: this.clearedBuildingCount,
      households: this.households.map(function (household) {
        return {
          number: household.number, name: household.name, dayOfArrival: household.dayOfArrival, livelihood: household.livelihood,
          homePoint: household.homePoint, pointIndices: household.pointIndices.slice(), money: Math.round(household.money * 100) / 100,
          securityBoost: household.securityBoost, dayOfNextSearch: household.dayOfNextSearch,
        };
      }),
      traffic: roundedList(this.traffic), recentTraffic: roundedList(this.recentTraffic), trafficValue: roundedList(this.trafficValue),
      security: roundedList(this.security), pressure: roundedList(this.pressure),
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
    const isOfThisEconomy = saved.economyVersion >= 2;
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
