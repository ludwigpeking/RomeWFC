// Purpose: the higher order of the classical tier. The classical volume is read as formations,
// each of which becomes one building (classical.js), the larger special figures first:
// 1. the hard specials (the Pantheon, the great basilica, the court with a peristyle) are looked
//    for anywhere in the volume, the largest first. A special keeps its shape when other blocks
//    are added beside it: only the points of the figure itself have to fit.
// 2. what is left is cut into the largest boxes it holds, down to single points.
//
// A formation is found by the places of its points in a lattice of columns and rows, not by
// where they lie on the ground: the lattices come from charts.js, which sees the square ground as
// one lattice and lays out a lattice round every group of classical points on the irregular
// ground. So the same figures are found on both. A point where three, five or six quads meet is
// read alone, as a stack; the rest of its group is read in the lattices of its parts.

import { TIER } from './volume';
import { latticeViewsOf } from './charts';

// Returns [{ kind: 'box' | 'pantheon' | 'greatBasilica' | 'court', view, minColumn, minLevel,
// minRow, columnCount, levelCount, rowCount, ... }], counted in points of the lattice view the
// formation was found in; for a point read alone, { kind: 'box', pointIndex, minLevel,
// levelCount, columnCount: 1, rowCount: 1 }.
export function findClassicalFormations(volume) {
  const formations = [];
  latticeViewsOf(volume).forEach(function (view) {
    if (view.isStar) {
      let level = 0;
      while (level < volume.levelCount) {
        if (volume.tierAt(view.pointIndex, level) !== TIER.classical) {
          level++;
          continue;
        }
        const minLevel = level;
        while (volume.tierAt(view.pointIndex, level) === TIER.classical) {
          level++;
        }
        formations.push({ kind: 'box', pointIndex: view.pointIndex, minLevel: minLevel, levelCount: level - minLevel, columnCount: 1, rowCount: 1 });
      }
      return;
    }
    findFormationsInView(volume, view).forEach(function (formation) {
      formation.view = view;
      formations.push(formation);
    });
  });
  return formations;
}

// The classical places of a view as [column, level, row], of the points that are its members
function classicalPlacesInView(volume, view) {
  const places = [];
  volume.filledPlaces().forEach(function (place) {
    if (place.tier === TIER.classical && volume.publicBuildingOfPoint[place.pointIndex] === 0 && view.isMember(place.pointIndex) && view.columnOfPoint.has(place.pointIndex)) {
      places.push([view.columnOfPoint.get(place.pointIndex), place.level, view.rowOfPoint.get(place.pointIndex)]);
    }
  });
  return places;
}

function findFormationsInView(volume, view) {
  const formations = findSpecials(volume, view);
  const columnCount = view.columnCount;
  const rowCount = view.rowCount;
  const levelCount = Math.max(1, volume.usedLevelCount());
  // the classical points the specials have left, as a lattice of columns, levels and rows
  const isLeft = new Uint8Array(columnCount * levelCount * rowCount);
  function latticeIndex(column, level, row) {
    return (level * rowCount + row) * columnCount + column;
  }
  function isOpen(column, level, row) {
    return column >= 0 && column < columnCount && row >= 0 && row < rowCount && level >= 0 && level < levelCount &&
      isLeft[latticeIndex(column, level, row)] === 1;
  }
  classicalPlacesInView(volume, view).forEach(function (place) {
    isLeft[latticeIndex(place[0], place[1], place[2])] = 1;
  });
  formations.forEach(function (formation) {
    formation.cells.forEach(function (cell) {
      isLeft[latticeIndex(cell[0], cell[1], cell[2])] = 0;
    });
  });
  // the largest box that begins at a place, grown one direction after another; the order of the
  // directions is tried every way, since growing in one first can block another
  function largestBoxFrom(column, level, row) {
    let best = null;
    [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].forEach(function (order) {
      const size = [1, 1, 1]; // columns, levels, rows
      order.forEach(function (direction) {
        for (;;) {
          let fits = true;
          for (let columnOffset = 0; columnOffset < (direction === 0 ? size[0] + 1 : size[0]) && fits; columnOffset++) {
            for (let levelOffset = 0; levelOffset < (direction === 1 ? size[1] + 1 : size[1]) && fits; levelOffset++) {
              for (let rowOffset = 0; rowOffset < (direction === 2 ? size[2] + 1 : size[2]) && fits; rowOffset++) {
                fits = isOpen(column + columnOffset, level + levelOffset, row + rowOffset);
              }
            }
          }
          if (!fits) {
            break;
          }
          size[direction]++;
        }
      });
      if (best === null || size[0] * size[1] * size[2] > best[0] * best[1] * best[2]) {
        best = size;
      }
    });
    return best;
  }
  // the largest box is taken out again and again until nothing is left
  for (;;) {
    let largest = null;
    for (let level = 0; level < levelCount; level++) {
      for (let row = 0; row < rowCount; row++) {
        for (let column = 0; column < columnCount; column++) {
          if (!isOpen(column, level, row)) {
            continue;
          }
          const size = largestBoxFrom(column, level, row);
          if (largest === null || size[0] * size[1] * size[2] > largest.columnCount * largest.levelCount * largest.rowCount) {
            largest = { kind: 'box', minColumn: column, minLevel: level, minRow: row, columnCount: size[0], levelCount: size[1], rowCount: size[2] };
          }
        }
      }
    }
    if (largest === null) {
      break;
    }
    for (let level = largest.minLevel; level < largest.minLevel + largest.levelCount; level++) {
      for (let row = largest.minRow; row < largest.minRow + largest.rowCount; row++) {
        for (let column = largest.minColumn; column < largest.minColumn + largest.columnCount; column++) {
          isLeft[latticeIndex(column, level, row)] = 0;
        }
      }
    }
    formations.push(largest);
  }
  return formations;
}

