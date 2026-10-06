// Purpose: the gardens. A garden is ground of a house that is left open: a point of the volume
// of its own kind (TIER.garden), lying on the ground, nothing on it. It has grass and trees of
// few faces (a cypress, a stone pine with its flat head, an olive, a clipped hedge), and a wall only towards what is not its owner's: the street, free ground, a neighbour.
// Towards the house it belongs to, and towards the next point of the same garden, it is open.

import * as THREE from 'three';
import { HOUSE_WALL_MATERIALS } from './parts';
import { TIER, placeHash, gardenWallHeight } from './volume';

const wallThickness = 0.3;

export function buildGardens(collector, volume, seed) {
  const map = volume.map;
  collector.placeAt(0, 0, 0, 0);
  function isGarden(pointIndex) {
    return volume.tierAt(pointIndex, 0) === TIER.garden;
  }
  // Whether a point beside a garden belongs with it, so that no wall stands between them: the
  // same owner's garden or building. Where no owners are named (a town drawn by hand), another
  // garden or a house beside it.
  function belongsWith(gardenPoint, otherPoint) {
    const tierOfOther = volume.tierAt(otherPoint, 0);
    if (tierOfOther === TIER.empty) {
      return false;
    }
    const owner = volume.ownerAt(gardenPoint);
    if (owner !== 0 || volume.ownerAt(otherPoint) !== 0) {
      return volume.ownerAt(otherPoint) === owner;
    }
    return tierOfOther === TIER.garden || tierOfOther === TIER.vernacular;
  }

  const grass = [];
  for (let pointIndex = 0; pointIndex < volume.pointCount; pointIndex++) {
    if (!isGarden(pointIndex)) {
      continue;
    }
    const point = map.points[pointIndex];
    map.quartersOfPoint[pointIndex].forEach(function (quarter) {
      [[0, 2, 1], [0, 3, 2]].forEach(function (triangle) {
        triangle.forEach(function (cornerIndex) {
          grass.push(quarter.outline[cornerIndex][0], 0.08, quarter.outline[cornerIndex][1]);
        });
      });
    });
    // one to three trees, always the same ones: a cypress, a stone pine, or an olive
    const treeCount = 1 + Math.floor(placeHash(pointIndex, 0, seed + 61) * 2.6);
    for (let tree = 0; tree < treeCount; tree++) {
      const angle = (tree + placeHash(pointIndex, tree, seed + 62)) * 2 * Math.PI / treeCount;
      const distance = 0.7 + placeHash(pointIndex, tree, seed + 63) * 0.7;
      const treeX = point.x + Math.cos(angle) * distance;
      const treeZ = point.z + Math.sin(angle) * distance;
      const size = 0.8 + placeHash(pointIndex, tree, seed + 64) * 0.5;
      const kind = placeHash(pointIndex, tree, seed + 65);
      if (kind < 0.35) {
        // a cypress: a tall cone of six sides
        collector.cylinder('timber', 0.08, 0.1, 0.5, treeX, 0, treeZ, 5);
        collector.cylinder('leaf', 0, 0.48 * size, 5.2 * size, treeX, 0.4, treeZ, 6);
      } else if (kind < 0.65) {
        // a stone pine: a tall bare trunk under a flat, wide head
        const trunkHeight = 4.2 * size;
        collector.cylinder('timber', 0.1, 0.16, trunkHeight, treeX, 0, treeZ, 5);
        const head = new THREE.IcosahedronGeometry(1.5 * size, 0);
        head.scale(1, 0.42, 1);
        head.rotateY(angle);
        head.translate(treeX, trunkHeight + 0.35 * size, treeZ);
        collector.add('leaf', head);
      } else {
        // an olive: a short trunk, a round head of few faces, a smaller one beside it
        collector.cylinder('timber', 0.12, 0.17, 1.2 * size, treeX, 0, treeZ, 5);
        const head = new THREE.IcosahedronGeometry(1.0 * size, 0);
        head.rotateY(angle);
        head.translate(treeX, 1.9 * size, treeZ);
        collector.add('leafPale', head);
        const sideHead = new THREE.IcosahedronGeometry(0.6 * size, 0);
        sideHead.translate(treeX + 0.6 * size * Math.cos(angle + 1), 1.5 * size, treeZ + 0.6 * size * Math.sin(angle + 1));
        collector.add('leafPale', sideHead);
      }
    }
    // a clipped hedge round a bed in the middle, in some gardens
    if (placeHash(pointIndex, 0, seed + 67) < 0.4) {
      collector.box('leaf', 1.1, 0.5, 0.3, point.x, 0.08, point.z - 0.4);
      collector.box('leaf', 1.1, 0.5, 0.3, point.x, 0.08, point.z + 0.4);
    }
  }
  if (grass.length > 0) {
    collector.addTriangles('grass', grass);
  }

  // the walls: inside every quad, on the line between the quarter of a garden point and the
  // quarter of a point that does not belong with it (as the walls of the houses are found)
  map.cells.forEach(function (cell, cellIndex) {
    for (let side = 0; side < 4; side++) {
      const firstPoint = cell.corners[side];
      const secondPoint = cell.corners[(side + 1) % 4];
      const firstIsGarden = isGarden(firstPoint);
      const secondIsGarden = isGarden(secondPoint);
      if (!firstIsGarden && !secondIsGarden) {
        continue;
      }
      const gardenPoint = firstIsGarden ? firstPoint : secondPoint;
      const otherPoint = firstIsGarden ? secondPoint : firstPoint;
      if (belongsWith(gardenPoint, otherPoint)) {
        continue;
      }
      // (a house of someone else beside it has its own wall on this line: none of the garden's)
      const tierOfOther = volume.tierAt(otherPoint, 0);
      if (tierOfOther === TIER.vernacular || (firstIsGarden && secondIsGarden && firstPoint > secondPoint)) {
        continue;
      }
      const start = cell.sideMiddles[side];
      const end = cell.middle;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const alongX = (end.x - start.x) / length;
      const alongZ = (end.z - start.z) / length;
      const owner = volume.ownerAt(gardenPoint);
      // (one wall for all the gardens drawn by hand, which have no owner to tell them apart)
      const wallChoice = placeHash(owner, 0, seed + 5);
      const wallMaterial = HOUSE_WALL_MATERIALS[Math.floor(wallChoice * HOUSE_WALL_MATERIALS.length)];
      // now and then a door in the wall, where it looks at open ground
      const hasADoor = tierOfOther === TIER.empty && length > 1.5 && placeHash(cellIndex, side, seed + 66) < 0.14;
      collector.wallBetween(wallMaterial, start.x - alongX * wallThickness / 2, start.z - alongZ * wallThickness / 2,
        end.x + alongX * wallThickness / 2, end.z + alongZ * wallThickness / 2, 0, gardenWallHeight, wallThickness,
        hasADoor ? [{ centre: 0, bottom: 0, width: 0.9, height: 1.85, isArched: true }] : []);
      collector.wallBetween('tile', start.x - alongX * 0.2, start.z - alongZ * 0.2, end.x + alongX * 0.2, end.z + alongZ * 0.2,
        gardenWallHeight, 0.12, wallThickness + 0.16, []); // the coping of tiles
    }
  });
}
