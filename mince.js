// Purpose: the mince. A designed model (models.js) is cut along the points of its volume into
// the pieces of its quads, level by level; a building is then put together from those pieces.
// The pieces are a product of the model, never drawn on their own.
//
// A model of widthPoints by depthPoints points lies over (widthPoints + 1) by (depthPoints + 1)
// quads: the quads between its points, and the ring of quads round them that holds its edges and
// corners (the model reaches only half a quad into those, to the centre line, and a little past
// it with its platform and cornice). Slice 0 across the width is the strip outside the first
// point, slice 1 the strip between the first point and the second, and so on; the same along the
// depth. Upwards a slice is a level, and whatever stands above the top of the volume (the roof
// and its parapet) is one more slice of its own, so that the same storey can carry any roof.
//
// Putting a building of another size together: every quad of the building takes the piece of the
// slice that answers to it. The slices before the repeat slice are counted from the near end,
// those after it from the far end, and the repeat slice fills what is between (or is left out
// when the building is smaller than the model).
//
// A quad holds more than its structure, and what else it holds would make pieces differ that are
// the same in structure. So a quad is cut in layers, each a piece of its own: the structure (with
// its base and head), the fill of a closed inside, and the steps before a front. And a piece of
// roof is the same piece wherever it lies in the height of its roof: it is kept from its lowest
// place, and how far it is lifted is kept with the quad.
//
// Pieces that come out the same (in the same model or in another) are one piece, kept once and
// shared: that is where the quads of different buildings turn out to be general. Pieces that are
// the same but for a turn or a mirror image are of one kind (kindKey): the collection of all
// pieces, gathered by kind, is where the pieces are generalized further.

import * as THREE from 'three';
import { PartCollector, cellSize } from './parts';
import { classicalLevelHeight } from './volume';
import { STRUCTURE_NAMES } from './orders';

const sharedPieces = new Map(); // the name of a piece -> the piece
const knownPieceMeasures = [];  // { name, materialNames, numbers } of every different piece
const knownKindMeasures = [];   // the same of every kind of piece

// The name of what a piece measures like: of the first known entry that any of the candidates
// agrees with closely, or a new name, registered with the first candidate
function findOrRegister(known, candidates, namePrefix) {
  const found = known.find(function (entry) {
    return candidates.some(function (candidate) {
      return candidate.materialNames === entry.materialNames && candidate.numbers.every(function (number, index) {
        return Math.abs(number - entry.numbers[index]) <= 0.12 + 0.002 * Math.abs(entry.numbers[index]);
      });
    });
  });
  if (found) {
    return found.name;
  }
  const name = namePrefix + (known.length + 1);
  known.push({ name: name, materialNames: candidates[0].materialNames, numbers: candidates[0].numbers });
  return name;
}
const mincedModels = new Map(); // model -> its mince

// The coordinate of a point of a row of pointCount points centred on the origin
function pointCoordinate(pointIndex, pointCount) {
  return (pointIndex - (pointCount - 1) / 2) * cellSize;
}

// The slice of the model that answers to a slice of the building
function sourceSliceOf(targetSlice, targetCount, sourceCount, repeatSlice) {
  const extraCount = targetCount - sourceCount;
  if (repeatSlice === null || extraCount === 0) {
    return targetSlice;
  }
  if (targetSlice < repeatSlice) {
    return targetSlice;
  }
  if (extraCount > 0) {
    return targetSlice <= repeatSlice + extraCount ? repeatSlice : targetSlice - extraCount;
  }
  return targetSlice - extraCount; // smaller than the model: the repeat slice is left out
}