// The hard specials of a lattice view, the largest first, none sharing a point with another
function findSpecials(volume, view) {
  const formations = [];
  // the classical points as a lattice of columns, levels and rows
  const columnCount = view.columnCount;
  const rowCount = view.rowCount;
  const levelCount = Math.max(1, volume.usedLevelCount());
  const isUnclaimed = new Uint8Array(columnCount * levelCount * rowCount);
  function latticeIndex(column, level, row) {
    return (level * rowCount + row) * columnCount + column;
  }
  function isOpen(column, level, row) { // classical, and not yet part of a formation
    return column >= 0 && column < columnCount && row >= 0 && row < rowCount && level >= 0 && level < levelCount &&
      isUnclaimed[latticeIndex(column, level, row)] === 1;
  }
  classicalPlacesInView(volume, view).forEach(function (place) {
    isUnclaimed[latticeIndex(place[0], place[1], place[2])] = 1;
  });

  // the largest first
  const candidates = findSpecialCandidates(isOpen, columnCount, levelCount, rowCount);
  candidates.sort(function (first, second) {
    return second.cells.length - first.cells.length;
  });
  candidates.forEach(function (candidate) {
    const isStillFree = candidate.cells.every(function (cell) {
      return isOpen(cell[0], cell[1], cell[2]);
    });
    if (!isStillFree) {
      return;
    }
    candidate.cells.forEach(function (cell) {
      isUnclaimed[latticeIndex(cell[0], cell[1], cell[2])] = 0;
    });
    candidate.formation.cells = candidate.cells; // [column, level, row] of every point it takes
    formations.push(candidate.formation);
  });
  return formations;
}

