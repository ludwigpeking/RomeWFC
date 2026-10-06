// Purpose: the design language of the classical models. Leaving the round shapes aside, a
// classical building is made of very few things, and the models are designed with only these, so
// that their mince comes out as a small set of general pieces:
//
// - the structure of an edge: a wall, a row of pillars, an arch, an arched window; and what these
//   make together: pillars on a wall, pillars on an arch (an arch on a wall, a blind arch, is
//   rare). A structure is given to each point of a side: it is the face of that point's block.
// - a corner is where two faces meet: of one structure (symmetric) or of two.
// - a storey has a base (the platform it stands on) and a head (the beam and the cornice it ends
//   with). Tall pillars or arches over several levels are a level without a head, any number of
//   levels with neither, and a level with the head.
// - the roof and its parapet are a level of their own, on top.
//
// Everything stands on the centre lines between the points. A pillar stands in every corner of
// the building, in the middle of its corner quad, and two in every quad between two points; no
// pillar stands on the middle of such a quad. So a side always has an even number of pillars and
// its middle is a gap to go in by: two to a side of the small aedicule, four to a side two points
// wide. The two of a quad stand half a cell apart. The building goes out past its pillars at its
// edges and corners (platform, beam and cornice). A tall order, over several levels, has pillars
// as much thicker as it is taller, and its two stand further apart: each against the border of
// its quad, touching the cut without crossing it. An arch or a window is centred on its point.

import { cellSize } from './parts';
import { classicalLevelHeight } from './volume';

// Classical buildings go out a little past the centre line between the points: the platform they
// stand on and the cornice of every storey reach this far beyond it.
export const outreach = 0.35;
export const baseHeight = 0.3;
const beamHeight = 0.45;
const corniceHeight = 0.25;
const wallThickness = 0.4;
// A pillar of an order one level tall is an eighth of its height thick (about 4.1 m high, so
// 0.52 m across). A taller order is thicker by half as much again for each further level: a full
// eighth of its height would leave no room between the pairs of pillars that stand 4 m apart.
const pillarRadius = 0.26;
const engagedPillarShare = 1.3;     // a pillar on a wall or on an arch is thicker, and stands out of it on both faces
// A pillar's capital is this much wider than its shaft, each way: the widest part of a pillar
const capitalShare = 1.35;

// The head of an order (its beam and cornice) grows with the order, though less than the pillars
function headScaleOf(orderLevelCount) {
  return 1 + 0.5 * (orderLevelCount - 1);
}

export const STRUCTURE_NAMES = {
  wall: 'wall', pillar: 'pillars', arch: 'arch', archWindow: 'arched window',
  pillarOnWall: 'pillars on wall', pillarOnArch: 'pillars on arch', archOnWall: 'blind arch',
};

// The coordinate of a point of a row of pointCount points centred on the origin
function pointCoordinate(pointIndex, pointCount) {
  return (pointIndex - (pointCount - 1) / 2) * cellSize;
}

