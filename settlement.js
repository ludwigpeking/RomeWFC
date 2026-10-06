// Purpose: a town that settles by itself, on either ground. People arrive one after another and
// put up a hut (the temporary tier). They travel to each other; every journey leaves traffic on
// the ground it crosses and money with the buildings it passes. A building that has gathered
// enough money is rebuilt better: a second level, then a house (the vernacular tier), and the
// richest of all become classical.
//
// Ground is fought over by its worth, and every loss is paid for by the gain it makes room for:
// - streets are not drawn by anyone. Where people travel, the ground has a worth as road, by how
//   much it is used. A newcomer has nothing and cannot settle on a road; a household with enough
//   money may build on it, paying what the road was worth.
// - a household grows by claiming the ground beside it: free ground for little, a road for its
//   worth, and the parcel of a poorer neighbour by buying it out for what it is worth.
// - journeys that would be shorter through a building go round it and press on it by what the
//   detour costs them. When that pressure has outgrown the worth of the building, it is broken
//   down, its household is paid its worth, and the road is open again.
//
// The rules of the ground follow an earlier simulation of the same author (2605_SpringShow): a
// way once trodden costs less to tread again, down to half; traffic makes the roads; a newcomer
// looks for the ground with the most traffic beside it.
//
// Every household owns its ground (volume.owners): its house does not grow together with the
// houses of its neighbours. Only when it buys a neighbour out do the two parcels become one house.
// Classical buildings grow together whoever owns them: they are seen as one institution.
//
// A household builds block by block: each point of its ground has its own stage, and one block
// at a time is raised a stage, the one with the most traffic beside it rather than another. Every
// further block at a stage asks for more money held, so a holding is seldom of one height, and a
// house turns classical one block at a time: on the ground floor of a block first (a portal to
// the street), then on its top floor as well, and only then the whole block.
//
// A household that has done well may lay out a garden on ground beside its house: open ground
// of its own, walled towards the street. A garden adds to the worth of the property and draws
// visitors, but it earns nothing from the passers-by, it is taxed like a building and it costs
// its keep every day: in the long run a family with large gardens holds less money, and a
// neighbour who has done better may buy its parcels.
//
// Journeys go from a household to another household or to one of the city's venues (the circus,
// the amphitheatre, the theatre, and the other public buildings): a venue draws many more people
// than a household does, and a household of great worth more than an ordinary one. The journeys
// are kept for a while (journeysToShow), so that people can be shown walking them afterwards.
//
// The town keeps what it has become: when a street grows busy, the houses along it open shops
// towards it, one front after another, and a shop once opened stays while its house stands, also
// when the traffic has gone elsewhere.
//
// The classical buildings that are entered by steps, and the triumphal arches, want open ground
// before them (classical.js tells which points): what stands there is cleared away and paid for,
// and nobody may build there while the monument stands.
//
// The simulation only writes the volume (which point holds which tier, how many levels, whose
// ground it is and how much it is used as street); the buildings come from it as always.

import { TIER, WORK, SeededRandom } from './volume';
import { nameOfHousehold } from './names';
import { pointsOfPublicBuilding } from './city';
import { createCity, runTheCity, householdsWithoutWater, CITY_PARAMETER_DEFAULTS } from './city';

// What a household builds as it grows rich: the tier and levels of its building, and the money it
// has to hold to build so. Money is spent on living, a small share of it every day, so what a
// household holds follows the trade that passes its door: only the busiest places ever hold
// enough to turn classical. What is built stays, also when its household grows poorer.
function buildingStage(moneyNeeded, tiersOfLevels) {
  const isOfOneTier = tiersOfLevels.every(function (tier) { return tier === tiersOfLevels[0]; });
  // tier: what the household counts as; a house with classical floors is still a house
  return { moneyNeeded: moneyNeeded, moneyNeededAtFullScale: moneyNeeded, tiersOfLevels: tiersOfLevels, tier: isOfOneTier ? tiersOfLevels[0] : TIER.vernacular };
}
function levelsOf(tier, levelCount) {
  return new Array(levelCount).fill(tier);
}
// A house has six storeys at the most. A classical block has three levels at the most, but for
// the tower: a block that rises on, level by level, up to 20 levels (100 m). A tower is a rare
// thing. The town has room for one for every so many households (householdsForEachTower), a
// household builds one only, and every further level costs a good deal more than the last
// (moneyGrowthOfATowerLevel), so that only a household that stays very rich for long gets high.
const mostLevelsOfAHouse = 6;
const mostLevelsOfATower = 20;
const moneyGrowthOfATowerLevel = 1.3; // each level of a tower asks for this many times the money of the one below
const BUILDING_STAGES = [
  buildingStage(0, levelsOf(TIER.temporary, 1)),
  buildingStage(60, levelsOf(TIER.temporary, 2)),
  buildingStage(250, levelsOf(TIER.vernacular, 1)),
  buildingStage(700, levelsOf(TIER.vernacular, 2)),
  buildingStage(1400, levelsOf(TIER.vernacular, 3)),
  buildingStage(2000, levelsOf(TIER.vernacular, 4)),
  buildingStage(2400, levelsOf(TIER.vernacular, 5)),
  buildingStage(2800, levelsOf(TIER.vernacular, mostLevelsOfAHouse)),
  // the house turns classical in parts: its ground floor first, then its top floor too
  buildingStage(3200, [TIER.classical].concat(levelsOf(TIER.vernacular, 4))),
  buildingStage(3600, [TIER.classical].concat(levelsOf(TIER.vernacular, 5))),
  buildingStage(4000, [TIER.classical].concat(levelsOf(TIER.vernacular, 4), [TIER.classical])),
  buildingStage(4800, levelsOf(TIER.classical, 1)),
  buildingStage(6500, levelsOf(TIER.classical, 2)),
  buildingStage(9000, levelsOf(TIER.classical, 3)),
];
for (let towerLevelCount = 4; towerLevelCount <= mostLevelsOfATower; towerLevelCount++) {
  BUILDING_STAGES.push(buildingStage(Math.round(9000 * Math.pow(moneyGrowthOfATowerLevel, towerLevelCount - 3)), levelsOf(TIER.classical, towerLevelCount)));
}
// The garden: not a stage a block is raised to, but what a claimed point may be laid out as
const firstTowerStageNumber = BUILDING_STAGES.length - (mostLevelsOfATower - 3);
const gardenStageNumber = BUILDING_STAGES.length;
BUILDING_STAGES.push(buildingStage(800, [TIER.garden]));
const firstStageThatLaysOutGardens = 3; // a house of two storeys

