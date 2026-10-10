// Purpose: the designed models of the classical tier. A classical building is designed as a whole,
// here, at one size; the quads are then the mince of the model (mince.js): the model is cut along
// the points of its volume into the pieces of its quads, level by level, and a building of
// another size is put together from those pieces. So the design lives in the models, and the
// pieces are a product of it.
//
// The models are designed in the language of orders.js: every face of a point takes one of a few
// structures (wall, pillars, arch, arched window, pillars on a wall, pillars on an arch), a storey
// has a base and a head, tall orders are levels without a head under a level with it, and the
// roof is a level of its own. Designed so, different models give the same pieces.
//
// Some buildings are hard modelled (isHardModelled): the rotunda and the triumphal arch here,
// the Pantheon in monuments.js; later perhaps theatres and circuses. They are placed whole, at
// their own sizes, are not minced and do not count among the pieces. The basilica is kept
// out of the quad parts (isOutsideTheLanguage) though it is minced so that it can grow: it is
// not yet written in the language. (The aqueduct is left out for now; it wants another logic.)
//
// A model stands in its own frame: the origin in the middle of its footprint on its base level,
// its width along x, its depth along z, its front towards +z. Its volume is widthPoints by
// depthPoints points, levelCount levels high.
//
// A model that is entered by steps at its front (opensToTheFront: the temples, the basilicas, the
// rotunda) wants the ground before them left open; one that is a passage (isAPassage: the
// triumphal arch, passed through across its width) wants it open on both sides (classical.js).
//
// For the mince to grow, a model names the slices that may be repeated or left out (repeat):
// across the width and along the depth a slice is the strip of quads between two points (slice 0
// lies outside the first point, slice 1 between the first and the second, and so on); upwards a
// slice is a level. A slice can be repeated when the model looks the same where the slice begins
// and where it ends. A roof that cannot be lengthened that way (one with hips at both ends of
// both directions) is made anew for the size it covers (buildRoofFor) and minced like a model.

import { cellSize } from './parts';
import { classicalLevelHeight } from './volume';
import { buildStorey, buildInsideFill, gableRoof, hippedRoof, outreach, baseHeight } from './orders';
import { buildBasilica } from './monuments';

// positions spread evenly from -extent to +extent
function spread(count, extent) {
  const positions = [];
  for (let index = 0; index < count; index++) {
    positions.push(count === 1 ? 0 : -extent + 2 * extent * index / (count - 1));
  }
  return positions;
}

// The storeys of a model, from the ground up. levels: for each level { structureOf, hasBase,
// hasHead }; a level without hasBase or hasHead named takes both (a storey of its own).
// Returns { platformReach, roofReach }: how far the platform of the first level and the roof over
// the last go out past the centre lines.
function buildStoreys(collector, widthPoints, depthPoints, isClosedInside, levels) {
  const reaches = levels.map(function (level, levelIndex) {
    return buildStorey(collector, {
      widthPoints: widthPoints, depthPoints: depthPoints, bottomY: levelIndex * classicalLevelHeight,
      hasBase: level.hasBase !== false, hasHead: level.hasHead !== false, orderLevelCount: level.orderLevelCount || 1,
      structureOf: level.structureOf, isClosedInside: isClosedInside,
    });
  });
  return { platformReach: reaches[0].platformReach, roofReach: reaches[reaches.length - 1].roofReach };
}

// the same structure on every face
function everywhere(structure) {
  return function () {
    return structure;
  };
}

// a tall order over levelCount levels: the first with the base, the last with the head
function tallOrder(levelCount, structureOf) {
  const levels = [];
  for (let level = 0; level < levelCount; level++) {
    levels.push({ structureOf: structureOf, hasBase: level === 0, hasHead: level === levelCount - 1, orderLevelCount: levelCount });
  }
  return levels;
}