// One convex polygon ([[x, y, z], ...]) cut to the side of a plane where coordinate[axis] * sign >= bound * sign
function clipPolygon(polygon, axis, bound, sign) {
  const clipped = [];
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = (current[axis] - bound) * sign;
    const nextDistance = (next[axis] - bound) * sign;
    if (currentDistance >= 0) {
      clipped.push(current);
    }
    if ((currentDistance > 0 && nextDistance < 0) || (currentDistance < 0 && nextDistance > 0)) {
      const share = currentDistance / (currentDistance - nextDistance);
      clipped.push([
        current[0] + (next[0] - current[0]) * share,
        current[1] + (next[1] - current[1]) * share,
        current[2] + (next[2] - current[2]) * share,
      ]);
    }
  }
  return clipped;
}

// Cuts a model into its pieces. Returns { places: Map 'across:along:level' or
// 'across:along:level:layer' -> { piece, liftY }, pieceCount, distinctCount }. A piece is { key, kindKey, trianglesOfMaterial, modelNames, placeCount, tags,
// position: 'corner' | 'edge' | 'inside', isRoof, layer: 'structure' | 'inside' | 'steps', isOfTheLanguage (cut from a model that is
// written in the design language) }; its
// triangles (Map materialName -> Float32Array) are counted from the middle of its quad and the
// floor of its level.
export function minceModel(model) {
  if (mincedModels.has(model)) {
    return mincedModels.get(model);
  }
  const collector = new PartCollector();
  model.build(collector);
  const widthPoints = model.widthPoints;
  const depthPoints = model.depthPoints;
  const levelCount = model.levelCount;
  // the middle of a slice, and its two bounds (none on the outer side of the outer slices)
  function sliceAcross(slice, pointCount) {
    return {
      middle: pointCoordinate(slice - 1, pointCount) + cellSize / 2,
      lower: slice === 0 ? -Infinity : pointCoordinate(slice - 1, pointCount),
      upper: slice === pointCount ? Infinity : pointCoordinate(slice, pointCount),
    };
  }
  function sliceOfCoordinate(coordinate, pointCount) {
    return Math.min(pointCount, Math.max(0, Math.floor(coordinate / cellSize + (pointCount - 1) / 2) + 1));
  }
  // the slice upwards: a level, or the roof (slice levelCount) for what is above the volume
  function levelOfHeight(height) {
    return Math.min(levelCount, Math.max(0, Math.floor(height / classicalLevelHeight)));
  }
  const coordinatesOfPiece = new Map(); // 'across:along:level' -> Map materialName -> number[]
  const tagsOfPiece = new Map();        // 'across:along:level' -> Set of the tags of the parts it is cut from
  collector.geometriesOfMaterial.forEach(function (geometries, materialName) {
    geometries.forEach(function (geometry) {
      const positions = geometry.getAttribute('position').array;
      for (let offset = 0; offset < positions.length; offset += 9) {
        const triangle = [
          [positions[offset], positions[offset + 1], positions[offset + 2]],
          [positions[offset + 3], positions[offset + 4], positions[offset + 5]],
          [positions[offset + 6], positions[offset + 7], positions[offset + 8]],
        ];
        // the way the triangle faces
        const faceNormal = [
          (triangle[1][1] - triangle[0][1]) * (triangle[2][2] - triangle[0][2]) - (triangle[1][2] - triangle[0][2]) * (triangle[2][1] - triangle[0][1]),
          (triangle[1][2] - triangle[0][2]) * (triangle[2][0] - triangle[0][0]) - (triangle[1][0] - triangle[0][0]) * (triangle[2][2] - triangle[0][2]),
          (triangle[1][0] - triangle[0][0]) * (triangle[2][1] - triangle[0][1]) - (triangle[1][1] - triangle[0][1]) * (triangle[2][0] - triangle[0][0]),
        ];
        // the slices the triangle reaches over
        const range = [0, 1, 2].map(function (axis) {
          let lowest = Math.min(triangle[0][axis], triangle[1][axis], triangle[2][axis]);
          let highest = Math.max(triangle[0][axis], triangle[1][axis], triangle[2][axis]);
          if (highest - lowest < 1e-6) {
            // a face that lies flat across this direction, perhaps in a cut itself: it goes to
            // one slice only, the one of the body it closes, which lies behind it: a top face
            // in a cut belongs to the level under the cut, a bottom face to the level over it
            lowest += faceNormal[axis] > 0 ? -1e-6 : 1e-6;
            highest = lowest;
          } else {
            // touching a cut with an edge is not reaching into the next slice
            lowest += 1e-6;
            highest -= 1e-6;
          }
          if (axis === 1) {
            return [levelOfHeight(lowest), levelOfHeight(highest)];
          }
          const pointCount = axis === 0 ? widthPoints : depthPoints;
          return [sliceOfCoordinate(lowest, pointCount), sliceOfCoordinate(highest, pointCount)];
        });
        for (let across = range[0][0]; across <= range[0][1]; across++) {
          for (let along = range[2][0]; along <= range[2][1]; along++) {
            for (let level = range[1][0]; level <= range[1][1]; level++) {
              const boundsAcross = sliceAcross(across, widthPoints);
              const boundsAlong = sliceAcross(along, depthPoints);
              let polygon = triangle;
              [[0, boundsAcross.lower, 1], [0, boundsAcross.upper, -1], [2, boundsAlong.lower, 1], [2, boundsAlong.upper, -1],
                [1, level === 0 ? -Infinity : level * classicalLevelHeight, 1], [1, level === levelCount ? Infinity : (level + 1) * classicalLevelHeight, -1]]
                .forEach(function (cut) {
                  if (Number.isFinite(cut[1]) && polygon.length >= 3) {
                    polygon = clipPolygon(polygon, cut[0], cut[1], cut[2]);
                  }
                });
              if (polygon.length < 3) {
                continue;
              }
              // the fill of the inside and the steps are layers of their own
              const layer = geometry.userData.tag === 'inside' || geometry.userData.tag === 'steps' ? geometry.userData.tag : 'structure';
              const pieceName = across + ':' + along + ':' + level + (layer === 'structure' ? '' : ':' + layer);
              if (!coordinatesOfPiece.has(pieceName)) {
                coordinatesOfPiece.set(pieceName, new Map());
                tagsOfPiece.set(pieceName, new Set());
              }
              if (geometry.userData.tag) {
                tagsOfPiece.get(pieceName).add(geometry.userData.tag);
              }
              const coordinatesOfMaterial = coordinatesOfPiece.get(pieceName);
              if (!coordinatesOfMaterial.has(materialName)) {
                coordinatesOfMaterial.set(materialName, []);
              }
              const coordinates = coordinatesOfMaterial.get(materialName);
              for (let corner = 1; corner + 1 < polygon.length; corner++) {
                [polygon[0], polygon[corner], polygon[corner + 1]].forEach(function (vertex) {
                  coordinates.push(vertex[0] - boundsAcross.middle, vertex[1] - level * classicalLevelHeight, vertex[2] - boundsAlong.middle);
                });
              }
            }
          }
        }
      }
      geometry.dispose();
    });
  });

  // pieces that are made of the same are one piece
  const places = new Map();
  const distinctKeys = new Set();
  coordinatesOfPiece.forEach(function (coordinatesOfMaterial, pieceName) {
    const nameParts = pieceName.split(':');
    const slices = nameParts.slice(0, 3).map(Number);
    const layer = nameParts[3] || 'structure';
    const isRoof = slices[2] === levelCount;
    // a piece of roof is kept from its lowest place
    let liftY = 0;
    if (isRoof) {
      liftY = Infinity;
      coordinatesOfMaterial.forEach(function (coordinates) {
        for (let index = 1; index < coordinates.length; index += 3) {
          liftY = Math.min(liftY, coordinates[index]);
        }
      });
      liftY = Math.round(liftY * 1000) / 1000;
      coordinatesOfMaterial.forEach(function (coordinates) {
        for (let index = 1; index < coordinates.length; index += 3) {
          coordinates[index] -= liftY;
        }
      });
    }
    // what the surface of the piece measures in each material, whatever triangles it happens to
    // be cut into: its area, where its middle lies, and how it is spread about the middle of the quad
    const measuresOfMaterial = new Map();
    Array.from(coordinatesOfMaterial.keys()).sort().forEach(function (materialName) {
      const coordinates = coordinatesOfMaterial.get(materialName);
      const measures = { area: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, zz: 0, xz: 0, xy: 0, yz: 0 };
      for (let offset = 0; offset < coordinates.length; offset += 9) {
        const first = [coordinates[offset], coordinates[offset + 1], coordinates[offset + 2]];
        const second = [coordinates[offset + 3], coordinates[offset + 4], coordinates[offset + 5]];
        const third = [coordinates[offset + 6], coordinates[offset + 7], coordinates[offset + 8]];
        const edgeOne = [second[0] - first[0], second[1] - first[1], second[2] - first[2]];
        const edgeTwo = [third[0] - first[0], third[1] - first[1], third[2] - first[2]];
        const area = Math.hypot(
          edgeOne[1] * edgeTwo[2] - edgeOne[2] * edgeTwo[1],
          edgeOne[2] * edgeTwo[0] - edgeOne[0] * edgeTwo[2],
          edgeOne[0] * edgeTwo[1] - edgeOne[1] * edgeTwo[0]) / 2;
        // the mean over a triangle of the product of two coordinates
        const meanProduct = function (firstAxis, secondAxis) {
          const sumFirst = first[firstAxis] + second[firstAxis] + third[firstAxis];
          const sumSecond = first[secondAxis] + second[secondAxis] + third[secondAxis];
          return (sumFirst * sumSecond + first[firstAxis] * first[secondAxis] + second[firstAxis] * second[secondAxis] + third[firstAxis] * third[secondAxis]) / 12;
        };
        measures.area += area;
        measures.x += area * (first[0] + second[0] + third[0]) / 3;
        measures.y += area * (first[1] + second[1] + third[1]) / 3;
        measures.z += area * (first[2] + second[2] + third[2]) / 3;
        measures.xx += area * meanProduct(0, 0);
        measures.yy += area * meanProduct(1, 1);
        measures.zz += area * meanProduct(2, 2);
        measures.xz += area * meanProduct(0, 2);
        // how it leans: a slope rising one way and its mirror image differ only in these
        measures.xy += area * meanProduct(0, 1);
        measures.yz += area * meanProduct(1, 2);
      }
      measuresOfMaterial.set(materialName, measures);
    });
    // the measures as numbers, as they stand or after a turn or a mirror image of the quad:
    // exchanged: x and z change places; signX, signZ: the directions are turned round
    const measuresAsNumbers = function (exchanged, signX, signZ) {
      const materialNames = [];
      const numbers = [];
      measuresOfMaterial.forEach(function (measures, materialName) {
        materialNames.push(materialName);
        numbers.push(
          measures.area, signX * (exchanged ? measures.z : measures.x), measures.y, signZ * (exchanged ? measures.x : measures.z),
          exchanged ? measures.zz : measures.xx, measures.yy, exchanged ? measures.xx : measures.zz, signX * signZ * measures.xz,
          signX * (exchanged ? measures.yz : measures.xy), signZ * (exchanged ? measures.xy : measures.yz));
      });
      return { materialNames: materialNames.join('|'), numbers: numbers };
    };
    // the same piece, and the same kind of piece, are found by measures that agree closely:
    // not exactly, since the same shape cut out of two models comes out with small differences
    const ownMeasures = measuresAsNumbers(false, 1, 1);
    const key = findOrRegister(knownPieceMeasures, [ownMeasures], 'piece');
    const turnedMeasures = [];
    [false, true].forEach(function (exchanged) {
      [1, -1].forEach(function (signX) {
        [1, -1].forEach(function (signZ) {
          turnedMeasures.push(measuresAsNumbers(exchanged, signX, signZ));
        });
      });
    });
    const kindKey = findOrRegister(knownKindMeasures, turnedMeasures, 'kind');
    if (!sharedPieces.has(key)) {
      const trianglesOfMaterial = new Map();
      coordinatesOfMaterial.forEach(function (coordinates, materialName) {
        trianglesOfMaterial.set(materialName, new Float32Array(coordinates));
      });
      const liesOnEdgeAcross = slices[0] === 0 || slices[0] === widthPoints;
      const liesOnEdgeAlong = slices[1] === 0 || slices[1] === depthPoints;
      sharedPieces.set(key, {
        key: key, kindKey: kindKey, trianglesOfMaterial: trianglesOfMaterial, modelNames: new Set(), placeCount: 0,
        tags: tagsOfPiece.get(pieceName),
        position: liesOnEdgeAcross && liesOnEdgeAlong ? 'corner' : liesOnEdgeAcross || liesOnEdgeAlong ? 'edge' : 'inside',
        isRoof: isRoof, layer: layer,
      });
    }
    const piece = sharedPieces.get(key);
    piece.modelNames.add(model.name);
    piece.placeCount++;
    piece.isOfTheLanguage = piece.isOfTheLanguage || !model.isOutsideTheLanguage;
    places.set(pieceName, { piece: piece, liftY: liftY });
    distinctKeys.add(key);
  });
  const minced = { places: places, pieceCount: places.size, distinctCount: distinctKeys.size };
  mincedModels.set(model, minced);
  return minced;
}

