// Purpose: designs of the classical tier that are not boxes of any size: the essential blocks
// that stand on one point (the tholos and the aedicule), which read their surroundings and turn
// their front to the open space, and the designs of the hard specials (the Pantheon, the great
// basilica, the court with a peristyle), which classical.js minces like every other model.
//
// A design is built in its own frame: the origin in the middle of its footprint on its base
// level, its width along x, its depth along z, its front towards +z.

import { cellSize } from './parts';
import { TIER, classicalLevelHeight } from './volume';
import { buildStorey, gableRoof, outreach, baseHeight } from './orders';

// The essential blocks, one point in plan. They are read from what is round them:
// - the tholos is round and has no front, so it only stands free: nothing on it, nothing beside it;
// - the aedicule has a back and a front. It comes where the point stands against a neighbour or
//   carries a block. Against a neighbour it has a back wall, which goes to the buildings; its pediment looks at the open space;
//   under a block the roof goes and the pediment stays, standing out in front of the block.
// - an aedicule that is part of a house (a vernacular block on it or beside it) is the portal
//   of that house: the pediment is shown off, and in place of the statue there is a door.
// Returns { isTholos, hasRoof, hasBackWall, hasDoor, frontX, frontZ }: which of the two it is, how
// the aedicule is made, and the way its front looks.
export function readEssentialBlock(pointIndex, level, map, volume) {
  const surroundings = readSurroundings(map, volume, pointIndex, level, level);
  const carriesABlock = volume.tierAt(pointIndex, level + 1) !== TIER.empty;
  const standsAgainstANeighbour = surroundings.raisedNeighbourCount > 0;
  return {
    isTholos: !carriesABlock && !standsAgainstANeighbour,
    hasRoof: !carriesABlock, hasBackWall: standsAgainstANeighbour,
    hasDoor: surroundings.vernacularNeighbourCount > 0 || volume.tierAt(pointIndex, level + 1) === TIER.vernacular,
    frontX: surroundings.frontX, frontZ: surroundings.frontZ,
  };
}

// The essential block placed whole on its point, turned to its front. The tholos is always placed
// so, being round; the aedicule only where it cannot be put together from its pieces (a point
// where no lattice could be laid out).
export function buildEssentialBlock(collector, pointIndex, level, map, volume) {
  const point = map.points[pointIndex];
  const block = readEssentialBlock(pointIndex, level, map, volume);
  collector.placeFacing(point.x, volume.bottomHeightAt(pointIndex, level), point.z, block.frontX, block.frontZ);
  if (block.isTholos) {
    buildTholos(collector);
  } else {
    buildAedicule(collector, 0, block.hasRoof, block.hasBackWall, block.hasDoor);
  }
  // a figure before its front, for its scale
  if (level === 0) {
    collector.person(0.9, 0, cellSize / 2 + 1.2);
  }
  collector.placeAt(0, 0, 0, 0);
  return block.isTholos ? 'tholos' : 'aedicule';
}

// What stands beside a point between two levels, and the direction of its front: towards the
// neighbouring point with open air that lies furthest away from the raised neighbours. Among
// equals the one with the most open air round itself wins, so the front looks into the square
// and not into a lane.
function readSurroundings(map, volume, pointIndex, minLevel, topLevel) {
  const point = map.points[pointIndex];
  function isVernacular(neighbourPoint) {
    for (let level = minLevel; level <= topLevel; level++) {
      if (volume.tierAt(neighbourPoint, level) === TIER.vernacular) {
        return true;
      }
    }
    return false;
  }
  function isRaised(neighbourPoint) {
    for (let level = minLevel; level <= topLevel; level++) {
      if (volume.tierAt(neighbourPoint, level) !== TIER.empty) {
        return true;
      }
    }
    return false;
  }
  function directionTo(neighbourPoint) {
    const neighbour = map.points[neighbourPoint];
    const distance = Math.hypot(neighbour.x - point.x, neighbour.z - point.z);
    return { x: (neighbour.x - point.x) / distance, z: (neighbour.z - point.z) / distance };
  }
  const neighbourPoints = Array.from(map.sideNeighboursOfPoint[pointIndex]);
  const raisedDirections = neighbourPoints.filter(isRaised).map(directionTo);
  let frontX = 0;
  let frontZ = 1;
  let bestOpenness = -Infinity;
  neighbourPoints.forEach(function (neighbourPoint) {
    if (isRaised(neighbourPoint)) {
      return;
    }
    const direction = directionTo(neighbourPoint);
    let openness = 0.001 * direction.z; // with nothing to choose between, the front looks towards +z
    raisedDirections.forEach(function (raisedDirection) {
      openness -= direction.x * raisedDirection.x + direction.z * raisedDirection.z;
    });
    map.quadNeighboursOfPoint[neighbourPoint].forEach(function (furtherPoint) {
      if (furtherPoint !== pointIndex && !isRaised(furtherPoint)) {
        openness += 0.01;
      }
    });
    if (openness > bestOpenness + 1e-6) {
      bestOpenness = openness;
      frontX = direction.x;
      frontZ = direction.z;
    }
  });
  return {
    frontX: frontX, frontZ: frontZ, raisedNeighbourCount: raisedDirections.length,
    vernacularNeighbourCount: neighbourPoints.filter(isVernacular).length,
  };
}

