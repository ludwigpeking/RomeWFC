// Purpose: seeing a part of any ground as a lattice of columns and rows, so that what is found
// and built by position (the formations of the classical tier, the pieces of their models) does
// not depend on the ground being a square grid.
//
// On the square ground the whole map is one lattice. On the irregular ground there are no
// columns and rows as such, but a group of classical points and the quads round it can be laid
// out as a lattice: one quad is given its place, and every quad beside one already placed takes
// the place beside it, across the side they share. That works wherever four quads meet at every
// point of the group. Where three, five or six meet at a point, no lattice closes round it: such
// a point is seen alone (a star: the point and the quads round it), and the rest of its group is
// laid out without it, in the parts it falls into. A part that still does not close (it winds
// round such a point, or folds over itself) is halved again and again until its parts do; in the
// end a single point where four quads meet is always a lattice of its own.
//
// A view is { columnCount, rowCount, pointIndexAt(column, row) (or -1), columnOfPoint, rowOfPoint
// (Maps), isMember(pointIndex) } for a lattice, and { isStar: true, pointIndex } for a point alone.
// A lattice view of a group also holds the ring of points round the group, which are not members.

import { TIER } from './volume';

export function latticeViewsOf(volume) {
  const map = volume.map;
  if (map.kind === 'square') {
    const columnOfPoint = new Map();
    const rowOfPoint = new Map();
    map.points.forEach(function (point, pointIndex) {
      columnOfPoint.set(pointIndex, point.column);
      rowOfPoint.set(pointIndex, point.row);
    });
    return [{
      columnCount: map.pointColumnCount, rowCount: map.pointRowCount, columnOfPoint: columnOfPoint, rowOfPoint: rowOfPoint,
      pointIndexAt: function (column, row) {
        return column >= 0 && column < map.pointColumnCount && row >= 0 && row < map.pointRowCount ? row * map.pointColumnCount + column : -1;
      },
      isMember: function () { return true; },
    }];
  }

  // the points that are classical on any level, in groups that hang together side by side
  const isClassicalPoint = new Uint8Array(volume.pointCount);
  volume.filledPlaces().forEach(function (place) {
    // (the city's own buildings are not read from the volume: they are built as what they are)
    if (place.tier === TIER.classical && volume.publicBuildingOfPoint[place.pointIndex] === 0) {
      isClassicalPoint[place.pointIndex] = 1;
    }
  });
  const cellsOfPoint = map.points.map(function () { return []; });
  map.cells.forEach(function (cell, cellIndex) {
    cell.corners.forEach(function (pointIndex) {
      cellsOfPoint[pointIndex].push(cellIndex);
    });
  });
  const views = [];
  const isGrouped = new Uint8Array(volume.pointCount);
  for (let startPoint = 0; startPoint < volume.pointCount; startPoint++) {
    if (!isClassicalPoint[startPoint] || isGrouped[startPoint]) {
      continue;
    }
    const group = [];
    const pending = [startPoint];
    isGrouped[startPoint] = 1;
    while (pending.length > 0) {
      const pointIndex = pending.pop();
      group.push(pointIndex);
      map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (isClassicalPoint[neighbourPoint] && !isGrouped[neighbourPoint]) {
          isGrouped[neighbourPoint] = 1;
          pending.push(neighbourPoint);
        }
      });
    }
    addViewsOfGroup(group);
  }
  return views;

  // whether a lattice can pass through a point: four quads meet there, or it lies on the rim
  function isRegularPoint(pointIndex) {
    return cellsOfPoint[pointIndex].length === 4 || map.points[pointIndex].isOnBoundary;
  }

  // the parts a set of points falls into, each hanging together side by side
  function partsThatHangTogether(pointIndices) {
    const isLeft = new Set(pointIndices);
    const parts = [];
    pointIndices.forEach(function (startPoint) {
      if (!isLeft.has(startPoint)) {
        return;
      }
      const part = [];
      const pending = [startPoint];
      isLeft.delete(startPoint);
      while (pending.length > 0) {
        const pointIndex = pending.shift(); // in the order of the distance from the first point
        part.push(pointIndex);
        map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
          if (isLeft.has(neighbourPoint)) {
            isLeft.delete(neighbourPoint);
            pending.push(neighbourPoint);
          }
        });
      }
      parts.push(part);
    });
    return parts;
  }

  // The views of a group: one lattice if it closes; otherwise the lattices of its parts
  function addViewsOfGroup(group) {
    const irregularPoints = group.filter(function (pointIndex) { return !isRegularPoint(pointIndex); });
    if (irregularPoints.length > 0) {
      irregularPoints.forEach(function (pointIndex) {
        views.push({ isStar: true, pointIndex: pointIndex });
      });
      partsThatHangTogether(group.filter(isRegularPoint)).forEach(addViewsOfGroup);
      return;
    }
    const view = layOutAsLattice(map, group, cellsOfPoint);
    if (view !== null) {
      views.push(view);
      return;
    }
    if (group.length === 1) {
      views.push({ isStar: true, pointIndex: group[0] });
      return;
    }
    // halved: the points nearer the first one, and the rest (the group comes in that order)
    const ordered = partsThatHangTogether(group)[0];
    const nearHalf = ordered.slice(0, Math.ceil(ordered.length / 2));
    const farHalf = ordered.slice(nearHalf.length);
    partsThatHangTogether(nearHalf).forEach(addViewsOfGroup);
    partsThatHangTogether(farHalf).forEach(addViewsOfGroup);
  }
}