// How many of a model's distinct pieces are also pieces of a model of another name
export function countPiecesSharedWithOthers(model) {
  const seenKeys = new Set();
  let sharedCount = 0;
  minceModel(model).places.forEach(function (place) {
    const piece = place.piece;
    if (!seenKeys.has(piece.key)) {
      seenKeys.add(piece.key);
      if (piece.modelNames.size > 1) {
        sharedCount++;
      }
    }
  });
  return sharedCount;
}

// Puts a building of widthPoints by depthPoints points, levelCount levels high, together from
// the pieces of a model, in the frame the collector is placed at (the origin in the middle of the
// footprint on the base level, the front towards +z). gapBetweenPieces draws the pieces apart,
// for a picture of the mince. carriesABlockAt(pointAcross, pointAlong), if given, tells where
// something stands on the building: a quad whose points all carry something gets no roof.
// ground, if given, puts the building on the quads of the ground themselves instead of the
// collector's frame: { floorY, cornersOfQuad(across, along) }, the four places on the ground of
// the quad of a slice (see addWarpedPiece), or null where the ground has none. Every piece is
// then warped into its quad, so on an irregular ground the building is skewed with it.
export function buildFromMince(collector, model, widthPoints, depthPoints, levelCount, gapBetweenPieces, carriesABlockAt, ground) {
  const minced = minceModel(model);
  // a roof that is made for the size it covers is a model of its own, of the roof level only
  let mincedRoof = null;
  if (model.buildRoofFor) {
    const roofKey = widthPoints + ':' + depthPoints;
    if (!model.roofModels) {
      model.roofModels = new Map();
    }
    if (!model.roofModels.has(roofKey)) {
      model.roofModels.set(roofKey, {
        name: model.name, isOutsideTheLanguage: model.isOutsideTheLanguage, widthPoints: widthPoints, depthPoints: depthPoints, levelCount: 0,
        build: function (roofCollector) { model.buildRoofFor(roofCollector, widthPoints, depthPoints); },
      });
    }
    mincedRoof = minceModel(model.roofModels.get(roofKey));
  }
  const gap = gapBetweenPieces || 0;
  for (let across = 0; across <= widthPoints; across++) {
    const sourceAcross = sourceSliceOf(across, widthPoints, model.widthPoints, model.repeat.across);
    for (let along = 0; along <= depthPoints; along++) {
      const sourceAlong = sourceSliceOf(along, depthPoints, model.depthPoints, model.repeat.along);
      // what sits on a roof takes the roof away: the quad has none where all its points carry something
      let isCovered = carriesABlockAt !== undefined;
      for (let pointAcross = Math.max(0, across - 1); pointAcross <= Math.min(widthPoints - 1, across) && isCovered; pointAcross++) {
        for (let pointAlong = Math.max(0, along - 1); pointAlong <= Math.min(depthPoints - 1, along) && isCovered; pointAlong++) {
          isCovered = carriesABlockAt(pointAcross, pointAlong);
        }
      }
      for (let level = 0; level <= levelCount; level++) { // the last is the roof
        if (level === levelCount && isCovered) {
          continue;
        }
        const sourceLevel = level === levelCount ? model.levelCount : sourceSliceOf(level, levelCount, model.levelCount, model.repeat.up);
        const middleX = pointCoordinate(across - 1, widthPoints) + cellSize / 2 + (across - widthPoints / 2) * gap;
        const middleZ = pointCoordinate(along - 1, depthPoints) + cellSize / 2 + (along - depthPoints / 2) * gap;
        ['', ':inside', ':steps'].forEach(function (layerSuffix) {
          const isRoofOfItsOwn = level === levelCount && mincedRoof !== null;
          const place = isRoofOfItsOwn
            ? mincedRoof.places.get(across + ':' + along + ':0' + layerSuffix)
            : minced.places.get(sourceAcross + ':' + sourceAlong + ':' + sourceLevel + layerSuffix);
          if (!place) { // nothing of the model lies in that quad, in that layer
            return;
          }
          const floorY = level * (classicalLevelHeight + gap) + place.liftY;
          if (ground) {
            const corners = ground.cornersOfQuad(across, along);
            if (corners !== null) {
              addWarpedPiece(collector, place.piece, corners, ground.floorY + floorY);
              collector.piecePlacements.push({ piece: place.piece, corners: corners, floorY: ground.floorY + floorY });
            }
            return;
          }
          addPiece(collector, place.piece, middleX, floorY, middleZ);
          collector.piecePlacements.push({
            piece: place.piece,
            matrix: collector.placement.clone().multiply(new THREE.Matrix4().makeTranslation(middleX, floorY, middleZ)),
          });
        });
      }
    }
  }
}

