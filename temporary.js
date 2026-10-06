// Purpose: the temporary tier: stalls, huts and shabby houses of timber, planks, thatch and canvas.
// They are simple: every raised point is its own little building, at most two levels tall, and
// the buildings do not grow together into anything larger.
// - One level alone is a stall: open to the street, a counter under an awning, a lean-to of thatch.
// - Two levels are a shabby house. The lower level has no roof of its own; it carries the upper one
//   on stout posts and beams and stays open to the street as a shop. The upper level has no need to
//   open to the street: it is closed, with boarded walls and small windows, under a roof of thatch,
//   and is reached by a stair at the side.

import { CANVAS_MATERIALS } from './parts';
import { TIER, placeHash, temporaryLevelHeight } from './volume';

export function buildTemporary(collector, volume, seed) {
  const map = volume.map;
  volume.filledPlaces().forEach(function (place) {
    if (place.tier !== TIER.temporary) {
      return;
    }
    const point = map.points[place.pointIndex];
    const variety = placeHash(place.pointIndex, place.level, seed + 11);
    // the front: towards a neighbouring point with open air, chosen by the place itself so that it stays put.
    // A whole house looks one way: the upper level takes the front of the level under it.
    const frontLevel = place.level > 0 && volume.tierAt(place.pointIndex, place.level - 1) === TIER.temporary ? place.level - 1 : place.level;
    const openNeighbours = Array.from(map.sideNeighboursOfPoint[place.pointIndex]).filter(function (neighbourPoint) {
      return volume.tierAt(neighbourPoint, frontLevel) === TIER.empty;
    });
    const frontVariety = placeHash(place.pointIndex, frontLevel, seed + 11);
    let frontX = 0;
    let frontZ = 1;
    if (openNeighbours.length > 0) {
      const towards = map.points[openNeighbours[Math.floor(frontVariety * openNeighbours.length)]];
      frontX = towards.x - point.x;
      frontZ = towards.z - point.z;
    }
    collector.placeFacing(point.x, volume.bottomHeightAt(place.pointIndex, place.level), point.z, frontX, frontZ);

    const carriesAnUpperLevel = volume.tierAt(place.pointIndex, place.level + 1) === TIER.temporary;
    const isUpperLevel = place.level > 0 && volume.tierAt(place.pointIndex, place.level - 1) === TIER.temporary;
    const canvas = CANVAS_MATERIALS[Math.floor(placeHash(place.pointIndex, place.level, seed + 23) * CANVAS_MATERIALS.length)];
    if (isUpperLevel) {
      buildUpperRoom(collector, variety);
    } else {
      buildStall(collector, variety, canvas, carriesAnUpperLevel);
    }
  });
  collector.placeAt(0, 0, 0, 0);
}

// The ground level, open to the street. Alone it is a stall under a lean-to; under an upper level
// it is the shop of a house, with stouter posts, beams to carry the floor above and no roof.
function buildStall(collector, variety, canvas, carriesAnUpperLevel) {
  const halfWidth = 1.6;
  const postHeight = carriesAnUpperLevel ? temporaryLevelHeight - 0.25 : 2.7;
  const postThickness = carriesAnUpperLevel ? 0.24 : 0.16;
  collector.box('plank', 2 * halfWidth + 0.3, 0.1, 2 * halfWidth + 0.3, 0, 0, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner) {
    collector.box('timber', postThickness, postHeight, postThickness, corner[0] * halfWidth, 0, corner[1] * halfWidth);
  });
  // boarded at the back and on one side (both sides under a house), with gaps between the boards
  const boardCount = carriesAnUpperLevel ? 7 : 5;
  const boardedHeight = postHeight - (carriesAnUpperLevel ? 0.1 : 0.5);
  for (let board = 0; board < boardCount; board++) {
    const boardBottom = 0.15 + board * boardedHeight / boardCount;
    const boardHeight = boardedHeight / boardCount - 0.06;
    collector.box('plank', 2 * halfWidth, boardHeight, 0.06, 0, boardBottom, -halfWidth);
    if (carriesAnUpperLevel || variety < 0.5) {
      collector.box('plank', 0.06, boardHeight, 2 * halfWidth, -halfWidth, boardBottom, 0);
    }
    if (carriesAnUpperLevel || variety >= 0.5) {
      collector.box('plank', 0.06, boardHeight, 2 * halfWidth, halfWidth, boardBottom, 0);
    }
  }
  // the counter with wares, and an awning of canvas over it
  collector.box('plank', 2 * halfWidth - 0.5, 0.9, 0.5, 0, 0, halfWidth - 0.25);
  collector.box(canvas, 0.5, 0.25, 0.3, -0.6, 0.9, halfWidth - 0.25);
  collector.box('thatch', 0.4, 0.2, 0.3, 0.3, 0.9, halfWidth - 0.25);
  const awningTop = carriesAnUpperLevel ? 2.9 : postHeight - 0.25;
  collector.addTriangles(canvas, slopedSheet(2 * halfWidth + 0.4, halfWidth - 0.1, halfWidth + 1.3, awningTop, awningTop - 0.7));
  collector.box('timber', 0.08, awningTop - 0.7, 0.08, -halfWidth, 0, halfWidth + 1.25);
  collector.box('timber', 0.08, awningTop - 0.7, 0.08, halfWidth, 0, halfWidth + 1.25);
  if (carriesAnUpperLevel) {
    // the beams that carry the floor above, reaching out a little under its overhang
    [-halfWidth, 0, halfWidth].forEach(function (alongX) {
      collector.box('timber', 0.2, 0.25, 2 * halfWidth + 0.7, alongX, postHeight, 0);
    });
  } else {
    // a lean-to of thatch, higher at the back
    collector.addTriangles('thatch', slopedSheet(2 * halfWidth + 0.7, -halfWidth - 0.35, halfWidth + 0.35, postHeight + 0.75, postHeight + 0.05));
    collector.addTriangles('thatch', slopedSheet(2 * halfWidth + 0.7, -halfWidth - 0.35, halfWidth + 0.35, postHeight + 0.6, postHeight - 0.1));
    collector.box('timber', 2 * halfWidth, 0.12, 0.12, 0, postHeight + 0.45, -halfWidth);
  }
}