// positions spread evenly from -extent to +extent
function spread(count, extent) {
  const positions = [];
  for (let index = 0; index < count; index++) {
    positions.push(count === 1 ? 0 : -extent + 2 * extent * index / (count - 1));
  }
  return positions;
}

// One point of pillars under a small pediment: a pillar in every corner. Inside stands a statue, or, where the aedicule is the portal of a house, a door in
// a wall at the back. Without its roof (under a block) the pediment alone stands over the front,
// clear of the wall of the block above. baseY: the floor it stands on.
export function buildAedicule(collector, baseY, hasRoof, hasBackWall, hasDoor) {
  const footprint = cellSize + 2 * outreach;
  buildStorey(collector, {
    widthPoints: 1, depthPoints: 1, bottomY: baseY, hasBase: true, hasHead: true, isClosedInside: false,
    structureOf: function (side) {
      if (side === 2 && hasDoor) {
        return 'arch';
      }
      return side === 2 && hasBackWall ? 'wall' : 'pillar';
    },
  });
  if (hasRoof) {
    gableRoof(collector, footprint, footprint, baseY + classicalLevelHeight);
  } else {
    const pedimentReach = 0.6; // how far the pediment comes forward of the block above
    collector.box('stoneShade', footprint, 0.2, pedimentReach + 0.2, 0, baseY + classicalLevelHeight - 0.2, footprint / 2 + pedimentReach / 2 - 0.1);
    collector.prism('stone', footprint, 0.95, 0.5, 0, baseY + classicalLevelHeight, footprint / 2 + pedimentReach - 0.25, false);
    collector.cylinder('bronze', 0, 0.14, 0.6, 0, baseY + classicalLevelHeight + 0.95, footprint / 2 + pedimentReach - 0.25, 6);
  }
  if (hasDoor) {
    collector.box('timber', 2.5, 2.9, 0.1, 0, baseY + baseHeight, -cellSize / 2 + 0.12); // a little proud of the wall of the house behind it
  } else {
    const statueZ = hasBackWall ? -0.9 : 0;
    collector.box('stoneShade', 0.8, 0.6, 0.8, 0, baseY + baseHeight, statueZ);
    collector.box('bronze', 0.32, 1.1, 0.32, 0, baseY + baseHeight + 0.6, statueZ);
  }
}

// A round tempietto: a ring of columns under a low dome
function buildTholos(collector) {
  const outerRadius = cellSize / 2 + outreach;
  collector.cylinder('stoneShade', outerRadius, outerRadius, 0.35, 0, 0, 0, 28);
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4 + Math.PI / 8;
    collector.column(1.75 * Math.cos(angle), 0.35, 1.75 * Math.sin(angle), classicalLevelHeight - 0.75, 0.26);
  }
  collector.cylinder('stone', 1.0, 1.0, classicalLevelHeight - 0.75, 0, 0.35, 0, 16);
  collector.cylinder('stone', outerRadius - 0.15, outerRadius - 0.15, 0.4, 0, classicalLevelHeight - 0.4, 0, 28);
  collector.dome('tile', outerRadius - 0.3, 1.15, 0, classicalLevelHeight, 0);
  collector.cylinder('bronze', 0, 0.12, 0.45, 0, classicalLevelHeight + 1.1, 0, 6);
}

// The pillars of a colonnade stand close: about this far from one to the next
const pillarSpan = 1.3;
// how many pillars a colonnade of a length takes, both ends counted; never fewer than four
function pillarCountAlong(length) {
  return Math.max(4, Math.round(length / pillarSpan) + 1);
}

