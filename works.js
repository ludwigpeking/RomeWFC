// Purpose: the works of the city that are not buildings of blocks: the wall with its towers and
// gates, the aqueduct, the fountains. They lie on the points of the grid like everything else
// (volume.works tells what lies on each point).
//
// - The wall stands on a ring of points of the grid (city.js), but it is drawn as a line of its
//   own through them (volume.wallStyle, one of WALL_STYLES): a smooth curve or straight runs
//   between corners, so that it does not zigzag with the grid. It is a band of brick 6 m high and
//   wallThickness wide along that line, with merlons along its outer edge only (towards the town
//   it is a plain walk), a square tower now and then along it and at its corners.
//   The style 'grid' instead builds it on the patches of its points, as a house is (patches.js):
//   each point of wall is the whole ground of the quarters round it, skewed with the grid.
// - A gate stands on the line where its point is: a gatehouse of stone across the line, a tall
//   arch through it, a tower at each end; the wall begins again beyond the towers.
// - The aqueduct is narrow (2 m) and runs from point to point along the sides of the quads.
// - The aqueduct: of rough stone, an arcade that carries its channel 8 m above the ground. Its
//   piers stand between the points and its arches over them, so that a street passes under an
//   arch. Where it turns, branches or ends it stands on a pier at the point itself, and the water
//   runs on over the pier: the channels open into a round of water there.
// - The fountain: a long basin of marble along the back row of its square of three by two points,
//   round the last pier of the aqueduct, the water falling from the pier into it on three sides;
//   a marble post at each end of the basin, a step before it, the square paved. (A fountain of
//   one point, from before 2026-10-13: a round basin round the pier.)

import { cellSize } from './parts';
import { WORK } from './volume';
import { shrinkOutline } from './topology';
import { facesOfPatch, stretchesOfFace, drawnIn, prismOver, boxAlong } from './patches';

const wallHeight = 6;
const wallThickness = 2.4;
const towerHeight = 9;
const towerSize = 3.2;
const metresBetweenTowers = 32;     // along a straight run
const gateHeight = 10;              // over the passage
const gateTowerHeight = 12;         // on either side of it
const gateArchHeight = 6.2;
const widestGateArch = 2.8;
const gateDepth = 4.2;              // across the wall
const gateArchLength = 3.4;         // along it
const gateTowerSize = 2.8;
const metresBetweenMerlons = 1.3;

// How the line of the wall is drawn through the ring of its points:
// - grid: on the patches of the points, skewed with the grid (no line at all)
// - throughEveryPoint: a Catmull-Rom spline through every point of the ring
// - smoothed: the ring smoothed first (each point the mean of its neighbours three to either
//   side), then the spline through the smoothed points
// - hull: straight runs between the corners of the convex hull of the ring
// - hullRounded: the hull with its corners rounded (Chaikin's corner cutting, three rounds)
export const WALL_STYLES = ['grid', 'throughEveryPoint', 'smoothed', 'hull', 'hullRounded'];
export const DEFAULT_WALL_STYLE = 'smoothed';

// ---------------------------------------------------------------------------
// Lines in plan: closed polygons as [[x, z], ...]
// ---------------------------------------------------------------------------
// the places of a ring in order round its middle
function orderedRoundTheMiddle(places) {
  let middleX = 0;
  let middleZ = 0;
  places.forEach(function (place) { middleX += place[0] / places.length; middleZ += place[1] / places.length; });
  return places.slice().sort(function (first, second) {
    return Math.atan2(first[1] - middleZ, first[0] - middleX) - Math.atan2(second[1] - middleZ, second[0] - middleX);
  });
}
// each place the mean of the places so many to either side of it
function smoothedByWindow(polygon, halfWindow) {
  const count = polygon.length;
  return polygon.map(function (place, index) {
    let sumX = 0;
    let sumZ = 0;
    for (let offset = -halfWindow; offset <= halfWindow; offset++) {
      const other = polygon[(index + offset + count * 4) % count];
      sumX += other[0];
      sumZ += other[1];
    }
    return [sumX / (2 * halfWindow + 1), sumZ / (2 * halfWindow + 1)];
  });
}
// Chaikin's corner cutting: each side keeps its quarter and three-quarter points
function cornersCut(polygon, rounds) {
  let result = polygon;
  for (let round = 0; round < rounds; round++) {
    const next = [];
    result.forEach(function (place, index) {
      const following = result[(index + 1) % result.length];
      next.push([place[0] * 0.75 + following[0] * 0.25, place[1] * 0.75 + following[1] * 0.25]);
      next.push([place[0] * 0.25 + following[0] * 0.75, place[1] * 0.25 + following[1] * 0.75]);
    });
    result = next;
  }
  return result;
}
// the convex hull of places, in order round it
function hullOfPlaces(places) {
  const sorted = places.slice().sort(function (first, second) { return first[0] === second[0] ? first[1] - second[1] : first[0] - second[0]; });
  function turn(origin, first, second) {
    return (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);
  }
  const lower = [];
  sorted.forEach(function (place) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], place) <= 0) {
      lower.pop();
    }
    lower.push(place);
  });
  const upper = [];
  sorted.slice().reverse().forEach(function (place) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], place) <= 0) {
      upper.pop();
    }
    upper.push(place);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// a closed Catmull-Rom spline through the places, as a dense polyline
