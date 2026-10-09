// Purpose: the blocks of a quad, shared by the tiers that are built the way Townscaper builds
// (the vernacular houses and the classical buildings): the volume is on the points, the building
// is made in the quads between them.
//
// Every quad is four quarters, one for each corner point (topology.js). A raised point owns the
// quarters round it, so its block is three to six components on the irregular grid. Inside a quad
// the line from the middle of a side to the middle of the quad parts the quarters of two
// neighbouring points: where one of the two is raised and the other is not, a stretch of wall
// stands on that line. Raised points next to each other have no wall between them, so they grow
// into one building whose outline runs through the middles of the quads. That holds for the
// points of one building only: where a style tells buildings apart (isSameBuilding: the houses
// of different owners), a party wall stands between the two, and each has its own roof.
//
// What each stretch looks like is settled by wave function collapse: every stretch starts with
// all the looks its place allows, the one with the fewest left is decided first, and each decision
// narrows the stretches beside it and the ones above and below. A tier gives its own looks and
// rules as a style:
//   {
//     isBlock(pointIndex, level)            whether the point is raised for this tier
//     isSameBuilding(firstPoint, secondPoint, level)  (optional) whether two raised points grow together
//     optionsFor(stretch)                   the looks a stretch may take, by its place
//     weightOf(lookName, stretch)           how likely a look is there
//     mayStandBeside(firstLook, secondLook) along a wall
//     mayStandAbove(lowerLook, upperLook)   on the same stretch, one level apart
//     fallbackLooks                         tried in order when no arrangement is found
//   }
// One roof covers every group of raised points that are open to the sky; it rises with the
// distance from its eaves, so any outline gets its hips, valleys and ridges.

import { TIER, SeededRandom, placeHash } from './volume';
import { sideName } from './topology';

// Every stretch of wall of a tier, with its look collapsed. A stretch is
// { name, level, start: {x, z}, end: {x, z}, length, raisedPoint, facedPoint, isPartyWall,
// carriesABlock, look }, name being the same on every level; raisedPoint is the point whose block
// the stretch closes, facedPoint the point it looks at (-1 beyond the rim of the map), and
// carriesABlock tells whether the raised point is raised on the level above too. A party wall
// stands between two raised points of different buildings.
export function collapseWallStretches(volume, seed, style) {
  const map = volume.map;
  const stretches = new Map(); // level + ':' + name -> stretch
  const isSameBuilding = style.isSameBuilding || function () { return true; };
  function addStretch(name, level, start, end, endNames, raisedPoint, facedPoint, isPartyWall) {
    const stretch = {
      name: name, level: level, start: start, end: end, endNames: endNames, raisedPoint: raisedPoint,
      facedPoint: facedPoint, isPartyWall: isPartyWall,
      length: Math.hypot(end.x - start.x, end.z - start.z),
      carriesABlock: style.isBlock(raisedPoint, level + 1),
    };
    stretch.options = style.optionsFor(stretch);
    stretches.set(level + ':' + name, stretch);
  }
  for (let level = 0; level < volume.usedLevelCount(); level++) {
    map.cells.forEach(function (cell, cellIndex) {
      for (let side = 0; side < 4; side++) {
        const firstPoint = cell.corners[side];
        const secondPoint = cell.corners[(side + 1) % 4];
        const firstIsBlock = style.isBlock(firstPoint, level);
        const secondIsBlock = style.isBlock(secondPoint, level);
        const middleName = sideName(firstPoint, secondPoint);
        // inside the quad: between the quarters of the two points of this side
        if (firstIsBlock !== secondIsBlock) {
          addStretch('q' + cellIndex + ':' + side, level, cell.sideMiddles[side], cell.middle, [middleName, 'c' + cellIndex],
            firstIsBlock ? firstPoint : secondPoint, firstIsBlock ? secondPoint : firstPoint, false);
        } else if (firstIsBlock && !isSameBuilding(firstPoint, secondPoint, level)) {
          addStretch('q' + cellIndex + ':' + side, level, cell.sideMiddles[side], cell.middle, [middleName, 'c' + cellIndex],
            Math.min(firstPoint, secondPoint), Math.max(firstPoint, secondPoint), true);
        }
        // on the rim of the map: the block ends at the side itself
        if (cell.neighbours[side] === null) {
          if (firstIsBlock) {
            addStretch('r' + cellIndex + ':' + side + 'a', level, map.points[firstPoint], cell.sideMiddles[side], ['p' + firstPoint, middleName], firstPoint, -1, false);
          }
          if (secondIsBlock) {
            addStretch('r' + cellIndex + ':' + side + 'b', level, cell.sideMiddles[side], map.points[secondPoint], [middleName, 'p' + secondPoint], secondPoint, -1, false);
          }
        }
      }
    });
  }
  // the neighbours of a stretch: the stretches that meet it at either end on its level, and the same stretch above and below
  const stretchesAtEnd = new Map();
  stretches.forEach(function (stretch) {
    stretch.endNames.forEach(function (endName) {
      const key = stretch.level + ':' + endName;
      if (!stretchesAtEnd.has(key)) {
        stretchesAtEnd.set(key, []);
      }
      stretchesAtEnd.get(key).push(stretch);
    });
  });
  stretches.forEach(function (stretch) {
    stretch.beside = [];
    stretch.endNames.forEach(function (endName) {
      stretchesAtEnd.get(stretch.level + ':' + endName).forEach(function (other) {
        if (other !== stretch) {
          stretch.beside.push(other);
        }
      });
    });
    stretch.above = stretches.get((stretch.level + 1) + ':' + stretch.name) || null;
    stretch.below = stretches.get((stretch.level - 1) + ':' + stretch.name) || null;
  });

  const startOptions = new Map();
  stretches.forEach(function (stretch, key) {
    startOptions.set(key, stretch.options);
  });
  const attemptLimit = 40;
  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    stretches.forEach(function (stretch, key) {
      stretch.options = startOptions.get(key).slice();
    });
    if (collapseOnce(stretches, new SeededRandom(seed * 7919 + attempt * 104729 + 1), style)) {
      break;
    }
    if (attempt === attemptLimit - 1) {
      stretches.forEach(function (stretch, key) { // no arrangement found: the looks that fit everywhere
        const allowed = startOptions.get(key);
        const fallback = style.fallbackLooks.find(function (lookName) {
          return allowed.includes(lookName);
        });
        stretch.options = [fallback || allowed[0]];
      });
    }
  }
  stretches.forEach(function (stretch) {
    stretch.look = stretch.options[0];
  });
  return stretches;
}

