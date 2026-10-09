// Purpose: the volume. Every point of the map (topology.js), on every level, is empty or filled
// with one of three tiers of building; everything that is built is derived from this.

// (a garden is ground of a house that is not built on: a block of its own kind, one level, nothing on it)
export const TIER = { empty: 0, classical: 1, vernacular: 2, temporary: 3, garden: 4 };
export const TIER_NAMES = ['empty', 'classical', 'vernacular', 'temporary', 'garden'];

// The height of a level, in metres, depends on the tier of the block that stands on it: a
// classical storey is taller than that of a house, and that of a hut is the lowest. So a level
// has no fixed height above the ground: a block stands on top of whatever is under it at its point.
export const classicalLevelHeight = 5;
export const vernacularLevelHeight = 3;
export const temporaryLevelHeight = 2.4;
export const gardenWallHeight = 2.2;
export function levelHeightOfTier(tier) {
  return tier === TIER.classical ? classicalLevelHeight : tier === TIER.vernacular ? vernacularLevelHeight : tier === TIER.temporary ? temporaryLevelHeight :
    tier === TIER.garden ? gardenWallHeight : 0;
}

// The works of a city that are not blocks: what lies on a point beside (or instead of) a
// building, as flags that add up. A wall or a gate, an aqueduct passing over, the fountain it
// ends at, and the passage of a street through an arch of the city.
export const WORK = { wall: 1, gate: 2, duct: 4, fountain: 8, passage: 16 };

// Temporary buildings (huts, stalls, shabby houses) stand at most two levels tall
export const temporaryLevelLimit = 2;

export class PointVolume {
  constructor(map, levelCount) {
    this.map = map;
    this.levelCount = levelCount;
    this.pointCount = map.points.length;
    this.tiers = new Uint8Array(this.pointCount * levelCount);
    // Whose ground a point is: the number of its owner, or 0 where nobody is named (a town drawn
    // by hand). Houses of different owners do not grow together; classical buildings always do.
    this.owners = new Int32Array(this.pointCount);
    // How much a point is used as street, where a simulation tells: 0 a yard, 1 a street, 2 a
    // busy street. null where nothing is known (a town drawn by hand).
    this.streetGrades = null;
    // The shop fronts a town has opened in its time, where a simulation tells: for a point, the
    // points beside it that its house looks at with a shop. null where nothing is known.
    this.shopFronts = null;
    // The works on each point (WORK flags; works.js builds them), and the buildings the city has
    // put up for itself: [{ number, kind, widthPoints, depthPoints, levelCount, grid }], grid
    // being the points of the building with a ring of points round it, row by row from its back
    // to its front; publicBuildingOfPoint tells which of them a point belongs to (0: none).
    this.works = new Uint8Array(this.pointCount);
    this.publicBuildings = [];
    this.publicBuildingOfPoint = new Int32Array(this.pointCount);
  }

  hasShopFront(raisedPoint, facedPoint) {
    const facedPoints = this.shopFronts.get(raisedPoint);
    return facedPoints !== undefined && facedPoints.has(facedPoint);
  }

  ownerAt(pointIndex) {
    return pointIndex >= 0 && pointIndex < this.pointCount ? this.owners[pointIndex] : 0;
  }

  setOwner(pointIndex, owner) {
    this.owners[pointIndex] = owner;
  }

  contains(pointIndex, level) {
    return pointIndex >= 0 && pointIndex < this.pointCount && level >= 0 && level < this.levelCount;
  }

  tierAt(pointIndex, level) {
    return this.contains(pointIndex, level) ? this.tiers[level * this.pointCount + pointIndex] : TIER.empty;
  }

  // How many levels are in use: one more than the highest level anything stands on. What goes
  // through the volume level by level need not look higher.
  usedLevelCount() {
    for (let index = this.tiers.length - 1; index >= 0; index--) {
      if (this.tiers[index] !== TIER.empty) {
        return Math.floor(index / this.pointCount) + 1;
      }
    }
    return 0;
  }

  // How high above the ground a level begins at a point: the heights of the blocks under it.
  // A classical block that carries a house or a hut is a part of that building (its portal, say):
  // it takes only the room of one of its levels, so the levels of the building stay in line, and
  // being taller it grows up out of that room into the level above (heightEatenFromBelowAt).
  bottomHeightAt(pointIndex, level) {
    let height = 0;
    for (let levelBelow = 0; levelBelow < level; levelBelow++) {
      const tier = this.tierAt(pointIndex, levelBelow);
      const tierAbove = this.tierAt(pointIndex, levelBelow + 1);
      const isPartOfTheBuildingAbove = tier === TIER.classical && (tierAbove === TIER.vernacular || tierAbove === TIER.temporary);
      height += levelHeightOfTier(isPartOfTheBuildingAbove ? tierAbove : tier);
    }
    return height;
  }