function splineThrough(polygon, stepLength) {
  const count = polygon.length;
  const line = [];
  for (let index = 0; index < count; index++) {
    const before = polygon[(index + count - 1) % count];
    const here = polygon[index];
    const next = polygon[(index + 1) % count];
    const after = polygon[(index + 2) % count];
    const pieces = Math.max(2, Math.ceil(Math.hypot(next[0] - here[0], next[1] - here[1]) / stepLength));
    for (let piece = 0; piece < pieces; piece++) {
      const share = piece / pieces;
      const share2 = share * share;
      const share3 = share2 * share;
      line.push([0, 1].map(function (axis) {
        return 0.5 * (2 * here[axis] + (next[axis] - before[axis]) * share + (2 * before[axis] - 5 * here[axis] + 4 * next[axis] - after[axis]) * share2 +
          (3 * here[axis] - before[axis] - 3 * next[axis] + after[axis]) * share3);
      }));
    }
  }
  return line;
}
// a closed polyline laid out again with a place every stepLength along it
function resampled(polygon, stepLength) {
  const count = polygon.length;
  let totalLength = 0;
  polygon.forEach(function (place, index) {
    const next = polygon[(index + 1) % count];
    totalLength += Math.hypot(next[0] - place[0], next[1] - place[1]);
  });
  const placeCount = Math.max(4, Math.round(totalLength / stepLength));
  const step = totalLength / placeCount;
  const line = [];
  let index = 0;
  let distanceIntoSide = 0;
  for (let placeNumber = 0; placeNumber < placeCount; placeNumber++) {
    let here = polygon[index % count];
    let next = polygon[(index + 1) % count];
    let sideLength = Math.hypot(next[0] - here[0], next[1] - here[1]);
    while (distanceIntoSide > sideLength && index < count * 2) {
      distanceIntoSide -= sideLength;
      index++;
      here = polygon[index % count];
      next = polygon[(index + 1) % count];
      sideLength = Math.hypot(next[0] - here[0], next[1] - here[1]);
    }
    const share = sideLength > 0 ? distanceIntoSide / sideLength : 0;
    line.push([here[0] + (next[0] - here[0]) * share, here[1] + (next[1] - here[1]) * share]);
    distanceIntoSide += step;
  }
  return line;
}
function liesInPolygon(polygon, place) {
  let isInside = false;
  for (let index = 0, before = polygon.length - 1; index < polygon.length; before = index++) {
    const first = polygon[index];
    const second = polygon[before];
    if ((first[1] > place[1]) !== (second[1] > place[1]) && place[0] < (second[0] - first[0]) * (place[1] - first[1]) / (second[1] - first[1]) + first[0]) {
      isInside = !isInside;
    }
  }
  return isInside;
}
function nearestPlaceNumber(line, place) {
  let nearest = 0;
  let leastDistance = Infinity;
  line.forEach(function (linePlace, placeNumber) {
    const distance = Math.hypot(linePlace[0] - place[0], linePlace[1] - place[1]);
    if (distance < leastDistance) {
      leastDistance = distance;
      nearest = placeNumber;
    }
  });
  return nearest;
}
const aqueductHeight = 8;
const aqueductThickness = 1.2;             // (2 until 2026-10-12: the author wants it slighter, to suit the little city)
const channelWallThickness = 0.3;