// Puts a building on one point together round that point, whatever the number of quads that
// meet there: the corner piece of the model (its last corner: the quad after its point across
// and along) is warped into every quad round the point, so three quads give a building of three
// sides, five one of five. For that the model has to look the same on all its sides, so that its
// corners are all one piece (the loggia). quads: for each quad round the point its four places
// on the ground, the point first, then round the quad the way the model's corner goes (across,
// then along). hasRoof: whether the roof is put on. floorY: the height of its floor.
export function buildFromMinceRoundAPoint(collector, model, levelCount, hasRoof, floorY, quads) {
  const minced = minceModel(model);
  let mincedRoof = null;
  if (model.buildRoofFor) {
    if (!model.roofModels) {
      model.roofModels = new Map();
    }
    if (!model.roofModels.has('1:1')) {
      model.roofModels.set('1:1', {
        name: model.name, isOutsideTheLanguage: model.isOutsideTheLanguage, widthPoints: 1, depthPoints: 1, levelCount: 0,
        build: function (roofCollector) { model.buildRoofFor(roofCollector, 1, 1); },
      });
    }
    mincedRoof = minceModel(model.roofModels.get('1:1'));
  }
  const sourceAcross = sourceSliceOf(1, 1, model.widthPoints, model.repeat.across);
  const sourceAlong = sourceSliceOf(1, 1, model.depthPoints, model.repeat.along);
  for (let level = 0; level <= levelCount; level++) { // the last is the roof
    if (level === levelCount && !hasRoof) {
      continue;
    }
    const sourceLevel = level === levelCount ? model.levelCount : sourceSliceOf(level, levelCount, model.levelCount, model.repeat.up);
    ['', ':inside', ':steps'].forEach(function (layerSuffix) {
      const place = level === levelCount && mincedRoof !== null
        ? mincedRoof.places.get('1:1:0' + layerSuffix)
        : minced.places.get(sourceAcross + ':' + sourceAlong + ':' + sourceLevel + layerSuffix);
      if (!place) {
        return;
      }
      const pieceFloorY = floorY + level * classicalLevelHeight + place.liftY;
      quads.forEach(function (corners) {
        addWarpedPiece(collector, place.piece, corners, pieceFloorY);
        collector.piecePlacements.push({ piece: place.piece, corners: corners, floorY: pieceFloorY });
      });
    });
  }
}

