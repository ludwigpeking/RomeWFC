// Purpose: the ground the town stands on, as points and the quads between them.
//
// As in Townscaper, the volume lives on the points: a point is raised or not. What is built is
// made in the quads between the points. Every quad is cut into four quarters, one for each of its
// corners (a kite: the corner point, the middles of its two sides, the middle of the quad), and
// the block that stands on a point is the quarters of all the quads round it. On a square grid a
// point has four quads; on the irregular grid it has from three to six, so a block there is made
// of three to six components and the buildings bend with the grid.

import { generateHexQuadMap, linkQuadCells } from './quadMap';

// A square grid: pointColumnCount by pointRowCount points, cellLength apart
export function createSquareMap(pointColumnCount, pointRowCount, cellLength) {
  const points = [];
  for (let row = 0; row < pointRowCount; row++) {
    for (let column = 0; column < pointColumnCount; column++) {
      points.push({
        x: column * cellLength, z: row * cellLength, column: column, row: row,
        isOnBoundary: column === 0 || row === 0 || column === pointColumnCount - 1 || row === pointRowCount - 1,
      });
    }
  }
  const cornerLists = [];
  for (let row = 0; row + 1 < pointRowCount; row++) {
    for (let column = 0; column + 1 < pointColumnCount; column++) {
      const first = row * pointColumnCount + column;
      cornerLists.push([first, first + 1, first + pointColumnCount + 1, first + pointColumnCount]);
    }
  }
  return prepareMap({
    kind: 'square', points: points, cells: linkQuadCells(points, cornerLists),
    pointColumnCount: pointColumnCount, pointRowCount: pointRowCount, cellLength: cellLength,
  });
}

// The irregular grid of quads in a hexagon
export function createIrregularMap(ringCount, cellLength, seed) {
  const generated = generateHexQuadMap(ringCount, cellLength, seed);
  return prepareMap({ kind: 'irregular', points: generated.points, cells: generated.cells, cellLength: cellLength });
}

// Works out what the builders need to know about a map:
// - for every cell: its middle, the middles of its four sides (side k joins corner k and corner k + 1)
// - for every point: the quarters round it, the points joined to it by a side, the points that share a quad with it
function prepareMap(map) {
  const pointCount = map.points.length;
  map.quartersOfPoint = [];
  map.sideNeighboursOfPoint = [];
  map.quadNeighboursOfPoint = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    map.quartersOfPoint.push([]);
    map.sideNeighboursOfPoint.push(new Set());
    map.quadNeighboursOfPoint.push(new Set());
  }
  map.cells.forEach(function (cell, cellIndex) {
    const cornerPoints = cell.corners.map(function (pointIndex) {
      return map.points[pointIndex];
    });
    cell.middle = {
      x: (cornerPoints[0].x + cornerPoints[1].x + cornerPoints[2].x + cornerPoints[3].x) / 4,
      z: (cornerPoints[0].z + cornerPoints[1].z + cornerPoints[2].z + cornerPoints[3].z) / 4,
    };
    cell.sideMiddles = [0, 1, 2, 3].map(function (side) {
      const next = (side + 1) % 4;
      return { x: (cornerPoints[side].x + cornerPoints[next].x) / 2, z: (cornerPoints[side].z + cornerPoints[next].z) / 2 };
    });
    for (let corner = 0; corner < 4; corner++) {
      const pointIndex = cell.corners[corner];
      const sideAfter = corner;                 // joins this corner and the next
      const sideBefore = (corner + 3) % 4;      // joins the corner before and this one
      map.quartersOfPoint[pointIndex].push({
        cellIndex: cellIndex, corner: corner, pointIndex: pointIndex,
        // the kite in plan: the point, the middle of the side after, the middle of the quad, the middle of the side before
        outline: [
          [cornerPoints[corner].x, cornerPoints[corner].z],
          [cell.sideMiddles[sideAfter].x, cell.sideMiddles[sideAfter].z],
          [cell.middle.x, cell.middle.z],
          [cell.sideMiddles[sideBefore].x, cell.sideMiddles[sideBefore].z],
        ],
        // names of the kite's four places, shared with the kites beside it (for the roofs)
        nodeNames: [
          'p' + pointIndex,
          sideName(cell.corners[sideAfter], cell.corners[(sideAfter + 1) % 4]),
          'c' + cellIndex,
          sideName(cell.corners[sideBefore], cell.corners[(sideBefore + 1) % 4]),
        ],
      });
      map.sideNeighboursOfPoint[pointIndex].add(cell.corners[(corner + 1) % 4]);
      map.sideNeighboursOfPoint[pointIndex].add(cell.corners[(corner + 3) % 4]);
      for (let other = 0; other < 4; other++) {
        if (other !== corner) {
          map.quadNeighboursOfPoint[pointIndex].add(cell.corners[other]);
        }
      }
    }
  });
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  map.points.forEach(function (point) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  map.bounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
  return map;
}

// The name of the middle of the side between two points, the same from either quad
export function sideName(firstPointIndex, secondPointIndex) {
  return 's' + Math.min(firstPointIndex, secondPointIndex) + '-' + Math.max(firstPointIndex, secondPointIndex);
}

// A kite's outline drawn in towards a place by a share (0 leaves it, 1 shrinks it to the place)
export function shrinkOutline(outline, towardsX, towardsZ, share) {
  return outline.map(function (corner) {
    return [corner[0] + (towardsX - corner[0]) * share, corner[1] + (towardsZ - corner[1]) * share];
  });
}