// Two levels on one point: a closed base with a door, an aedicule of pillars above
function buildShrine(collector) {
  buildStoreys(collector, 1, 1, false, [
    { structureOf: function (side) { return side === 0 ? 'arch' : 'wall'; } },
    { structureOf: everywhere('pillar') },
  ]);
  buildInsideFill(collector, cellSize, cellSize, 0, 0, 0);
  collector.tag = 'inside';
  collector.box('stoneShade', 0.8, 0.6, 0.8, 0, classicalLevelHeight + baseHeight, 0);
  collector.box('bronze', 0.32, 1.1, 0.32, 0, classicalLevelHeight + baseHeight + 0.6, 0);
  collector.tag = '';
  gableRoof(collector, cellSize + 2 * outreach, cellSize + 2 * outreach, 2 * classicalLevelHeight);
}

// A campanile: storeys of arched windows over a door, under a pointed roof; widthPoints is 1 or 2
function buildTower(collector, widthPoints, levelCount) {
  const levels = [{ structureOf: function (side) { return side === 0 ? 'arch' : 'wall'; } }];
  for (let level = 1; level < levelCount; level++) {
    levels.push({ structureOf: everywhere('archWindow') });
  }
  buildStoreys(collector, widthPoints, widthPoints, true, levels);
  hippedRoof(collector, widthPoints, widthPoints, levelCount * classicalLevelHeight);
}

// Two points in a row, hard modelled: one great arch on the axis through a thick wall, pillars
// before its piers, an attic above with a figure on it
function buildTriumphalArch(collector, levelCount) {
  const length = 2 * cellSize;
  const bodyHeight = levelCount * classicalLevelHeight - 1.5;
  collector.box('stoneShade', cellSize + 2 * outreach, baseHeight, length + 2 * outreach, 0, 0, 0);
  collector.wall('stone', length, bodyHeight - baseHeight, 2.8, [{ centre: 0, bottom: 0, width: 3.4, height: bodyHeight - 1.5, isArched: true }], 0, baseHeight, 0, 1);
  [-1, 1].forEach(function (face) {
    [-3.4, -2.2, 2.2, 3.4].forEach(function (alongZ) {
      collector.column(face * 1.7, baseHeight, alongZ, bodyHeight - baseHeight, 0.25);
    });
  });
  collector.box('stoneShade', cellSize + 2 * outreach, 0.35, length + 2 * outreach, 0, bodyHeight, 0);
  collector.box('stone', 3.4, 1.15, length, 0, bodyHeight + 0.35, 0);
  collector.tag = 'roof';
  collector.box('bronze', 0.9, 1.0, 2.4, 0, bodyHeight + 1.5, 0);
  collector.tag = '';
}

// A row of points on one level: an open hall of pillars under a gabled roof
function buildStoa(collector, depthPoints) {
  buildStoreys(collector, 1, depthPoints, false, [{ structureOf: everywhere('pillar') }]);
  gableRoof(collector, cellSize + 2 * outreach, depthPoints * cellSize + 2 * outreach, classicalLevelHeight);
}

// The classical ground floor of a house (the portal): closed walls with engaged pilasters, an
// arched door on every point of the front, arched windows at the back; it carries the house
// above, so its walls are walls, not a colonnade
function buildPortal(collector) {
  buildStoreys(collector, 2, 2, true, [{ structureOf: function (side) { return side === 0 ? 'arch' : side === 2 ? 'archWindow' : 'pillarOnWall'; } }]);
  hippedRoof(collector, 2, 2, classicalLevelHeight);
}

// Two by two points on one level: an open pavilion of arches under a pointed roof
function buildPavilion(collector) {
  buildStoreys(collector, 2, 2, false, [{ structureOf: everywhere('arch') }]);
  hippedRoof(collector, 2, 2, classicalLevelHeight);
}