// One attempt of the collapse; false when a stretch is left with no look
function collapseOnce(stretches, random, style) {
  const all = Array.from(stretches.values());
  function propagateFrom(startStretch) {
    const pending = [startStretch];
    while (pending.length > 0) {
      const stretch = pending.pop();
      const relations = stretch.beside.map(function (neighbour) {
        return { neighbour: neighbour, fits: function (own, other) { return style.mayStandBeside(own, other); } };
      });
      if (stretch.above) {
        relations.push({ neighbour: stretch.above, fits: function (own, other) { return style.mayStandAbove(own, other); } });
      }
      if (stretch.below) {
        relations.push({ neighbour: stretch.below, fits: function (own, other) { return style.mayStandAbove(other, own); } });
      }
      for (const relation of relations) {
        const before = relation.neighbour.options.length;
        relation.neighbour.options = relation.neighbour.options.filter(function (otherLook) {
          return stretch.options.some(function (ownLook) {
            return relation.fits(ownLook, otherLook);
          });
        });
        if (relation.neighbour.options.length === 0) {
          return false;
        }
        if (relation.neighbour.options.length < before) {
          pending.push(relation.neighbour);
        }
      }
    }
    return true;
  }
  // what is fixed from the start narrows its neighbours first
  for (const stretch of all) {
    if (stretch.options.length === 1 && !propagateFrom(stretch)) {
      return false;
    }
  }
  for (;;) {
    let next = null;
    all.forEach(function (stretch) {
      if (stretch.options.length > 1 && (next === null || stretch.options.length < next.options.length)) {
        next = stretch;
      }
    });
    if (next === null) {
      return true;
    }
    let totalWeight = 0;
    next.options.forEach(function (lookName) {
      totalWeight += style.weightOf(lookName, next);
    });
    let pick = random.nextFloat() * totalWeight;
    let chosen = next.options[next.options.length - 1];
    for (const lookName of next.options) {
      pick -= style.weightOf(lookName, next);
      if (pick <= 0) {
        chosen = lookName;
        break;
      }
    }
    next.options = [chosen];
    if (!propagateFrom(next)) {
      return false;
    }
  }
}