// One level of a building on a rectangle of widthPoints by depthPoints points, centred on the
// origin of the collector's frame, its front towards +z. Returns { platformReach, roofReach }: how
// far its platform, and the roof that fits its cornice, go out past the centre lines.
//   bottomY          the floor of the level
//   hasBase, hasHead whether the level begins with the platform and ends with beam and cornice
//   orderLevelCount  how many levels the order of this level runs over (1 unless it is a tall order)
//   structureOf(side, pointAlong)  the structure of the face of a point, or null for none. Side 0
//                    is the front (+z), 1 the right (+x), 2 the back (-z), 3 the left (-x); the
//                    points of the front and the back are counted along x, of the sides along z.
//   isClosedInside   a dark inside, seen through arches and windows
export function buildStorey(collector, options) {
  const widthPoints = options.widthPoints;
  const depthPoints = options.depthPoints;
  const bottomY = options.bottomY;
  const width = widthPoints * cellSize;
  const depth = depthPoints * cellSize;
  const orderLevelCount = options.orderLevelCount || 1;
  const isTallOrder = orderLevelCount > 1;
  const freePillarRadius = pillarRadius * (1 + 0.5 * (orderLevelCount - 1));
  const engagedPillarRadius = freePillarRadius * engagedPillarShare;
  const headBeamHeight = beamHeight * headScaleOf(orderLevelCount);
  const headCorniceHeight = corniceHeight * headScaleOf(orderLevelCount);
  const headHeight = headBeamHeight + headCorniceHeight;
  const bodyBottomY = bottomY + (options.hasBase ? baseHeight : 0);
  const bodyHeight = classicalLevelHeight - (options.hasBase ? baseHeight : 0) - (options.hasHead ? headHeight : 0);
  const earlierTag = collector.tag;

  // where the face of a point lies, and a place along it
  function pointCountOfSide(side) {
    return side === 0 || side === 2 ? widthPoints : depthPoints;
  }
  function placeOnFace(side, pointAlong, offsetAlong) {
    if (side === 0 || side === 2) {
      return { x: pointCoordinate(pointAlong, widthPoints) + offsetAlong, z: side === 0 ? depth / 2 : -depth / 2 };
    }
    return { x: side === 1 ? width / 2 : -width / 2, z: pointCoordinate(pointAlong, depthPoints) + offsetAlong };
  }
  function isWalled(structure) {
    return structure !== null && structure !== 'pillar';
  }

  // the widest pillar of the level: the platform has to reach out past its plinth, and the beam
  // and the cornice past its capital, so a tall order takes more room than the usual outreach
  let widestPillarRadius = 0;
  for (let side = 0; side < 4; side++) {
    for (let pointAlong = 0; pointAlong < pointCountOfSide(side); pointAlong++) {
      const structure = options.structureOf(side, pointAlong);
      if (structure === 'pillarOnWall' || structure === 'pillarOnArch') {
        widestPillarRadius = Math.max(widestPillarRadius, engagedPillarRadius);
      } else if (structure === 'pillar') {
        widestPillarRadius = Math.max(widestPillarRadius, freePillarRadius);
      }
    }
  }
  const platformReach = Math.max(outreach, 1.3 * widestPillarRadius + 0.05);
  const beamThickness = Math.max(0.5, 2.7 * widestPillarRadius - 0.1); // as deep as the capitals it lies on
  const corniceThickness = beamThickness + 2 * outreach - 0.1;
  if (options.hasBase) {
    collector.tag = 'base';
    collector.box('stoneShade', width + 2 * platformReach, baseHeight, depth + 2 * platformReach, 0, bottomY, 0);
  }
  if (options.isClosedInside) {
    buildInsideFill(collector, width, depth, bottomY, 0, 0);
  }

  const pillarPlaces = new Set(); // one pillar where two faces meet
  function addPillar(side, pointAlong, offsetAlong, radius) {
    const place = placeOnFace(side, pointAlong, offsetAlong);
    const key = Math.round(place.x * 100) + ':' + Math.round(place.z * 100);
    if (pillarPlaces.has(key)) {
      return;
    }
    pillarPlaces.add(key);
    let shaftBottomY = bodyBottomY;
    let shaftHeight = bodyHeight;
    if (options.hasBase) { // a plinth under the shaft
      collector.box('stone', radius * 2.6, radius * 0.5, radius * 2.6, place.x, shaftBottomY, place.z);
      shaftBottomY += radius * 0.5;
      shaftHeight -= radius * 0.5;
    }
    if (options.hasHead) { // a capital on it
      shaftHeight -= radius * 0.7;
      collector.box('stone', radius * 2 * capitalShare, radius * 0.7, radius * 2 * capitalShare, place.x, shaftBottomY + shaftHeight, place.z);
    }
    collector.cylinder('stone', radius, radius, shaftHeight, place.x, shaftBottomY, place.z, 12);
  }
  function addWall(side, pointAlong, offsetAlong, wallWidth, openings, materialName, thickness) {
    const place = placeOnFace(side, pointAlong, offsetAlong);
    collector.wall(materialName || 'stone', wallWidth, bodyHeight, thickness || wallThickness, openings, place.x, bodyBottomY, place.z, side);
  }
  // an arch from the floor of the level; where the level has no head it is only the two piers
  // of an arch that ends higher up
  const archWidth = 2.6;
  function addArch(side, pointAlong) {
    if (options.hasHead) {
      addWall(side, pointAlong, 0, cellSize, [{ centre: 0, bottom: 0, width: archWidth, height: Math.min(bodyHeight - 0.4, 3.9), isArched: true }]);
    } else {
      const pierWidth = (cellSize - archWidth) / 2;
      addWall(side, pointAlong, -(archWidth + pierWidth) / 2, pierWidth, []);
      addWall(side, pointAlong, (archWidth + pierWidth) / 2, pierWidth, []);
    }
  }

  for (let side = 0; side < 4; side++) {
    for (let pointAlong = 0; pointAlong < pointCountOfSide(side); pointAlong++) {
      const structure = options.structureOf(side, pointAlong);
      if (structure === null) {
        continue;
      }
      collector.tag = structure;
      if (structure === 'wall' || structure === 'pillarOnWall') {
        addWall(side, pointAlong, 0, cellSize, []);
      } else if (structure === 'arch' || structure === 'pillarOnArch') {
        addArch(side, pointAlong);
      } else if (structure === 'archWindow') {
        // the window keeps to its level, clear of floor and head, so that levels can be repeated
        addWall(side, pointAlong, 0, cellSize, [{ centre: 0, bottom: 1.2, width: 1.3, height: Math.min(2.6, bodyHeight - 1.7), isArched: true }]);
      } else if (structure === 'archOnWall') {
        addWall(side, pointAlong, 0, cellSize, [{ centre: 0, bottom: 0, width: archWidth, height: Math.min(bodyHeight - 0.3, 3.0), isArched: true }]);
        addWall(side, pointAlong, 0, cellSize - 0.1, [], 'stoneShade', wallThickness - 0.2);
      }
      if (structure === 'pillar' || structure === 'pillarOnWall') {
        const radius = structure === 'pillar' ? freePillarRadius : engagedPillarRadius;
        const beginsAtACorner = pointAlong === 0;
        const endsAtACorner = pointAlong === pointCountOfSide(side) - 1;
        // the corner pillar where the face ends at a corner of the building; otherwise a pillar
        // on the far side of the point, in the quad between two points. Of an order of one level
        // it stands a quarter of a cell from the point, so that the two of a quad are half a cell
        // apart; of a tall order it stands against the border of the quad, its capital touching it
        const offsetFromThePoint = isTallOrder ? capitalShare * radius : cellSize / 4;
        const offsets = [beginsAtACorner ? -cellSize / 2 : -offsetFromThePoint, endsAtACorner ? cellSize / 2 : offsetFromThePoint];
        offsets.forEach(function (offsetAlong) {
          addPillar(side, pointAlong, offsetAlong, radius);
        });
      } else if (structure === 'pillarOnArch') {
        [-cellSize / 2, cellSize / 2].forEach(function (offsetAlong) {
          addPillar(side, pointAlong, offsetAlong, engagedPillarRadius);
        });
      }
    }
  }

  // a post in every corner where a wall of some kind ends, so that the corner is closed
  const corners = [
    { x: -width / 2, z: depth / 2, faces: [[0, 0], [3, depthPoints - 1]] },
    { x: width / 2, z: depth / 2, faces: [[0, widthPoints - 1], [1, depthPoints - 1]] },
    { x: width / 2, z: -depth / 2, faces: [[2, widthPoints - 1], [1, 0]] },
    { x: -width / 2, z: -depth / 2, faces: [[2, 0], [3, 0]] },
  ];
  corners.forEach(function (corner) {
    const walledFace = corner.faces.find(function (face) {
      return isWalled(options.structureOf(face[0], face[1]));
    });
    if (walledFace) {
      collector.tag = options.structureOf(walledFace[0], walledFace[1]);
      collector.box('stone', wallThickness, bodyHeight, wallThickness, corner.x, bodyBottomY, corner.z);
    }
  });

  if (options.hasHead) {
    collector.tag = 'head';
    const headBottomY = bottomY + classicalLevelHeight - headHeight;
    // the ceiling, between the beams, then the beam and the cornice along every side that has a structure
    collector.box('stoneShade', width - beamThickness, 0.1, depth - beamThickness, 0, headBottomY + headBeamHeight - 0.1, 0);
    for (let side = 0; side < 4; side++) {
      let hasStructure = false;
      for (let pointAlong = 0; pointAlong < pointCountOfSide(side); pointAlong++) {
        hasStructure = hasStructure || options.structureOf(side, pointAlong) !== null;
      }
      if (!hasStructure) {
        continue;
      }
      const runsAlongX = side === 0 || side === 2;
      const sideLength = runsAlongX ? width : depth;
      const middle = placeOnFace(side, 0, -pointCoordinate(0, pointCountOfSide(side)));
      collector.box('stone', runsAlongX ? sideLength + beamThickness : beamThickness, headBeamHeight, runsAlongX ? beamThickness : sideLength + beamThickness, middle.x, headBottomY, middle.z);
      collector.box('stoneShade', runsAlongX ? sideLength + corniceThickness : corniceThickness, headCorniceHeight, runsAlongX ? corniceThickness : sideLength + corniceThickness, middle.x, headBottomY + headBeamHeight, middle.z);
    }
  }
  collector.tag = earlierTag;
  // how far the level goes out past the centre lines: at its foot, and with the roof it can carry
  return { platformReach: platformReach, roofReach: corniceThickness / 2 - 0.2 };
}

