// Purpose: the buildings a city puts up for itself once it is large enough, as far as they are
// not among the models of models.js: the arch over a street, the theatre, the amphitheatre and
// the circus. They are hard modelled: designed whole, placed whole at their own sizes, not minced.
//
// Like every model each stands in its own frame: the origin in the middle of its footprint on
// the ground, its width along x, its depth along z, its front towards +z.

import { cellSize } from './parts';
import { classicalLevelHeight } from './volume';

// A part of a ring, round or oval, standing on bottomY: between an outer and an inner outline
// (half axes along x and along z), from one angle to another (0 looks along +x, a quarter turn
// along +z). Its top, its outer and inner faces, and its two ends where it is not a whole ring.
function ringPart(collector, materialName, centreX, centreZ, outerHalfX, outerHalfZ, innerHalfX, innerHalfZ, bottomY, height, startAngle, endAngle, segmentCount) {
  const coordinates = [];
  const topY = bottomY + height;
  function pushQuad(first, second, third, fourth) {
    coordinates.push(first[0], first[1], first[2], second[0], second[1], second[2], third[0], third[1], third[2]);
    coordinates.push(first[0], first[1], first[2], third[0], third[1], third[2], fourth[0], fourth[1], fourth[2]);
  }
  function placesAt(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      outerX: centreX + outerHalfX * cosine, outerZ: centreZ + outerHalfZ * sine,
      innerX: centreX + innerHalfX * cosine, innerZ: centreZ + innerHalfZ * sine,
    };
  }
  for (let segment = 0; segment < segmentCount; segment++) {
    const here = placesAt(startAngle + (endAngle - startAngle) * segment / segmentCount);
    const next = placesAt(startAngle + (endAngle - startAngle) * (segment + 1) / segmentCount);
    pushQuad([here.outerX, topY, here.outerZ], [next.outerX, topY, next.outerZ], [next.innerX, topY, next.innerZ], [here.innerX, topY, here.innerZ]);
    pushQuad([here.outerX, bottomY, here.outerZ], [next.outerX, bottomY, next.outerZ], [next.outerX, topY, next.outerZ], [here.outerX, topY, here.outerZ]);
    if (innerHalfX > 0 || innerHalfZ > 0) {
      pushQuad([here.innerX, bottomY, here.innerZ], [here.innerX, topY, here.innerZ], [next.innerX, topY, next.innerZ], [next.innerX, bottomY, next.innerZ]);
    }
  }
  const isWholeRing = Math.abs(Math.abs(endAngle - startAngle) - 2 * Math.PI) < 1e-6;
  if (!isWholeRing) {
    [startAngle, endAngle].forEach(function (angle) {
      const end = placesAt(angle);
      pushQuad([end.outerX, bottomY, end.outerZ], [end.outerX, topY, end.outerZ], [end.innerX, topY, end.innerZ], [end.innerX, bottomY, end.innerZ]);
    });
  }
  collector.addTriangles(materialName, coordinates);
}

// The outer face of an arena or a theatre: storeys of arcades along a part of an oval. Each bay
// is a stretch of wall with an arch through it, the dark of the passage behind; a half pillar
// stands before every pier and an entablature runs over every storey.
function arcadedFace(collector, centreX, centreZ, halfX, halfZ, storeyCount, storeyHeight, startAngle, endAngle, bayCount) {
  const entablatureHeight = 0.55;
  const wallThickness = 0.8;
  const passageDepth = 1.6;
  function placeAt(angle, inwards) {
    return [centreX + (halfX - inwards) * Math.cos(angle), centreZ + (halfZ - inwards) * Math.sin(angle)];
  }
  for (let storey = 0; storey < storeyCount; storey++) {
    const bottomY = storey * storeyHeight;
    const archHeight = storeyHeight - entablatureHeight;
    ringPart(collector, 'interior', centreX, centreZ, halfX - wallThickness - 0.05, halfZ - wallThickness - 0.05,
      halfX - passageDepth, halfZ - passageDepth, bottomY, archHeight, startAngle, endAngle, 48);
    ringPart(collector, 'stoneShade', centreX, centreZ, halfX + 0.18, halfZ + 0.18, halfX - passageDepth, halfZ - passageDepth,
      bottomY + archHeight, entablatureHeight, startAngle, endAngle, 48);
    for (let bay = 0; bay < bayCount; bay++) {
      const start = placeAt(startAngle + (endAngle - startAngle) * bay / bayCount, wallThickness / 2);
      const end = placeAt(startAngle + (endAngle - startAngle) * (bay + 1) / bayCount, wallThickness / 2);
      const bayLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const archWidth = Math.min(bayLength - 0.9, 2 * (archHeight - 0.9));
      collector.wallBetween('stone', start[0], start[1], end[0], end[1], bottomY, archHeight, wallThickness,
        [{ centre: 0, bottom: 0, width: archWidth, height: Math.min(archHeight - 0.45, archWidth / 2 + archHeight * 0.55), isArched: true }]);
    }
    // the half pillars before the piers
    for (let pier = 0; pier <= bayCount; pier++) {
      const angle = startAngle + (endAngle - startAngle) * pier / bayCount;
      const foot = placeAt(angle, -0.12);
      collector.cylinder('stone', 0.17, 0.2, archHeight, foot[0], bottomY, foot[1], 8);
    }
  }
}