// The Pantheon, a hard special: a base of 5 by 5 points, two levels high, with 3 by 3 points, two
// levels high, standing on the middle of it. The base is the round hall with its deep porch of
// columns under a pediment; the upper volume is the stepped rings and the dome with its open eye.
export function buildPantheon(collector) {
  const baseHeight = 2 * classicalLevelHeight;            // the eaves of the hall and of the porch
  const footprint = 5 * cellSize + 2 * outreach;
  const platformHeight = 0.6;
  const hallRadius = 7.9;
  const hallCentreZ = -2.4;                       // the hall stands back; the porch takes the front
  collector.box('stoneShade', footprint, platformHeight, footprint, 0, 0, 0);
  collector.steps('stoneShade', 11.5, platformHeight, 3, 0, 0, footprint / 2);

  // the round hall, with a band half way up and its cornice on the top of the base
  collector.cylinder('stone', hallRadius, hallRadius, baseHeight - platformHeight - 0.5, 0, platformHeight, hallCentreZ, 48);
  collector.cylinder('stoneShade', hallRadius + 0.2, hallRadius + 0.2, 0.3, 0, classicalLevelHeight, hallCentreZ, 48);
  collector.cylinder('stoneShade', hallRadius + 0.45, hallRadius + 0.45, 0.5, 0, baseHeight - 0.5, hallCentreZ, 48);

  // the upper volume: three rings stepping in, then the dome, open at the top
  const ringRadii = [7.6, 7.0, 6.5];
  ringRadii.forEach(function (ringRadius, index) {
    collector.cylinder('stoneShade', ringRadius, ringRadius, 0.55, 0, baseHeight + index * 0.55, hallCentreZ, 48);
  });
  const domeBaseY = baseHeight + ringRadii.length * 0.55;
  const domeRadius = 6.1;
  const domeHeight = domeRadius; // half a sphere, whatever the height of a level
  collector.dome('stoneShade', domeRadius, domeHeight, 0, domeBaseY, hallCentreZ);
  collector.cylinder('stone', 1.15, 1.3, 0.3, 0, domeBaseY + domeHeight - 0.22, hallCentreZ, 24);
  collector.cylinder('interior', 0.95, 0.95, 0.32, 0, domeBaseY + domeHeight - 0.2, hallCentreZ, 24);

  // the porch is narrower than the hall: about two thirds of its width, as on the real building
  const porchWidth = 11.2;
  const porchFrontZ = 5 * cellSize / 2 - 0.4;
  // the block between the hall and the porch, as high as the hall
  // (it must stand clear of the round wall, or the door would be buried in it)
  const blockFrontZ = hallCentreZ + hallRadius + 1.5;
  collector.box('stone', porchWidth + 0.8, baseHeight - platformHeight - 0.5, 3.4, 0, platformHeight, blockFrontZ - 1.7);
  collector.box('stoneShade', porchWidth + 1.4, 0.5, 3.8, 0, baseHeight - 0.5, blockFrontZ - 1.7);
  // the great door into the rotunda: bronze leaves in a stone frame, on the axis of the porch
  const doorFaceZ = blockFrontZ;
  collector.box('stoneShade', 3.6, 6.3, 0.3, 0, platformHeight, doorFaceZ + 0.1);
  collector.box('interior', 2.7, 5.7, 0.2, 0, platformHeight, doorFaceZ + 0.2);
  [-0.68, 0.68].forEach(function (leafCentreX) {
    collector.box('bronze', 1.26, 4.6, 0.12, leafCentreX, platformHeight, doorFaceZ + 0.32);
  });
  collector.box('bronze', 2.62, 0.95, 0.1, 0, platformHeight + 4.7, doorFaceZ + 0.32);

  // eight columns across the front, two more rows behind, under a pediment
  const columnHeight = baseHeight - platformHeight - 0.7;
  // the middle bay is wider, so that the door shows between the columns
  const columnPositions = [-5.15, -3.9, -2.65, -1.4, 1.4, 2.65, 3.9, 5.15];
  columnPositions.forEach(function (alongX, index) {
    collector.column(alongX, platformHeight, porchFrontZ, columnHeight, 0.45);
    if (index === 0 || index === 2 || index === 5 || index === 7) {
      collector.column(alongX, platformHeight, porchFrontZ - 1.7, columnHeight, 0.45);
    }
  });
  // the beam over the columns ends a little under the cornice of the block behind it, and the
  // tiles end where the pediment begins: no face lies in another
  collector.box('stone', porchWidth, 0.67, 3.4, 0, baseHeight - 0.7, porchFrontZ - 1.2);
  collector.prism('tile', porchWidth + 0.6, 2.3, 3.55, 0, baseHeight, porchFrontZ - 1.5, false);
  collector.prism('stone', porchWidth + 0.6, 2.3, 0.35, 0, baseHeight, porchFrontZ + 0.45, false);
}

