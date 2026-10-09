// Purpose: the works of the city that are not buildings of blocks: the wall with its towers and
// gates, the aqueduct, the fountains. They lie on the points of the grid like everything else
// (volume.works tells what lies on each point).
//
// - The wall is built on the patches of its points, as a house is (patches.js): each point of
//   wall is the whole ground of the quarters round it, of brick, 6 m high, so that the wall is a
//   block thick, closes from point to point and is skewed with the grid. Merlons stand along the
//   faces that look out of it. A tower (the same patch, higher) where it turns or ends and now
//   and then on a straight run.
// - A gate is the patch of its point too: a gatehouse of stone with a passage through it from
//   the face that looks out of the town to the face that looks in, an arch on each of the two,
//   and the ground on either side of the passage raised as its two towers.
// - The aqueduct is narrow (2 m) and runs from point to point along the sides of the quads.
// - The aqueduct: of rough stone, an arcade that carries its channel 8 m above the ground. Its
//   piers stand between the points and its arches over them, so that a street passes under an
//   arch. Where it turns, branches or ends it stands on a pier at the point itself, and the water
//   runs on over the pier: the channels open into a round of water there.
// - The fountain: a basin of marble at the end of an aqueduct, the water falling from the last pier.

import { cellSize } from './parts';
import { WORK } from './volume';
import { shrinkOutline } from './topology';
import { facesOfPatch, stretchesOfFace, drawnIn, prismOver, boxAlong } from './patches';

const wallHeight = 6;
const towerHeight = 9;
const gateHeight = 10;              // over the passage
const gateTowerHeight = 12;         // on either side of it
const gateArchHeight = 6.2;
const widestGateArch = 2.8;
const aqueductHeight = 8;
const aqueductThickness = 2;
const channelWallThickness = 0.4;

export function buildWorks(collector, volume) {
  const map = volume.map;
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
  // whether a point lies on a straight run: two neighbours, nearly opposite each other
  function runsStraightThrough(point, neighbourPoints) {
    if (neighbourPoints.length !== 2) {
      return false;
    }
    const first = directionBetween(point, map.points[neighbourPoints[0]]);
    const second = directionBetween(point, map.points[neighbourPoints[1]]);
    return first.x * second.x + first.z * second.z < -0.85;
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
      stretchesOfFace(face).forEach(function (stretch) {
        merlonsAlong(materialName, drawnIn(stretch[0], point, 0.02), drawnIn(stretch[1], point, 0.02), height + 0.25);
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
        merlonsAlong('stone', chain[index], chain[index + 1], gateTowerHeight + 0.25);
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
      merlonsAlong('stone', outline[jamb.before], outline[jamb.after], gateHeight + 0.35);
    });
    return true;
  }

  for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
    const works = volume.works[pointIndex];
    if (works === 0) {
      continue;
    }
    const point = map.points[pointIndex];

    // ---- the wall and its gates: on the patch of the point
    if (works & (WORK.wall | WORK.gate)) {
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
            merlonsAlong('brick', drawnIn(stretch[0], point, 0.1), drawnIn(stretch[1], point, 0.1), wallHeight);
          });
        });
        if (wallNeighbours.length <= 2 && (!runsStraightThrough(point, wallNeighbours) || pointIndex % 5 === 0)) {
          // a tower where the wall turns or ends, and now and then on a straight run
          towerOnPatch('brick', pointIndex, faces, towerHeight);
        }
      }
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

    // ---- the fountain: a basin of marble round the last pier of the aqueduct
    if (works & WORK.fountain) {
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
