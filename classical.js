// Purpose: the classical tier. The classical volume is read as formations (formations.js); each
// formation takes a designed model (models.js, monuments.js) and is put together from the mince
// of that model, quad by quad (mince.js). So a building of any size comes from a model designed
// once, and the quads are the product of the models.
//
// Not made from a mince: the essential blocks on one point (the tholos and the aedicule), which
// read their surroundings, and the hard modelled buildings (the Pantheon, the rotunda, the
// triumphal arch), which are placed whole.
//
// A building is put on the quads of the ground themselves: every piece of the mince is warped
// into the quad it belongs to, found by its place in the lattice view of its formation
// (charts.js). On the square ground that changes nothing; on the irregular ground the building is
// skewed with the quads, as the houses are. A point where three, five or six quads meet lies in
// no lattice: what stands on it is a loggia put together round the point, one corner piece in
// every quad, so it has as many sides as there are quads. What is placed whole (the round tholos,
// the hard modelled buildings) is not skewed.

import { cellSize } from './parts';
import { TIER, placeHash } from './volume';
import { positionInView } from './charts';
import { findClassicalFormations } from './formations';
import { chooseModel, MODELS } from './models';
import { buildFromMince, buildFromMinceRoundAPoint } from './mince';
import { PUBLIC_HARD_MODELS } from './publicModels';
import { buildEssentialBlock, readEssentialBlock, buildAedicule, buildPantheon, buildBasilica, buildCourt } from './monuments';

// The models of the hard specials, one for every size met, kept so that each is minced once
const specialModels = new Map();
export function specialModelOf(formation, widthPoints, depthPoints) {
  const key = [formation.kind, widthPoints, depthPoints, formation.levelCount, formation.aisleLevelCount || 0].join(':');
  if (!specialModels.has(key)) {
    const fixedSize = { across: null, along: null, up: null };
    let model = null;
    if (formation.kind === 'pantheon') {
      model = { name: 'pantheon', build: buildPantheon, isHardModelled: true, opensToTheFront: true };
    } else if (formation.kind === 'greatBasilica') {
      const aisleLevelCount = formation.aisleLevelCount;
      const naveLevelCount = formation.levelCount;
      model = { name: 'great basilica', isOutsideTheLanguage: true, opensToTheFront: true, build: function (collector) { buildBasilica(collector, widthPoints, depthPoints, aisleLevelCount, naveLevelCount); } };
    } else {
      model = { name: 'peristyle court', isOutsideTheLanguage: true, build: function (collector) { buildCourt(collector, widthPoints, depthPoints); } };
    }
    model.widthPoints = widthPoints;
    model.depthPoints = depthPoints;
    model.levelCount = formation.levelCount;
    model.repeat = fixedSize;
    specialModels.set(key, model);
  }
  return specialModels.get(key);
}

// The models of the aedicule, one for each way it is made (with or without its roof, a back wall,
// a door): designed as a whole like every model, and minced, so that it is put together from its
// pieces and skewed with the ground
const aediculeModels = new Map();
function aediculeModelOf(block) {
  const key = [block.hasRoof, block.hasBackWall, block.hasDoor].join(':');
  if (!aediculeModels.has(key)) {
    aediculeModels.set(key, {
      name: 'aedicule', widthPoints: 1, depthPoints: 1, levelCount: 1, repeat: { across: null, along: null, up: null },
      build: function (collector) { buildAedicule(collector, 0, block.hasRoof, block.hasBackWall, block.hasDoor); },
    });
  }
  return aediculeModels.get(key);
}

// How many points deep the ground is kept open: before the steps of a building, and on both
// sides of a passage
const openPointsBeforeSteps = 1;
const openPointsBeforeAPassage = 2;