// Whether a seat is taken: a little more than half of them are, always the same ones
function isSeatTaken(seatNumber, rowNumber) {
  const mixed = Math.sin(seatNumber * 12.9898 + rowNumber * 78.233) * 43758.5453;
  return mixed - Math.floor(mixed) < 0.58;
}

// The seats: rings of steps going down inwards from the top of the outer wall, with the people
// who sit on them (standing figures, for the scale)
function seats(collector, centreX, centreZ, outerHalfX, outerHalfZ, innerHalfX, innerHalfZ, topHeight, bottomHeight, stepCount, startAngle, endAngle) {
  for (let step = 0; step < stepCount; step++) {
    const outerShare = step / stepCount;
    const innerShare = (step + 1) / stepCount;
    ringPart(collector, step % 2 === 0 ? 'stone' : 'stoneShade', centreX, centreZ,
      outerHalfX + (innerHalfX - outerHalfX) * outerShare, outerHalfZ + (innerHalfZ - outerHalfZ) * outerShare,
      outerHalfX + (innerHalfX - outerHalfX) * innerShare, outerHalfZ + (innerHalfZ - outerHalfZ) * innerShare,
      0, topHeight + (bottomHeight - topHeight) * innerShare, startAngle, endAngle, 48);
    // the people on this step, a seat every 1.3 m along its middle
    const middleShare = (outerShare + innerShare) / 2;
    const middleHalfX = outerHalfX + (innerHalfX - outerHalfX) * middleShare;
    const middleHalfZ = outerHalfZ + (innerHalfZ - outerHalfZ) * middleShare;
    const seatCount = Math.floor(Math.abs(endAngle - startAngle) * (middleHalfX + middleHalfZ) / 2 / 1.3);
    for (let seat = 0; seat < seatCount; seat++) {
      if (isSeatTaken(seat, step)) {
        const angle = startAngle + (endAngle - startAngle) * (seat + 0.5) / seatCount;
        collector.person(centreX + middleHalfX * Math.cos(angle), topHeight + (bottomHeight - topHeight) * innerShare, centreZ + middleHalfZ * Math.sin(angle));
      }
    }
  }
}

// Three points across a street, one deep: a great arch over the street in the middle and a
// lesser one over each side, pillars before the piers, an attic with a group of bronze on it.
// The street passes through it from the back to the front.
function buildCityArch(collector) {
  const width = 3 * cellSize - 0.4;
  const depth = 3.0;
  const bodyHeight = 2 * classicalLevelHeight - 1.9;
  collector.wall('stone', width, bodyHeight, depth, [
    { centre: 0, bottom: 0, width: 3.7, height: bodyHeight - 1.3, isArched: true },
    { centre: -3.95, bottom: 0, width: 1.9, height: bodyHeight * 0.56, isArched: true },
    { centre: 3.95, bottom: 0, width: 1.9, height: bodyHeight * 0.56, isArched: true },
  ], 0, 0, 0, 0);
  [-1, 1].forEach(function (face) {
    [-5.35, -2.5, 2.5, 5.35].forEach(function (alongX) {
      collector.column(alongX, 0, face * (depth / 2 + 0.32), bodyHeight, 0.27);
    });
  });
  collector.box('stoneShade', width + 0.9, 0.4, depth + 1.3, 0, bodyHeight, 0);
  collector.box('stone', width - 0.6, 1.5, depth, 0, bodyHeight + 0.4, 0);
  collector.box('bronze', 2.6, 1.2, 1.0, 0, bodyHeight + 1.9, 0);
}