// The lattice of a group of points and the quads round them, or null where it does not close
function layOutAsLattice(map, group, cellsOfPoint) {
  const isMemberPoint = new Set(group);
  // only where four quads meet at every point of the group; on the rim of the map a point has
  // fewer, which does no harm: the quads that are there still take their places
  for (const pointIndex of group) {
    if (cellsOfPoint[pointIndex].length !== 4 && !map.points[pointIndex].isOnBoundary) {
      return null;
    }
  }
  const isCellOfTheGroup = new Set();
  group.forEach(function (pointIndex) {
    cellsOfPoint[pointIndex].forEach(function (cellIndex) {
      isCellOfTheGroup.add(cellIndex);
    });
  });
  const placeOfPoint = new Map(); // pointIndex -> [column, row]
  let closes = true;
  function place(pointIndex, column, row) {
    const known = placeOfPoint.get(pointIndex);
    if (known === undefined) {
      placeOfPoint.set(pointIndex, [column, row]);
    } else if (known[0] !== column || known[1] !== row) {
      closes = false;
    }
  }
  const firstCell = cellsOfPoint[group[0]][0];
  const firstCorners = map.cells[firstCell].corners;
  place(firstCorners[0], 0, 0);
  place(firstCorners[1], 1, 0);
  place(firstCorners[2], 1, 1);
  place(firstCorners[3], 0, 1);
  const isPlacedCell = new Set([firstCell]);
  const pendingCells = [firstCell];
  while (pendingCells.length > 0 && closes) {
    const cellIndex = pendingCells.pop();
    const cell = map.cells[cellIndex];
    for (let side = 0; side < 4; side++) {
      // the quad across this side: kept as its number, or as { cell, edge }, by the kind of ground
      const neighbour = cell.neighbours[side];
      const neighbourIndex = neighbour !== null && typeof neighbour === 'object' ? neighbour.cell : neighbour;
      if (neighbourIndex === null || neighbourIndex === undefined || !isCellOfTheGroup.has(neighbourIndex) || isPlacedCell.has(neighbourIndex)) {
        continue;
      }
      // the two points of the shared side, and the two of this quad opposite them
      const first = cell.corners[side];
      const second = cell.corners[(side + 1) % 4];
      const beyondSecond = cell.corners[(side + 2) % 4];
      const beyondFirst = cell.corners[(side + 3) % 4];
      const placeOfFirst = placeOfPoint.get(first);
      const placeOfBeyondFirst = placeOfPoint.get(beyondFirst);
      const stepColumn = placeOfFirst[0] - placeOfBeyondFirst[0];
      const stepRow = placeOfFirst[1] - placeOfBeyondFirst[1];
      const placeOfSecond = placeOfPoint.get(second);
      // the neighbour's two other points lie one step further, each beside the point it shares a side with
      const neighbourCorners = map.cells[neighbourIndex].corners;
      const firstAt = neighbourCorners.indexOf(first);
      const secondAt = neighbourCorners.indexOf(second);
      if (firstAt === -1 || secondAt === -1) {
        closes = false;
        break;
      }
      const secondFollowsFirst = secondAt === (firstAt + 1) % 4;
      const besideFirst = neighbourCorners[secondFollowsFirst ? (firstAt + 3) % 4 : (firstAt + 1) % 4];
      const besideSecond = neighbourCorners[secondFollowsFirst ? (secondAt + 1) % 4 : (secondAt + 3) % 4];
      place(besideFirst, placeOfFirst[0] + stepColumn, placeOfFirst[1] + stepRow);
      place(besideSecond, placeOfSecond[0] + stepColumn, placeOfSecond[1] + stepRow);
      // (the second opposite point is only there to name the side)
      void beyondSecond;
      isPlacedCell.add(neighbourIndex);
      pendingCells.push(neighbourIndex);
    }
  }
  if (!closes || isPlacedCell.size !== isCellOfTheGroup.size) {
    return null;
  }
  // two points on one place: the lattice folds over itself
  const pointAtPlace = new Map();
  let minColumn = Infinity, minRow = Infinity, maxColumn = -Infinity, maxRow = -Infinity;
  for (const [pointIndex, placeOfIt] of placeOfPoint) {
    const key = placeOfIt[0] + ':' + placeOfIt[1];
    if (pointAtPlace.has(key)) {
      return null;
    }
    pointAtPlace.set(key, pointIndex);
    minColumn = Math.min(minColumn, placeOfIt[0]);
    maxColumn = Math.max(maxColumn, placeOfIt[0]);
    minRow = Math.min(minRow, placeOfIt[1]);
    maxRow = Math.max(maxRow, placeOfIt[1]);
  }
  const columnOfPoint = new Map();
  const rowOfPoint = new Map();
  placeOfPoint.forEach(function (placeOfIt, pointIndex) {
    columnOfPoint.set(pointIndex, placeOfIt[0] - minColumn);
    rowOfPoint.set(pointIndex, placeOfIt[1] - minRow);
  });
  return {
    columnCount: maxColumn - minColumn + 1, rowCount: maxRow - minRow + 1, columnOfPoint: columnOfPoint, rowOfPoint: rowOfPoint,
    pointIndexAt: function (column, row) {
      const pointIndex = pointAtPlace.get((column + minColumn) + ':' + (row + minRow));
      return pointIndex === undefined ? -1 : pointIndex;
    },
    isMember: function (pointIndex) { return isMemberPoint.has(pointIndex); },
  };
}