// Builds the whole classical tier and returns the names of the buildings. groundToKeepOpen
// (optional, an array) takes the points that should stay free of other buildings: the ground
// before the steps of the temples, basilicas, rotundas and the Pantheon, and the ground on both
// sides of a triumphal arch, the way one passes through it.
export function buildClassicalTier(collector, volume, groundToKeepOpen) {
  const names = findClassicalFormations(volume).map(function (formation) {
    return buildFormation(collector, formation, volume, groundToKeepOpen || []);
  });
  // the city's own buildings: each built as what it is, on the patch of the grid it was given
  volume.publicBuildings.forEach(function (building) {
    if (building.free) {
      // one that does not follow the grid: placed whole where it stands, turned as it was placed
      const model = publicModelOf(building);
      collector.placeFacing(building.free.x, 0, building.free.z, building.free.frontX, building.free.frontZ);
      model.build(collector);
      collector.person(0.9, 0, building.depthPoints * cellSize / 2 + 1.2);
      building.openPoints.forEach(function (pointIndex) {
        (groundToKeepOpen || []).push(pointIndex);
      });
      names.push(model.name);
      return;
    }
    const grid = building.grid;
    names.push(buildFormation(collector, {
      kind: 'public', model: publicModelOf(building), minColumn: 1, minRow: 1, minLevel: 0,
      columnCount: building.widthPoints, rowCount: building.depthPoints, levelCount: building.levelCount,
      view: {
        pointIndexAt: function (column, row) {
          return row >= 0 && row < grid.length && column >= 0 && column < grid[row].length ? grid[row][column] : -1;
        },
      },
    }, volume, groundToKeepOpen || []));
  });
  collector.placeAt(0, 0, 0, 0);
  collector.roofTint = [1, 1, 1];
  return names;
}

// The model of a building of the city, by its kind
function publicModelOf(building) {
  if (PUBLIC_HARD_MODELS[building.kind]) {
    return PUBLIC_HARD_MODELS[building.kind];
  }
  if (building.kind === 'pantheon') {
    return specialModelOf({ kind: 'pantheon', levelCount: 4 }, 5, 5);
  }
  return chooseModel(building.widthPoints, building.depthPoints, building.levelCount, '', false);
}