// How much each kind of venue draws, against a household of ordinary worth at 1
const DRAW_OF_A_VENUE = { circus: 5, amphitheatre: 4, theatre: 3, basilica: 2.5, pantheon: 2.5, temple: 1.5 };
const mostJourneysToShow = 400;

// What kind of building a stage is: 'hut', 'house', 'houseWithClassicalFloors', 'classical' or 'garden'
function kindOfStage(stage) {
  if (stage.tier === TIER.garden) {
    return 'garden';
  }
  if (stage.tier === TIER.temporary) {
    return 'hut';
  }
  if (stage.tier === TIER.classical) {
    return 'classical';
  }
  return stage.tiersOfLevels.indexOf(TIER.classical) >= 0 ? 'houseWithClassicalFloors' : 'house';
}
// The stages as they were numbered before houses had six storeys and towers rose: a run saved
// then is read with these
const STAGE_OF_EARLIER_STAGE = [0, 1, 2, 3, 4, 5, 8, 8, 10, 11, 12, 13];
const versionOfTheStages = 2;
// Raising a block to a stage asks for that much more of the stage's money for every other block
// of the household that stands at that stage or higher
let moneyShareForEachFurtherBlock = 0.25;
let moneyKeptEachDay = 0.997;          // the rest is spent on living
const moneyForAPasserBy = 1;             // to every building beside a point a journey crosses
const moneyForAVisit = 2;                // to both ends of a journey
let journeysPerHouseholdEachDay = 0.35;
let chanceOfAnArrivalEachDay = 0.45;
let mostGroundSettled = 0.45;          // share of the points that may be built on

// Roads. The recent traffic of a point is its journeys, the older ones counting less every day.
const recentTrafficKeptEachDay = 0.98;
export const roadRecentTraffic = 3;      // recent traffic from which a point counts as road
const moneyWorthOfARecentJourney = 25;   // the worth of a road, for each journey of its recent traffic
// How much a point is used as street, for the faces of the houses that look at it (shops towards
// a busy street). A point keeps its grade until its traffic has clearly left it, so that the
// houses do not change their faces with every journey.
const STREET_GRADE = { yard: 0, street: 1, busyStreet: 2 };
const leastBusyStreetRecentTraffic = 8;
let shareOfTheBusiestStreet = 0.4;     // a street is busy from this share of the traffic of the busiest point
const shareOfTrafficThatKeepsAGrade = 0.6;
let chanceOfAShopOpeningEachDay = 0.01; // for each front of a house that looks at a busy street

// Growing. A household claims ground beside it now and then.
let householdsForEachTower = 150;        // the town has room for one tower for every so many households
let chanceOfAGardenAmongClaims = 0.5;    // of the free ground a well-off household claims, how much it lays out as garden
let moneyForAGardenEachDay = 0.8;        // the keep of one point of garden
let chanceOfAClaimEachDay = 0.03;
let mostPointsOfAHousehold = 9;
const moneyForFreeGround = 20;
const moneyHeldForARoad = 2;             // times the worth of the road, to build on it
let moneyHeldForABuyOut = 3;           // times the worth of the parcel, to buy a neighbour out

// Breaking through. A journey may think of crossing a building, at this many steps of detour for
// each; what it saves by that, against the way it has to go, presses on the buildings it would cross.
let stepsABuildingCosts = 5;
const stepsSavedWhereNoWayIsLeft = 15;
let moneyWorthOfAStepSaved = 12;
const pressureKeptEachDay = 0.995;

// The parameters a settlement may be run with, and what they are when nothing else is asked for.
// moneyScaleOfStages: all the money a stage of building needs, times this. They hold for the
// settlement that was made last (one settlement lives at a time).
export const SETTLEMENT_PARAMETER_DEFAULTS = {
  moneyScaleOfStages: 1,
  householdsForEachTower: 150,
  chanceOfAGardenAmongClaims: 0.5,
  moneyForAGardenEachDay: 0.8,
  moneyShareForEachFurtherBlock: 0.25,
  moneyKeptEachDay: 0.997,
  journeysPerHouseholdEachDay: 0.35,
  chanceOfAnArrivalEachDay: 0.45,
  mostGroundSettled: 0.45,
  shareOfTheBusiestStreet: 0.4,
  chanceOfAShopOpeningEachDay: 0.01,
  chanceOfAClaimEachDay: 0.03,
  mostPointsOfAHousehold: 9,
  moneyHeldForABuyOut: 3,
  stepsABuildingCosts: 5,
  moneyWorthOfAStepSaved: 12,
};

Object.assign(SETTLEMENT_PARAMETER_DEFAULTS, CITY_PARAMETER_DEFAULTS); // what the city does as a whole: city.js

