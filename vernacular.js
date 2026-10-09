// Purpose: the vernacular tier, the ordinary houses of the town. They are built from the blocks
// of the quads (quadBlocks.js): plastered walls on the lines between the quarters, under tiled roofs.
//
// A house is the ground of one owner: raised points beside each other grow into one house only
// where they belong to the same owner (volume.owners). Between the houses of two owners stands a
// party wall, and each has its own roof, its own plaster and its own door. Where no owners are
// named (a town drawn by hand) all the points that touch are one house, as before.
//
// What a stretch of wall looks like is not left to chance: it follows from its place, so a house
// keeps its face while the town changes round it.
// - It looks at a point: a busy street, a street or a yard (volume.streetGrades, told by the
//   settlement; in a town drawn by hand, open ground beside two buildings counts as busy and the
//   rest as street).
// - On the ground: a shop arch towards a busy street; one door for every house, towards a street
//   if it has one; windows otherwise, small ones towards a yard. In a settlement the shops are a
//   matter of time (volume.shopFronts): a house opens a shop when the street before it has become
//   busy, one front after another, and keeps it from then on.
// - On the second and third floor: tall windows towards the street (down to the floor on the
//   second, arched on the third), plain windows towards a yard.
// - Higher up: pairs of windows, then plain ones; small ones towards a yard.
// - A blank wall where the stretch looks at another building, and on a party wall.
//
// Towards a garden a house opens with a door on the ground and with windows as towards a street.
//
// A roof terrace: now and then the top storey of a block of a house of two storeys or more is
// not a room but a terrace: a floor open to the sky behind a low parapet, with a pergola of
// timber under a cloth. Which blocks have one follows from their place, so it stays.
//
// A classical block under a house (its portal, say) is taller than a level of the house and fills
// most of the level above it. What is left of that level is a connector: a low block without
// windows between the classical block and the house above. A wall parts it from the full rooms
// beside it on its level.

import { facesOfPatch, drawnIn, boxAlong, addSheetTriangle } from './patches';
import { HOUSE_WALL_MATERIALS } from './parts';
import { TIER, placeHash, vernacularLevelHeight } from './volume';
import { shrinkOutline } from './topology';
import { collapseWallStretches, buildRoofs } from './quadBlocks';

const wallThickness = 0.3;
const roofRisePerCell = 2.2;         // metres of roof height for each cell of distance from the eaves
const shortestStretchWithOpening = 1.35; // metres; a shorter stretch of wall stays blank
const chanceOfARoofTerrace = 0.15;
const parapetHeight = 1.0;

const STREET_GRADE = { yard: 0, street: 1, busyStreet: 2 };

// The looks of a stretch of wall (about half a cell long) and what each is cut with
export const STRETCH_LOOKS = {
  door: { openings: [{ centre: 0, bottom: 0, width: 1.0, height: 2.2, isArched: true }] },
  shop: { openings: [{ centre: 0, bottom: 0, width: 1.45, height: 2.4, isArched: true }] },
  window: { openings: [{ centre: 0, bottom: 1.0, width: 0.8, height: 1.2, isArched: false }] },
  archedWindow: { openings: [{ centre: 0, bottom: 0.8, width: 1.05, height: 1.75, isArched: true }] },
  // two narrow windows side by side
  pairOfWindows: { openings: [
    { centre: -0.42, bottom: 1.0, width: 0.5, height: 1.25, isArched: true }, { centre: 0.42, bottom: 1.0, width: 0.5, height: 1.25, isArched: true }] },
  // a tall window down to the floor, as onto a balcony
  tallWindow: { openings: [{ centre: 0, bottom: 0.15, width: 0.85, height: 2.3, isArched: false }] },
  // a small window high in the wall, as of a store room or a stair
  smallWindow: { openings: [{ centre: 0, bottom: 1.7, width: 0.55, height: 0.6, isArched: false }] },
  blank: { openings: [] },
  // a stretch too short for any opening
  narrow: { openings: [] },
  // the wall between the houses of two owners
  party: { openings: [] },
  // the low wall round a roof terrace
  parapet: { openings: [] },
  // the low wall of a connector, over a classical block
  connector: { openings: [] },
};

