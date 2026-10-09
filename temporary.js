// Purpose: the temporary tier: stalls, huts and shabby houses of timber, planks, thatch and canvas.
// They are simple: every raised point is its own little building, at most two levels tall, and
// the buildings do not grow together into anything larger.
// - One level alone is a stall: open to the street, a counter under an awning, a lean-to of thatch.
// - Two levels are a shabby house. The lower level has no roof of its own; it carries the upper one
//   on stout posts and beams and stays open to the street as a shop. The upper level has no need to
//   open to the street: it is closed, with boarded walls and small windows, under a roof of thatch,
//   and is reached by a stair at the side.
// Like the houses they are built on the patch of their point (patches.js): the floor is the
// quarters of the quads round the point, the posts stand towards the middles of those quads, the
// boards, the counter and the walls run along the faces of the patch. So they are skewed with the
// grid, and two of them side by side keep to their own ground.

import { CANVAS_MATERIALS } from './parts';
import { TIER, placeHash, temporaryLevelHeight } from './volume';
import { shrinkOutline } from './topology';
import { facesOfPatch, stretchesOfFace, drawnIn, boxAlong, addSheetTriangle } from './patches';

const shareLeftToTheNeighbour = 0.06; // a hut keeps this share of its patch free on every side

export function buildTemporary(collector, volume, seed) {
  const map = volume.map;
  collector.placeAt(0, 0, 0, 0);
  volume.filledPlaces().forEach(function (place) {
    if (place.tier !== TIER.temporary) {
      return;
    }
    const point = map.points[place.pointIndex];
    const variety = placeHash(place.pointIndex, place.level, seed + 11);
    const faces = facesOfPatch(map, place.pointIndex);
    // the front: the face towards a neighbouring point with open air, chosen by the place itself so
    // that it stays put. A whole house looks one way: the upper level takes the front of the level under it.
    const frontLevel = place.level > 0 && volume.tierAt(place.pointIndex, place.level - 1) === TIER.temporary ? place.level - 1 : place.level;
    const openFaceNumbers = [];
    faces.forEach(function (face, faceNumber) {
      if (volume.tierAt(face.neighbourPoint, frontLevel) === TIER.empty) {
        openFaceNumbers.push(faceNumber);
      }
    });
    const frontVariety = placeHash(place.pointIndex, frontLevel, seed + 11);
    const frontFaceNumber = openFaceNumbers.length > 0 ? openFaceNumbers[Math.floor(frontVariety * openFaceNumbers.length)] : 0;
    const hut = {
      map: map, point: point, pointIndex: place.pointIndex, faces: faces, frontFaceNumber: frontFaceNumber,
      // the face beside the front, on one side or the other: left open in a stall, windowed in a room
      sideFaceNumber: (frontFaceNumber + (variety < 0.5 ? 1 : faces.length - 1)) % faces.length,
      bottomY: volume.bottomHeightAt(place.pointIndex, place.level),
      quarters: map.quartersOfPoint[place.pointIndex],
    };
    const carriesAnUpperLevel = volume.tierAt(place.pointIndex, place.level + 1) === TIER.temporary;
    const isUpperLevel = place.level > 0 && volume.tierAt(place.pointIndex, place.level - 1) === TIER.temporary;
    const canvas = CANVAS_MATERIALS[Math.floor(placeHash(place.pointIndex, place.level, seed + 23) * CANVAS_MATERIALS.length)];
    if (isUpperLevel) {
      // the stair comes down outside a face that looks at open ground, not the front
      hut.stairFaceNumber = -1;
      faces.forEach(function (face, faceNumber) {
        if (hut.stairFaceNumber === -1 && faceNumber !== frontFaceNumber && face.before !== null && face.after !== null &&
          volume.tierAt(face.neighbourPoint, 0) === TIER.empty && (volume.works[face.neighbourPoint] || 0) === 0) {
          hut.stairFaceNumber = faceNumber;
        }
      });
      buildUpperRoom(collector, hut);
    } else {
      buildStall(collector, hut, canvas, carriesAnUpperLevel);
    }
  });
}

// The middles of the quads round the point, drawn in: where the posts stand
function cornersOf(hut, share) {
  const corners = [];
  hut.faces.forEach(function (face) {
    if (face.before !== null) {
      corners.push(drawnIn(face.before, hut.point, share));
    }
  });
  return corners;
}

// A post at a place, square, turned towards the point
function post(collector, hut, place, thickness, bottomY, height) {
  const length = Math.hypot(hut.point.x - place[0], hut.point.z - place[1]) || 1;
  boxAlong(collector, hut.map, 'timber', place[0], place[1], (hut.point.x - place[0]) / length, (hut.point.z - place[1]) / length, thickness, thickness, bottomY, height);
}