// Every roof has the same pitch and the same eaves, whatever its kind and size, so that roofs of
// different buildings are made of the same slopes: how much a roof rises for each metre in from
// its eaves, which lie the usual outreach past the centre lines
const roofPitch = 0.4;

// The dark fill of a closed inside, seen through arches and windows: one level of it, over a
// rectangle between centre lines (width by depth, centred on centreX, centreZ). Always made the
// same way, so that the fills of different buildings are the same pieces.
export function buildInsideFill(collector, width, depth, bottomY, centreX, centreZ) {
  const earlierTag = collector.tag;
  collector.tag = 'inside';
  collector.box('interior', width - 0.9, classicalLevelHeight - 0.1, depth - 0.9, centreX, bottomY + 0.05, centreZ);
  collector.tag = earlierTag;
}

// A tiled roof of two slopes, its ridge along z, with a stone pediment at each end and a figure on the front
export function gableRoof(collector, width, length, bottomY) {
  const rise = width / 2 * roofPitch;
  const earlierTag = collector.tag;
  collector.tag = 'roof';
  // the tiles lie between the two pediments and end where those begin: no face of one lies in a face of the other
  collector.prism('tile', width, rise, length - 0.6, 0, bottomY, 0, false);
  collector.prism('stone', width, rise, 0.3, 0, bottomY, length / 2 - 0.15, false);
  collector.prism('stone', width, rise, 0.3, 0, bottomY, -length / 2 + 0.15, false);
  collector.cylinder('bronze', 0, 0.14, 0.6, 0, bottomY + rise, length / 2 - 0.15, 6);
  collector.tag = earlierTag;
}