// A patch of the grid laid out as a lattice of columnCount by rowCount points, from a first point
// and the point beside it that gives the direction of the columns; the rows follow to the side
// that makes the patch turn as a model does (its width along x, its depth along z). Returns the
// points row by row, or null where the grid does not go on regularly that far (a point where
// three, five or six quads meet, or the rim of the map).
export function latticePatch(map, firstPoint, secondPoint, columnCount, rowCount) {
  function isRegular(pointIndex) {
    return map.quartersOfPoint[pointIndex].length === 4 && !map.points[pointIndex].isOnBoundary;
  }
  // the point straight on from one point through the next: the neighbour of the second that
  // shares no quad with the first
  function straightOn(fromPoint, throughPoint) {
    for (const candidate of map.sideNeighboursOfPoint[throughPoint]) {
      if (candidate !== fromPoint && !map.quadNeighboursOfPoint[fromPoint].has(candidate)) {
        return candidate;
      }
    }
    return -1;
  }
  if (!isRegular(firstPoint) || !isRegular(secondPoint)) {
    return null;
  }
  const isTaken = new Set();
  const firstRow = [firstPoint, secondPoint];
  while (firstRow.length < columnCount) {
    const next = straightOn(firstRow[firstRow.length - 2], firstRow[firstRow.length - 1]);
    if (next === -1 || !isRegular(next)) {
      return null;
    }
    firstRow.push(next);
  }
  const rows = [firstRow];
  firstRow.forEach(function (pointIndex) { isTaken.add(pointIndex); });
  while (rows.length < rowCount) {
    const row = rows[rows.length - 1];
    const nextRow = [];
    for (let column = 0; column < columnCount; column++) {
      const point = map.points[row[column]];
      const from = map.points[row[Math.max(0, column - 1)]];
      const to = map.points[row[Math.min(columnCount - 1, column + 1)]];
      const acrossX = to.x - from.x;
      const acrossZ = to.z - from.z;
      // the neighbour to the side of the rows: the one furthest that way
      let beside = -1;
      let furthest = 0;
      for (const candidate of map.sideNeighboursOfPoint[row[column]]) {
        const sideways = acrossX * (map.points[candidate].z - point.z) - acrossZ * (map.points[candidate].x - point.x);
        if (sideways > furthest && candidate !== row[column - 1] && candidate !== row[column + 1]) {
          furthest = sideways;
          beside = candidate;
        }
      }
      if (beside === -1 || !isRegular(beside) || isTaken.has(beside) ||
        (column > 0 && !map.sideNeighboursOfPoint[beside].has(nextRow[column - 1]))) {
        return null;
      }
      isTaken.add(beside);
      nextRow.push(beside);
    }
    rows.push(nextRow);
  }
  return rows;
}