// What a piece is, in the words of the design language: where it lies (corner, edge, inside),
// the structures it holds (a corner of one structure is symmetric, of two it is not), and which
// part of a storey it is: a whole storey (base and head), a foot (base only), a shaft (neither),
// a head, or a roof. Returns { position, structures: [name, ...], part, group, groupRank }: group
// is the heading the piece belongs under in the collection, groupRank the order of the headings.
export function classifyPiece(piece) {
  const structureKeys = Object.keys(STRUCTURE_NAMES).filter(function (structure) {
    return piece.tags.has(structure);
  });
  const structures = structureKeys.map(function (structure) {
    return STRUCTURE_NAMES[structure];
  });
  let part = 'shaft';
  if (piece.isRoof) {
    part = 'roof';
  } else if (piece.tags.has('base') && piece.tags.has('head')) {
    part = 'storey';
  } else if (piece.tags.has('base')) {
    part = 'foot';
  } else if (piece.tags.has('head')) {
    part = 'head';
  }
  const firstStructureRank = structureKeys.length > 0 ? Object.keys(STRUCTURE_NAMES).indexOf(structureKeys[0]) : 0;
  let group = '';
  let groupRank = 0;
  if (piece.layer === 'inside') {
    part = 'fill';
    group = 'FILL OF A CLOSED INSIDE';
    groupRank = 6000;
  } else if (piece.layer === 'steps') {
    part = 'steps';
    group = 'STEPS';
    groupRank = 6100;
  } else if (piece.isRoof) {
    group = 'ROOF · ' + piece.position;
    groupRank = 5000 + ['edge', 'corner', 'inside'].indexOf(piece.position);
  } else if (piece.position === 'inside') {
    group = 'INSIDE' + (structures.length > 0 ? ' · with ' + structures.join(' + ') : '');
    groupRank = 4000 + structureKeys.length * 10 + firstStructureRank;
  } else if (structures.length === 0) {
    group = piece.position.toUpperCase() + ' · no structure';
    groupRank = 3900;
  } else if (piece.position === 'edge') {
    group = 'EDGE · ' + structures.join(' + ');
    groupRank = 1000 + structureKeys.length * 100 + firstStructureRank;
  } else {
    group = (structures.length === 1 ? 'CORNER, symmetric · ' : 'CORNER, not symmetric · ') + structures.join(' + ');
    groupRank = (structures.length === 1 ? 2000 : 3000) + structureKeys.length * 100 + firstStructureRank;
  }
  return { position: piece.position, structures: structures, part: part, group: group, groupRank: groupRank };
}