// A temple: a porch of pillars one point deep in front of a closed cella, whose walls carry the
// same pillars, one gabled roof over both. Tall, its order runs over all its levels. The cella
// looks the same at every point of its depth, so the temple can be cut and lengthened there.
function buildTemple(collector, widthPoints, depthPoints, levelCount) {
  const width = widthPoints * cellSize;
  const depth = depthPoints * cellSize;
  const reaches = buildStoreys(collector, widthPoints, depthPoints, false, tallOrder(levelCount, function (side, pointAlong) {
    if (side === 0) {
      return 'pillar';
    }
    const isBesideThePorch = (side === 1 || side === 3) && pointAlong === depthPoints - 1;
    return isBesideThePorch ? 'pillar' : 'pillarOnWall';
  }));
  // the front of the cella, on the centre line behind the porch. Its doors stand behind the
  // middle gaps of the porch: between the points, so a temple two points wide has one door on its axis
  const cellaFrontZ = depth / 2 - cellSize;
  const doorPlaces = widthPoints === 1 ? [0] : spread(widthPoints - 1, (widthPoints - 2) * cellSize / 2);
  collector.tag = 'wall';
  collector.wall('stone', width - 0.4, levelCount * classicalLevelHeight - baseHeight - 0.35, 0.4, doorPlaces.map(function (alongX) {
    return { centre: alongX, bottom: 0, width: 1.9, height: 3.3, isArched: true };
  }), 0, baseHeight, cellaFrontZ, 0);
  for (let level = 0; level < levelCount; level++) {
    buildInsideFill(collector, width, depth - cellSize, level * classicalLevelHeight, 0, cellaFrontZ - (depth - cellSize) / 2);
  }
  collector.tag = 'steps';
  collector.steps('stoneShade', width * 0.62, baseHeight, 2, 0, 0, depth / 2 + reaches.platformReach);
  collector.tag = '';
  gableRoof(collector, width + 2 * reaches.roofReach, depth + 2 * reaches.roofReach, levelCount * classicalLevelHeight);
}

// A temple with pillars all round a cella that stands free inside them, on the next centre lines
function buildPeripteralTemple(collector, depthPoints) {
  const widthPoints = 3;
  const width = widthPoints * cellSize;
  const depth = depthPoints * cellSize;
  buildStoreys(collector, widthPoints, depthPoints, false, [{ structureOf: everywhere('pillar') }]);
  buildStorey(collector, {
    widthPoints: widthPoints - 2, depthPoints: depthPoints - 2, bottomY: 0, hasBase: false, hasHead: false, isClosedInside: true,
    structureOf: function (side) { return side === 0 ? 'arch' : 'wall'; },
  });
  collector.tag = 'steps';
  collector.steps('stoneShade', width * 0.62, baseHeight, 2, 0, 0, depth / 2 + outreach);
  collector.tag = '';
  gableRoof(collector, width + 2 * outreach, depth + 2 * outreach, classicalLevelHeight);
}