// A basilica: a tall nave between two lower aisles, one cell wide each. The aisles have arcades
// at the ground and lean-to roofs against the nave; the nave rises above them with a row of
// windows (the clerestory) under its own long roof. aisleLevels: how high the aisles' eaves are;
// naveLevels: how high the nave's eaves are.
export function buildBasilica(collector, widthCells, depthCells, aisleLevels, naveLevels) {
  const width = widthCells * cellSize - 0.1;
  const length = depthCells * cellSize - 0.1;
  const naveWidth = (widthCells - 2) * cellSize;
  const aisleTop = aisleLevels * classicalLevelHeight;
  const naveTop = naveLevels * classicalLevelHeight;
  const aisleWallHeight = aisleTop - 0.35;
  const naveWallHeight = naveTop - 0.35;
  // the platform ends a little under the sills of the doors (0.25), so that its top does not lie in them
  collector.box('stoneShade', widthCells * cellSize + 2 * outreach, 0.24, depthCells * cellSize + 2 * outreach, 0, 0, 0);
  collector.box('interior', width - 0.9, aisleWallHeight - 0.3, length - 0.9, 0, 0.1, 0);
  collector.box('interior', naveWidth - 0.9, naveWallHeight - 0.3, length - 0.9, 0, 0.1, 0);

  function cellCentres(cellCount) {
    const centres = [];
    for (let cell = 0; cell < cellCount; cell++) {
      centres.push((cell + 0.5) * cellSize - cellCount * cellSize / 2);
    }
    return centres;
  }
  // the long walls of the aisles: an arch to every cell, small windows on any upper level
  const aisleOpenings = [];
  cellCentres(depthCells).forEach(function (centre) {
    aisleOpenings.push({ centre: centre, bottom: 0.25, width: 2.5, height: 2.9, isArched: true });
    for (let level = 1; level < aisleLevels; level++) {
      aisleOpenings.push({ centre: centre, bottom: level * classicalLevelHeight + 0.7, width: 1.2, height: 1.9, isArched: true });
    }
  });
  collector.wall('stone', length, aisleWallHeight, 0.4, aisleOpenings, width / 2 - 0.2, 0, 0, 1);
  collector.wall('stone', length, aisleWallHeight, 0.4, aisleOpenings, -(width / 2 - 0.2), 0, 0, 1);
  // the long walls of the nave, with the clerestory above the aisle roofs
  const clerestoryBottom = aisleTop + 1.5;
  const naveOpenings = naveTop - clerestoryBottom >= 2.2 ? cellCentres(depthCells).map(function (centre) {
    return { centre: centre, bottom: clerestoryBottom, width: 1.3, height: Math.min(2.0, naveTop - clerestoryBottom - 0.6), isArched: true };
  }) : [];
  collector.wall('stone', length, naveWallHeight, 0.4, naveOpenings, naveWidth / 2 - 0.2, 0, 0, 1);
  collector.wall('stone', length, naveWallHeight, 0.4, naveOpenings, -(naveWidth / 2 - 0.2), 0, 0, 1);

  // the two ends: the front has the great door of the nave under a window, and a door to each aisle
  [1, -1].forEach(function (end) {
    const isFront = end === 1;
    const endZ = end * (length / 2 - 0.2);
    const naveEndOpenings = isFront
      ? [{ centre: 0, bottom: 0.25, width: Math.min(2.6, naveWidth - 1.4), height: 3.5, isArched: true },
        { centre: 0, bottom: aisleTop + 0.9, width: Math.min(2.0, naveWidth - 1.8), height: Math.min(2.2, naveTop - aisleTop - 1.6), isArched: true }]
      : [{ centre: 0, bottom: aisleTop + 0.9, width: Math.min(2.0, naveWidth - 1.8), height: Math.min(2.2, naveTop - aisleTop - 1.6), isArched: true }];
    collector.wall('stone', naveWidth, naveWallHeight, 0.4, naveEndOpenings, 0, 0, endZ, 0);
    [-1, 1].forEach(function (aisleSide) {
      const aisleCentreX = aisleSide * (naveWidth / 2 + (width - naveWidth) / 4);
      const aisleEndOpenings = isFront ? [{ centre: 0, bottom: 0.25, width: 1.6, height: 2.7, isArched: true }] : [];
      collector.wall('stone', (width - naveWidth) / 2, aisleWallHeight, 0.4, aisleEndOpenings, aisleCentreX, 0, endZ, 0);
    });
  });

  // the cornices, reaching out past the centre line, and the roofs
  const outerLength = depthCells * cellSize + 2 * outreach;
  const outerHalfWidth = widthCells * cellSize / 2 + outreach;
  [-1, 1].forEach(function (aisleSide) {
    const aisleRoofWidth = outerHalfWidth - naveWidth / 2;
    const aisleRoofCentreX = aisleSide * (naveWidth / 2 + aisleRoofWidth / 2);
    collector.box('stoneShade', aisleRoofWidth, 0.35, outerLength, aisleRoofCentreX, aisleWallHeight, 0);
    // a lean-to of tiles from the eaves up against the nave wall
    const eavesX = aisleSide * outerHalfWidth;
    const wallX = aisleSide * (naveWidth / 2);
    const leanToRise = 1.15;
    collector.addTriangles('tile', [
      eavesX, aisleTop, -outerLength / 2, wallX, aisleTop + leanToRise, -outerLength / 2, wallX, aisleTop + leanToRise, outerLength / 2,
      eavesX, aisleTop, -outerLength / 2, wallX, aisleTop + leanToRise, outerLength / 2, eavesX, aisleTop, outerLength / 2,
    ]);
  });
  collector.box('stoneShade', naveWidth + 2 * outreach, 0.35, outerLength, 0, naveWallHeight, 0);
  gableRoof(collector, naveWidth + 2 * outreach + 0.1, outerLength + 0.1, naveTop);
}