// Where a place of a lattice view lies on the ground: the point there, or, where the map ends and
// there is none, a place reckoned on from the points that are there: straight on along its
// column or its row, or, in a corner beyond the map, across from the three places round it
export function positionInView(map, view, column, row) {
  function pointAt(atColumn, atRow) {
    const pointIndex = view.pointIndexAt(atColumn, atRow);
    return pointIndex === -1 ? null : { x: map.points[pointIndex].x, z: map.points[pointIndex].z };
  }
  // the point, or a place straight on from two points along a column or a row
  function pointOrStraightOn(atColumn, atRow) {
    const point = pointAt(atColumn, atRow);
    if (point !== null) {
      return point;
    }
    for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const near = pointAt(atColumn + step[0], atRow + step[1]);
      const far = pointAt(atColumn + 2 * step[0], atRow + 2 * step[1]);
      if (near !== null && far !== null) {
        return { x: 2 * near.x - far.x, z: 2 * near.z - far.z };
      }
    }
    return null;
  }
  const straightOn = pointOrStraightOn(column, row);
  if (straightOn !== null) {
    return straightOn;
  }
  // across from three places: the fourth corner of the quad they make with it
  for (const step of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const besideAlongColumns = pointOrStraightOn(column + step[0], row);
    const besideAlongRows = pointOrStraightOn(column, row + step[1]);
    const opposite = pointOrStraightOn(column + step[0], row + step[1]);
    if (besideAlongColumns !== null && besideAlongRows !== null && opposite !== null) {
      return { x: besideAlongColumns.x + besideAlongRows.x - opposite.x, z: besideAlongColumns.z + besideAlongRows.z - opposite.z };
    }
  }
  // a lone point with nothing known round it: a cell away, in the way of the columns and rows
  const middle = pointAt(Math.round(column), Math.round(row));
  return middle;
}
