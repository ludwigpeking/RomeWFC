// Purpose: the patch of a point, for whatever is built on a single point and has to follow the
// grid as the houses do: the huts, the pergola of a roof terrace, the wall of the city, its gates.
//
// The patch of a point is the ground of the quarters of the quads round it (topology.js). Its
// outline runs from the middle of a quad to the middle of the side towards a neighbouring point
// and on to the middle of the next quad: one face towards each neighbour, bent at the middle of
// the side wherever the grid is skewed. Two neighbouring points share the line of their faces, so
// what is built on patches closes without gaps and overlaps on any grid.

// The faces of the patch of a point, in order round it. Each is
//   { neighbourPoint, middle: [x, z], before: [x, z] or null, after: [x, z] or null, towards: { x, z } }
// middle: the middle of the side to the neighbour; before and after: the middles of the two quads
// that share that side (one of them is missing on the rim of the map); towards: the direction
// from the point to the middle, of length one. The after of a face is the before of the next.
export function facesOfPatch(map, pointIndex) {
  const point = map.points[pointIndex];
  const faceOfNeighbour = new Map();
  function addHalf(neighbourPoint, sideMiddle, quadMiddle) {
    if (!faceOfNeighbour.has(neighbourPoint)) {
      const length = Math.hypot(sideMiddle[0] - point.x, sideMiddle[1] - point.z) || 1;
      faceOfNeighbour.set(neighbourPoint, {
        neighbourPoint: neighbourPoint, middle: sideMiddle, before: null, after: null,
        towards: { x: (sideMiddle[0] - point.x) / length, z: (sideMiddle[1] - point.z) / length },
        angle: Math.atan2(sideMiddle[1] - point.z, sideMiddle[0] - point.x),
      });
    }
    const face = faceOfNeighbour.get(neighbourPoint);
    // which side of the line from the point to the middle of the side the quad lies on
    const turn = (sideMiddle[0] - point.x) * (quadMiddle[1] - point.z) - (sideMiddle[1] - point.z) * (quadMiddle[0] - point.x);
    if (turn < 0) {
      face.before = quadMiddle;
    } else {
      face.after = quadMiddle;
    }
  }
  map.quartersOfPoint[pointIndex].forEach(function (quarter) {
    const cell = map.cells[quarter.cellIndex];
    addHalf(cell.corners[(quarter.corner + 1) % 4], quarter.outline[1], quarter.outline[2]);
    addHalf(cell.corners[(quarter.corner + 3) % 4], quarter.outline[3], quarter.outline[2]);
  });
  return Array.from(faceOfNeighbour.values()).sort(function (first, second) { return first.angle - second.angle; });
}

// The stretches of a face, each [from, to] ([x, z]): from the middle of a quad to the middle of
// the side and on to the middle of the next quad
export function stretchesOfFace(face) {
  const stretches = [];
  if (face.before !== null) {
    stretches.push([face.before, face.middle]);
  }
  if (face.after !== null) {
    stretches.push([face.middle, face.after]);
  }
  return stretches;
}

// A place in plan drawn in towards a point by a share (0 leaves it; a negative share moves it out)
export function drawnIn(place, point, share) {
  return [place[0] + (point.x - place[0]) * share, place[1] + (point.z - place[1]) * share];
}

// Twice the area of a polygon in plan, with the sign of the way it runs round
export function turnOfPolygon(polygon) {
  let sum = 0;
  for (let index = 0; index < polygon.length; index++) {
    const here = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    sum += here[0] * next[1] - next[0] * here[1];
  }
  return sum;
}

// An upright prism over a convex polygon in plan, whichever way its corners run round (the
// collector's own polygonPrism shows its faces only for the way the quarters run)
export function prismOver(collector, map, materialName, polygon, bottomY, height) {
  if (map.turnOfQuarters === undefined) {
    map.turnOfQuarters = Math.sign(turnOfPolygon(map.quartersOfPoint[0][0].outline));
  }
  const runsTheSameWay = Math.sign(turnOfPolygon(polygon)) === map.turnOfQuarters;
  collector.polygonPrism(materialName, runsTheSameWay ? polygon : polygon.slice().reverse(), bottomY, height);
}

// A box in plan turned any way: its middle, the direction of its length (of length one), its
// length and its width
export function boxAlong(collector, map, materialName, middleX, middleZ, alongX, alongZ, length, width, bottomY, height) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const corners = [[-halfLength, -halfWidth], [halfLength, -halfWidth], [halfLength, halfWidth], [-halfLength, halfWidth]].map(function (offset) {
    return [middleX + offset[0] * alongX - offset[1] * alongZ, middleZ + offset[0] * alongZ + offset[1] * alongX];
  });
  prismOver(collector, map, materialName, corners, bottomY, height);
}

// A triangle in space added to a list of coordinates so that it is seen from above (and, with
// isSeenFromBelowToo, a second time for whoever stands under it). Corners: [x, y, z].
export function addSheetTriangle(coordinates, first, second, third, isSeenFromBelowToo) {
  const facesUp = (second[2] - first[2]) * (third[0] - first[0]) - (second[0] - first[0]) * (third[2] - first[2]) > 0;
  const upper = facesUp ? [first, second, third] : [first, third, second];
  upper.forEach(function (corner) {
    coordinates.push(corner[0], corner[1], corner[2]);
  });
  if (isSeenFromBelowToo) {
    [upper[0], upper[2], upper[1]].forEach(function (corner) {
      coordinates.push(corner[0], corner[1] - 0.03, corner[2]);
    });
  }
}