// Sets the parameters: the defaults, and over them whatever is given. Returns all of them.
export function setSettlementParameters(givenParameters) {
  const parameters = Object.assign({}, SETTLEMENT_PARAMETER_DEFAULTS, givenParameters || {});
  householdsForEachTower = parameters.householdsForEachTower;
  chanceOfAGardenAmongClaims = parameters.chanceOfAGardenAmongClaims;
  moneyForAGardenEachDay = parameters.moneyForAGardenEachDay;
  moneyShareForEachFurtherBlock = parameters.moneyShareForEachFurtherBlock;
  moneyKeptEachDay = parameters.moneyKeptEachDay;
  journeysPerHouseholdEachDay = parameters.journeysPerHouseholdEachDay;
  chanceOfAnArrivalEachDay = parameters.chanceOfAnArrivalEachDay;
  mostGroundSettled = parameters.mostGroundSettled;
  shareOfTheBusiestStreet = parameters.shareOfTheBusiestStreet;
  chanceOfAShopOpeningEachDay = parameters.chanceOfAShopOpeningEachDay;
  chanceOfAClaimEachDay = parameters.chanceOfAClaimEachDay;
  mostPointsOfAHousehold = parameters.mostPointsOfAHousehold;
  moneyHeldForABuyOut = parameters.moneyHeldForABuyOut;
  stepsABuildingCosts = parameters.stepsABuildingCosts;
  moneyWorthOfAStepSaved = parameters.moneyWorthOfAStepSaved;
  BUILDING_STAGES.forEach(function (stage) {
    stage.moneyNeeded = stage.moneyNeededAtFullScale * parameters.moneyScaleOfStages;
  });
  return parameters;
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
    this.ownerOfPoint = new Array(map.points.length).fill(null);
    this.stageOfPoint = new Int8Array(map.points.length).fill(-1); // how far each block is built; -1 where nothing stands
    this.traffic = new Float32Array(map.points.length);       // every journey that ever crossed a point
    this.recentTraffic = new Float32Array(map.points.length); // the same, the older ones counting less
    this.pressure = new Float32Array(map.points.length);      // steps of detour a building has cost the journeys
    this.brokenBuildingCount = 0;
    this.clearedBuildingCount = 0;
    this.journeysToShow = [];                                 // the ways of the latest journeys, from their beginnings to their ends
    this.journeyCount = 0;
    this.journeysToVenues = 0;
    // the city as a whole (city.js): its treasury, its buildings, its wall
    this.city = createCity();
    this.isWithinWalls = new Uint8Array(map.points.length);
    this.hasAWall = false;
    this.wallCount = 0;        // how many walls the city has built, one outside the other
    this.roadRecentTraffic = roadRecentTraffic;
    this.busyStreetRecentTraffic = leastBusyStreetRecentTraffic;
    this.namesTaken = new Set();                              // the names of the households, each given once
    this.householdCount = 0;                                  // every household that ever came, for their numbers
    this.isKeptOpen = new Uint8Array(map.points.length);      // the ground before the monuments
    volume.streetGrades = new Uint8Array(map.points.length);
    volume.shopFronts = new Map();
    this.neighboursOfPoint = map.points.map(function (point, pointIndex) {
      return Array.from(map.sideNeighboursOfPoint[pointIndex]);
    });
    // the middle of the map, where the first settler stops
    let middlePoint = 0;
    let leastDistance = Infinity;
    const middleX = (map.bounds.minX + map.bounds.maxX) / 2;
    const middleZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    map.points.forEach(function (point, pointIndex) {
      const distance = Math.hypot(point.x - middleX, point.z - middleZ);
      if (distance < leastDistance) {
        leastDistance = distance;
        middlePoint = pointIndex;
      }
    });
    this.middlePoint = middlePoint;
  }

  isFree(pointIndex) {
    return this.ownerOfPoint[pointIndex] === null;
  }

  isRoad(pointIndex) {
    return this.isFree(pointIndex) && this.recentTraffic[pointIndex] >= roadRecentTraffic;
  }

  // What a point is worth as road: by how much it has been used lately
  worthAsRoad(pointIndex) {
    return this.recentTraffic[pointIndex] * moneyWorthOfARecentJourney;
  }

  // What the building on a point is worth, by how far it is built
  worthOfBuildingOn(pointIndex) {
    return 30 + BUILDING_STAGES[this.stageOfPoint[pointIndex]].moneyNeeded * 0.5;
  }

  // What a built point is worth: what its building cost, and its share of what its household holds
  worthAsParcel(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    return 30 + BUILDING_STAGES[this.stageOfPoint[pointIndex]].moneyNeeded * 0.5 + household.money / household.pointIndices.length;
  }

  // Whether a newcomer could take a point: free, not a road, not on the rim, and neither it nor
  // any building beside it walled in by it (every building keeps open ground on one side at least)
  maySettleOn(pointIndex) {
    if (!this.isFree(pointIndex) || this.isRoad(pointIndex) || this.isKeptOpen[pointIndex] || this.volume.works[pointIndex] !== 0 || this.map.points[pointIndex].isOnBoundary) {
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

  // One day: perhaps an arrival, the day's journeys, then every household spends, rebuilds if it
  // can and perhaps claims ground. Returns whether the volume changed.
  step() {
    this.dayCount++;
    let volumeChanged = false;
    if (this.random.nextFloat() < chanceOfAnArrivalEachDay && this.settledPointCount() < mostGroundSettled * this.map.points.length) {
      volumeChanged = this.settleANewHousehold() || volumeChanged;
    }
    const journeyCount = Math.ceil(this.households.length * journeysPerHouseholdEachDay);
    for (let journey = 0; journey < journeyCount; journey++) {
      volumeChanged = this.travel() || volumeChanged;
    }
    // busy is measured against the busiest point of the town, so that the main streets stand out
    // however large the town has grown
    let highestRecentTraffic = 0;
    for (let pointIndex = 0; pointIndex < this.traffic.length; pointIndex++) {
      highestRecentTraffic = Math.max(highestRecentTraffic, this.recentTraffic[pointIndex]);
    }
    this.busyStreetRecentTraffic = Math.max(leastBusyStreetRecentTraffic, shareOfTheBusiestStreet * highestRecentTraffic);
    for (let pointIndex = 0; pointIndex < this.traffic.length; pointIndex++) {
      this.recentTraffic[pointIndex] *= recentTrafficKeptEachDay;
      this.pressure[pointIndex] *= pressureKeptEachDay;
      this.volume.streetGrades[pointIndex] = this.streetGradeFor(this.recentTraffic[pointIndex], this.volume.streetGrades[pointIndex]);
    }
    volumeChanged = this.openShops() || volumeChanged;
    const settlement = this;
    this.households.slice().forEach(function (household) {
      if (household.pointIndices.length === 0) {
        return; // bought out or broken down earlier this day
      }
      household.money *= moneyKeptEachDay;
      household.pointIndices.forEach(function (pointIndex) {
        if (settlement.stageOfPoint[pointIndex] === gardenStageNumber) {
          household.money = Math.max(0, household.money - moneyForAGardenEachDay);
        }
      });
      volumeChanged = settlement.raiseABlockIfRicher(household) || volumeChanged;
      volumeChanged = settlement.claimGroundPerhaps(household) || volumeChanged;
    });
    volumeChanged = runTheCity(this) || volumeChanged;
    return volumeChanged;
  }

  // The grade of a point as street, from its recent traffic and the grade it had: it rises at
  // the full traffic of a grade and falls only when a share of that is lost
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

  // Along the busy streets the houses open shops, now and then one more front; a shop stays.
  // Returns whether one opened.
  openShops() {
    let shopOpened = false;
    const shopFronts = this.volume.shopFronts;
    for (let facedPoint = 0; facedPoint < this.traffic.length; facedPoint++) {
      if (this.volume.streetGrades[facedPoint] !== STREET_GRADE.busyStreet || this.ownerOfPoint[facedPoint] !== null) {
        continue;
      }
      for (const raisedPoint of this.neighboursOfPoint[facedPoint]) {
        if (this.volume.tierAt(raisedPoint, 0) !== TIER.vernacular || this.volume.hasShopFront(raisedPoint, facedPoint) ||
          this.random.nextFloat() >= chanceOfAShopOpeningEachDay) {
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

  // The ground the monuments want open before them, as the classical tier tells it each time the
  // town is rebuilt: what stands there (but nothing classical) is cleared away, its household
  // paid its worth, and nobody settles or claims there. Returns whether the volume changed.
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
      household.money += settlement.worthAsParcel(pointIndex);
      settlement.takePoint(pointIndex);
      settlement.volume.setTier(pointIndex, 0, TIER.empty);
      settlement.pressure[pointIndex] = 0;
      settlement.clearedBuildingCount++;
      volumeChanged = true;
    });
    return volumeChanged;
  }

  settledPointCount() {
    let count = 0;
    this.households.forEach(function (household) {
      count += household.pointIndices.length;
    });
    return count;
  }

  // A newcomer stops beside the town: of some free places near it, the one with the most traffic beside it
  settleANewHousehold() {
    let site = -1;
    if (this.households.length === 0) {
      site = this.middlePoint;
    } else {
      let bestValue = -1;
      for (let attempt = 0; attempt < 24; attempt++) {
        const host = this.households[this.random.nextInt(this.households.length)];
        let candidate = host.pointIndices[this.random.nextInt(host.pointIndices.length)];
        const stepCount = 1 + this.random.nextInt(3);
        for (let step = 0; step < stepCount; step++) {
          const neighbours = this.neighboursOfPoint[candidate];
          candidate = neighbours[this.random.nextInt(neighbours.length)];
        }
        if (!this.maySettleOn(candidate)) {
          continue;
        }
        let value = this.random.nextFloat();
        for (const neighbourPoint of this.neighboursOfPoint[candidate]) {
          value += this.recentTraffic[neighbourPoint];
        }
        if (value > bestValue) {
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
      pointIndices: [], money: 0, stage: 0,
    };
    this.households.push(household);
    this.givePoint(site, household, 0);
    return true;
  }

  // A point passes to a household, built on to a stage
  givePoint(pointIndex, household, stage) {
    this.ownerOfPoint[pointIndex] = household;
    this.volume.setOwner(pointIndex, household.number);
    household.pointIndices.push(pointIndex);
    this.pressure[pointIndex] = 0;
    this.stageOfPoint[pointIndex] = stage;
    if (stage !== gardenStageNumber) { // (a household counts by its buildings, not by its gardens)
      household.stage = Math.max(household.stage, stage);
    }
    this.buildOnPoint(pointIndex, BUILDING_STAGES[stage]);
  }

  // A point is taken from its household; a household without ground is gone
  takePoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    household.pointIndices.splice(household.pointIndices.indexOf(pointIndex), 1);
    this.ownerOfPoint[pointIndex] = null;
    this.volume.shopFronts.delete(pointIndex);
    this.stageOfPoint[pointIndex] = -1;
    this.volume.setOwner(pointIndex, 0);
    // the household counts by the best of the blocks it has left
    const settlement = this;
    household.stage = 0;
    household.pointIndices.forEach(function (otherPoint) {
      if (settlement.stageOfPoint[otherPoint] !== gardenStageNumber) {
        household.stage = Math.max(household.stage, settlement.stageOfPoint[otherPoint]);
      }
    });
    if (household.pointIndices.length === 0) {
      this.households.splice(this.households.indexOf(household), 1);
    }
  }

  buildOnPoint(pointIndex, stage) {
    this.volume.setTier(pointIndex, 0, TIER.empty); // takes away what stood there, all of it
    for (let level = 0; level < stage.tiersOfLevels.length; level++) {
      this.volume.setTier(pointIndex, level, stage.tiersOfLevels[level]);
    }
  }

  // Whether a household may begin a tower: it has none yet, and the town has fewer towers than
  // it has room for
  mayBeginATower(household) {
    const settlement = this;
    function isATower(pointIndex) {
      return settlement.stageOfPoint[pointIndex] >= firstTowerStageNumber && settlement.stageOfPoint[pointIndex] < gardenStageNumber;
    }
    if (household.pointIndices.some(isATower)) {
      return false;
    }
    let towerCount = 0;
    for (let pointIndex = 0; pointIndex < this.stageOfPoint.length; pointIndex++) {
      if (isATower(pointIndex)) {
        towerCount++;
      }
    }
    return towerCount < Math.floor(this.households.length / householdsForEachTower);
  }

  // One block of a household is raised a stage, if the household holds the money for it: of the
  // blocks it could raise, the one with the most traffic beside it (and some chance). Returns
  // whether a block was raised.
  raiseABlockIfRicher(household) {
    const settlement = this;
    let chosenPoint = -1;
    let bestValue = -Infinity;
    household.pointIndices.forEach(function (pointIndex) {
      const nextStage = settlement.stageOfPoint[pointIndex] + 1;
      if (nextStage >= gardenStageNumber) { // the highest tower, or a garden: neither is raised
        return;
      }
      // a tower is begun only where the town has room for another and the household has none
      if (nextStage === firstTowerStageNumber && !settlement.mayBeginATower(household)) {
        return;
      }
      let furtherBlockCount = 0;
      household.pointIndices.forEach(function (otherPoint) {
        if (otherPoint !== pointIndex && settlement.stageOfPoint[otherPoint] >= nextStage && settlement.stageOfPoint[otherPoint] !== gardenStageNumber) {
          furtherBlockCount++;
        }
      });
      if (household.money < BUILDING_STAGES[nextStage].moneyNeeded * (1 + moneyShareForEachFurtherBlock * furtherBlockCount)) {
        return;
      }
      let trafficBeside = 0;
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        trafficBeside += settlement.recentTraffic[neighbourPoint];
      });
      const value = trafficBeside * (0.5 + settlement.random.nextFloat());
      if (value > bestValue) {
        bestValue = value;
        chosenPoint = pointIndex;
      }
    });
    if (chosenPoint === -1) {
      return false;
    }
    const stage = this.stageOfPoint[chosenPoint] + 1;
    this.stageOfPoint[chosenPoint] = stage;
    household.stage = Math.max(household.stage, stage);
    this.buildOnPoint(chosenPoint, BUILDING_STAGES[stage]);
    return true;
  }

  // A household now and then claims a point beside its ground: free ground for little, a road for
  // its worth, the parcel of a poorer neighbour by buying it out
  claimGroundPerhaps(household) {
    if (household.pointIndices.length >= mostPointsOfAHousehold || this.random.nextFloat() > chanceOfAClaimEachDay) {
      return false;
    }
    const from = household.pointIndices[this.random.nextInt(household.pointIndices.length)];
    const neighbours = this.neighboursOfPoint[from];
    const site = neighbours[this.random.nextInt(neighbours.length)];
    if (this.map.points[site].isOnBoundary || this.isKeptOpen[site] || this.volume.works[site] !== 0) {
      return false;
    }
    const neighbour = this.ownerOfPoint[site];
    if (neighbour === household || (neighbour !== null && neighbour.isCity)) {
      return false;
    }
    if (neighbour === null) {
      const price = this.isRoad(site) ? this.worthAsRoad(site) : moneyForFreeGround;
      const moneyHeldForIt = this.isRoad(site) ? moneyHeldForARoad * price : price;
      if (household.money < moneyHeldForIt) {
        return false;
      }
      household.money -= price; // the lost road is paid for
      // A household that has done well may lay the ground out as a garden, the more readily
      // where it lies beside a garden it has already; never on a road.
      const growsFromAGarden = this.stageOfPoint[from] === gardenStageNumber;
      const laysOutAGarden = household.stage >= firstStageThatLaysOutGardens && !this.isRoad(site) &&
        this.random.nextFloat() < (growsFromAGarden ? 2 : 1) * chanceOfAGardenAmongClaims;
      if (laysOutAGarden) {
        this.givePoint(site, household, gardenStageNumber);
        return true;
      }
      // otherwise it is built on as the least of the buildings the household has
      let leastStage = gardenStageNumber;
      for (const pointIndex of household.pointIndices) {
        leastStage = Math.min(leastStage, this.stageOfPoint[pointIndex]);
      }
      this.givePoint(site, household, leastStage);
      return true;
    }
    // the parcel of a neighbour: only of one who builds no better, and for what it is worth
    const price = this.worthAsParcel(site);
    if (neighbour.stage > household.stage || household.money < moneyHeldForABuyOut * price) {
      return false;
    }
    household.money -= price;
    neighbour.money += price;
    // what stands on the parcel stays as it is; it is one house with the buyer's from now on
    const stageOfTheParcel = this.stageOfPoint[site];
    const shopFrontsOfTheParcel = this.volume.shopFronts.get(site);
    this.takePoint(site);
    this.givePoint(site, household, stageOfTheParcel);
    if (shopFrontsOfTheParcel !== undefined) {
      this.volume.shopFronts.set(site, shopFrontsOfTheParcel);
    }
    return true;
  }

  // One journey: from a household to another, rather a near and a rich one, over free ground and
  // rather along the ground others have trodden. It leaves traffic where it goes and money with
  // the buildings it passes and with both its ends. Where the way through a building would have
  // been shorter, it presses on that building, and may break it down. Returns whether a building fell.
  travel() {
    if (this.households.length < 2) {
      return false;
    }
    const origin = this.households[this.random.nextInt(this.households.length)];
    const settlement = this;
    const fromPoint = this.map.points[origin.pointIndices[0]];
    let destination = null;
    let bestAttraction = -1;
    function consider(candidate, draw, reachOfTheDraw) {
      const toPoint = settlement.map.points[candidate.pointIndices[0]];
      const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.z - fromPoint.z);
      const attraction = draw / (1 + distance * distance / reachOfTheDraw) * (0.5 + settlement.random.nextFloat());
      if (attraction > bestAttraction) {
        bestAttraction = attraction;
        destination = candidate;
      }
    }
    // some households, each drawing by the worth of its property (an ordinary house about 1) ...
    for (let candidateNumber = 0; candidateNumber < 5; candidateNumber++) {
      const candidate = this.households[this.random.nextInt(this.households.length)];
      if (candidate === origin) {
        continue;
      }
      let worthOfProperty = 0;
      candidate.pointIndices.forEach(function (pointIndex) {
        worthOfProperty += settlement.worthOfBuildingOn(pointIndex);
      });
      consider(candidate, 0.3 + worthOfProperty / 700, 200);
    }
    // ... and one of the venues, which draws more and from further away
    const venues = this.venues();
    if (venues.length > 0) {
      const venue = venues[this.random.nextInt(venues.length)];
      consider(venue, venue.draw, 1500);
    }
    if (destination === null) { // nobody else was thought of, and there is no venue yet
      return false;
    }
    // the way it would like to go, through buildings where that is worth their detour, and the way it has to go
    const wished = this.findWay(origin, destination, true);
    let taken = wished;
    let buildingFell = false;
    if (wished !== null && wished.crossedBuildings.length > 0) {
      taken = this.findWay(origin, destination, false);
      const costWithoutTheBuildings = wished.cost - wished.crossedBuildings.length * stepsABuildingCosts;
      const stepsSaved = taken === null ? stepsSavedWhereNoWayIsLeft : Math.max(0, taken.cost - costWithoutTheBuildings);
      wished.crossedBuildings.forEach(function (pointIndex) {
        if (settlement.ownerOfPoint[pointIndex] === null) {
          return; // fell with its household a moment ago
        }
        settlement.pressure[pointIndex] += stepsSaved;
        if (settlement.pressure[pointIndex] * moneyWorthOfAStepSaved >= settlement.worthAsParcel(pointIndex)) {
          settlement.breakDown(pointIndex);
          buildingFell = true;
        }
      });
    }
    if (taken === null || origin.pointIndices.length === 0 || destination.pointIndices.length === 0) {
      return buildingFell;
    }
    taken.points.forEach(function (pointIndex) {
      settlement.traffic[pointIndex] += 1;
      settlement.recentTraffic[pointIndex] += 1;
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        const household = settlement.ownerOfPoint[neighbourPoint];
        if (household !== null && settlement.stageOfPoint[neighbourPoint] !== gardenStageNumber) { // a garden sells nothing to the passers-by
          household.money += moneyForAPasserBy;
        }
      });
    });
    origin.money += moneyForAVisit;
    if (destination.isVenue) {
      this.city.money += 3 * moneyForAVisit; // what a venue takes goes to the city
      this.journeysToVenues++;
    } else {
      destination.money += moneyForAVisit;
    }
    this.journeyCount++;
    // the way is kept from its beginning to its end, for showing people walking it
    this.journeysToShow.push(taken.points.slice().reverse());
    if (this.journeysToShow.length > mostJourneysToShow) {
      this.journeysToShow.shift();
    }
    return buildingFell;
  }

  // The venues people travel to: the city's buildings, each as a place with its points and its
  // draw (the arch is passed, not visited)
  venues() {
    const publicBuildings = this.volume.publicBuildings;
    if (!this.venuesKnown || this.venuesKnown.length !== publicBuildings.filter(function (building) { return DRAW_OF_A_VENUE[building.kind] !== undefined; }).length) {
      this.venuesKnown = [];
      const settlement = this;
      publicBuildings.forEach(function (building) {
        if (DRAW_OF_A_VENUE[building.kind] === undefined) {
          return;
        }
        const pointIndices = pointsOfPublicBuilding(building);
        settlement.venuesKnown.push({ isVenue: true, kind: building.kind, draw: DRAW_OF_A_VENUE[building.kind], pointIndices: pointIndices });
      });
    }
    return this.venuesKnown;
  }

  // A building in the way of many journeys is broken down: its household is paid its worth, and
  // the ground is road again
  breakDown(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    household.money += this.worthAsParcel(pointIndex);
    this.takePoint(pointIndex);
    this.volume.setTier(pointIndex, 0, TIER.empty);
    this.pressure[pointIndex] = 0;
    this.recentTraffic[pointIndex] = Math.max(this.recentTraffic[pointIndex], roadRecentTraffic);
    this.brokenBuildingCount++;
  }

  // The way from one household to another that costs the least, a trodden point costing less than
  // an untrodden one. mayCrossBuildings: the buildings of others may be crossed, each at the cost
  // of a detour. Returns { points, cost, crossedBuildings }, or null when there is no way.
  findWay(origin, destination, mayCrossBuildings) {
    const settlement = this;
    const pointCount = this.map.points.length;
    // costs are kept as exactly as they are compared: a rounded cost would look improvable again and again
    const costTo = new Float64Array(pointCount).fill(Infinity);
    const cameFrom = new Int32Array(pointCount).fill(-1);
    const isGoal = new Uint8Array(pointCount);
    // nobody walks through the wall (only through its gates), through a fountain, or through
    // what the city has built
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
    // a point costs less the more it has been trodden: its full cost the first time, down to half
    function costOfStepOnto(pointIndex) {
      const journeyCount = Math.max(1, settlement.traffic[pointIndex]);
      return 1 / (2 * journeyCount) + 0.5 + (settlement.ownerOfPoint[pointIndex] === null ? 0 : stepsABuildingCosts);
    }
    destination.pointIndices.forEach(function (pointIndex) {
      settlement.neighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (mayStepOnto(neighbourPoint)) {
          isGoal[neighbourPoint] = 1;
        }
      });
    });
    // a heap of [cost, point], the least cost first
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

  // A household in words, for whoever points at its building: its name, what it has built
  // there, what it holds
  describePoint(pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household === null) {
      return null;
    }
    if (household.isCity) {
      return 'The city';
    }
    const stage = BUILDING_STAGES[this.stageOfPoint[pointIndex]];
    if (this.stageOfPoint[pointIndex] === gardenStageNumber) {
      return household.name + ' · here: a garden · holding ' + household.pointIndices.length + ' points · money ' + Math.round(household.money);
    }
    const tierNames = { [TIER.temporary]: 'hut', [TIER.vernacular]: 'house', [TIER.classical]: 'classical' };
    const levels = stage.tiersOfLevels.map(function (tier) { return tierNames[tier]; });
    const isOfOneKind = levels.every(function (level) { return level === levels[0]; });
    const building = isOfOneKind ? levels.length + (levels.length === 1 ? ' level of ' : ' levels of ') + levels[0] : levels.join(' / ');
    return household.name + ' · here: ' + building + ' · holding ' + household.pointIndices.length + (household.pointIndices.length === 1 ? ' point' : ' points') +
      ' · money ' + Math.round(household.money) + ' · arrived on day ' + household.dayOfArrival;
  }

  // Everything the settlement knows of a point, as lines of words: for whoever points at it
  // while a data layer is shown
  describeDataAt(pointIndex) {
    const lines = [];
    const household = this.ownerOfPoint[pointIndex];
    const works = this.volume.works[pointIndex];
    if (household === null) {
      const grade = this.volume.streetGrades[pointIndex];
      lines.push(grade === STREET_GRADE.busyStreet ? 'A busy street' : grade === STREET_GRADE.street ? 'A street' : 'Free ground');
      lines.push('worth as road: ' + Math.round(this.worthAsRoad(pointIndex)));
    } else if (household.isCity) {
      const building = this.volume.publicBuildings[this.volume.publicBuildingOfPoint[pointIndex] - 1];
      lines.push('The city' + (building ? ': ' + building.kind + ', built on day ' + building.day : ''));
    } else {
      this.describePoint(pointIndex).split(' · ').forEach(function (part) {
        lines.push(part);
      });
      const worth = this.worthAsParcel(pointIndex);
      lines.push('worth of this parcel: ' + Math.round(worth));
      lines.push('pressure of traffic: ' + Math.round(100 * this.pressure[pointIndex] * moneyWorthOfAStepSaved / worth) + '% of what breaks it through');
    }
    lines.push('traffic: ' + (Math.round(this.recentTraffic[pointIndex] * 10) / 10) + ' lately, ' + Math.round(this.traffic[pointIndex]) + ' in all');
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

  // The richest households, the first so many: [{ name, money, points, stage }]
  richestHouseholds(count) {
    return this.households.slice().sort(function (first, second) {
      return second.money - first.money;
    }).slice(0, count).map(function (household) {
      return { name: household.name, money: Math.round(household.money), points: household.pointIndices.length, stage: household.stage };
    });
  }

  // What a data layer shows at a point: a number from 0 to 1 (for 'owners' the number of the
  // household), or null where the layer has nothing to show there.
  // traffic: the recent traffic of free ground · streets: the grade of free ground as street ·
  // owners: whose parcel · stage: how far the block is built · money: what it holds ·
  // worth: what the ground is worth, as parcel or as road · pressure: how near a building is to
  // being broken through (1: it falls)
  layerValueAt(layerName, pointIndex) {
    const household = this.ownerOfPoint[pointIndex];
    if (household !== null && household.isCity) {
      return null;
    }
    function onALogarithmicScale(money, mostMoney) {
      return Math.min(1, Math.log(1 + money) / Math.log(1 + mostMoney));
    }
    if (layerName === 'traffic') {
      return household === null && this.recentTraffic[pointIndex] >= 0.5 ? Math.min(1, this.recentTraffic[pointIndex] / (4 * roadRecentTraffic)) : null;
    }
    if (layerName === 'streets') {
      const grade = this.volume.streetGrades[pointIndex];
      return household === null && grade > STREET_GRADE.yard ? grade / STREET_GRADE.busyStreet : null;
    }
    if (layerName === 'worth') {
      if (household !== null) {
        return onALogarithmicScale(this.worthAsParcel(pointIndex), 10000);
      }
      return this.recentTraffic[pointIndex] >= 0.5 ? onALogarithmicScale(this.worthAsRoad(pointIndex), 10000) : null;
    }
    if (household === null) {
      return null;
    }
    if (layerName === 'owners') {
      return household.number;
    }
    if (layerName === 'stage') {
      return this.stageOfPoint[pointIndex] / (BUILDING_STAGES.length - 1);
    }
    if (layerName === 'money') {
      return onALogarithmicScale(household.money, BUILDING_STAGES[BUILDING_STAGES.length - 1].moneyNeeded);
    }
    if (layerName === 'pressure') {
      return Math.min(1, this.pressure[pointIndex] * moneyWorthOfAStepSaved / this.worthAsParcel(pointIndex));
    }
    return null;
  }

  // How the town stands: the day, how many households live in each tier, the largest holding,
  // and how many buildings the roads have broken through
  // The town in numbers, for comparing one run with another
  statistics() {
    const settlement = this;
    const householdsByTier = { temporary: 0, vernacular: 0, classical: 0 };
    let housesWithClassicalFloors = 0;
    let largestHoldingPoints = 0;
    let settledPoints = 0;
    let moneyOfAll = 0;
    this.households.forEach(function (household) {
      const stage = BUILDING_STAGES[household.stage];
      householdsByTier[stage.tier === TIER.classical ? 'classical' : stage.tier === TIER.vernacular ? 'vernacular' : 'temporary']++;
      if (stage.tier === TIER.vernacular && stage.tiersOfLevels[0] === TIER.classical) {
        housesWithClassicalFloors++;
      }
      largestHoldingPoints = Math.max(largestHoldingPoints, household.pointIndices.length);
      settledPoints += household.pointIndices.length;
      moneyOfAll += household.money;
    });
    const blocksByStage = new Array(BUILDING_STAGES.length).fill(0);
    let roadPoints = 0;
    let busyStreetPoints = 0;
    let levelsOfAllBlocks = 0;
    for (let pointIndex = 0; pointIndex < this.stageOfPoint.length; pointIndex++) {
      if (this.stageOfPoint[pointIndex] >= 0) {
        blocksByStage[this.stageOfPoint[pointIndex]]++;
        levelsOfAllBlocks += BUILDING_STAGES[this.stageOfPoint[pointIndex]].tiersOfLevels.length;
      } else if (this.recentTraffic[pointIndex] >= roadRecentTraffic) {
        roadPoints++;
        if (this.volume.streetGrades[pointIndex] === STREET_GRADE.busyStreet) {
          busyStreetPoints++;
        }
      }
    }
    let shopFronts = 0;
    this.volume.shopFronts.forEach(function (facedPoints) {
      shopFronts += facedPoints.size;
    });
    const blocksOfKind = { hut: 0, house: 0, houseWithClassicalFloors: 0, classical: 0, garden: 0 };
    let highestBlockLevels = 0;
    blocksByStage.forEach(function (blockCount, stage) {
      blocksOfKind[kindOfStage(BUILDING_STAGES[stage])] += blockCount;
      if (blockCount > 0 && stage !== gardenStageNumber) {
        highestBlockLevels = Math.max(highestBlockLevels, BUILDING_STAGES[stage].tiersOfLevels.length);
      }
    });
    function blocksFromStage(firstStage, lastStage) {
      let count = 0;
      for (let stage = firstStage; stage <= lastStage; stage++) {
        count += blocksByStage[stage];
      }
      return count;
    }
    function rounded(value) {
      return Math.round(value * 100) / 100;
    }
    return {
      days: this.dayCount,
      households: this.households.length,
      householdsInHuts: householdsByTier.temporary,
      householdsInHouses: householdsByTier.vernacular,
      householdsClassical: householdsByTier.classical,
      housesWithClassicalFloors: housesWithClassicalFloors,
      largestHoldingPoints: largestHoldingPoints,
      meanHoldingPoints: rounded(settledPoints / Math.max(1, this.households.length)),
      shareOfGroundSettled: rounded(settledPoints / settlement.map.points.length),
      hutBlocks: blocksOfKind.hut,
      houseBlocks: blocksOfKind.house,
      houseBlocksWithClassicalFloors: blocksOfKind.houseWithClassicalFloors,
      classicalBlocks: blocksOfKind.classical,
      towerBlocks: blocksFromStage(firstTowerStageNumber, gardenStageNumber - 1), // classical, over three levels
      gardenPoints: blocksOfKind.garden,
      shareOfJourneysToVenues: rounded(this.journeysToVenues / Math.max(1, this.journeyCount)),
      mostLevelsOfABlock: highestBlockLevels,
      meanLevelsOfABlock: rounded(levelsOfAllBlocks / Math.max(1, settledPoints)),
      roadPoints: roadPoints,
      busyStreetPoints: busyStreetPoints,
      shopFronts: shopFronts,
      buildingsBrokenThrough: this.brokenBuildingCount,
      buildingsClearedBeforeMonuments: this.clearedBuildingCount,
      meanMoneyOfAHousehold: Math.round(moneyOfAll / Math.max(1, this.households.length)),
      publicBuildings: this.volume.publicBuildings.map(function (building) { return building.kind; }).join(' '),
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

  // Everything of the settlement and its town that has to be kept to take it up again later:
  // plain numbers and lists, fit to be written to a file
  save() {
    const shopFronts = [];
    this.volume.shopFronts.forEach(function (facedPoints, raisedPoint) {
      shopFronts.push([raisedPoint, Array.from(facedPoints)]);
    });
    function roundedList(values) {
      return Array.from(values, function (value) { return Math.round(value * 100) / 100; });
    }
    return {
      stagesVersion: versionOfTheStages, seed: this.seed, parameters: this.parameters, dayCount: this.dayCount, randomState: this.random.state,
      householdCount: this.householdCount, brokenBuildingCount: this.brokenBuildingCount, clearedBuildingCount: this.clearedBuildingCount,
      households: this.households.map(function (household) {
        return {
          number: household.number, name: household.name, dayOfArrival: household.dayOfArrival,
          pointIndices: household.pointIndices.slice(), money: Math.round(household.money * 100) / 100, stage: household.stage,
        };
      }),
      stageOfPoint: Array.from(this.stageOfPoint),
      traffic: roundedList(this.traffic), recentTraffic: roundedList(this.recentTraffic), pressure: roundedList(this.pressure),
      isKeptOpen: Array.from(this.isKeptOpen),
      levelCount: this.volume.levelCount, tiers: Array.from(this.volume.tiers), owners: Array.from(this.volume.owners),
      streetGrades: Array.from(this.volume.streetGrades), shopFronts: shopFronts,
      works: Array.from(this.volume.works), publicBuildings: this.volume.publicBuildings,
      publicBuildingOfPoint: Array.from(this.volume.publicBuildingOfPoint),
      city: { money: Math.round(this.city.money), fountainPoints: this.city.fountainPoints, moneyCollected: Math.round(this.city.moneyCollected), moneySpent: Math.round(this.city.moneySpent), chronicle: this.city.chronicle },
      isWithinWalls: Array.from(this.isWithinWalls), hasAWall: this.hasAWall, wallCount: this.wallCount,
    };
  }

  // A saved settlement taken up again on the same ground: the volume is written as it stood
  static restore(map, volume, saved) {
    const settlement = new Settlement(map, volume, saved.seed, saved.parameters);
    settlement.dayCount = saved.dayCount;
    settlement.random.state = saved.randomState;
    settlement.householdCount = saved.householdCount;
    settlement.brokenBuildingCount = saved.brokenBuildingCount;
    settlement.clearedBuildingCount = saved.clearedBuildingCount;
    settlement.households = saved.households.map(function (household) {
      // (a run saved before the households had names gets them now, the same ones every time)
      const restored = {
        number: household.number, name: household.name || nameOfHousehold(household.number, saved.seed, settlement.namesTaken),
        dayOfArrival: household.dayOfArrival || 0,
        pointIndices: household.pointIndices.slice(), money: household.money, stage: household.stage,
      };
      settlement.namesTaken.add(restored.name);
      restored.pointIndices.forEach(function (pointIndex) {
        settlement.ownerOfPoint[pointIndex] = restored;
      });
      return restored;
    });
    settlement.stageOfPoint.set(saved.stageOfPoint);
    if (saved.stagesVersion !== versionOfTheStages) {
      for (let pointIndex = 0; pointIndex < settlement.stageOfPoint.length; pointIndex++) {
        if (settlement.stageOfPoint[pointIndex] >= 0) {
          settlement.stageOfPoint[pointIndex] = STAGE_OF_EARLIER_STAGE[settlement.stageOfPoint[pointIndex]];
        }
      }
      settlement.households.forEach(function (household) {
        household.stage = STAGE_OF_EARLIER_STAGE[household.stage];
      });
    }
    settlement.traffic.set(saved.traffic);
    settlement.recentTraffic.set(saved.recentTraffic);
    settlement.pressure.set(saved.pressure);
    settlement.isKeptOpen.set(saved.isKeptOpen);
    volume.tiers.set(saved.tiers);
    volume.owners.set(saved.owners);
    volume.streetGrades.set(saved.streetGrades);
    saved.shopFronts.forEach(function (entry) {
      volume.shopFronts.set(entry[0], new Set(entry[1]));
    });
    // the city (a run saved before there was one has none of this)
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
    return settlement;
  }

  summary() {
    const counts = { temporary: 0, vernacular: 0, classical: 0 };
    let housesWithClassicalFloors = 0;
    let largestHolding = 0;
    this.households.forEach(function (household) {
      const tier = BUILDING_STAGES[household.stage].tier;
      if (tier === TIER.vernacular && BUILDING_STAGES[household.stage].tiersOfLevels[0] === TIER.classical) {
        housesWithClassicalFloors++;
      }
      counts[tier === TIER.classical ? 'classical' : tier === TIER.vernacular ? 'vernacular' : 'temporary']++;
      largestHolding = Math.max(largestHolding, household.pointIndices.length);
    });
    return 'day ' + this.dayCount + ' · ' + this.households.length + ' households: ' + counts.temporary + ' in huts, ' +
      counts.vernacular + ' in houses (' + housesWithClassicalFloors + ' with classical floors), ' + counts.classical + ' classical · largest holding ' + largestHolding +
      ' points · ' + this.brokenBuildingCount + ' buildings broken through, ' + this.clearedBuildingCount + ' cleared for the city · treasury ' + Math.round(this.city.money) +
      ' · public: ' + (this.volume.publicBuildings.map(function (building) { return building.kind; }).join(', ') || 'none') +
      ' · ' + this.city.fountainPoints.length + ' fountains' + (this.hasAWall ? ' · walled, ' + this.countOfWork(WORK.gate) + ' gates' : '');
  }
}