// A ring of cells round an open court: a wall outside, a colonnade inside, a basin in the middle
export function buildCourt(collector, widthCells, depthCells) {
  const width = widthCells * cellSize - 0.1;
  const length = depthCells * cellSize - 0.1;
  const wallHeight = classicalLevelHeight - 0.5; // floor 0.2, wall, roof 0.3
  collector.box('stoneShade', width + 2 * outreach, 0.2, length + 2 * outreach, 0, 0, 0);
  for (let side = 0; side < 4; side++) {
    const runsAlongDepth = side === 1 || side === 3;
    const openings = side === 0 ? [{ centre: 0, bottom: 0, width: 1.8, height: 2.6, isArched: true }] : [];
    const offset = (runsAlongDepth ? width : length) / 2 - 0.2;
    const centreX = side === 1 ? offset : side === 3 ? -offset : 0;
    const centreZ = side === 0 ? offset : side === 2 ? -offset : 0;
    collector.wall('stone', runsAlongDepth ? length : width, wallHeight, 0.4, openings, centreX, 0.2, centreZ, side);
  }
  // the colonnade along the inner edge of the ring
  const innerHalfWidth = width / 2 - cellSize + 0.3;
  const innerHalfLength = length / 2 - cellSize + 0.3;
  spread(pillarCountAlong(2 * innerHalfWidth), innerHalfWidth).forEach(function (alongX) {
    collector.column(alongX, 0.2, innerHalfLength, wallHeight - 0.2, 0.26);
    collector.column(alongX, 0.2, -innerHalfLength, wallHeight - 0.2, 0.26);
  });
  spread(pillarCountAlong(2 * innerHalfLength), innerHalfLength).slice(1, -1).forEach(function (alongZ) {
    collector.column(innerHalfWidth, 0.2, alongZ, wallHeight - 0.2, 0.26);
    collector.column(-innerHalfWidth, 0.2, alongZ, wallHeight - 0.2, 0.26);
  });
  // the roof over the ring, of tiles, open over the court; its edge reaches out past the centre line
  const roofDepth = cellSize + outreach;
  const roofWidth = width + 2 * outreach + 0.1;
  const roofLength = length + 2 * outreach + 0.1;
  collector.box('tile', roofWidth, 0.3, roofDepth, 0, wallHeight + 0.2, roofLength / 2 - roofDepth / 2);
  collector.box('tile', roofWidth, 0.3, roofDepth, 0, wallHeight + 0.2, -roofLength / 2 + roofDepth / 2);
  collector.box('tile', roofDepth, 0.3, roofLength - 2 * roofDepth, roofWidth / 2 - roofDepth / 2, wallHeight + 0.2, 0);
  collector.box('tile', roofDepth, 0.3, roofLength - 2 * roofDepth, -roofWidth / 2 + roofDepth / 2, wallHeight + 0.2, 0);
  // the basin
  collector.box('stone', 2.4, 0.35, 2.4, 0, 0.2, 0);
  collector.box('water', 1.9, 0.06, 1.9, 0, 0.52, 0);
}