// A theatre: half a ring of seats looking down on the stage, closed at the back by the tall
// stage building with its two storeys of pillars. Its round outer face looks to the front.
function buildTheatre(collector, widthPoints, depthPoints, levelCount) {
  const height = levelCount * classicalLevelHeight;
  const halfWidth = widthPoints * cellSize / 2 - 0.3;
  const stageBuildingDepth = 2.4;
  const backZ = -depthPoints * cellSize / 2 + 0.3;
  const centreZ = backZ + stageBuildingDepth + 2.6; // the stage lies between the stage building and the middle of the seats
  const radius = Math.min(halfWidth, depthPoints * cellSize / 2 - 0.3 - centreZ);
  collector.box('stoneShade', widthPoints * cellSize, 0.25, depthPoints * cellSize, 0, 0, 0);
  arcadedFace(collector, 0, centreZ, radius, radius, 2, height / 2 - 0.4, 0, Math.PI, 14);
  ringPart(collector, 'stone', 0, centreZ, radius, radius, radius - 1.1, radius - 1.1, height - 0.8, 0.8, 0, Math.PI, 48);
  seats(collector, 0, centreZ, radius - 1.1, radius - 1.1, 2.4, 2.4, height - 1.2, 1.0, 8, 0, Math.PI);
  ringPart(collector, 'plasterCream', 0, centreZ, 2.4, 2.4, 0, 0, 0, 0.5, 0, Math.PI, 24); // the orchestra
  // the stage and the building behind it
  collector.box('plank', 2 * radius - 2.4, 1.1, 2.6, 0, 0, centreZ - 1.3);
  collector.box('stone', 2 * radius, height, stageBuildingDepth, 0, 0, backZ + stageBuildingDepth / 2);
  collector.box('stoneShade', 2 * radius + 0.5, 0.45, stageBuildingDepth + 0.5, 0, height, backZ + stageBuildingDepth / 2);
  for (let storey = 0; storey < 2; storey++) {
    const storeyBottomY = 1.1 + storey * (height - 1.5) / 2;
    for (let pillar = 0; pillar < 8; pillar++) {
      const alongX = -radius + 1.4 + pillar * (2 * radius - 2.8) / 7;
      collector.column(alongX, storeyBottomY, backZ + stageBuildingDepth + 0.3, (height - 1.5) / 2 - 0.3, 0.2);
    }
    collector.box('stoneShade', 2 * radius - 1.6, 0.3, 0.8, 0, storeyBottomY + (height - 1.5) / 2 - 0.3, backZ + stageBuildingDepth + 0.3);
  }
  [[-1.6, -1.0], [0.3, -1.5], [1.9, -0.9]].forEach(function (place) { // the players on the stage
    collector.person(place[0], 1.1, centreZ + place[1]);
  });
  [-0.6, 0, 0.6].forEach(function (share) { // the three doors of the stage wall
    collector.box('interior', 1.5, 2.6, 0.1, share * radius, 1.1, backZ + stageBuildingDepth + 0.03);
  });
  // the back of the stage building looks like a building of the town: blind windows in two
  // storeys between pilasters of shade, a portal at the ground (the author, 2026-10-10)
  const backFaceZ = backZ - 0.06;
  const bayCount = Math.max(5, Math.round(radius / 1.6) * 2 + 1);
  for (let bay = 0; bay < bayCount; bay++) {
    const alongX = -radius + (bay + 0.5) * (2 * radius / bayCount);
    const isTheMiddle = bay === Math.floor(bayCount / 2);
    for (let storey = 0; storey < 2; storey++) {
      const sillY = 1.4 + storey * (height - 1.5) / 2;
      if (storey === 0 && isTheMiddle) {
        continue;
      }
      collector.box('stoneShade', 1.1, 1.9, 0.12, alongX, sillY, backFaceZ); // a blind window: a shallow recess
      collector.box('stone', 1.4, 0.18, 0.2, alongX, sillY + 1.9, backFaceZ - 0.02); // its lintel
    }
  }
  collector.box('stoneShade', 2 * radius, 0.3, 0.25, 0, 1.1 + (height - 1.5) / 2 - 0.3, backFaceZ); // the string course between the storeys
  // the portal: an arched door in a frame of stone, two steps before it
  collector.box('stone', 3.4, 4.6, 0.3, 0, 0.3, backFaceZ - 0.08);
  collector.box('interior', 2.2, 3.6, 0.12, 0, 0.3, backFaceZ - 0.3);
  collector.box('stoneShade', 4.2, 0.3, 1.0, 0, 0, backFaceZ - 0.6);
}