function buildFormation(collector, formation, volume, groundToKeepOpen) {
  const map = volume.map;
  const view = formation.view || null; // none: a point read alone
  // the points of the formation, by their places counted from its first column and row
  function pointIndexAt(columnOffset, rowOffset) {
    return view === null ? formation.pointIndex : view.pointIndexAt(formation.minColumn + columnOffset, formation.minRow + rowOffset);
  }
  const firstPoint = pointIndexAt(0, 0);
  // what it stands on: a house under any of its points makes it a building of the roofs; and it
  // stands on the highest of what is under it, where its points stand on different things
  let standsOnAHouse = false;
  let carriesAHouse = false; // it is the classical floor of a house: its portal or its colonnade
  let isOwned = false;       // it belongs to households
  let bottomY = 0;
  let middleX = 0;
  let middleZ = 0;
  for (let rowOffset = 0; rowOffset < formation.rowCount; rowOffset++) {
    for (let columnOffset = 0; columnOffset < formation.columnCount; columnOffset++) {
      const pointIndex = pointIndexAt(columnOffset, rowOffset);
      standsOnAHouse = standsOnAHouse || (formation.minLevel > 0 && volume.tierAt(pointIndex, formation.minLevel - 1) === TIER.vernacular);
      const tierAbove = volume.tierAt(pointIndex, formation.minLevel + formation.levelCount);
      carriesAHouse = carriesAHouse || tierAbove === TIER.vernacular || tierAbove === TIER.temporary;
      isOwned = isOwned || volume.ownerAt(pointIndex) !== 0;
      bottomY = Math.max(bottomY, volume.bottomHeightAt(pointIndex, formation.minLevel));
      middleX += map.points[pointIndex].x / (formation.columnCount * formation.rowCount);
      middleZ += map.points[pointIndex].z / (formation.columnCount * formation.rowCount);
    }
  }
  const isOnePlace = formation.kind === 'box' && formation.columnCount === 1 && formation.rowCount === 1 && formation.levelCount === 1;
  const standsOnNothing = formation.minLevel > 0 && volume.tierAt(firstPoint, formation.minLevel - 1) === TIER.empty;
  // an essential block: the tholos is placed whole, being round; the aedicule is put together
  // from its pieces like every building, wherever the ground can be seen as a lattice
  // what stands above the ground stands on a roof: of a house, or of another classical building
  const standsOnARoof = formation.minLevel > 0;
  const isEssentialBlock = isOnePlace && !standsOnARoof;
  const essentialBlock = isEssentialBlock ? readEssentialBlock(firstPoint, formation.minLevel, map, volume) : null;
  if (isEssentialBlock && essentialBlock.isTholos) {
    return buildEssentialBlock(collector, firstPoint, formation.minLevel, map, volume);
  }
  // a point read alone: a loggia round the point (on a roof: a roof tower), a corner piece in
  // each of its quads
  if (view === null) {
    const loggia = MODELS.find(function (candidate) { return candidate.name === (standsOnARoof ? 'roof tower' : 'loggia'); });
    const point = map.points[firstPoint];
    const quads = map.quartersOfPoint[firstPoint].map(function (quarter) {
      const cornersOfCell = map.cells[quarter.cellIndex].corners;
      const after = map.points[cornersOfCell[(quarter.corner + 1) % 4]];
      const opposite = map.points[cornersOfCell[(quarter.corner + 2) % 4]];
      const before = map.points[cornersOfCell[(quarter.corner + 3) % 4]];
      // round the quad the way the model goes from across to along (from x to z)
      const turnsAsTheModel = (after.x - point.x) * (before.z - point.z) - (after.z - point.z) * (before.x - point.x) > 0;
      return turnsAsTheModel ? [point, after, opposite, before] : [point, before, opposite, after];
    });
    const carriesSomething = volume.tierAt(firstPoint, formation.minLevel + formation.levelCount) !== TIER.empty;
    collector.placeAt(0, 0, 0, 0);
    collector.roofTint = [1, 1, 1];
    buildFromMinceRoundAPoint(collector, loggia, formation.levelCount, !carriesSomething, bottomY, quads);
    return loggia.name;
  }

  // The model lies in the lattice turned by quarter turns: its width along the columns and its
  // front towards the higher rows (no turn), or turned on from there. The longer side of a
  // footprint is its depth; an aedicule turns its front the way its surroundings ask for.
  // (a building of the city lies as its patch was laid out: its width along the columns)
  let quarterTurnCount = !formation.model && (formation.naveRunsAlongX !== undefined ? formation.naveRunsAlongX : formation.columnCount > formation.rowCount) ? 1 : 0;
  const widthPoints = quarterTurnCount === 1 ? formation.rowCount : formation.columnCount;
  const depthPoints = quarterTurnCount === 1 ? formation.columnCount : formation.rowCount;
  // the place in the view of a point of the model, counted across its width and along its depth
  function offsetInView(pointAcross, pointAlong) {
    if (quarterTurnCount === 0) {
      return [pointAcross, pointAlong];
    }
    if (quarterTurnCount === 1) {
      return [pointAlong, widthPoints - 1 - pointAcross];
    }
    if (quarterTurnCount === 2) {
      return [widthPoints - 1 - pointAcross, depthPoints - 1 - pointAlong];
    }
    return [depthPoints - 1 - pointAlong, pointAcross];
  }
  // where a point of the model lies on the ground: counted across its width and along its depth,
  // also one beyond its first and last points (the ring round it); null where the ground has none
  function groundAt(pointAcross, pointAlong) {
    if (view === null) {
      return null;
    }
    const offset = offsetInView(pointAcross, pointAlong);
    return positionInView(map, view, formation.minColumn + offset[0], formation.minRow + offset[1]);
  }
  if (isEssentialBlock) {
    // of the four ways the lattice offers, the one nearest the way the front should look
    let bestAgreement = -Infinity;
    let bestTurnCount = 0;
    for (let turnCount = 0; turnCount < 4; turnCount++) {
      quarterTurnCount = turnCount;
      const here = groundAt(0, 0);
      const before = groundAt(0, 1);
      if (here === null || before === null) {
        continue;
      }
      const agreement = (before.x - here.x) * essentialBlock.frontX + (before.z - here.z) * essentialBlock.frontZ;
      if (agreement > bestAgreement) {
        bestAgreement = agreement;
        bestTurnCount = turnCount;
      }
    }
    quarterTurnCount = bestTurnCount;
  }
  // the way its front looks on the ground: from its last row of points to the ring before them
  let frontX = 0;
  let frontZ = 1;
  const frontMiddle = groundAt((widthPoints - 1) / 2 | 0, depthPoints - 1);
  const beforeTheFront = groundAt((widthPoints - 1) / 2 | 0, depthPoints);
  if (frontMiddle !== null && beforeTheFront !== null) {
    frontX = beforeTheFront.x - frontMiddle.x;
    frontZ = beforeTheFront.z - frontMiddle.z;
  }
  collector.placeFacing(middleX, bottomY, middleZ, frontX, frontZ);
  // its roof has its own shade of tile, a little different from the next building's
  const roofBrightness = 1 - 0.35 * placeHash(firstPoint, formation.minLevel, 31);
  const roofYellowness = 0.6 * (placeHash(firstPoint, formation.minLevel, 41) - 0.5);
  collector.roofTint = [roofBrightness, roofBrightness * (1 + roofYellowness), roofBrightness * (1 + 1.4 * roofYellowness)];

  let model = null;
  if (formation.model) {
    model = formation.model;
  } else if (isEssentialBlock) {
    model = aediculeModelOf(essentialBlock);
  } else if (formation.kind === 'box') {
    // as a part of a house, under it or on it, it is a stoa, a loggia or a tower, never a temple
    model = chooseModel(widthPoints, depthPoints, formation.levelCount, standsOnARoof ? 'on' : carriesAHouse ? 'under' : '', isOwned,
      placeHash(firstPoint, formation.minLevel, 53));
  } else {
    model = specialModelOf(formation, widthPoints, depthPoints);
  }
  // the ground it wants left open, by the places of the lattice beyond its front or its two sides
  if (formation.minLevel === 0 && view !== null && (model.opensToTheFront || model.isAPassage || model.isAPassageThroughItsDepth)) {
    const keepOpen = function (pointAcross, pointAlong) {
      const offset = offsetInView(pointAcross, pointAlong);
      const pointIndex = pointIndexAt(offset[0], offset[1]);
      if (pointIndex !== -1) {
        groundToKeepOpen.push(pointIndex);
      }
    };
    if (model.isAPassageThroughItsDepth) {
      // the street that passes through its middle, behind it and before it
      const middleAcross = (widthPoints - 1) / 2;
      for (let pointsBefore = 1; pointsBefore <= openPointsBeforeAPassage; pointsBefore++) {
        keepOpen(middleAcross, -pointsBefore);
        keepOpen(middleAcross, depthPoints - 1 + pointsBefore);
      }
    } else if (model.opensToTheFront) {
      for (let pointAcross = 0; pointAcross < widthPoints; pointAcross++) {
        for (let pointsBefore = 1; pointsBefore <= openPointsBeforeSteps; pointsBefore++) {
          keepOpen(pointAcross, depthPoints - 1 + pointsBefore);
        }
      }
    } else {
      for (let pointAlong = 0; pointAlong < depthPoints; pointAlong++) {
        for (let pointsBefore = 1; pointsBefore <= openPointsBeforeAPassage; pointsBefore++) {
          keepOpen(-pointsBefore, pointAlong);
          keepOpen(widthPoints - 1 + pointsBefore, pointAlong);
        }
      }
    }
  }
  if (model.isHardModelled) {
    model.build(collector); // placed whole, at its own size, not skewed
  } else {
    const topLevel = formation.minLevel + formation.levelCount;
    // where something stands on the building, by the points of the model
    const carriesABlockAt = function (pointAcross, pointAlong) {
      const offset = offsetInView(pointAcross, pointAlong);
      return volume.tierAt(view === null ? formation.pointIndex : pointIndexAt(offset[0], offset[1]), topLevel) !== TIER.empty;
    };
    // the quads of the ground the pieces are warped into: the quad of a slice lies between the
    // points one before and at the slice, across and along
    const ground = view === null ? undefined : {
      floorY: bottomY,
      cornersOfQuad: function (across, along) {
        const corners = [groundAt(across - 1, along - 1), groundAt(across, along - 1), groundAt(across, along), groundAt(across - 1, along)];
        return corners.indexOf(null) === -1 ? corners : null;
      },
    };
    // (the aedicule under a block keeps what it has above its storey: its pediment, shown off)
    buildFromMince(collector, model, widthPoints, depthPoints, formation.levelCount, 0, isEssentialBlock ? undefined : carriesABlockAt, ground);
  }
  // a figure before the front of what stands on the ground, for its scale
  if (formation.minLevel === 0) {
    collector.person(0.9, 0, depthPoints * cellSize / 2 + 1.2);
  }
  return model.name;
}