// Three by three points, hard modelled: a round hall under a dome, a porch on each side
function buildRotunda(collector, levelCount) {
  const totalHeight = levelCount * classicalLevelHeight;
  const podiumHeight = 1.0;
  const drumRadius = 4.6;
  const drumHeight = totalHeight - podiumHeight - 0.45; // the cornice of the drum ends on the top of the volume
  const domeHeight = drumRadius * 0.92;
  const footprint = 3 * cellSize + 2 * outreach;
  collector.box('stoneShade', footprint, podiumHeight, footprint, 0, 0, 0);
  collector.cylinder('stone', drumRadius, drumRadius, drumHeight, 0, podiumHeight, 0, 32);
  collector.cylinder('stoneShade', drumRadius + 0.35, drumRadius + 0.35, 0.45, 0, podiumHeight + drumHeight, 0, 32);
  collector.tag = 'roof';
  collector.dome('tile', drumRadius, domeHeight, 0, podiumHeight + drumHeight + 0.45, 0);
  collector.cylinder('stone', 0.5, 0.6, 0.8, 0, podiumHeight + drumHeight + 0.35 + domeHeight, 0, 10);
  collector.cylinder('bronze', 0, 0.3, 0.9, 0, podiumHeight + drumHeight + 1.15 + domeHeight, 0, 8);
  collector.tag = '';

  const porchPillarHeight = Math.min(drumHeight * 0.72, 2 * classicalLevelHeight - podiumHeight - 0.5);
  for (let side = 0; side < 4; side++) {
    const outward = [[0, 1], [1, 0], [0, -1], [-1, 0]][side];
    const ridgeRunsAlongX = side === 1 || side === 3;
    spread(4, 2.6).forEach(function (across) {
      collector.column(outward[0] * 5.6 + outward[1] * across, podiumHeight, outward[1] * 5.6 + outward[0] * across, porchPillarHeight, 0.3);
    });
    const porchCentreX = outward[0] * 4.9;
    const porchCentreZ = outward[1] * 4.9;
    collector.box('stone', ridgeRunsAlongX ? 2.2 : 6.4, 0.5, ridgeRunsAlongX ? 6.4 : 2.2, porchCentreX, podiumHeight + porchPillarHeight, porchCentreZ);
    collector.prism('stone', 6.6, 1.3, 2.5, porchCentreX, podiumHeight + porchPillarHeight + 0.5, porchCentreZ, ridgeRunsAlongX);
    collector.box('interior', ridgeRunsAlongX ? 0.15 : 1.6, porchPillarHeight * 0.75, ridgeRunsAlongX ? 1.6 : 0.15, outward[0] * (drumRadius + 0.02), podiumHeight, outward[1] * (drumRadius + 0.02));
  }
  collector.steps('stoneShade', 6.5, podiumHeight, 4, 0, 0, footprint / 2);
}

// A loggia: storeys of arches, an arch to every point, under a hipped roof. Its storeys look the
// same at every point in both directions and on every level, so they can be cut to any size: the
// building for the volumes no other model fits. Its roof is made for the size it covers.
function buildLoggia(collector) {
  buildStoreys(collector, 2, 2, false, [{ structureOf: everywhere('arch') }, { structureOf: everywhere('arch') }]);
  hippedRoof(collector, 2, 2, 2 * classicalLevelHeight);
}

// A roof tower: closed storeys with an arched window to every point, under a hipped roof. Like
// the loggia its storeys look the same at every point and on every level, so it can be cut to any
// size: the classical piece that stands on a roof, closed where the loggia is open.
function buildRoofTower(collector) {
  buildStoreys(collector, 2, 2, true, [{ structureOf: everywhere('archWindow') }, { structureOf: everywhere('archWindow') }]);
  hippedRoof(collector, 2, 2, 2 * classicalLevelHeight);
}