// An amphitheatre: an oval of seats round an arena of sand, behind three storeys of arcades
function buildAmphitheatre(collector, widthPoints, depthPoints, levelCount) {
  const height = levelCount * classicalLevelHeight;
  const halfX = widthPoints * cellSize / 2 - 0.4;
  const halfZ = depthPoints * cellSize / 2 - 0.4;
  const whole = 2 * Math.PI;
  const atticHeight = 1.6;
  collector.box('stoneShade', widthPoints * cellSize, 0.2, depthPoints * cellSize, 0, 0, 0);
  arcadedFace(collector, 0, 0, halfX, halfZ, 3, (height - atticHeight) / 3, 0, whole, 36);
  ringPart(collector, 'stone', 0, 0, halfX, halfZ, halfX - 1.1, halfZ - 1.1, height - atticHeight, atticHeight, 0, whole, 48);
  seats(collector, 0, 0, halfX - 1.1, halfZ - 1.1, halfX * 0.42, halfZ * 0.5, height - atticHeight - 0.4, 1.6, 10, 0, whole);
  ringPart(collector, 'plasterCream', 0, 0, halfX * 0.42, halfZ * 0.5, 0, 0, 0, 0.35, 0, whole, 40); // the arena
  [[-1.2, -0.8], [1.1, 0.6], [0.2, 3.0], [-0.6, -3.4]].forEach(function (place) { // the fighters in the arena
    collector.person(place[0], 0.35, place[1]);
  });
  // the great gates on the long axis
  [-1, 1].forEach(function (end) {
    collector.box('interior', 2.2, 3.2, 0.5, 0, 0.2, end * (halfZ - 0.1));
  });
}