// The ground level, open to the street. Alone it is a stall under a lean-to; under an upper level
// it is the shop of a house, with stouter posts, beams to carry the floor above and no roof.
function buildStall(collector, hut, canvas, carriesAnUpperLevel) {
  const point = hut.point;
  const bottomY = hut.bottomY;
  const postHeight = carriesAnUpperLevel ? temporaryLevelHeight - 0.25 : 2.7;
  const postThickness = carriesAnUpperLevel ? 0.24 : 0.16;
  hut.quarters.forEach(function (quarter) {
    collector.polygonPrism('plank', shrinkOutline(quarter.outline, point.x, point.z, shareLeftToTheNeighbour - 0.02), bottomY, 0.1);
  });
  const corners = cornersOf(hut, shareLeftToTheNeighbour + 0.06);
  corners.forEach(function (corner) {
    post(collector, hut, corner, postThickness, bottomY, postHeight);
  });
  // boarded on every face but the front (and, in a stall, the one beside it), with gaps between the boards
  const boardCount = carriesAnUpperLevel ? 7 : 5;
  const boardedHeight = postHeight - (carriesAnUpperLevel ? 0.1 : 0.5);
  hut.faces.forEach(function (face, faceNumber) {
    if (faceNumber === hut.frontFaceNumber || (!carriesAnUpperLevel && faceNumber === hut.sideFaceNumber && hut.faces.length > 2)) {
      return;
    }
    stretchesOfFace(face).forEach(function (stretch) {
      const start = drawnIn(stretch[0], point, shareLeftToTheNeighbour + 0.06);
      const end = drawnIn(stretch[1], point, shareLeftToTheNeighbour + 0.06);
      for (let board = 0; board < boardCount; board++) {
        collector.wallBetween('plank', start[0], start[1], end[0], end[1], bottomY + 0.15 + board * boardedHeight / boardCount, boardedHeight / boardCount - 0.06, 0.06, []);
      }
    });
  });
  // the counter with wares along the front, and an awning of canvas over it
  const front = hut.faces[hut.frontFaceNumber];
  const awningTop = bottomY + (carriesAnUpperLevel ? 2.9 : postHeight - 0.25);
  const awning = [];
  stretchesOfFace(front).forEach(function (stretch, stretchNumber) {
    const counterStart = drawnIn(stretch[0], point, 0.3);
    const counterEnd = drawnIn(stretch[1], point, 0.3);
    collector.wallBetween('plank', counterStart[0], counterStart[1], counterEnd[0], counterEnd[1], bottomY, 0.9, 0.5, []);
    const waresX = (counterStart[0] + counterEnd[0]) / 2;
    const waresZ = (counterStart[1] + counterEnd[1]) / 2;
    const length = Math.hypot(counterEnd[0] - counterStart[0], counterEnd[1] - counterStart[1]) || 1;
    boxAlong(collector, hut.map, stretchNumber === 0 ? canvas : 'thatch', waresX, waresZ, (counterEnd[0] - counterStart[0]) / length, (counterEnd[1] - counterStart[1]) / length,
      Math.min(0.5, length * 0.5), 0.3, bottomY + 0.9, stretchNumber === 0 ? 0.25 : 0.2);
    const eaveStart = drawnIn(stretch[0], point, shareLeftToTheNeighbour);
    const eaveEnd = drawnIn(stretch[1], point, shareLeftToTheNeighbour);
    const outerStart = [eaveStart[0] + front.towards.x * 1.3, eaveStart[1] + front.towards.z * 1.3];
    const outerEnd = [eaveEnd[0] + front.towards.x * 1.3, eaveEnd[1] + front.towards.z * 1.3];
    addSheetTriangle(awning, [eaveStart[0], awningTop, eaveStart[1]], [eaveEnd[0], awningTop, eaveEnd[1]], [outerEnd[0], awningTop - 0.7, outerEnd[1]], true);
    addSheetTriangle(awning, [eaveStart[0], awningTop, eaveStart[1]], [outerEnd[0], awningTop - 0.7, outerEnd[1]], [outerStart[0], awningTop - 0.7, outerStart[1]], true);
    // a thin post under each outer corner of the awning
    const outerCorner = stretch[0] === front.middle ? outerEnd : outerStart;
    boxAlong(collector, hut.map, 'timber', outerCorner[0] - front.towards.x * 0.06, outerCorner[1] - front.towards.z * 0.06, front.towards.x, front.towards.z, 0.08, 0.08, bottomY, awningTop - 0.7 - bottomY);
  });
  collector.addTriangles(canvas, awning);
  if (carriesAnUpperLevel) {
    // the beams that carry the floor above: from the point out to every post
    corners.forEach(function (corner) {
      collector.wallBetween('timber', point.x, point.z, corner[0], corner[1], bottomY + postHeight, 0.25, 0.2, []);
    });
  } else {
    // a lean-to of thatch over the whole patch and a little beyond, higher at the back
    const thatch = [];
    const heightAt = function (place) {
      const distanceToTheFront = (place[0] - point.x) * front.towards.x + (place[1] - point.z) * front.towards.z;
      return bottomY + postHeight + 0.4 - 0.2 * distanceToTheFront;
    };
    hut.quarters.forEach(function (quarter) {
      const outline = shrinkOutline(quarter.outline, point.x, point.z, shareLeftToTheNeighbour - 0.2).map(function (place) {
        return [place[0], heightAt(place), place[1]];
      });
      addSheetTriangle(thatch, outline[0], outline[1], outline[2], true);
      addSheetTriangle(thatch, outline[0], outline[2], outline[3], true);
    });
    collector.addTriangles('thatch', thatch);
  }
}