export function describePiece(piece) {
  const kind = classifyPiece(piece);
  if (kind.structures.length === 0) {
    return kind.position + ' · ' + kind.part;
  }
  const symmetry = kind.position === 'corner' ? (kind.structures.length === 1 ? ', symmetric' : ', not symmetric') : '';
  return kind.position + symmetry + ' · ' + kind.structures.join(' + ') + ' · ' + kind.part;
}

// What a kind of piece measures, by the name of the kind: { materialNames, numbers }, for
// finding out in what two kinds that look alike differ
export function measuresOfKind(kindKey) {
  return knownKindMeasures.find(function (entry) {
    return entry.name === kindKey;
  });
}

// Every piece cut so far, of all the models, gathered by kind: [{ kindKey, pieces: [piece, ...] }].
// The pieces of a kind are the same but for turns and mirror images.
export function listPieceKinds() {
  const kinds = new Map();
  sharedPieces.forEach(function (piece) {
    if (!kinds.has(piece.kindKey)) {
      kinds.set(piece.kindKey, { kindKey: piece.kindKey, pieces: [] });
    }
    kinds.get(piece.kindKey).pieces.push(piece);
  });
  return Array.from(kinds.values());
}

// Adds one piece to a collector, the middle of its quad at a place of the collector's frame
export function addPiece(collector, piece, middleX, floorY, middleZ) {
  piece.trianglesOfMaterial.forEach(function (triangles, materialName) {
    const positions = new Float32Array(triangles.length);
    for (let offset = 0; offset < triangles.length; offset += 3) {
      positions[offset] = triangles[offset] + middleX;
      positions[offset + 1] = triangles[offset + 1] + floorY;
      positions[offset + 2] = triangles[offset + 2] + middleZ;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); // the collector's parts all carry normals
    collector.add(materialName, geometry);
  });
}