export function buildWorks(collector, volume) {
  const map = volume.map;
  const wallStyle = WALL_STYLES.indexOf(volume.wallStyle) >= 0 ? volume.wallStyle : DEFAULT_WALL_STYLE;
  collector.placeAt(0, 0, 0, 0);
  function has(pointIndex, work) {
    return (volume.works[pointIndex] & work) !== 0;
  }
  // the neighbours of a point that carry the same kind of work
  function neighboursWith(pointIndex, work) {
    return Array.from(map.sideNeighboursOfPoint[pointIndex]).filter(function (neighbourPoint) {
      return has(neighbourPoint, work);
    });
  }
  // a box in plan turned any way: its middle, the direction of its length, its length and width
  function turnedBox(materialName, middleX, middleZ, alongX, alongZ, length, width, bottomY, height) {
    const halfLength = length / 2;
    const halfWidth = width / 2;
    const corners = [[-halfLength, -halfWidth], [halfLength, -halfWidth], [halfLength, halfWidth], [-halfLength, halfWidth]].map(function (offset) {
      return [middleX + offset[0] * alongX - offset[1] * alongZ, middleZ + offset[0] * alongZ + offset[1] * alongX];
    });
    collector.polygonPrism(materialName, corners, bottomY, height);
  }
  function directionBetween(from, to) {
    const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    return { x: (to.x - from.x) / length, z: (to.z - from.z) / length, length: length };
  }
  // the fountains with their squares, by the point the aqueduct ends at; and every point of a square
  const fountainAtEnd = new Map();
  const isOnASquare = new Set();
  (volume.fountains || []).forEach(function (fountain) {
    fountainAtEnd.set(fountain.endPoint, fountain);
    fountain.pointIndices.forEach(function (pointIndex) { isOnASquare.add(pointIndex); });
  });
  // ---- a fountain with its square: the basin along the back row, round the pier at its middle
  function buildFountainWithSquare(fountain) {
    const end = map.points[fountain.endPoint];
    const backFirst = map.points[fountain.backRow[0]];
    const backLast = map.points[fountain.backRow[fountain.backRow.length - 1]];
    const frontMiddle = map.points[fountain.frontRow[1]];
    const along = directionBetween(backFirst, backLast); // along the long edge
    const front = directionBetween(end, frontMiddle);    // from the back row to the front row
    // the square paved: the whole patch, half a cell beyond its points
    turnedBox('stoneShade', (end.x + frontMiddle.x) / 2, (end.z + frontMiddle.z) / 2, along.x, along.z,
      along.length + cellSize, front.length + cellSize, 0, 0.12);
    // the basin: its back edge just behind the pier, the water reaching well before it
    const basinLength = along.length + 1.6;
    const basinWidth = 3.2;
    const basinForward = basinWidth / 2 - aqueductThickness / 2 - 0.6; // the pier stands 0.6 m before the back wall of the basin
    const basinX = end.x + front.x * basinForward;
    const basinZ = end.z + front.z * basinForward;
    // the body of the basin, a rim of four bars round its top, the water within the rim (a
    // little below it: the rim and the water fought where their tops met, 2026-10-13)
    turnedBox('stone', basinX, basinZ, along.x, along.z, basinLength, basinWidth, 0.12, 0.7);
    const rimLength = basinLength + 0.24;
    const rimWidth = basinWidth + 0.24;
    const rimBar = 0.32;
    [-1, 1].forEach(function (side) {
      turnedBox('stoneShade', basinX + front.x * side * (rimWidth / 2 - rimBar / 2), basinZ + front.z * side * (rimWidth / 2 - rimBar / 2),
        along.x, along.z, rimLength, rimBar, 0.82, 0.24);
      turnedBox('stoneShade', basinX + along.x * side * (rimLength / 2 - rimBar / 2), basinZ + along.z * side * (rimLength / 2 - rimBar / 2),
        along.x, along.z, rimBar, rimWidth - 2 * rimBar, 0.82, 0.24);
    });
    turnedBox('water', basinX, basinZ, along.x, along.z, rimLength - 2 * rimBar, rimWidth - 2 * rimBar, 0.8, 0.18);
    // a step before the basin, the length of it
    turnedBox('stone', basinX + front.x * (basinWidth / 2 + 0.45), basinZ + front.z * (basinWidth / 2 + 0.45), along.x, along.z, basinLength + 0.9, 0.9, 0.12, 0.2);
    // the water falling from the channel into the basin: to the front of the pier and to each side, out of spouts of marble
    [{ x: front.x, z: front.z }, { x: along.x, z: along.z }, { x: -along.x, z: -along.z }].forEach(function (side) {
      const reach = aqueductThickness / 2 + 0.38;
      turnedBox('water', end.x + side.x * reach, end.z + side.z * reach, 1, 0, 0.2, 0.2, 1.0, aqueductHeight - 2.5);
      turnedBox('stone', end.x + side.x * (reach - 0.05), end.z + side.z * (reach - 0.05), 1, 0, 0.5, 0.5, aqueductHeight - 1.6, 0.3);
    });
    // a post of marble at each end of the basin, a ball on it
    [-1, 1].forEach(function (endSign) {
      const postX = basinX + along.x * endSign * (basinLength / 2 + 0.5);
      const postZ = basinZ + along.z * endSign * (basinLength / 2 + 0.5);
      collector.cylinder('stone', 0.26, 0.32, 1.5, postX, 0.12, postZ, 12);
      collector.cylinder('stoneShade', 0.36, 0.36, 0.12, postX, 1.62, postZ, 12);
      collector.cylinder('stone', 0.05, 0.3, 0.5, postX, 1.74, postZ, 12);
    });
  }
  // whether a point lies on a straight run: two neighbours, nearly opposite each other
  function runsStraightThrough(point, neighbourPoints) {
    if (neighbourPoints.length !== 2) {
      return false;
    }
    const first = directionBetween(point, map.points[neighbourPoints[0]]);
    const second = directionBetween(point, map.points[neighbourPoints[1]]);
    return first.x * second.x + first.z * second.z < -0.85;
  }
  // The middle of the town (where its first settler stopped; without a settlement, the middle of
  // the map): what looks away from it looks out of the town
  const townMiddle = volume.townMiddle || { x: (map.bounds.minX + map.bounds.maxX) / 2, z: (map.bounds.minZ + map.bounds.maxZ) / 2 };
  // whether a line in plan, seen from a point of the wall, lies on its outer side
  function looksOutOfTheTown(point, start, end) {
    const outwardX = point.x - townMiddle.x;
    const outwardZ = point.z - townMiddle.z;
    const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
    const towardsX = (start[0] + end[0]) / 2 - point.x;
    const towardsZ = (start[1] + end[1]) / 2 - point.z;
    const towardsLength = Math.hypot(towardsX, towardsZ) || 1;
    return (towardsX * outwardX + towardsZ * outwardZ) / (towardsLength * outwardLength) > 0.25;
  }
  // merlons along a line in plan, standing on a height
  function merlonsAlong(materialName, start, end, bottomY) {
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length < 0.5) {
      return;
    }
    const alongX = (end[0] - start[0]) / length;
    const alongZ = (end[1] - start[1]) / length;
    const merlonCount = Math.max(1, Math.round(length / 1.3));
    for (let merlon = 0; merlon < merlonCount; merlon++) {
      const distance = (merlon + 0.5) * length / merlonCount;
      boxAlong(collector, map, materialName, start[0] + alongX * distance, start[1] + alongZ * distance, alongX, alongZ, 0.65, 0.4, bottomY, 0.7);
    }
  }
  // a tower on the patch of a point: the patch a little wider, higher, merlons round its top
  function towerOnPatch(materialName, pointIndex, faces, height) {
    const point = map.points[pointIndex];
    map.quartersOfPoint[pointIndex].forEach(function (quarter) {
      collector.polygonPrism(materialName, shrinkOutline(quarter.outline, point.x, point.z, -0.08), 0, height);
      collector.polygonPrism('stoneShade', shrinkOutline(quarter.outline, point.x, point.z, -0.14), height, 0.25);
    });
    faces.forEach(function (face) {
      if (has(face.neighbourPoint, WORK.wall | WORK.gate)) {
        return; // (towards more wall: no parapet across the walk)
      }
      stretchesOfFace(face).forEach(function (stretch) {
        if (looksOutOfTheTown(point, stretch[0], stretch[1])) {
          merlonsAlong(materialName, drawnIn(stretch[0], point, 0.02), drawnIn(stretch[1], point, 0.02), height + 0.25);
        }
      });
    });
  }
  // The ground between a chain of places and the straight line from its first to its last, as
  // convex pieces: each from two places of the chain to their feet on the line
  function piecesUnderChain(chain) {
    const first = chain[0];
    const last = chain[chain.length - 1];
    const lineLength = Math.hypot(last[0] - first[0], last[1] - first[1]) || 1;
    const lineX = (last[0] - first[0]) / lineLength;
    const lineZ = (last[1] - first[1]) / lineLength;
    const feet = chain.map(function (place) {
      const distance = Math.max(0, Math.min(lineLength, (place[0] - first[0]) * lineX + (place[1] - first[1]) * lineZ));
      return [first[0] + lineX * distance, first[1] + lineZ * distance];
    });
    const pieces = [];
    for (let index = 0; index + 1 < chain.length; index++) {
      const piece = [chain[index], chain[index + 1], feet[index + 1], feet[index]].filter(function (place, placeNumber, places) {
        const before = places[(placeNumber + places.length - 1) % places.length];
        return Math.hypot(place[0] - before[0], place[1] - before[1]) > 0.01;
      });
      if (piece.length >= 3) {
        pieces.push(piece);
      }
    }
    return pieces;
  }
  // A gate on the patch of a point. Returns false where the patch has no two faces to pass through.
  function gateOnPatch(pointIndex, faces) {
    const point = map.points[pointIndex];
    // the passage: from one face that looks out of the wall to the one most nearly opposite it
    const openFaceNumbers = [];
    faces.forEach(function (face, faceNumber) {
      if (!has(face.neighbourPoint, WORK.wall | WORK.gate) && face.before !== null && face.after !== null) {
        openFaceNumbers.push(faceNumber);
      }
    });
    let passage = null;
    openFaceNumbers.forEach(function (firstNumber) {
      openFaceNumbers.forEach(function (secondNumber) {
        const facing = faces[firstNumber].towards.x * faces[secondNumber].towards.x + faces[firstNumber].towards.z * faces[secondNumber].towards.z;
        if (firstNumber < secondNumber && (passage === null || facing < passage.facing)) {
          passage = { first: firstNumber, second: secondNumber, facing: facing };
        }
      });
    });
    if (passage === null || passage.facing > 0.35) {
      return false;
    }
    // the outline of the patch, round; on the two faces of the passage it runs straight, and the
    // jambs of the arch are places on it
    const outline = [];
    const jambs = {}; // face number -> { before: place number, after: place number, width }
    faces.forEach(function (face, faceNumber) {
      if (faceNumber === passage.first || faceNumber === passage.second) {
        const length = Math.hypot(face.after[0] - face.before[0], face.after[1] - face.before[1]);
        const alongX = (face.after[0] - face.before[0]) / length;
        const alongZ = (face.after[1] - face.before[1]) / length;
        const archWidth = Math.max(1.2, Math.min(widestGateArch, length - 1.0));
        const middle = [(face.before[0] + face.after[0]) / 2, (face.before[1] + face.after[1]) / 2];
        outline.push(face.before);
        jambs[faceNumber] = { before: outline.length, after: outline.length + 1, width: archWidth, alongX: alongX, alongZ: alongZ, middle: middle };
        outline.push([middle[0] - alongX * archWidth / 2, middle[1] - alongZ * archWidth / 2]);
        outline.push([middle[0] + alongX * archWidth / 2, middle[1] + alongZ * archWidth / 2]);
      } else {
        if (face.before !== null) {
          outline.push(face.before);
        }
        outline.push(face.middle);
      }
    });
    function chainBetween(fromPlace, toPlace) {
      const chain = [];
      for (let placeNumber = fromPlace; ; placeNumber = (placeNumber + 1) % outline.length) {
        chain.push(outline[placeNumber]);
        if (placeNumber === toPlace) {
          return chain;
        }
      }
    }
    // the two towers: the ground on either side of the passage
    [chainBetween(jambs[passage.first].after, jambs[passage.second].before), chainBetween(jambs[passage.second].after, jambs[passage.first].before)].forEach(function (chain) {
      piecesUnderChain(chain).forEach(function (piece) {
        prismOver(collector, map, 'stone', piece, 0, gateTowerHeight);
        prismOver(collector, map, 'stoneShade', piece, gateTowerHeight, 0.25);
      });
      for (let index = 0; index + 1 < chain.length; index++) {
        if (looksOutOfTheTown(point, chain[index], chain[index + 1])) {
          merlonsAlong('stone', chain[index], chain[index + 1], gateTowerHeight + 0.25);
        }
      }
    });
    // over the passage: the gatehouse from the crown of the arches up, and an arch on each face
    const overThePassage = [outline[jambs[passage.first].before], outline[jambs[passage.first].after], outline[jambs[passage.second].before], outline[jambs[passage.second].after]];
    prismOver(collector, map, 'stone', overThePassage, gateArchHeight, gateHeight - gateArchHeight);
    prismOver(collector, map, 'stoneShade', overThePassage, gateHeight, 0.35);
    [passage.first, passage.second].forEach(function (faceNumber) {
      const jamb = jambs[faceNumber];
      const reach = jamb.width / 2 + 0.45;
      collector.wallBetween('stone', jamb.middle[0] - jamb.alongX * reach, jamb.middle[1] - jamb.alongZ * reach, jamb.middle[0] + jamb.alongX * reach, jamb.middle[1] + jamb.alongZ * reach,
        0, gateArchHeight + 0.9, 0.7, [{ centre: 0, bottom: 0, width: jamb.width, height: gateArchHeight, isArched: true }]);
      if (looksOutOfTheTown(point, outline[jamb.before], outline[jamb.after])) {
        merlonsAlong('stone', outline[jamb.before], outline[jamb.after], gateHeight + 0.35);
      }
    });
    return true;
  }

  // a tower: a square shaft with merlons round its top, turned the way the wall runs
  function tower(materialName, centreX, centreZ, alongX, alongZ, height, size) {
    turnedBox(materialName, centreX, centreZ, alongX, alongZ, size, size, 0, height);
    turnedBox('stoneShade', centreX, centreZ, alongX, alongZ, size + 0.3, size + 0.3, height, 0.25);
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (place) {
      const offsetAlong = place[0] * (size / 2 - 0.3);
      const offsetAcross = place[1] * (size / 2 - 0.3);
      turnedBox(materialName, centreX + offsetAlong * alongX - offsetAcross * alongZ, centreZ + offsetAlong * alongZ + offsetAcross * alongX,
        alongX, alongZ, 0.6, 0.6, height + 0.25, 0.7);
    });
  }

  // ---- the wall as a line of its own through each ring of its points
  if (wallStyle !== 'grid') {
    // the rings: the wall and gate points that hang together (across a quad counts)
    const isSeen = new Uint8Array(volume.pointCount);
    for (let startPoint = 0; startPoint < volume.pointCount; startPoint++) {
      if (!has(startPoint, WORK.wall | WORK.gate) || isSeen[startPoint]) {
        continue;
      }
      const ring = [];
      const pending = [startPoint];
      isSeen[startPoint] = 1;
      while (pending.length > 0) {
        const pointIndex = pending.pop();
        ring.push(pointIndex);
        map.quadNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
          if (has(neighbourPoint, WORK.wall | WORK.gate) && !isSeen[neighbourPoint]) {
            isSeen[neighbourPoint] = 1;
            pending.push(neighbourPoint);
          }
        });
      }
      if (ring.length >= 6) {
        buildWallRing(ring);
      } else {
        ring.forEach(function (pointIndex) { buildWallOnPatch(pointIndex); });
      }
    }
  }

  function buildWallRing(ring) {
    const ringPlaces = orderedRoundTheMiddle(ring.map(function (pointIndex) { return [map.points[pointIndex].x, map.points[pointIndex].z]; }));
    let line = null;
    let cornerPlaces = []; // where towers stand for certain
    if (wallStyle === 'throughEveryPoint') {
      line = resampled(splineThrough(ringPlaces, 1), metresBetweenMerlons);
    } else if (wallStyle === 'smoothed') {
      line = resampled(splineThrough(smoothedByWindow(ringPlaces, 3), 1), metresBetweenMerlons);
    } else if (wallStyle === 'hull') {
      cornerPlaces = hullOfPlaces(ringPlaces);
      line = resampled(cornerPlaces, metresBetweenMerlons);
    } else {
      cornerPlaces = hullOfPlaces(ringPlaces);
      line = resampled(cornersCut(cornerPlaces, 3), metresBetweenMerlons);
    }
    const count = line.length;
    // the direction along the line at each place, and the normal that looks out of the ring
    const along = line.map(function (place, placeNumber) {
      const before = line[(placeNumber + count - 1) % count];
      const next = line[(placeNumber + 1) % count];
      const length = Math.hypot(next[0] - before[0], next[1] - before[1]) || 1;
      return [(next[0] - before[0]) / length, (next[1] - before[1]) / length];
    });
    let outwardSign = 1;
    if (liesInPolygon(line, [line[0][0] - along[0][1] * 0.5, line[0][1] + along[0][0] * 0.5])) {
      outwardSign = -1;
    }
    const outward = along.map(function (direction) { return [-direction[1] * outwardSign, direction[0] * outwardSign]; });
    // the gates: where the line passes nearest their points; nothing of the wall near them
    const gatePlaceNumbers = ring.filter(function (pointIndex) { return has(pointIndex, WORK.gate); }).map(function (pointIndex) {
      return nearestPlaceNumber(line, [map.points[pointIndex].x, map.points[pointIndex].z]);
    });
    const reachOfAGate = gateArchLength / 2 + gateTowerSize - 0.4;
    function ringDistance(first, second) {
      const apart = Math.abs(first - second);
      return Math.min(apart, count - apart) * metresBetweenMerlons;
    }
    function isNearAGate(placeNumber, reach) {
      return gatePlaceNumbers.some(function (gateNumber) { return ringDistance(placeNumber, gateNumber) < reach; });
    }
    // the band of the wall: a piece from each place to the next, between the two edges
    const halfThickness = wallThickness / 2;
    for (let placeNumber = 0; placeNumber < count; placeNumber++) {
      const nextNumber = (placeNumber + 1) % count;
      if (isNearAGate(placeNumber, reachOfAGate) && isNearAGate(nextNumber, reachOfAGate)) {
        continue;
      }
      const edge = function (number, side) {
        return [line[number][0] + outward[number][0] * side * halfThickness, line[number][1] + outward[number][1] * side * halfThickness];
      };
      prismOver(collector, map, 'brick', [edge(placeNumber, -1), edge(nextNumber, -1), edge(nextNumber, 1), edge(placeNumber, 1)], 0, wallHeight);
      // a merlon on the outer edge
      if (!isNearAGate(placeNumber, reachOfAGate + 0.6)) {
        const merlon = edge(placeNumber, 1);
        turnedBox('brick', merlon[0] - outward[placeNumber][0] * 0.25, merlon[1] - outward[placeNumber][1] * 0.25, along[placeNumber][0], along[placeNumber][1], 0.65, 0.4, wallHeight, 0.7);
      }
    }
    // the towers: at the corners, and along the runs between them every so many metres
    const towerPlaceNumbers = cornerPlaces.map(function (corner) { return nearestPlaceNumber(line, corner); });
    if (towerPlaceNumbers.length === 0) {
      towerPlaceNumbers.push(0);
    }
    const isATower = new Uint8Array(count);
    towerPlaceNumbers.forEach(function (placeNumber) { isATower[placeNumber] = 1; });
    let metresSinceATower = 0;
    for (let step = 0; step < count * 2; step++) {
      const placeNumber = (towerPlaceNumbers[0] + step) % count;
      if (isATower[placeNumber]) {
        metresSinceATower = 0;
        continue;
      }
      metresSinceATower += metresBetweenMerlons;
      if (metresSinceATower >= metresBetweenTowers && !isNearAGate(placeNumber, reachOfAGate + towerSize)) {
        isATower[placeNumber] = 1;
        metresSinceATower = 0;
      }
    }
    for (let placeNumber = 0; placeNumber < count; placeNumber++) {
      if (isATower[placeNumber] && !isNearAGate(placeNumber, reachOfAGate + towerSize / 2)) {
        tower('brick', line[placeNumber][0], line[placeNumber][1], along[placeNumber][0], along[placeNumber][1], towerHeight, towerSize);
      }
    }
    // the gates: a gatehouse across the line, its arch through it, a tower at each end
    gatePlaceNumbers.forEach(function (gateNumber) {
      const place = line[gateNumber];
      const alongWall = { x: along[gateNumber][0], z: along[gateNumber][1] };
      const outwardHere = outward[gateNumber];
      collector.wallBetween('stone', place[0] - alongWall.x * gateArchLength / 2, place[1] - alongWall.z * gateArchLength / 2,
        place[0] + alongWall.x * gateArchLength / 2, place[1] + alongWall.z * gateArchLength / 2, 0, gateHeight, gateDepth,
        [{ centre: 0, bottom: 0, width: widestGateArch, height: gateArchHeight, isArched: true }]);
      turnedBox('stoneShade', place[0], place[1], alongWall.x, alongWall.z, gateArchLength + 0.2, gateDepth + 0.4, gateHeight, 0.35);
      // a band over the arch on the outer face, and merlons along it
      turnedBox('stoneShade', place[0] + outwardHere[0] * (gateDepth / 2 + 0.08), place[1] + outwardHere[1] * (gateDepth / 2 + 0.08),
        alongWall.x, alongWall.z, gateArchLength, 0.16, 7.0, 0.35);
      [-1.2, 0, 1.2].forEach(function (offset) {
        turnedBox('stone', place[0] + offset * alongWall.x + outwardHere[0] * (gateDepth / 2 - 0.25), place[1] + offset * alongWall.z + outwardHere[1] * (gateDepth / 2 - 0.25),
          alongWall.x, alongWall.z, 0.7, 0.5, gateHeight + 0.35, 0.75);
      });
      [-1, 1].forEach(function (end) {
        const distance = end * (gateArchLength / 2 + gateTowerSize / 2 - 0.4);
        tower('stone', place[0] + alongWall.x * distance, place[1] + alongWall.z * distance, alongWall.x, alongWall.z, gateTowerHeight, gateTowerSize);
      });
    });
  }

  // ---- the wall on the patch of a point (the style 'grid', and the rings too small for a line)
  function buildWallOnPatch(pointIndex) {
    const works = volume.works[pointIndex];
    const point = map.points[pointIndex];
    {
      const wallNeighbours = neighboursWith(pointIndex, WORK.wall | WORK.gate);
      const faces = facesOfPatch(map, pointIndex);
      const isGateBuilt = (works & WORK.gate) !== 0 && gateOnPatch(pointIndex, faces);
      if ((works & WORK.gate) !== 0 && !isGateBuilt) {
        towerOnPatch('stone', pointIndex, faces, gateTowerHeight); // no two faces to pass through
      } else if (!isGateBuilt) {
        map.quartersOfPoint[pointIndex].forEach(function (quarter) {
          collector.polygonPrism('brick', quarter.outline, 0, wallHeight);
        });
        // merlons along the faces that look out of the wall
        faces.forEach(function (face) {
          if (has(face.neighbourPoint, WORK.wall | WORK.gate)) {
            return;
          }
          stretchesOfFace(face).forEach(function (stretch) {
            if (looksOutOfTheTown(point, stretch[0], stretch[1])) {
              merlonsAlong('brick', drawnIn(stretch[0], point, 0.1), drawnIn(stretch[1], point, 0.1), wallHeight);
            }
          });
        });
        if (wallNeighbours.length <= 2 && (!runsStraightThrough(point, wallNeighbours) || pointIndex % 5 === 0)) {
          // a tower where the wall turns or ends, and now and then on a straight run
          towerOnPatch('brick', pointIndex, faces, towerHeight);
        }
      }
    }
  }

  for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
    const works = volume.works[pointIndex];
    if (works === 0) {
      continue;
    }
    const point = map.points[pointIndex];
    if (wallStyle === 'grid' && (works & (WORK.wall | WORK.gate))) {
      buildWallOnPatch(pointIndex);
    }

    // ---- the aqueduct
    if (works & WORK.duct) {
      const ductNeighbours = neighboursWith(pointIndex, WORK.duct);
      const channelBottomY = aqueductHeight - 0.9;
      const waterY = channelBottomY + 0.3;
      // A span from one place to another: the arcade (with or without its arch), the floor of
      // the channel, the water, and the two low walls of the channel. wallsBeginAfter: the walls
      // leave that much of the span free at its start, where the channels meet over a pier.
      const span = function (startX, startZ, endX, endZ, hasArch, wallsBeginAfter) {
        const length = Math.hypot(endX - startX, endZ - startZ);
        const along = { x: (endX - startX) / length, z: (endZ - startZ) / length };
        collector.wallBetween('roughStone', startX, startZ, endX, endZ, 0, channelBottomY, aqueductThickness,
          hasArch ? [{ centre: 0, bottom: 0, width: Math.min(2.8, length - 1.1), height: channelBottomY - 0.9, isArched: true }] : []);
        const middleX = (startX + endX) / 2, middleZ = (startZ + endZ) / 2;
        turnedBox('roughStone', middleX, middleZ, along.x, along.z, length, aqueductThickness + 0.3, channelBottomY, 0.3);
        turnedBox('water', middleX, middleZ, along.x, along.z, length, aqueductThickness - 2 * channelWallThickness, waterY, 0.35);
        const wallLength = length - wallsBeginAfter;
        const wallMiddleDistance = wallsBeginAfter + wallLength / 2;
        [-1, 1].forEach(function (edge) {
          turnedBox('roughStone', startX + along.x * wallMiddleDistance - edge * along.z * (aqueductThickness / 2 - channelWallThickness / 2),
            startZ + along.z * wallMiddleDistance + edge * along.x * (aqueductThickness / 2 - channelWallThickness / 2),
            along.x, along.z, wallLength, channelWallThickness, waterY, 0.6);
        });
      };
      if (runsStraightThrough(point, ductNeighbours) && !(works & WORK.fountain)) {
        // an arch over the point, from the middle of one side to the middle of the other
        const first = map.points[ductNeighbours[0]];
        const second = map.points[ductNeighbours[1]];
        span((point.x + first.x) / 2, (point.z + first.z) / 2, (point.x + second.x) / 2, (point.z + second.z) / 2, true, 0);
      } else {
        // A pier at the point, and half a span to each neighbour. Over the pier the channels
        // open into a round of water; its rim stands only where no channel leaves it.
        const roundRadius = aqueductThickness / 2 + 0.25;
        const leavingDirections = ductNeighbours.map(function (neighbourPoint) {
          return directionBetween(point, map.points[neighbourPoint]);
        });
        if (point.isOnBoundary && ductNeighbours.length === 1) {
          // where it comes in over the rim of the map it runs on straight out of the picture
          const inward = leavingDirections[0];
          leavingDirections.push({ x: -inward.x, z: -inward.z });
          span(point.x, point.z, point.x - inward.x * cellSize, point.z - inward.z * cellSize, false, roundRadius);
        }
        ductNeighbours.forEach(function (neighbourPoint) {
          const neighbour = map.points[neighbourPoint];
          span(point.x, point.z, (point.x + neighbour.x) / 2, (point.z + neighbour.z) / 2, false, roundRadius);
        });
        turnedBox('roughStone', point.x, point.z, 1, 0, aqueductThickness + 0.4, aqueductThickness + 0.4, 0, channelBottomY);
        collector.cylinder('roughStone', roundRadius + 0.15, roundRadius + 0.15, 0.3, point.x, channelBottomY, point.z, 20);
        collector.cylinder('water', roundRadius - 0.1, roundRadius - 0.1, 0.36, point.x, waterY, point.z, 20);
        const rimPieceCount = 20;
        for (let piece = 0; piece < rimPieceCount; piece++) {
          const angle = (piece + 0.5) * 2 * Math.PI / rimPieceCount;
          const outwardX = Math.cos(angle);
          const outwardZ = Math.sin(angle);
          const opensToAChannel = leavingDirections.some(function (direction) {
            return direction.x * outwardX + direction.z * outwardZ > 0.74; // within the width of a channel
          });
          if (!opensToAChannel) {
            turnedBox('roughStone', point.x + outwardX * roundRadius, point.z + outwardZ * roundRadius, -outwardZ, outwardX,
              2 * Math.PI * roundRadius / rimPieceCount + 0.06, channelWallThickness, waterY, 0.6);
          }
        }
      }
    }

    // ---- the fountain: with its square (built from its end point), or of one point: a round
    // basin of marble round the last pier of the aqueduct
    if ((works & WORK.fountain) && fountainAtEnd.has(pointIndex)) {
      buildFountainWithSquare(fountainAtEnd.get(pointIndex));
    } else if ((works & WORK.fountain) && !isOnASquare.has(pointIndex)) {
      collector.cylinder('stone', 2.0, 2.0, 0.75, point.x, 0, point.z, 24);
      collector.cylinder('stoneShade', 2.1, 2.1, 0.14, point.x, 0.75, point.z, 24);
      collector.cylinder('water', 1.8, 1.8, 0.08, point.x, 0.8, point.z, 24);
      // the water falling from the channel on the four sides of the pier, each out of a spout of marble
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (side) {
        turnedBox('water', point.x + side[0] * (aqueductThickness / 2 + 0.38), point.z + side[1] * (aqueductThickness / 2 + 0.38), 1, 0, 0.2, 0.2, 0.8, aqueductHeight - 2.3);
        turnedBox('stone', point.x + side[0] * (aqueductThickness / 2 + 0.33), point.z + side[1] * (aqueductThickness / 2 + 0.33), 1, 0, 0.5, 0.5, aqueductHeight - 1.6, 0.3);
      });
    }
  }
}