// A circus: a long track of sand round a low spine with its turning posts and an obelisk, banks
// of seats along both sides and round the far end, the starting gates across the near one
function buildCircus(collector, widthPoints, depthPoints) {
  const width = widthPoints * cellSize - 0.6;
  const length = depthPoints * cellSize - 0.6;
  const bankDepth = 2.6;
  const bankHeight = classicalLevelHeight - 0.6;
  const turnRadius = width / 2;
  const turnCentreZ = length / 2 - turnRadius;   // the round end is at the front
  const gatesZ = -length / 2 + 0.6;
  const straightLength = turnCentreZ - gatesZ;
  collector.box('plasterCream', width - 0.4, 0.2, length - turnRadius, 0, 0, (gatesZ + turnCentreZ) / 2 - 0.3); // the track
  ringPart(collector, 'plasterCream', 0, turnCentreZ, turnRadius - 0.2, turnRadius - 0.2, 0, 0, 0, 0.2, 0, Math.PI, 24);
  // the banks: three steps, on both long sides and round the end
  for (let step = 0; step < 3; step++) {
    const stepDepth = bankDepth * (3 - step) / 3;
    const stepHeight = bankHeight * (step + 1) / 3;
    [-1, 1].forEach(function (side) {
      collector.box(step % 2 === 0 ? 'stone' : 'stoneShade', stepDepth, stepHeight, straightLength, side * (width / 2 - stepDepth / 2), 0, (gatesZ + turnCentreZ) / 2);
      // the people on this step of the bank, a seat every 1.3 m
      const seatCount = Math.floor(straightLength / 1.3);
      for (let seat = 0; seat < seatCount; seat++) {
        if (isSeatTaken(seat + (side + 1) * 500, step)) {
          collector.person(side * (width / 2 - stepDepth + bankDepth / 6), stepHeight, gatesZ + (seat + 0.5) * straightLength / seatCount);
        }
      }
    });
    ringPart(collector, step % 2 === 0 ? 'stone' : 'stoneShade', 0, turnCentreZ, turnRadius, turnRadius, turnRadius - stepDepth, turnRadius - stepDepth, 0, stepHeight, 0, Math.PI, 28);
  }
  // the starting gates: a wall of arches across the track, a box for the giver of the games over the middle
  const gateWidth = (width - 2 * bankDepth) / 5;
  const gateOpenings = [];
  for (let gate = 0; gate < 5; gate++) {
    gateOpenings.push({ centre: (gate - 2) * gateWidth, bottom: 0, width: gateWidth - 0.7, height: 2.9, isArched: true });
  }
  collector.wall('stone', width - 2 * bankDepth + 0.6, bankHeight, 1.2, gateOpenings, 0, 0, gatesZ, 0);
  collector.box('stoneShade', width - 2 * bankDepth + 1.0, 0.35, 1.6, 0, bankHeight, gatesZ);
  collector.box('stone', 3.0, 1.6, 1.4, 0, bankHeight + 0.35, gatesZ);
  collector.prism('tile', 3.4, 0.8, 1.8, 0, bankHeight + 1.95, gatesZ, true);
  [[-2.4, 0.2], [-2.9, 0.45], [2.5, -0.3], [2.9, 0.1]].forEach(function (place) { // the drivers on the track
    collector.person(place[0], 0.2, (gatesZ + turnCentreZ) / 2 + place[1] * straightLength);
  });
  // the spine
  const spineLength = straightLength - 2 * turnRadius;
  const spineCentreZ = (gatesZ + turnCentreZ) / 2 + 1.0;
  collector.box('stone', 1.2, 0.9, spineLength, 0, 0.2, spineCentreZ);
  collector.box('stoneShade', 0.8, 0.7, 0.8, 0, 1.1, spineCentreZ);
  collector.box('plasterRose', 0.5, 4.2, 0.5, 0, 1.8, spineCentreZ);
  collector.pyramid('bronze', 0.5, 0.5, 0.6, 0, 6.0, spineCentreZ);
  [-1, 1].forEach(function (end) {
    [-0.35, 0, 0.35].forEach(function (alongX) {
      collector.cylinder('bronze', 0.05, 0.16, 1.8, alongX, 1.1, spineCentreZ + end * (spineLength / 2 - 0.4), 8);
    });
  });
}

const fixedSize = { across: null, along: null, up: null };

// The models of the city's own buildings that are hard modelled, by their kind
export const PUBLIC_HARD_MODELS = {
  cityArch: {
    name: 'city arch', isHardModelled: true, isAPassageThroughItsDepth: true, widthPoints: 3, depthPoints: 1, levelCount: 2, repeat: fixedSize,
    build: buildCityArch, sizeText: '3 × 1 × 2, over a busy street; only the city builds it',
  },
  theatre: {
    name: 'theatre', isHardModelled: true, widthPoints: 5, depthPoints: 4, levelCount: 2, repeat: fixedSize,
    build: function (collector) { buildTheatre(collector, 5, 4, 2); }, sizeText: '5 × 4 × 2; only the city builds it',
  },
  amphitheatre: {
    name: 'amphitheatre', isHardModelled: true, widthPoints: 6, depthPoints: 8, levelCount: 3, repeat: fixedSize,
    build: function (collector) { buildAmphitheatre(collector, 6, 8, 3); }, sizeText: '6 × 8 × 3; only the city builds it',
  },
  circus: {
    name: 'circus', isHardModelled: true, widthPoints: 4, depthPoints: 12, levelCount: 1, repeat: fixedSize,
    build: function (collector) { buildCircus(collector, 4, 12); }, sizeText: '4 × 12 × 1; only the city builds it',
  },
};