// Where a place of a piece lies on the ground, when the piece is warped into a quad. A piece is
// kept from the middle of a square quad one cell wide; corners are the places on the ground of
// that square's corners, in the order (low across, low along), (high across, low along), (high,
// high), (low across, high along), as { x, z }.
function warpOntoGround(across, along, corners) {
  const shareAcross = across / cellSize + 0.5;
  const shareAlong = along / cellSize + 0.5;
  const lowX = corners[0].x + (corners[1].x - corners[0].x) * shareAcross;
  const lowZ = corners[0].z + (corners[1].z - corners[0].z) * shareAcross;
  const highX = corners[3].x + (corners[2].x - corners[3].x) * shareAcross;
  const highZ = corners[3].z + (corners[2].z - corners[3].z) * shareAcross;
  return [lowX + (highX - lowX) * shareAlong, lowZ + (highZ - lowZ) * shareAlong];
}

// Adds one piece to a collector, warped into a quad of the ground (not through the collector's frame)
export function addWarpedPiece(collector, piece, corners, floorY) {
  const earlierPlacement = collector.placement.clone();
  collector.placement.identity();
  piece.trianglesOfMaterial.forEach(function (triangles, materialName) {
    const positions = new Float32Array(triangles.length);
    for (let offset = 0; offset < triangles.length; offset += 3) {
      const onGround = warpOntoGround(triangles[offset], triangles[offset + 2], corners);
      positions[offset] = onGround[0];
      positions[offset + 1] = triangles[offset + 1] + floorY;
      positions[offset + 2] = onGround[1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    collector.add(materialName, geometry);
  });
  collector.placement.copy(earlierPlacement);
}

// The shape of a piece where it was placed (an entry of a collector's piecePlacements), all its
// materials together: for showing where it lies
export function placedPieceGeometry(placement) {
  const geometry = pieceGeometry(placement.piece);
  if (placement.matrix) {
    geometry.applyMatrix4(placement.matrix);
    return geometry;
  }
  const positions = geometry.getAttribute('position').array;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const onGround = warpOntoGround(positions[offset], positions[offset + 2], placement.corners);
    positions[offset] = onGround[0];
    positions[offset + 1] += placement.floorY;
    positions[offset + 2] = onGround[1];
  }
  return geometry;
}

// The shape of a piece, all its materials together, as one geometry
export function pieceGeometry(piece) {
  let coordinateCount = 0;
  piece.trianglesOfMaterial.forEach(function (triangles) {
    coordinateCount += triangles.length;
  });
  const positions = new Float32Array(coordinateCount);
  let offset = 0;
  piece.trianglesOfMaterial.forEach(function (triangles) {
    positions.set(triangles, offset);
    offset += triangles.length;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