// A hipped roof over a rectangle of points: four slopes, to a point over a square (with a figure
// on its tip) and to a ridge along the longer side otherwise. It is made for the size it covers:
// a roof cannot be lengthened both ways by repeating its middle.
export function hippedRoof(collector, widthPoints, depthPoints, bottomY) {
  const earlierTag = collector.tag;
  collector.tag = 'roof';
  const eavesHalfWidth = widthPoints * cellSize / 2 + outreach;
  const eavesHalfDepth = depthPoints * cellSize / 2 + outreach;
  const rise = Math.min(eavesHalfWidth, eavesHalfDepth) * roofPitch;
  const ridgeHalfWidth = Math.max(0, eavesHalfWidth - eavesHalfDepth);
  const ridgeHalfDepth = Math.max(0, eavesHalfDepth - eavesHalfWidth);
  const topY = bottomY + rise;
  const eaves = [[-eavesHalfWidth, eavesHalfDepth], [eavesHalfWidth, eavesHalfDepth], [eavesHalfWidth, -eavesHalfDepth], [-eavesHalfWidth, -eavesHalfDepth]];
  const ridge = [[-ridgeHalfWidth, ridgeHalfDepth], [ridgeHalfWidth, ridgeHalfDepth], [ridgeHalfWidth, -ridgeHalfDepth], [-ridgeHalfWidth, -ridgeHalfDepth]];
  const coordinates = [];
  function addTriangle(first, firstY, second, secondY, third, thirdY) {
    const isFlat = (first[0] === second[0] && first[1] === second[1]) || (second[0] === third[0] && second[1] === third[1]) || (first[0] === third[0] && first[1] === third[1]);
    if (!isFlat) { // where the ridge is a point, a slope is one triangle
      coordinates.push(first[0], firstY, first[1], second[0], secondY, second[1], third[0], thirdY, third[1]);
    }
  }
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    addTriangle(eaves[side], bottomY, eaves[next], bottomY, ridge[next], topY);
    addTriangle(eaves[side], bottomY, ridge[next], topY, ridge[side], topY);
  }
  // closed underneath (facing down)
  addTriangle(eaves[0], bottomY, eaves[2], bottomY, eaves[1], bottomY);
  addTriangle(eaves[0], bottomY, eaves[3], bottomY, eaves[2], bottomY);
  collector.addTriangles('tile', coordinates);
  if (widthPoints === depthPoints) {
    collector.cylinder('bronze', 0, 0.15, 0.8, 0, topY - 0.1, 0, 6);
  }
  collector.tag = earlierTag;
}