// The models, in the order they are tried for a box of classical points (the width is the
// shorter side). fits: whether the model makes a box of that size, standing on the ground or on
// another classical building; fitsOnAHouse: the same on top of a house, where only towers, stoas
// and loggias stand. repeat: the slice that may be repeated or left out in each direction, or null.
export const MODELS = [
  {
    name: 'shrine', widthPoints: 1, depthPoints: 1, levelCount: 2, repeat: { across: null, along: null, up: null },
    build: buildShrine,
    fits: function (width, depth, height) { return width === 1 && depth === 1 && height === 2; },
    sizeText: '1 × 1 × 2',
  },
  {
    name: 'tower', widthPoints: 1, depthPoints: 1, levelCount: 3, repeat: { across: null, along: null, up: 1 },
    build: function (collector) { buildTower(collector, 1, 3); },
    fits: function (width, depth, height) { return width === 1 && depth === 1 && height >= 3; },
    fitsOnAHouse: function (width, depth, height) { return width === 1 && depth === 1 && height >= 2; },
    sizeText: '1 × 1 × 3 or taller',
  },
  {
    name: 'triumphal arch', isHardModelled: true, isAPassage: true, widthPoints: 1, depthPoints: 2, levelCount: 2, repeat: { across: null, along: null, up: null },
    build: function (collector) { buildTriumphalArch(collector, 2); },
    fits: function (width, depth, height) { return width === 1 && depth === 2 && height === 2; },
    sizeText: '1 × 2 × 2',
  },
  {
    name: 'triumphal arch', isHardModelled: true, isAPassage: true, widthPoints: 1, depthPoints: 2, levelCount: 3, repeat: { across: null, along: null, up: null },
    build: function (collector) { buildTriumphalArch(collector, 3); },
    fits: function (width, depth, height) { return width === 1 && depth === 2 && height === 3; },
    sizeText: '1 × 2 × 3',
  },
  {
    name: 'portal', widthPoints: 2, depthPoints: 2, levelCount: 1, repeat: { across: 1, along: 1, up: null },
    build: buildPortal,
    buildRoofFor: function (collector, widthPoints, depthPoints) { hippedRoof(collector, widthPoints, depthPoints, 0); },
    fits: function () { return false; },
    fitsOnAHouse: function (width, depth, height) { return height === 1; },
    sizeText: 'any box of one level under a house',
  },
  {
    name: 'stoa', widthPoints: 1, depthPoints: 3, levelCount: 1, repeat: { across: null, along: 2, up: null },
    build: function (collector) { buildStoa(collector, 3); },
    fits: function (width, depth, height) { return width === 1 && depth >= 3 && height === 1; },
    fitsOnAHouse: function (width, depth, height) { return width === 1 && depth >= 2 && height === 1; },
    // on a roof too, but less often than the roof tower
    fitsOnARoof: function (width, depth, height) { return width === 1 && depth >= 2 && height === 1; },
    chanceOnARoof: 0.3,
    sizeText: '1 × 3 or longer × 1',
  },
  {
    name: 'pavilion', widthPoints: 2, depthPoints: 2, levelCount: 1, repeat: { across: null, along: null, up: null },
    build: buildPavilion,
    fits: function (width, depth, height) { return width === 2 && depth === 2 && height === 1; },
    sizeText: '2 × 2 × 1',
  },
  {
    name: 'great tower', widthPoints: 2, depthPoints: 2, levelCount: 3, repeat: { across: null, along: null, up: 1 },
    build: function (collector) { buildTower(collector, 2, 3); },
    fits: function (width, depth, height) { return width === 2 && depth === 2 && height >= 3; },
    fitsOnAHouse: function (width, depth, height) { return width === 2 && depth === 2 && height >= 2; },
    sizeText: '2 × 2 × 3 or taller',
  },
  {
    name: 'rotunda', isHardModelled: true, opensToTheFront: true, widthPoints: 3, depthPoints: 3, levelCount: 2, repeat: { across: null, along: null, up: null },
    build: function (collector) { buildRotunda(collector, 2); },
    fits: function (width, depth, height) { return width === 3 && depth === 3 && height === 2; },
    sizeText: '3 × 3 × 2',
  },
  {
    name: 'rotunda', isHardModelled: true, opensToTheFront: true, widthPoints: 3, depthPoints: 3, levelCount: 3, repeat: { across: null, along: null, up: null },
    build: function (collector) { buildRotunda(collector, 3); },
    fits: function (width, depth, height) { return width === 3 && depth === 3 && height === 3; },
    sizeText: '3 × 3 × 3',
  },
  {
    name: 'basilica', isOutsideTheLanguage: true, opensToTheFront: true, widthPoints: 3, depthPoints: 4, levelCount: 2, repeat: { across: null, along: 2, up: null },
    build: function (collector) { buildBasilica(collector, 3, 4, 1, 2); },
    fits: function (width, depth, height) { return width === 3 && depth >= 4 && height === 2; },
    sizeText: '3 × 4 or longer × 2',
  },
  {
    name: 'basilica', isOutsideTheLanguage: true, opensToTheFront: true, widthPoints: 3, depthPoints: 4, levelCount: 3, repeat: { across: null, along: 2, up: null },
    build: function (collector) { buildBasilica(collector, 3, 4, 2, 3); },
    fits: function (width, depth, height) { return width === 3 && depth >= 4 && height === 3; },
    sizeText: '3 × 4 or longer × 3',
  },
  {
    name: 'temple', opensToTheFront: true, widthPoints: 1, depthPoints: 3, levelCount: 1, repeat: { across: null, along: 1, up: null },
    build: function (collector) { buildTemple(collector, 1, 3, 1); },
    fits: function (width, depth, height) { return width === 1 && depth === 2 && height === 1; },
    sizeText: '1 × 2 × 1',
  },
  {
    name: 'temple', opensToTheFront: true, widthPoints: 2, depthPoints: 3, levelCount: 1, repeat: { across: null, along: 1, up: null },
    build: function (collector) { buildTemple(collector, 2, 3, 1); },
    fits: function (width, depth, height) { return width === 2 && depth >= 3 && height === 1; },
    sizeText: '2 × 3 or longer × 1',
  },
  {
    name: 'temple', opensToTheFront: true, widthPoints: 2, depthPoints: 3, levelCount: 3, repeat: { across: null, along: 1, up: 1 },
    build: function (collector) { buildTemple(collector, 2, 3, 3); },
    fits: function (width, depth, height) { return width === 2 && depth >= 3 && height >= 2; },
    sizeText: '2 × 3 or longer × 2 or taller',
  },
  {
    name: 'peripteral temple', opensToTheFront: true, widthPoints: 3, depthPoints: 4, levelCount: 1, repeat: { across: null, along: 2, up: null },
    build: function (collector) { buildPeripteralTemple(collector, 4); },
    fits: function (width, depth, height) { return width === 3 && depth >= 3 && height === 1; },
    sizeText: '3 × 3 or longer × 1',
  },
  {
    name: 'roof tower', widthPoints: 2, depthPoints: 2, levelCount: 2, repeat: { across: 1, along: 1, up: 0 },
    build: buildRoofTower,
    buildRoofFor: function (collector, widthPoints, depthPoints) { hippedRoof(collector, widthPoints, depthPoints, 0); },
    fits: function () { return false; },
    fitsOnARoof: function () { return true; },
    sizeText: 'any box that stands on a roof',
  },
  {
    name: 'loggia', widthPoints: 2, depthPoints: 2, levelCount: 2, repeat: { across: 1, along: 1, up: 0 },
    build: buildLoggia,
    // the roof for a building of another size: made for that size, at the height of the eaves
    buildRoofFor: function (collector, widthPoints, depthPoints) { hippedRoof(collector, widthPoints, depthPoints, 0); },
    fits: function () { return true; },
    fitsOnAHouse: function () { return true; },
    sizeText: 'any other box',
  },
];

// The model for a box of classical points, by its size (width the shorter side).
// placeInAHouse: 'on' where the box stands on a roof (of a house or of another classical
// building): there it is a roof tower, closed, with small windows. 'under' where it carries a
// house: there it is a portal (one level: closed walls, doors on the front) or a tower. '' where it stands free.
// isOwned: the box belongs to households, whose blocks never make a triumphal arch: that is for
// the city. chance: a number from 0 to 1 that stays with the box, for the models that are
// taken only now and then (chanceOnARoof).
export function chooseModel(widthPoints, depthPoints, levelCount, placeInAHouse, isOwned, chance) {
  return MODELS.find(function (model) {
    if (isOwned && model.isAPassage) {
      return false;
    }
    if (placeInAHouse === 'on') {
      return model.fitsOnARoof !== undefined && model.fitsOnARoof(widthPoints, depthPoints, levelCount) &&
        (model.chanceOnARoof === undefined || (chance !== undefined && chance < model.chanceOnARoof));
    }
    if (placeInAHouse === 'under') {
      return model.fitsOnAHouse !== undefined && model.fitsOnAHouse(widthPoints, depthPoints, levelCount);
    }
    return model.fits(widthPoints, depthPoints, levelCount);
  });
}