// The upper level of a shabby house: a closed room of boards with small windows under a roof of
// thatch, with a stair down the side
function buildUpperRoom(collector, hut) {
  const point = hut.point;
  const bottomY = hut.bottomY;
  const wallHeight = 2.5;
  hut.quarters.forEach(function (quarter) {
    collector.polygonPrism('plank', shrinkOutline(quarter.outline, point.x, point.z, shareLeftToTheNeighbour - 0.05), bottomY, 0.12);
    collector.polygonPrism('interior', shrinkOutline(quarter.outline, point.x, point.z, shareLeftToTheNeighbour + 0.08), bottomY + 0.15, wallHeight - 0.2);
  });
  // a small window on the front and on the face beside it; the rest is closed
  hut.faces.forEach(function (face, faceNumber) {
    stretchesOfFace(face).forEach(function (stretch, stretchNumber) {
      const start = drawnIn(stretch[0], point, shareLeftToTheNeighbour);
      const end = drawnIn(stretch[1], point, shareLeftToTheNeighbour);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const hasWindow = stretchNumber === 0 && length > 1.3 && (faceNumber === hut.frontFaceNumber || faceNumber === hut.sideFaceNumber);
      collector.wallBetween('plank', start[0], start[1], end[0], end[1], bottomY + 0.12, wallHeight, 0.08,
        hasWindow ? [{ centre: 0, bottom: 1.05, width: 0.7, height: 0.8, isArched: false }] : []);
    });
  });
  cornersOf(hut, shareLeftToTheNeighbour).forEach(function (corner) {
    // the posts end just under the top of the walls, so that their tops do not lie in it
    post(collector, hut, corner, 0.18, bottomY + 0.12, wallHeight - 0.02);
  });
  // the roof: thatch from the eaves, a little beyond the walls, up to a peak over the point
  const thatch = [];
  const peak = [point.x, bottomY + 0.12 + wallHeight + 1.25, point.z];
  const eavesY = bottomY + 0.12 + wallHeight - 0.05;
  hut.faces.forEach(function (face) {
    stretchesOfFace(face).forEach(function (stretch) {
      const start = drawnIn(stretch[0], point, shareLeftToTheNeighbour - 0.22);
      const end = drawnIn(stretch[1], point, shareLeftToTheNeighbour - 0.22);
      addSheetTriangle(thatch, peak, [start[0], eavesY, start[1]], [end[0], eavesY, end[1]], true);
    });
  });
  collector.addTriangles('thatch', thatch);
  // the stair down the outside of a face, from one of its ends to the other
  if (hut.stairFaceNumber !== -1) {
    const face = hut.faces[hut.stairFaceNumber];
    const top = drawnIn(face.before, point, shareLeftToTheNeighbour);
    const bottom = drawnIn(face.after, point, shareLeftToTheNeighbour);
    const length = Math.hypot(bottom[0] - top[0], bottom[1] - top[1]) || 1;
    const alongX = (bottom[0] - top[0]) / length;
    const alongZ = (bottom[1] - top[1]) / length;
    const stepCount = 10;
    const stepDepth = Math.min(0.33, (length - 0.9) / stepCount);
    const placeAlong = function (distance) {
      return [top[0] + alongX * distance + face.towards.x * 0.5, top[1] + alongZ * distance + face.towards.z * 0.5];
    };
    const landing = placeAlong(0.45);
    boxAlong(collector, hut.map, 'plank', landing[0], landing[1], alongX, alongZ, 0.9, 0.75, bottomY + 0.02, 0.07);
    for (let step = 0; step < stepCount; step++) {
      const tread = placeAlong(0.9 + (step + 0.5) * stepDepth);
      boxAlong(collector, hut.map, 'plank', tread[0], tread[1], alongX, alongZ, stepDepth + 0.03, 0.75, bottomY - (step + 1) * temporaryLevelHeight / stepCount, 0.07);
    }
    const foot = placeAlong(0.9 + stepCount * stepDepth);
    boxAlong(collector, hut.map, 'timber', foot[0] + face.towards.x * 0.35, foot[1] + face.towards.z * 0.35, alongX, alongZ, 0.08, 0.08, bottomY - temporaryLevelHeight, temporaryLevelHeight * 1.05);
  }
}