// Every place in the volume where a hard special fits: [{ formation, cells: [[column, level, row], ...] }].
// A special is read from the heights of the stacks that stand on its base level: how many
// classical points follow each other upwards from there.
const largestCourtSide = 8;
function findSpecialCandidates(isOpen, columnCount, levelCount, rowCount) {
  const candidates = [];
  for (let baseLevel = 0; baseLevel < levelCount; baseLevel++) {
    // the height of the stack on every point of this level; 0 where nothing starts here
    const stackHeight = new Uint8Array(columnCount * rowCount);
    let hasAnyStack = false;
    for (let row = 0; row < rowCount; row++) {
      for (let column = 0; column < columnCount; column++) {
        if (isOpen(column, baseLevel - 1, row)) {
          continue; // the stack began lower down
        }
        let height = 0;
        while (isOpen(column, baseLevel + height, row)) {
          height++;
        }
        stackHeight[row * columnCount + column] = height;
        hasAnyStack = hasAnyStack || height > 0;
      }
    }
    if (!hasAnyStack) {
      continue;
    }
    const heightAt = function (column, row) {
      return column >= 0 && column < columnCount && row >= 0 && row < rowCount ? stackHeight[row * columnCount + column] : 0;
    };
    const cellsOfStacks = function (minColumn, minRow, countAlongX, countAlongZ) {
      const cells = [];
      for (let row = minRow; row < minRow + countAlongZ; row++) {
        for (let column = minColumn; column < minColumn + countAlongX; column++) {
          for (let height = 0; height < heightAt(column, row); height++) {
            cells.push([column, baseLevel + height, row]);
          }
        }
      }
      return cells;
    };

    // the Pantheon: 5 by 5 stacks, two high on the rim and four high on the 3 by 3 in the middle
    for (let minRow = 0; minRow + 5 <= rowCount; minRow++) {
      for (let minColumn = 0; minColumn + 5 <= columnCount; minColumn++) {
        let fits = true;
        for (let rowOffset = 0; rowOffset < 5 && fits; rowOffset++) {
          for (let columnOffset = 0; columnOffset < 5 && fits; columnOffset++) {
            const isInMiddle = rowOffset >= 1 && rowOffset <= 3 && columnOffset >= 1 && columnOffset <= 3;
            fits = heightAt(minColumn + columnOffset, minRow + rowOffset) === (isInMiddle ? 4 : 2);
          }
        }
        if (fits) {
          candidates.push({
            formation: { kind: 'pantheon', minColumn: minColumn, minLevel: baseLevel, minRow: minRow, columnCount: 5, levelCount: 4, rowCount: 5 },
            cells: cellsOfStacks(minColumn, minRow, 5, 5),
          });
        }
      }
    }

    // the great basilica: two aisles of one height, one point wide, with a taller nave between
    // them, all of one length (3 points or more). Looked for with the nave along z, then along x.
    [false, true].forEach(function (naveRunsAlongX) {
      const acrossLimit = naveRunsAlongX ? rowCount : columnCount;
      const alongLimit = naveRunsAlongX ? columnCount : rowCount;
      const heightOf = function (across, along) {
        return naveRunsAlongX ? heightAt(along, across) : heightAt(across, along);
      };
      // the height a line of stacks across the nave's direction shares from alongStart to alongEnd, or 0
      const sharedHeight = function (across, alongStart, alongEnd) {
        const height = heightOf(across, alongStart);
        for (let along = alongStart + 1; along <= alongEnd; along++) {
          if (heightOf(across, along) !== height) {
            return 0;
          }
        }
        return height;
      };
      for (let alongStart = 0; alongStart < alongLimit; alongStart++) {
        for (let alongEnd = alongStart + 2; alongEnd < alongLimit; alongEnd++) {
          for (let firstAisle = 0; firstAisle + 2 < acrossLimit; firstAisle++) {
            const aisleHeight = sharedHeight(firstAisle, alongStart, alongEnd);
            if (aisleHeight === 0) {
              continue;
            }
            const naveHeight = sharedHeight(firstAisle + 1, alongStart, alongEnd);
            if (naveHeight <= aisleHeight) {
              continue;
            }
            let secondAisle = firstAisle + 2;
            while (secondAisle < acrossLimit && sharedHeight(secondAisle, alongStart, alongEnd) === naveHeight) {
              secondAisle++;
            }
            if (secondAisle >= acrossLimit || sharedHeight(secondAisle, alongStart, alongEnd) !== aisleHeight) {
              continue;
            }
            const acrossCount = secondAisle - firstAisle + 1;
            const alongCount = alongEnd - alongStart + 1;
            candidates.push({
              formation: {
                kind: 'greatBasilica', minLevel: baseLevel, levelCount: naveHeight, aisleLevelCount: aisleHeight, naveRunsAlongX: naveRunsAlongX,
                minColumn: naveRunsAlongX ? alongStart : firstAisle, minRow: naveRunsAlongX ? firstAisle : alongStart,
                columnCount: naveRunsAlongX ? alongCount : acrossCount, rowCount: naveRunsAlongX ? acrossCount : alongCount,
              },
              cells: naveRunsAlongX ? cellsOfStacks(alongStart, firstAisle, alongCount, acrossCount) : cellsOfStacks(firstAisle, alongStart, acrossCount, alongCount),
            });
          }
        }
      }
    });

    // the court: a ring of stacks one high round a middle with nothing on it
    for (let minRow = 0; minRow + 3 <= rowCount; minRow++) {
      for (let minColumn = 0; minColumn + 3 <= columnCount; minColumn++) {
        if (heightAt(minColumn, minRow) !== 1) {
          continue;
        }
        for (let countAlongZ = 3; countAlongZ <= largestCourtSide && minRow + countAlongZ <= rowCount; countAlongZ++) {
          for (let countAlongX = 3; countAlongX <= largestCourtSide && minColumn + countAlongX <= columnCount; countAlongX++) {
            let fits = true;
            for (let rowOffset = 0; rowOffset < countAlongZ && fits; rowOffset++) {
              for (let columnOffset = 0; columnOffset < countAlongX && fits; columnOffset++) {
                const isOnRim = rowOffset === 0 || columnOffset === 0 || rowOffset === countAlongZ - 1 || columnOffset === countAlongX - 1;
                fits = heightAt(minColumn + columnOffset, minRow + rowOffset) === (isOnRim ? 1 : 0);
              }
            }
            if (fits) {
              candidates.push({
                formation: { kind: 'court', minColumn: minColumn, minLevel: baseLevel, minRow: minRow, columnCount: countAlongX, levelCount: 1, rowCount: countAlongZ },
                cells: cellsOfStacks(minColumn, minRow, countAlongX, countAlongZ),
              });
            }
          }
        }
      }
    }
  }
  return candidates;
}
