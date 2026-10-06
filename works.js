// Purpose: the works of the city that are not buildings of blocks: the wall with its towers and
// gates, the aqueduct, the fountains. They lie on the points of the grid like everything else
// (volume.works tells what lies on each point), but they are narrow: a block is 4 m wide, a wall
// or an aqueduct 2 m. They run from point to point along the sides of the quads.
//
// - The wall: of brick, 6 m high, with a walk and merlons, a tower where it turns or ends and now
//   and then on a straight run.
// - A gate takes the place of the wall on its point: a gatehouse of stone higher and deeper than
//   the wall, a tall arch through it across the wall, a tower at each end of it. The wall begins
//   again beyond the towers.
// - The aqueduct: of rough stone, an arcade that carries its channel 8 m above the ground. Its
//   piers stand between the points and its arches over them, so that a street passes under an
//   arch. Where it turns, branches or ends it stands on a pier at the point itself, and the water
//   runs on over the pier: the channels open into a round of water there.
// - The fountain: a basin of marble at the end of an aqueduct, the water falling from the last pier.

import { cellSize } from './parts';
import { WORK } from './volume';

const wallHeight = 6;
const wallThickness = 2;
const towerHeight = 9;
const towerSize = 3;
const gateHeight = 10;
const gateDepth = 4.2;              // across the wall
const gateTowerSize = 2.8;
const gateTowerHeight = 12;
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
  // how far from its point a gate reaches along the wall: its arch and the towers at its ends
  const reachOfAGate = cellSize / 2 - 0.3 + gateTowerSize - 0.4;

  for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
    const works = volume.works[pointIndex];
    if (works === 0) {
      continue;
    }
    const point = map.points[pointIndex];

    // ---- the wall and its gates
    if (works & (WORK.wall | WORK.gate)) {
      const wallNeighbours = neighboursWith(pointIndex, WORK.wall | WORK.gate);
      wallNeighbours.forEach(function (neighbourPoint) {
        if (neighbourPoint < pointIndex) {
          return; // each stretch once
        }
        const neighbour = map.points[neighbourPoint];
        const along = directionBetween(point, neighbour);
        // a gate takes the place of the wall beside its point: the wall begins beyond its towers
        const startDistance = has(pointIndex, WORK.gate) ? Math.min(reachOfAGate, along.length / 2) : 0;
        const endDistance = along.length - (has(neighbourPoint, WORK.gate) ? Math.min(reachOfAGate, along.length / 2) : 0);
        if (endDistance - startDistance < 0.3) {
          return;
        }
        const startX = point.x + along.x * startDistance, startZ = point.z + along.z * startDistance;
        const endX = point.x + along.x * endDistance, endZ = point.z + along.z * endDistance;
        collector.wallBetween('brick', startX, startZ, endX, endZ, 0, wallHeight, wallThickness, []);
        // merlons along both edges of the walk
        const merlonCount = Math.max(1, Math.round((endDistance - startDistance) / 1.3));
        for (let merlon = 0; merlon < merlonCount; merlon++) {
          const distance = startDistance + (merlon + 0.5) * (endDistance - startDistance) / merlonCount;
          [-1, 1].forEach(function (edge) {
            turnedBox('brick', point.x + along.x * distance - edge * along.z * (wallThickness / 2 - 0.2), point.z + along.z * distance + edge * along.x * (wallThickness / 2 - 0.2),
              along.x, along.z, 0.65, 0.4, wallHeight, 0.7);
          });
        }
      });
      if (works & WORK.gate) {
        // The gatehouse lies along the wall: from the neighbour on one side to the one on the
        // other where there are two, so that it joins the wall on both; its arch goes through
        // it across the wall.
        let alongWall = wallNeighbours.length > 0 ? directionBetween(point, map.points[wallNeighbours[0]]) : { x: 1, z: 0 };
        if (wallNeighbours.length >= 2) {
          alongWall = directionBetween(map.points[wallNeighbours[1]], map.points[wallNeighbours[0]]);
        }
        const archLength = cellSize - 0.6;
        collector.wallBetween('stone', point.x - alongWall.x * archLength / 2, point.z - alongWall.z * archLength / 2,
          point.x + alongWall.x * archLength / 2, point.z + alongWall.z * archLength / 2, 0, gateHeight, gateDepth,
          [{ centre: 0, bottom: 0, width: 2.8, height: 6.2, isArched: true }]);
        turnedBox('stoneShade', point.x, point.z, alongWall.x, alongWall.z, archLength + 0.2, gateDepth + 0.4, gateHeight, 0.35);
        // a band over the arch on both faces, and merlons along both
        [-1, 1].forEach(function (face) {
          turnedBox('stoneShade', point.x - face * alongWall.z * (gateDepth / 2 + 0.08), point.z + face * alongWall.x * (gateDepth / 2 + 0.08),
            alongWall.x, alongWall.z, archLength, 0.16, 7.0, 0.35);
          [-1.2, 0, 1.2].forEach(function (place) {
            turnedBox('stone', point.x + place * alongWall.x - face * alongWall.z * (gateDepth / 2 - 0.25), point.z + place * alongWall.z + face * alongWall.x * (gateDepth / 2 - 0.25),
              alongWall.x, alongWall.z, 0.7, 0.5, gateHeight + 0.35, 0.75);
          });
        });
        // the two towers that flank it
        [-1, 1].forEach(function (end) {
          const distance = end * (archLength / 2 + gateTowerSize / 2 - 0.4);
          tower('stone', point.x + alongWall.x * distance, point.z + alongWall.z * distance, alongWall.x, alongWall.z, gateTowerHeight, gateTowerSize);
        });
      } else if (wallNeighbours.length <= 2 && (!runsStraightThrough(point, wallNeighbours) || pointIndex % 5 === 0)) {
        // a tower where the wall turns or ends, and now and then on a straight run
        const along = wallNeighbours.length > 0 ? directionBetween(point, map.points[wallNeighbours[0]]) : { x: 1, z: 0 };
        tower('brick', point.x, point.z, along.x, along.z, towerHeight, towerSize);
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