  // How much of a block is taken by the classical block under it, in metres from its bottom. A
  // classical block under a house keeps its full height, so it fills the lower part of the level
  // of the house above it; what is left of that level is a low block without windows, which joins
  // the classical block to the house above (a connector).
  heightEatenFromBelowAt(pointIndex, level) {
    const isAHouseOnAClassicalBlock = this.tierAt(pointIndex, level) === TIER.vernacular && this.tierAt(pointIndex, level - 1) === TIER.classical;
    return isAHouseOnAClassicalBlock ? classicalLevelHeight - vernacularLevelHeight : 0;
  }

  // Whether a tier may stand on a point at a level: inside the volume, huts no higher than their
  // limit, and nothing suspended: a block stands on the ground or on a block (ruled out for now,
  // so that the blocks carried over a gap need not be thought of yet)
  canHold(pointIndex, level, tier) {
    if (!this.contains(pointIndex, level)) {
      return false;
    }
    if (tier !== TIER.empty && level > 0 && this.tierAt(pointIndex, level - 1) === TIER.empty) {
      return false;
    }
    // a garden lies on the ground, and nothing stands on a garden
    if (tier === TIER.garden && level > 0) {
      return false;
    }
    if (tier !== TIER.empty && level > 0 && this.tierAt(pointIndex, level - 1) === TIER.garden) {
      return false;
    }
    return tier !== TIER.temporary || level < temporaryLevelLimit;
  }

  // Emptying a place takes away everything that stood on it too
  setTier(pointIndex, level, tier) {
    if (!this.canHold(pointIndex, level, tier)) {
      return false;
    }
    this.tiers[level * this.pointCount + pointIndex] = tier;
    if (tier === TIER.empty) {
      for (let levelAbove = level + 1; levelAbove < this.levelCount; levelAbove++) {
        this.tiers[levelAbove * this.pointCount + pointIndex] = TIER.empty;
      }
    }
    return true;
  }

  clear() {
    this.tiers.fill(TIER.empty);
    this.owners.fill(0);
    this.streetGrades = null;
    this.shopFronts = null;
    this.roofTerraces = null;
    this.townMiddle = null;
    this.works.fill(0);
    this.publicBuildings = [];
    this.publicBuildingOfPoint.fill(0);
  }

  // every filled place as { pointIndex, level, tier }
  filledPlaces() {
    const places = [];
    for (let level = 0; level < this.levelCount; level++) {
      for (let pointIndex = 0; pointIndex < this.pointCount; pointIndex++) {
        const tier = this.tiers[level * this.pointCount + pointIndex];
        if (tier !== TIER.empty) {
          places.push({ pointIndex: pointIndex, level: level, tier: tier });
        }
      }
    }
    return places;
  }

  // The groups of places of one tier that touch: one above the other, or side by side on points joined by a side
  connectedGroups(tier) {
    const groupOfPlace = new Int32Array(this.tiers.length).fill(-1);
    const groups = [];
    const volume = this;
    this.filledPlaces().forEach(function (startPlace) {
      const startIndex = startPlace.level * volume.pointCount + startPlace.pointIndex;
      if (startPlace.tier !== tier || groupOfPlace[startIndex] >= 0) {
        return;
      }
      const group = [];
      const pending = [startPlace];
      groupOfPlace[startIndex] = groups.length;
      while (pending.length > 0) {
        const place = pending.pop();
        group.push(place);
        const touching = [[place.pointIndex, place.level + 1], [place.pointIndex, place.level - 1]];
        volume.map.sideNeighboursOfPoint[place.pointIndex].forEach(function (neighbourPoint) {
          touching.push([neighbourPoint, place.level]);
        });
        touching.forEach(function (candidate) {
          if (volume.tierAt(candidate[0], candidate[1]) !== tier) {
            return;
          }
          const index = candidate[1] * volume.pointCount + candidate[0];
          if (groupOfPlace[index] < 0) {
            groupOfPlace[index] = groups.length;
            pending.push({ pointIndex: candidate[0], level: candidate[1], tier: tier });
          }
        });
      }
      groups.push(group);
    });
    return groups;
  }
}

// A repeatable random number source (the same seed gives the same town)
export class SeededRandom {
  constructor(seed) {
    this.state = (seed >>> 0) || 1;
  }

  nextFloat() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  nextInt(limit) {
    return Math.floor(this.nextFloat() * limit);
  }
}

// A repeatable number between 0 and 1 for a place, so that it keeps its look while others change
export function placeHash(pointIndex, level, salt) {
  let state = Math.imul(pointIndex + 1, 73856093) ^ Math.imul(level + 1, 19349663) ^ Math.imul(salt + 1, 2654435761);
  state = Math.imul(state ^ (state >>> 15), 2246822519);
  state = Math.imul(state ^ (state >>> 13), 3266489917);
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
}