// One tiled roof over each group of raised points that are open to the sky on the same level and
// belong to one building (buildingOf(pointIndex), a number; optional: without it all are one).
// The roof is made on the quarters of the quads: every place of a quarter (its point, the middles
// of its two sides, the middle of its quad) lies some half cells in from the eaves, and rises by
// that much. roofRisePerCell: metres of roof height for each cell of distance from the eaves.
// shadeKeyOf(pointIndex) (optional): a number that stays the same for a building while the town
// changes round it; the shade of its tiles follows from it (without it: from buildingOf).
export function buildRoofs(collector, volume, isBlock, roofRisePerCell, buildingOf, shadeKeyOf) {
  const map = volume.map;
  const notRoofed = -1;
  for (let level = 0; level < volume.usedLevelCount(); level++) {
    // the building whose roof covers a point on this level, or notRoofed
    const roofOf = function (pointIndex) {
      if (!isBlock(pointIndex, level) || volume.tierAt(pointIndex, level + 1) !== TIER.empty) {
        return notRoofed;
      }
      return buildingOf ? buildingOf(pointIndex) : 0;
    };
    const roofedQuarters = [];
    const stepsFromEaves = new Map(); // place name -> half cells in from the eaves
    // a place is on the eaves where the quarters that meet at it are not all under one roof
    const roofAtPlace = new Map();
    const placesOnEaves = new Set();
    for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
      const roofOfPoint = roofOf(pointIndex);
      map.quartersOfPoint[pointIndex].forEach(function (quarter) {
        if (roofOfPoint !== notRoofed) {
          quarter.eavesY = volume.bottomHeightAt(pointIndex, level + 1); // the top of the block of its point
          roofedQuarters.push(quarter);
        }
        quarter.nodeNames.forEach(function (name) {
          if (!roofAtPlace.has(name)) {
            roofAtPlace.set(name, roofOfPoint);
          } else if (roofAtPlace.get(name) !== roofOfPoint) {
            placesOnEaves.add(name);
          }
          if (roofOfPoint === notRoofed) {
            placesOnEaves.add(name);
          }
        });
      });
      if (roofOfPoint !== notRoofed && map.points[pointIndex].isOnBoundary) {
        placesOnEaves.add('p' + pointIndex);
      }
    }
    if (roofedQuarters.length === 0) {
      continue;
    }
    // the rim of the map is eaves too: the middles of the sides that have no quad beyond them
    map.cells.forEach(function (cell) {
      for (let side = 0; side < 4; side++) {
        if (cell.neighbours[side] === null) {
          placesOnEaves.add(sideName(cell.corners[side], cell.corners[(side + 1) % 4]));
        }
      }
    });
    roofedQuarters.forEach(function (quarter) {
      quarter.nodeNames.forEach(function (name) {
        if (placesOnEaves.has(name)) {
          stepsFromEaves.set(name, 0);
        }
      });
    });
    let changed = true;
    while (changed) { // inwards from the eaves, a half cell at a time
      changed = false;
      roofedQuarters.forEach(function (quarter) {
        let lowest = Infinity;
        quarter.nodeNames.forEach(function (name) {
          if (stepsFromEaves.has(name)) {
            lowest = Math.min(lowest, stepsFromEaves.get(name));
          }
        });
        quarter.nodeNames.forEach(function (name) {
          if (lowest + 1 < (stepsFromEaves.has(name) ? stepsFromEaves.get(name) : Infinity)) {
            stepsFromEaves.set(name, lowest + 1);
            changed = true;
          }
        });
      });
    }
    const coordinates = [];
    // every roof has its own shade of tile: lighter or darker, and from a deep red to a yellower
    // orange (terracotta is nearly all red, so the shade is turned by its green and blue); the
    // part of it over each point differs again by less
    const tints = [];
    roofedQuarters.forEach(function (quarter) {
      const roofNumber = shadeKeyOf ? shadeKeyOf(quarter.pointIndex) : roofOf(quarter.pointIndex);
      // (darker rather than lighter: in the sun the tiles are near the brightest the picture shows,
      // and a lighter shade would hardly be seen)
      const brightness = 1 - 0.45 * placeHash(roofNumber, level, 31) - 0.08 * placeHash(quarter.pointIndex, level, 37);
      const yellowness = 0.7 * (placeHash(roofNumber, level, 41) - 0.5);
      const corners = quarter.outline.map(function (corner, index) {
        const steps = stepsFromEaves.get(quarter.nodeNames[index]);
        return [corner[0], quarter.eavesY + (Number.isFinite(steps) ? steps : 0) * roofRisePerCell / 2, corner[1]];
      });
      // two triangles, parted from the point to the middle of the quad, facing up
      [[0, 1, 2], [0, 2, 3]].forEach(function (triangle) {
        const first = corners[triangle[0]], second = corners[triangle[1]], third = corners[triangle[2]];
        const facesUp = (second[2] - first[2]) * (third[0] - first[0]) - (second[0] - first[0]) * (third[2] - first[2]) > 0;
        const ordered = facesUp ? [first, second, third] : [first, third, second];
        ordered.forEach(function (corner) {
          coordinates.push(corner[0], corner[1], corner[2]);
          tints.push(brightness, brightness * (1 + yellowness), brightness * (1 + 1.4 * yellowness));
        });
      });
      // the ceiling under the roof, which also closes the eaves
      collector.polygonPrism('stoneShade', quarter.outline, quarter.eavesY - 0.14, 0.14);
    });
    collector.addTriangles('tile', coordinates, tints);
  }
}