// The upper level of a shabby house: a closed room of boards with small windows under a roof of
// thatch, a little wider than the shop below, with a stair down the side
function buildUpperRoom(collector, variety) {
  const halfWidth = 1.8;
  const wallHeight = 2.5;
  collector.box('plank', 2 * halfWidth + 0.1, 0.12, 2 * halfWidth + 0.1, 0, 0, 0);
  collector.box('interior', 2 * halfWidth - 0.25, wallHeight - 0.2, 2 * halfWidth - 0.25, 0, 0.15, 0);
  for (let side = 0; side < 4; side++) {
    // a small window on the front and on one other side; the rest is closed
    const hasWindow = side === 0 || side === (variety < 0.5 ? 1 : 3);
    const openings = hasWindow ? [{ centre: side === 0 ? -0.5 : 0.3, bottom: 1.05, width: 0.7, height: 0.8, isArched: false }] : [];
    const offset = halfWidth - 0.04;
    const centreX = side === 1 ? offset : side === 3 ? -offset : 0;
    const centreZ = side === 0 ? offset : side === 2 ? -offset : 0;
    collector.wall('plank', 2 * halfWidth, wallHeight, 0.08, openings, centreX, 0.12, centreZ, side);
  }
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner) {
    // the posts end just under the top of the walls, so that their tops do not lie in it
    collector.box('timber', 0.18, wallHeight - 0.02, 0.18, corner[0] * halfWidth, 0.12, corner[1] * halfWidth);
  });
  // a shutter of canvas-coloured boards beside the front window
  collector.box('timber', 0.34, 0.8, 0.05, -1.05, 1.17, halfWidth + 0.03);
  // the roof: two slopes of thatch, its ridge from side to side
  collector.prism('thatch', 2 * halfWidth + 0.9, 1.25, 2 * halfWidth + 0.8, 0, wallHeight + 0.12, 0, true);
  // the stair down the side, towards the back
  const stairSide = variety < 0.5 ? -1 : 1;
  const stepCount = 10;
  for (let step = 0; step < stepCount; step++) {
    collector.box('plank', 0.75, 0.07, 0.36, stairSide * (halfWidth + 0.45), -(step + 1) * temporaryLevelHeight / stepCount, halfWidth - 0.4 - step * 0.33);
  }
  collector.box('timber', 0.08, temporaryLevelHeight * 1.05, 0.08, stairSide * (halfWidth + 0.8), -temporaryLevelHeight, halfWidth - 0.4 - (stepCount - 1) * 0.33);
  collector.box('plank', 0.75, 0.07, 0.9, stairSide * (halfWidth + 0.45), 0.02, halfWidth - 0.1);
}

// A flat sheet, width wide along x, from (backZ, backY) to (frontZ, frontY): two triangles
function slopedSheet(width, backZ, frontZ, backY, frontY) {
  const left = -width / 2;
  const right = width / 2;
  return [
    left, backY, backZ, left, frontY, frontZ, right, frontY, frontZ,
    left, backY, backZ, right, frontY, frontZ, right, backY, backZ,
  ];
}