// The houses of a volume: houseOfPoint[pointIndex] is the number of the house a point belongs to
// (-1 where no house stands), and plasterOfHouse[house] its plaster. Points beside each other
// that hold a house on any level and have the same owner are one house.
function findHouses(volume, seed) {
  const map = volume.map;
  const holdsAHouse = new Uint8Array(volume.pointCount);
  volume.filledPlaces().forEach(function (place) {
    if (place.tier === TIER.vernacular) {
      holdsAHouse[place.pointIndex] = 1;
    }
  });
  const houseOfPoint = new Int32Array(volume.pointCount).fill(-1);
  const plasterOfHouse = [];
  for (let startPoint = 0; startPoint < volume.pointCount; startPoint++) {
    if (!holdsAHouse[startPoint] || houseOfPoint[startPoint] !== -1) {
      continue;
    }
    const house = plasterOfHouse.length;
    const owner = volume.ownerAt(startPoint);
    const pending = [startPoint];
    houseOfPoint[startPoint] = house;
    while (pending.length > 0) {
      const pointIndex = pending.pop();
      map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
        if (holdsAHouse[neighbourPoint] && houseOfPoint[neighbourPoint] === -1 && volume.ownerAt(neighbourPoint) === owner) {
          houseOfPoint[neighbourPoint] = house;
          pending.push(neighbourPoint);
        }
      });
    }
    // the plaster stays with the owner while the house grows; without owners, with its first point
    const plasterChoice = owner !== 0 ? placeHash(owner, 0, seed + 5) : placeHash(startPoint, 0, seed);
    // (a house is plastered in one of the colours, or shows its brick)
    plasterOfHouse.push(HOUSE_WALL_MATERIALS[Math.floor(plasterChoice * HOUSE_WALL_MATERIALS.length)]);
  }
  return { houseOfPoint: houseOfPoint, plasterOfHouse: plasterOfHouse };
}

function vernacularStyle(volume, houses, seed) {
  const map = volume.map;
  function isBlock(pointIndex, level) {
    return volume.tierAt(pointIndex, level) === TIER.vernacular;
  }
  // a roof terrace: the top storey of a block, on a storey of the house; in a settlement where
  // the household built one (volume.roofTerraces), otherwise chosen by its place
  function isTerrace(pointIndex, level) {
    if (!(level >= 1 && isBlock(pointIndex, level) && volume.tierAt(pointIndex, level + 1) === TIER.empty && isBlock(pointIndex, level - 1))) {
      return false;
    }
    return volume.roofTerraces ? volume.roofTerraces[pointIndex] === 1 : placeHash(pointIndex, level, seed + 71) < chanceOfARoofTerrace;
  }
  // how much the ground of a point is used as street
  function streetGradeAt(pointIndex) {
    if (volume.streetGrades !== null) {
      return volume.streetGrades[pointIndex];
    }
    let builtNeighbourCount = 0;
    map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
      if (volume.tierAt(neighbourPoint, 0) !== TIER.empty) {
        builtNeighbourCount++;
      }
    });
    return builtNeighbourCount >= 2 ? STREET_GRADE.busyStreet : STREET_GRADE.street;
  }

  // whether a house looks at a point with a shop: as the settlement has opened its shops, or, in
  // a town drawn by hand, wherever the point is a busy street
  function isShopFront(raisedPoint, facedPoint) {
    if (volume.shopFronts !== null) {
      return volume.hasShopFront(raisedPoint, facedPoint);
    }
    return streetGradeAt(facedPoint) === STREET_GRADE.busyStreet;
  }

  // The door of every house: of its stretches on the ground that look at open ground and are not
  // shops, the one towards a street rather than a yard; among equals the first by name, so that
  // the door stays where it is while the house is unchanged.
  const doorOfHouse = new Map(); // house -> { name, streetGrade }
  map.cells.forEach(function (cell, cellIndex) {
    for (let side = 0; side < 4; side++) {
      const firstPoint = cell.corners[side];
      const secondPoint = cell.corners[(side + 1) % 4];
      const firstIsBlock = isBlock(firstPoint, 0);
      if (firstIsBlock === isBlock(secondPoint, 0)) {
        continue;
      }
      const raisedPoint = firstIsBlock ? firstPoint : secondPoint;
      const facedPoint = firstIsBlock ? secondPoint : firstPoint;
      const length = Math.hypot(cell.middle.x - cell.sideMiddles[side].x, cell.middle.z - cell.sideMiddles[side].z);
      const streetGrade = streetGradeAt(facedPoint);
      if (volume.tierAt(facedPoint, 0) !== TIER.empty || length < shortestStretchWithOpening || isShopFront(raisedPoint, facedPoint)) {
        continue;
      }
      const name = 'q' + cellIndex + ':' + side;
      const house = houses.houseOfPoint[raisedPoint];
      const known = doorOfHouse.get(house);
      if (known === undefined || streetGrade > known.streetGrade || (streetGrade === known.streetGrade && name < known.name)) {
        doorOfHouse.set(house, { name: name, streetGrade: streetGrade });
      }
    }
  });

  function lookOf(stretch) {
    if (stretch.isPartyWall) {
      return 'party';
    }
    if (volume.heightEatenFromBelowAt(stretch.raisedPoint, stretch.level) > 0) {
      return 'connector';
    }
    if (stretch.length < shortestStretchWithOpening) {
      return 'narrow';
    }
    if (isTerrace(stretch.raisedPoint, stretch.level)) {
      return 'parapet';
    }
    if (stretch.facedPoint === -1) {
      return stretch.level === 0 ? 'smallWindow' : 'window'; // the rim of the map
    }
    const facedTier = volume.tierAt(stretch.facedPoint, stretch.level);
    if (facedTier === TIER.garden) {
      return 'door'; // into the garden
    }
    if (facedTier !== TIER.empty) {
      return 'blank'; // it looks at another building
    }
    // (over a garden a house looks as over a street)
    const streetGrade = volume.tierAt(stretch.facedPoint, 0) === TIER.garden ? STREET_GRADE.street : streetGradeAt(stretch.facedPoint);
    const looksAtAYard = streetGrade === STREET_GRADE.yard;
    if (stretch.level === 0) {
      if (isShopFront(stretch.raisedPoint, stretch.facedPoint)) {
        return 'shop';
      }
      const door = doorOfHouse.get(houses.houseOfPoint[stretch.raisedPoint]);
      if (door !== undefined && door.name === stretch.name) {
        return 'door';
      }
      return looksAtAYard ? 'smallWindow' : 'window';
    }
    if (stretch.level === 1) {
      return looksAtAYard ? 'window' : 'tallWindow';
    }
    if (stretch.level === 2) {
      return looksAtAYard ? 'window' : 'archedWindow';
    }
    if (stretch.level === 3) {
      return looksAtAYard ? 'smallWindow' : 'pairOfWindows';
    }
    return looksAtAYard ? 'smallWindow' : 'window';
  }

  return {
    isBlock: isBlock,
    isTerrace: isTerrace,
    // (a connector and a full room beside it are parted too, by a wall inside the house; and a
    // roof terrace from the room beside it)
    isSameBuilding: function (firstPoint, secondPoint, level) {
      return houses.houseOfPoint[firstPoint] === houses.houseOfPoint[secondPoint] &&
        volume.heightEatenFromBelowAt(firstPoint, level) === volume.heightEatenFromBelowAt(secondPoint, level) &&
        isTerrace(firstPoint, level) === isTerrace(secondPoint, level);
    },
    // every stretch has the one look its place gives it: the collapse has nothing left to choose
    optionsFor: function (stretch) {
      return [lookOf(stretch)];
    },
    weightOf: function () {
      return 1;
    },
    mayStandBeside: function () {
      return true;
    },
    mayStandAbove: function () {
      return true;
    },
    fallbackLooks: ['window', 'narrow', 'blank'],
  };
}

export function buildVernacular(collector, volume, seed) {
  const map = volume.map;
  const houses = findHouses(volume, seed);
  const style = vernacularStyle(volume, houses, seed);
  const stretches = collapseWallStretches(volume, seed, style);
  collector.placeAt(0, 0, 0, 0);

  volume.filledPlaces().forEach(function (place) {
    if (place.tier !== TIER.vernacular) {
      return;
    }
    const point = map.points[place.pointIndex];
    const heightEaten = volume.heightEatenFromBelowAt(place.pointIndex, place.level);
    const bottomY = volume.bottomHeightAt(place.pointIndex, place.level) + heightEaten;
    const standsOnNothing = place.level > 0 && volume.tierAt(place.pointIndex, place.level - 1) === TIER.empty;
    if (style.isTerrace(place.pointIndex, place.level)) {
      // a roof terrace: its floor, a pergola of four posts under a cloth, and someone up there
      map.quartersOfPoint[place.pointIndex].forEach(function (quarter) {
        collector.polygonPrism('stoneShade', quarter.outline, bottomY - 0.02, 0.14);
      });
      // (the pergola follows the patch: a post towards the middle of every quad round the point,
      // a beam from post to post, the cloth over them)
      const pergolaHeight = 2.3;
      const posts = [];
      facesOfPatch(map, place.pointIndex).forEach(function (face) {
        if (face.before !== null) {
          posts.push(drawnIn(face.before, point, 0.42));
        }
      });
      const cloth = [];
      const clothY = bottomY + 0.22 + pergolaHeight;
      posts.forEach(function (post, postNumber) {
        const next = posts[(postNumber + 1) % posts.length];
        const towardsPoint = Math.hypot(point.x - post[0], point.z - post[1]) || 1;
        boxAlong(collector, map, 'timber', post[0], post[1], (point.x - post[0]) / towardsPoint, (point.z - post[1]) / towardsPoint, 0.13, 0.13, bottomY + 0.12, pergolaHeight);
        collector.wallBetween('timber', post[0], post[1], next[0], next[1], bottomY + 0.12 + pergolaHeight, 0.1, 0.1, []);
        addSheetTriangle(cloth, [point.x, clothY, point.z], [post[0], clothY, post[1]], [next[0], clothY, next[1]], true);
      });
      collector.addTriangles(placeHash(place.pointIndex, place.level, seed + 72) < 0.5 ? 'canvasLinen' : 'canvasHemp', cloth);
      if (placeHash(place.pointIndex, place.level, seed + 73) < 0.5) {
        collector.person(point.x + 0.4, bottomY + 0.12, point.z - 0.3);
      }
      return;
    }
    map.quartersOfPoint[place.pointIndex].forEach(function (quarter) {
      // the dark inside, seen through the openings
      // it ends under the ceiling, so that its sides do not lie in the sides of the ceiling's parts
      collector.polygonPrism('interior', shrinkOutline(quarter.outline, point.x, point.z, 0.16), bottomY + 0.05, vernacularLevelHeight - heightEaten - 0.25);
      if (standsOnNothing) {
        collector.polygonPrism('stoneShade', quarter.outline, bottomY - 0.3, 0.3);
      }
    });
    // a raised point with nothing under it stands on a pier down to whatever is below
    if (standsOnNothing) {
      let supportLevel = place.level - 1;
      while (supportLevel > 0 && volume.tierAt(place.pointIndex, supportLevel - 1) === TIER.empty) {
        supportLevel--;
      }
      const supportY = volume.bottomHeightAt(place.pointIndex, supportLevel);
      collector.box('stoneShade', 0.7, bottomY - supportY - 0.3, 0.7, point.x, supportY, point.z);
    }
  });

  stretches.forEach(function (stretch) {
    const house = houses.houseOfPoint[stretch.raisedPoint];
    // The wall runs half its thickness past an end of its stretch: at an outer corner the two
    // walls then close the corner between them, and no end of a wall is left bare in the middle
    // of it. Not where the wall of another house or a party wall meets it: there the walls end on
    // the line between the houses.
    const alongX = (stretch.end.x - stretch.start.x) / stretch.length;
    const alongZ = (stretch.end.z - stretch.start.z) / stretch.length;
    const reachPastEnds = stretch.endNames.map(function (endName) {
      const meetsAnotherHouse = stretch.isPartyWall || stretch.beside.some(function (other) {
        return other.endNames.includes(endName) && (other.isPartyWall || houses.houseOfPoint[other.raisedPoint] !== house);
      });
      return meetsAnotherHouse ? 0 : wallThickness / 2;
    });
    // a connector has only the height its classical block leaves it; a wall between two blocks
    // is as high as the higher of them
    let heightEaten = volume.heightEatenFromBelowAt(stretch.raisedPoint, stretch.level);
    if (stretch.isPartyWall) {
      heightEaten = Math.min(heightEaten, volume.heightEatenFromBelowAt(stretch.facedPoint, stretch.level));
    }
    // the parapet of a roof terrace is low; between two terraces of different houses it is low too
    const isLow = stretch.look === 'parapet' ||
      (stretch.isPartyWall && style.isTerrace(stretch.raisedPoint, stretch.level) && style.isTerrace(stretch.facedPoint, stretch.level));
    const wallHeight = isLow ? parapetHeight : vernacularLevelHeight - heightEaten;
    // a wall that shows no face (a party wall, a wall that looks at another building) is bare brick
    const showsNoFace = (stretch.look === 'party' && !isLow) || stretch.look === 'blank';
    collector.wallBetween(showsNoFace ? 'brick' : houses.plasterOfHouse[house],
      stretch.start.x - alongX * reachPastEnds[0], stretch.start.z - alongZ * reachPastEnds[0],
      stretch.end.x + alongX * reachPastEnds[1], stretch.end.z + alongZ * reachPastEnds[1],
      volume.bottomHeightAt(stretch.raisedPoint, stretch.level) + heightEaten, wallHeight, wallThickness, STRETCH_LOOKS[stretch.look].openings);
  });
  // (a roof terrace has no roof: the roofs beside it end at it)
  const isRoofedBlock = function (pointIndex, level) {
    return style.isBlock(pointIndex, level) && !style.isTerrace(pointIndex, level);
  };
  buildRoofs(collector, volume, isRoofedBlock, roofRisePerCell, function (pointIndex) {
    return houses.houseOfPoint[pointIndex];
  }, function (pointIndex) {
    // (the shade of the tiles stays with the owner, as the plaster does; a town drawn by hand has no owners)
    const owner = volume.ownerAt(pointIndex);
    return owner !== 0 ? owner : houses.houseOfPoint[pointIndex];
  });
  return stretches;
}
