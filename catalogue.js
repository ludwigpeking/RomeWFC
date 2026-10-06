// Purpose: the catalogue in the side panel. Every tile and every special combination has a code
// and a name, with a picture, so that they can be talked about:
// - E: the essential classical blocks, one point each, read from their surroundings
// - M: the classical models, each designed as a whole and shown beside its mince: the pieces of
//   its quads, from which buildings of other sizes are put together. Opening a model shows every
//   one of its pieces alone (M6.1, M6.2, ...)
// - P: the quad parts, first in the panel: all the pieces of the models written in the design
//   language, by kind (the same but for turns and mirror images), grouped by what they are
//   (edge, corner, inside or roof, and their structure): the place to generalize them
// - H: the hard modelled buildings, placed whole; they are not minced and are kept apart
// - V: the vernacular blocks of a quad, all of them: every way its four corner points can be
//   raised over two levels, counted once for all its turns and mirror images
// - W: the looks of a stretch of wall, chosen by the collapse
// - T: the temporary buildings
// The pictures are made from the same builders the town uses, on a small map of their own.
// For looking closely: every picture can be turned by dragging in it, and pointing at a piece
// lights up where that kind of piece lies, in the town and in the pictures of the models.

import * as THREE from 'three';
import { PointVolume, TIER, vernacularLevelHeight } from './volume';
import { createSquareMap } from './topology';
import { PartCollector, cellSize } from './parts';
import { buildClassicalTier, specialModelOf } from './classical';
import { PUBLIC_HARD_MODELS } from './publicModels';
import { MODELS } from './models';
import { minceModel, countPiecesSharedWithOthers, buildFromMince, addPiece, listPieceKinds, describePiece, classifyPiece, placedPieceGeometry } from './mince';
import { buildVernacular, STRETCH_LOOKS } from './vernacular';
import { buildTemporary } from './temporary';

const picturePixelWidth = 480;
const picturePixelHeight = 372;
const catalogueMapPointCount = 9;

// The essential blocks: a classical point alone
const ESSENTIAL_ENTRIES = [
  { code: 'E1', name: 'aedicule', volumeText: 'one point, against a neighbour or under a block: the front looks at the open space. In a house it is the portal', standsAgainstANeighbour: true },
  { code: 'E2', name: 'tholos', volumeText: 'one point, standing free: nothing on it, nothing beside it' },
];

// The hard specials as formations of an example size, for their models
const SPECIAL_EXAMPLES = [
  { formation: { kind: 'court', levelCount: 1 }, widthPoints: 3, depthPoints: 3, sizeText: 'a ring round an open middle, 1 high' },
  { formation: { kind: 'pantheon', levelCount: 4 }, widthPoints: 5, depthPoints: 5, sizeText: '5 × 5 × 2, with 3 × 3 × 2 on the middle of it' },
  { formation: { kind: 'greatBasilica', levelCount: 2, aisleLevelCount: 1 }, widthPoints: 5, depthPoints: 6, sizeText: 'a base 3 or wider, with a nave on it one point narrower each side and as long' },
];

// Every model with its code: the models of the boxes, then the hard specials. The minced ones
// are M1, M2, ...; the hard modelled ones, kept apart, are H1, H2, ...
function listModelEntries() {
  const entries = MODELS.map(function (model) {
    return { model: model, name: model.name, sizeText: model.sizeText };
  });
  SPECIAL_EXAMPLES.forEach(function (example) {
    const model = specialModelOf(example.formation, example.widthPoints, example.depthPoints);
    entries.push({ model: model, name: model.name, sizeText: example.sizeText });
  });
  Object.keys(PUBLIC_HARD_MODELS).forEach(function (kind) {
    const model = PUBLIC_HARD_MODELS[kind];
    entries.push({ model: model, name: model.name, sizeText: model.sizeText });
  });
  let mincedCount = 0;
  let hardCount = 0;
  entries.forEach(function (entry) {
    entry.code = entry.model.isHardModelled ? 'H' + (++hardCount) : 'M' + (++mincedCount);
  });
  return entries;
}

// The blocks of a quad of the vernacular tier, exhaustively. A block
// is the quad over two levels: each of its four corner points (in order round the quad) is
// raised 0, 1 or 2 levels high. Nothing is suspended: a point is raised on the upper level only
// where it is raised on the lower one. Blocks that are turns or mirror images of each other are
// one block, which leaves 20. 1 to 5 are the blocks of one level; the others carry a second
// level on some or all of their raised corners.
// The state of a corner: 0 not raised, 1 raised one level, 2 raised two levels.
const LOWER_SHAPE_NAMES = ['outer corner', 'wall', 'saddle', 'inner corner', 'inside'];
const UPPER_SHAPE_NAMES = ['corner', 'wall', 'saddle', 'inner corner', 'inside'];

// 0 one corner, 1 two on one side, 2 two opposite, 3 three, 4 all four; -1 none
function shapeOfCorners(isChosen) {
  const count = isChosen.filter(Boolean).length;
  if (count === 2) {
    return (isChosen[0] && isChosen[2]) || (isChosen[1] && isChosen[3]) ? 2 : 1;
  }
  return count === 0 ? -1 : count <= 1 ? 0 : count;
}

// the eight turns and mirror images of the corner states of a quad
function symmetricImages(cornerStates) {
  const images = [];
  [cornerStates, [cornerStates[0], cornerStates[3], cornerStates[2], cornerStates[1]]].forEach(function (states) {
    for (let turn = 0; turn < 4; turn++) {
      images.push([0, 1, 2, 3].map(function (corner) {
        return states[(corner + turn) % 4];
      }));
    }
  });
  return images;
}

function listQuadBlockEntries() {
  const entries = [];
  const seenKeys = new Set();
  for (let number = 1; number < 81; number++) {
    const cornerStates = [number % 3, Math.floor(number / 3) % 3, Math.floor(number / 9) % 3, Math.floor(number / 27) % 3];
    const images = symmetricImages(cornerStates);
    const key = images.map(function (image) { return image.join(''); }).sort()[0];
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    // shown with its mass at the far corner, so that the walls face the viewer
    const viewWeights = [4, 2.1, 1, 2];
    let shownStates = images[0];
    let bestWeight = -1;
    images.forEach(function (image) {
      const weight = image.reduce(function (sum, state, corner) { return sum + state * viewWeights[corner]; }, 0);
      if (weight > bestWeight) {
        bestWeight = weight;
        shownStates = image;
      }
    });
    const isRaisedBelow = shownStates.map(function (state) { return state >= 1; });
    const isRaisedAbove = shownStates.map(function (state) { return state === 2; });
    const lowerShape = shapeOfCorners(isRaisedBelow);
    const upperShape = shapeOfCorners(isRaisedAbove);
    const lowerCount = isRaisedBelow.filter(Boolean).length;
    const upperCount = isRaisedAbove.filter(Boolean).length;
    let name = '';
    let volumeText = '';
    if (upperCount === 0) {
      name = LOWER_SHAPE_NAMES[lowerShape];
      volumeText = lowerCount + (lowerCount === 1 ? ' corner' : ' corners') + ' raised' +
        (lowerShape === 1 ? ', on one side' : lowerShape === 2 ? ', opposite' : lowerShape === 4 ? ': no wall, only roof' : '');
    } else {
      name = upperShape === lowerShape ? LOWER_SHAPE_NAMES[lowerShape] + ', two levels' : UPPER_SHAPE_NAMES[upperShape] + ' on ' + LOWER_SHAPE_NAMES[lowerShape];
      volumeText = 'below ' + lowerCount + ', above ' + upperCount;
      if (lowerShape === 3 && upperCount === 1) {
        // the middle corner of three has both its neighbours raised
        const upperCorner = isRaisedAbove.indexOf(true);
        const isMiddle = isRaisedBelow[(upperCorner + 1) % 4] && isRaisedBelow[(upperCorner + 3) % 4];
        name += isMiddle ? ' (middle)' : ' (end)';
      }
    }
    entries.push({
      name: name, volumeText: volumeText, cornerStates: shownStates, key: key,
      lowerShape: lowerShape, lowerCount: lowerCount, upperCount: upperCount,
    });
  }
  // the blocks of one level first, in the order of their shapes; then those with a second level
  entries.sort(function (first, second) {
    return (first.upperCount > 0) - (second.upperCount > 0) ||
      first.lowerCount - second.lowerCount || first.lowerShape - second.lowerShape ||
      first.upperCount - second.upperCount || (first.key < second.key ? -1 : 1);
  });
  entries.forEach(function (entry, index) {
    entry.code = 'V' + (index + 1);
  });
  return entries;
}

const WALL_ENTRIES = [
  { code: 'W1', name: 'door', lookName: 'door', volumeText: 'ground; one for every house, towards a street' },
  { code: 'W2', name: 'shop arch', lookName: 'shop', volumeText: 'ground; towards a busy street' },
  { code: 'W3', name: 'window', lookName: 'window', volumeText: 'ground towards a street; upper floors towards a yard; fifth floor up' },
  { code: 'W4', name: 'arched window', lookName: 'archedWindow', volumeText: 'third floor, towards a street' },
  { code: 'W5', name: 'pair of windows', lookName: 'pairOfWindows', volumeText: 'fourth floor, towards a street' },
  { code: 'W6', name: 'tall window', lookName: 'tallWindow', volumeText: 'second floor, towards a street; down to the floor' },
  { code: 'W7', name: 'small window', lookName: 'smallWindow', volumeText: 'towards a yard: ground and fourth floor up; high in the wall' },
  { code: 'W8', name: 'blank wall', lookName: 'blank', volumeText: 'where it looks at another building; party walls' },
];

const TEMPORARY_ENTRIES = [
  { code: 'T1', name: 'stall', volumeText: '1 level alone', levels: 1 },
  { code: 'T2 + T3', name: 'shabby house: shop (T2) under an upper room (T3)', volumeText: '2 levels', levels: 2 },
];

// The code of a monument by its name, for the list of monuments found
export function codeOfMonument(name) {
  const entry = ESSENTIAL_ENTRIES.concat(listModelEntries()).find(function (candidate) {
    return candidate.name === name;
  });
  return entry ? entry.code : '';
}

// showKindInTown(kindKey or null): lights up a kind of piece in the town, or nothing
export function buildCatalogue(panel, materials, showKindInTown) {
  const catalogueRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  catalogueRenderer.setSize(picturePixelWidth, picturePixelHeight, false);
  catalogueRenderer.localClippingEnabled = true;
  const map = createSquareMap(catalogueMapPointCount, catalogueMapPointCount, cellSize);
  const middlePoint = Math.floor(catalogueMapPointCount / 2);

  function pointAt(column, row) {
    return row * catalogueMapPointCount + column;
  }

  // A picture of what a collector holds, which can be turned by dragging in it. clipBox ([minX,
  // maxX, minZ, maxZ]) cuts away everything outside one quad. All the pictures are drawn by the
  // one renderer and copied into a canvas each.
  const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a1c, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide });
  const modelPictures = []; // the pictures of whole models, in which a kind of piece can be lit up
  function drawPicture(picture) {
    if (picture.clipBox) {
      catalogueRenderer.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -picture.clipBox[0]), new THREE.Plane(new THREE.Vector3(-1, 0, 0), picture.clipBox[1]),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -picture.clipBox[2]), new THREE.Plane(new THREE.Vector3(0, 0, -1), picture.clipBox[3]),
      ];
    } else {
      catalogueRenderer.clippingPlanes = [];
    }
    const angleOfViewDegrees = 24;
    const camera = new THREE.PerspectiveCamera(angleOfViewDegrees, picturePixelWidth / picturePixelHeight, 1, 1000);
    const distance = picture.sphere.radius / Math.sin(THREE.MathUtils.degToRad(angleOfViewDegrees) / 2) * 1.02;
    camera.position.set(
      picture.sphere.center.x + distance * Math.cos(picture.elevation) * Math.sin(picture.azimuth),
      picture.sphere.center.y + distance * Math.sin(picture.elevation),
      picture.sphere.center.z + distance * Math.cos(picture.elevation) * Math.cos(picture.azimuth));
    camera.lookAt(picture.sphere.center);
    catalogueRenderer.render(picture.scene, camera);
    picture.context.drawImage(catalogueRenderer.domElement, 0, 0);
  }
  // kindKey: for the picture of one piece, its kind, lit up elsewhere while the pointer is on it
  function takePicture(collector, markers, clipBox, kindKey) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f1ea);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ab8f, 1.7));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sun.position.set(-30, 60, 40);
    scene.add(sun);
    const group = collector.buildMeshes(materials);
    scene.add(group);
    (markers || []).forEach(function (marker) {
      scene.add(marker);
    });
    const bounds = new THREE.Box3().setFromObject(group);
    if (clipBox) {
      bounds.min.x = clipBox[0];
      bounds.max.x = clipBox[1];
      bounds.min.z = clipBox[2];
      bounds.max.z = clipBox[3];
    }
    const canvas = document.createElement('canvas');
    canvas.width = picturePixelWidth;
    canvas.height = picturePixelHeight;
    const highlightGroup = new THREE.Group();
    scene.add(highlightGroup);
    const picture = {
      canvas: canvas, context: canvas.getContext('2d'), scene: scene, clipBox: clipBox || null, highlightGroup: highlightGroup,
      sphere: bounds.getBoundingSphere(new THREE.Sphere()),
      azimuth: Math.atan2(0.62, 0.66), elevation: Math.asin(0.42 / Math.hypot(0.62, 0.42, 0.66)),
    };
    drawPicture(picture);

    // dragging turns the picture
    let dragStart = null;
    let hasTurned = false;
    canvas.addEventListener('pointerdown', function (event) {
      dragStart = { x: event.clientX, y: event.clientY, azimuth: picture.azimuth, elevation: picture.elevation };
      hasTurned = false;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (dragStart === null) {
        return;
      }
      const movedX = event.clientX - dragStart.x;
      const movedY = event.clientY - dragStart.y;
      hasTurned = hasTurned || Math.hypot(movedX, movedY) > 4;
      picture.azimuth = dragStart.azimuth - movedX * 0.012;
      picture.elevation = Math.max(-1.45, Math.min(1.45, dragStart.elevation + movedY * 0.012));
      drawPicture(picture);
    });
    canvas.addEventListener('pointerup', function () {
      dragStart = null;
    });
    canvas.addEventListener('click', function (event) {
      if (hasTurned) { // a drag is not a click: it does not open or close what the picture stands in
        event.preventDefault();
        event.stopPropagation();
      }
    });
    if (kindKey) {
      canvas.addEventListener('pointerenter', function () {
        showKind(kindKey);
      });
      canvas.addEventListener('pointerleave', function () {
        showKind(null);
      });
    }
    return picture;
  }
  // Lights up a kind of piece wherever it lies: in the town, and in the pictures of the models
  function showKind(kindKey) {
    showKindInTown(kindKey);
    modelPictures.forEach(function (modelPicture) {
      const hadHighlight = modelPicture.picture.highlightGroup.children.length > 0;
      modelPicture.picture.highlightGroup.children.slice().forEach(function (mesh) {
        modelPicture.picture.highlightGroup.remove(mesh);
        mesh.geometry.dispose();
      });
      if (kindKey !== null) {
        modelPicture.placements.forEach(function (placement) {
          if (placement.piece.kindKey === kindKey) {
            const geometry = placedPieceGeometry(placement);
            const mesh = new THREE.Mesh(geometry, highlightMaterial);
            mesh.renderOrder = 10;
            modelPicture.picture.highlightGroup.add(mesh);
          }
        });
      }
      if (hadHighlight || modelPicture.picture.highlightGroup.children.length > 0) {
        drawPicture(modelPicture.picture);
      }
    });
  }

  let entryGrid = null;
  function addSection(title, note) {
    const heading = document.createElement('div');
    heading.className = 'sectionTitle';
    heading.textContent = title;
    panel.appendChild(heading);
    if (note) {
      const noteElement = document.createElement('div');
      noteElement.className = 'hint';
      noteElement.textContent = note;
      panel.appendChild(noteElement);
    }
    entryGrid = document.createElement('div');
    entryGrid.className = 'catalogueGrid';
    panel.appendChild(entryGrid);
  }

  function addEntry(entry, picture) {
    const row = document.createElement('div');
    row.className = 'catalogueEntry';
    if (entry.kindKey) {
      row.dataset.kind = entry.kindKey; // for checks from outside
    }
    const text = document.createElement('div');
    const code = document.createElement('b');
    code.textContent = entry.code;
    const name = document.createElement('span');
    name.textContent = ' ' + entry.name;
    const volumeText = document.createElement('small');
    volumeText.textContent = entry.volumeText;
    text.append(code, name, volumeText);
    row.append(picture.canvas, text);
    entryGrid.appendChild(row);
  }

  // ---- the quad parts: every kind of piece, grouped by what it is. The models are all minced first.
  listModelEntries().forEach(function (entry) {
    if (!entry.model.isHardModelled) {
      minceModel(entry.model);
    }
  });
  const pieceKinds = listPieceKinds().map(function (kind) {
    return { kindKey: kind.kindKey, pieces: kind.pieces.filter(function (piece) { return piece.isOfTheLanguage; }) };
  }).filter(function (kind) {
    return kind.pieces.length > 0;
  });
  function modelNamesOfKind(kind) {
    const names = new Set();
    kind.pieces.forEach(function (piece) {
      piece.modelNames.forEach(function (modelName) { names.add(modelName); });
    });
    return Array.from(names);
  }
  function placeCountOfKind(kind) {
    return kind.pieces.reduce(function (sum, piece) { return sum + piece.placeCount; }, 0);
  }
  let differentPieceCount = 0;
  let quadCount = 0;
  const kindsOfGroup = new Map(); // heading -> { rank, kinds }
  pieceKinds.forEach(function (kind) {
    differentPieceCount += kind.pieces.length;
    quadCount += placeCountOfKind(kind);
    const classified = classifyPiece(kind.pieces[0]);
    kind.part = classified.part;
    if (!kindsOfGroup.has(classified.group)) {
      kindsOfGroup.set(classified.group, { rank: classified.groupRank, kinds: [] });
    }
    kindsOfGroup.get(classified.group).kinds.push(kind);
  });
  const groupNames = Array.from(kindsOfGroup.keys()).sort(function (first, second) {
    return kindsOfGroup.get(first).rank - kindsOfGroup.get(second).rank || (first < second ? -1 : 1);
  });
  const partsTitle = document.createElement('div');
  partsTitle.className = 'partsTitle';
  partsTitle.textContent = 'Quad parts';
  panel.appendChild(partsTitle);
  const partsFacts = document.createElement('div');
  partsFacts.className = 'hint';
  partsFacts.textContent = quadCount + ' quads cut from the models written in the design language · ' + differentPieceCount + ' different pieces · ' +
    pieceKinds.length + ' kinds when turns and mirror images count as one · ' + groupNames.length + ' groups. A group should come down to one part for each of storey, foot, shaft and head; where it holds more, the parts still differ in something that is not their structure.';
  panel.appendChild(partsFacts);
  const partOrder = ['storey', 'foot', 'shaft', 'head', 'roof', 'fill', 'steps'];
  let kindNumber = 0;
  groupNames.forEach(function (groupName) {
    const group = kindsOfGroup.get(groupName);
    group.kinds.sort(function (first, second) {
      return partOrder.indexOf(first.part) - partOrder.indexOf(second.part) || placeCountOfKind(second) - placeCountOfKind(first);
    });
    addSection(groupName + ' — ' + group.kinds.length + (group.kinds.length === 1 ? ' kind' : ' kinds'));
    group.kinds.forEach(function (kind) {
      kindNumber++;
      const collector = new PartCollector();
      addPiece(collector, kind.pieces[0], 0, 0, 0);
      addEntry({
        code: 'P' + kindNumber, name: kind.part, kindKey: kind.kindKey,
        volumeText: modelNamesOfKind(kind).join(', ') + ' · in ' + placeCountOfKind(kind) + (placeCountOfKind(kind) === 1 ? ' quad' : ' quads') +
          (kind.pieces.length > 1 ? ' · ' + kind.pieces.length + ' turns or mirror images' : ''),
      }, takePicture(collector, null, null, kind.kindKey));
    });
  });

  // ---- the essential classical blocks
  addSection('CLASSICAL: ESSENTIAL BLOCKS', 'A classical point alone. Not cut into quads: it reads what stands round it.');
  ESSENTIAL_ENTRIES.forEach(function (entry) {
    const volume = new PointVolume(map, 7);
    volume.setTier(pointAt(middlePoint, middlePoint), 0, TIER.classical);
    if (entry.standsAgainstANeighbour) { // a stall behind it, which is not in the picture
      volume.setTier(pointAt(middlePoint, middlePoint - 1), 0, TIER.temporary);
    }
    const collector = new PartCollector();
    buildClassicalTier(collector, volume);
    addEntry(entry, takePicture(collector));
  });

  // ---- the classical models, each beside its mince; opened, a model shows every piece alone
  addSection('CLASSICAL: MODELS AND THEIR MINCE', 'A model is designed as a whole, at one size. It is cut along its points into the pieces of its quads (drawn apart in the second picture), and buildings of other sizes are put together from those pieces. Click a model to see each of its pieces.');
  // where a slice lies in its model, in words
  function sliceText(slice, pointCount, firstText, lastText) {
    if (slice === 0) {
      return firstText;
    }
    if (slice === pointCount) {
      return lastText;
    }
    return pointCount === 2 ? 'middle' : 'middle ' + slice;
  }
  const modelGrid = document.createElement('div');
  modelGrid.className = 'modelGrid';
  panel.appendChild(modelGrid);
  listModelEntries().filter(function (entry) {
    return !entry.model.isHardModelled;
  }).forEach(function (entry) {
    const model = entry.model;
    const minced = minceModel(model);
    const growing = [];
    if (model.repeat.across !== null && model.repeat.along !== null) {
      growing.push('both ways');
    } else if (model.repeat.along !== null) {
      growing.push('along its depth');
    }
    if (model.repeat.up !== null) {
      growing.push('upwards');
    }
    const sharedCount = countPiecesSharedWithOthers(model);

    const block = document.createElement('details');
    block.className = 'modelBlock';
    const summary = document.createElement('summary');
    const title = document.createElement('div');
    title.className = 'modelTitle';
    const code = document.createElement('b');
    code.textContent = entry.code;
    const name = document.createElement('span');
    name.textContent = ' ' + entry.name;
    const facts = document.createElement('small');
    facts.textContent = entry.sizeText + (model.isOutsideTheLanguage ? ' · kept out of the quad parts' : '') + ' · ' + minced.pieceCount + ' pieces, ' + minced.distinctCount + ' different' +
      (sharedCount > 0 ? ', ' + sharedCount + ' shared with other models' : '') +
      (growing.length > 0 ? ' · grows ' + growing.join(' and ') : ' · one size only');
    title.append(code, name, facts);
    const pictures = document.createElement('div');
    pictures.className = 'modelPictures';
    // the whole model, put together from its pieces so that each piece is known where it lies
    const whole = new PartCollector();
    buildFromMince(whole, model, model.widthPoints, model.depthPoints, model.levelCount);
    const apart = new PartCollector();
    buildFromMince(apart, model, model.widthPoints, model.depthPoints, model.levelCount, 1.3);
    whole.person(0.9, 0, model.depthPoints * cellSize / 2 + 1.2); // a figure before the front, for its scale
    const wholePicture = takePicture(whole);
    modelPictures.push({ picture: wholePicture, placements: whole.piecePlacements });
    pictures.append(wholePicture.canvas, takePicture(apart).canvas);
    summary.append(title, pictures);
    block.appendChild(summary);
    modelGrid.appendChild(block);

    // every different piece alone, drawn when the model is first opened
    let piecesAreShown = false;
    block.addEventListener('toggle', function () {
      if (!block.open || piecesAreShown) {
        return;
      }
      piecesAreShown = true;
      const pieceGrid = document.createElement('div');
      pieceGrid.className = 'catalogueGrid';
      block.appendChild(pieceGrid);
      const placesOfKey = new Map(); // what a piece is made of -> where it lies in the model
      minced.places.forEach(function (placed, pieceName) {
        if (!placesOfKey.has(placed.piece.key)) {
          placesOfKey.set(placed.piece.key, { piece: placed.piece, pieceNames: [] });
        }
        placesOfKey.get(placed.piece.key).pieceNames.push(pieceName);
      });
      let pieceNumber = 0;
      placesOfKey.forEach(function (place) {
        pieceNumber++;
        const slices = place.pieceNames[0].split(':').slice(0, 3).map(Number);
        const collector = new PartCollector();
        addPiece(collector, place.piece, 0, 0, 0);
        const otherModelNames = Array.from(place.piece.modelNames).filter(function (modelName) {
          return modelName !== model.name;
        });
        const row = document.createElement('div');
        row.className = 'catalogueEntry';
        const picture = takePicture(collector, null, null, place.piece.kindKey);
        const text = document.createElement('div');
        const pieceCode = document.createElement('b');
        pieceCode.textContent = entry.code + '.' + pieceNumber;
        const pieceText = document.createElement('span');
        pieceText.textContent = ' ' + describePiece(place.piece);
        const pieceFacts = document.createElement('small');
        pieceFacts.textContent = sliceText(slices[0], model.widthPoints, 'left', 'right') + ' · ' +
          sliceText(slices[1], model.depthPoints, 'back', 'front') + ' · ' + (slices[2] === model.levelCount ? 'roof' : 'level ' + (slices[2] + 1)) + ' · ' + (place.pieceNames.length > 1 ? 'lies ' + place.pieceNames.length + ' times in this model' : 'lies once in this model') +
          (otherModelNames.length > 0 ? '; also a piece of: ' + otherModelNames.join(', ') : '');
        text.append(pieceCode, pieceText, pieceFacts);
        row.append(picture.canvas, text);
        pieceGrid.appendChild(row);
      });
    });
  });

  // ---- the hard modelled buildings: placed whole, kept apart from the pieces
  addSection('CLASSICAL: HARD MODELLED', 'Buildings modelled as a whole and placed whole, at their own sizes. They are not minced and do not count among the pieces.');
  listModelEntries().filter(function (entry) {
    return entry.model.isHardModelled;
  }).forEach(function (entry) {
    const collector = new PartCollector();
    entry.model.build(collector);
    collector.person(0.9, 0, entry.model.depthPoints * cellSize / 2 + 1.2);
    addEntry({ code: entry.code, name: entry.name, volumeText: entry.sizeText }, takePicture(collector));
  });

  // ---- the blocks of a quad: one quad, cut out of a small building, its corners marked by how high they are raised
  const tileCorners = [[middlePoint, middlePoint], [middlePoint + 1, middlePoint], [middlePoint + 1, middlePoint + 1], [middlePoint, middlePoint + 1]];
  const markerColours = [0xb9b2a3, 0x23262b, 0xb8442c]; // by the state of the corner
  function addQuadBlocks(tier, buildTier) {
    listQuadBlockEntries().forEach(function (entry) {
      const volume = new PointVolume(map, 7);
      const markers = [];
      tileCorners.forEach(function (corner, index) {
        const cornerState = entry.cornerStates[index];
        for (let level = 0; level < cornerState; level++) {
          volume.setTier(pointAt(corner[0], corner[1]), level, tier);
        }
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.12, 16),
          new THREE.MeshBasicMaterial({ color: markerColours[cornerState] }));
        marker.position.set(corner[0] * cellSize, 0.06, corner[1] * cellSize);
        markers.push(marker);
      });
      const collector = new PartCollector();
      buildTier(collector, volume);
      collector.geometriesOfMaterial.delete('interior'); // the cut would show the dark inside as a solid block
      collector.box('stoneShade', cellSize, 0.1, cellSize, (middlePoint + 0.5) * cellSize, -0.1, (middlePoint + 0.5) * cellSize);
      const margin = 0.45; // room for the corner markers and for what reaches out past the centre line
      addEntry(entry, takePicture(collector, markers,
        [middlePoint * cellSize - margin, (middlePoint + 1) * cellSize + margin, middlePoint * cellSize - margin, (middlePoint + 1) * cellSize + margin]));
    });
  }
  const quadBlockNote = 'A block is one quad over two levels. Each corner point is raised 0, 1 or 2 levels (light, dark, red dot); nothing is suspended. Turns and mirror images are one block: 20 in all.';
  addSection('VERNACULAR: ALL BLOCKS OF A QUAD', quadBlockNote);
  addQuadBlocks(TIER.vernacular, function (collector, volume) {
    buildVernacular(collector, volume, 3);
  });

  // ---- the looks of a stretch of wall
  addSection('VERNACULAR: WALL LOOKS', 'Every stretch of wall (half a quad long) takes one look, settled by the collapse.');
  WALL_ENTRIES.forEach(function (entry) {
    const collector = new PartCollector();
    collector.wallBetween('plasterOchre', 0, 0, cellSize / 2, 0, 0, vernacularLevelHeight, 0.3, STRETCH_LOOKS[entry.lookName].openings);
    collector.box('interior', cellSize / 2, vernacularLevelHeight, 0.05, cellSize / 4, 0, -0.2);
    addEntry(entry, takePicture(collector));
  });

  // ---- the temporary buildings
  addSection('TEMPORARY', 'One building to a point, two levels at most.');
  TEMPORARY_ENTRIES.forEach(function (entry) {
    const volume = new PointVolume(map, 7);
    for (let level = 0; level < entry.levels; level++) {
      volume.setTier(pointAt(middlePoint, middlePoint), level, TIER.temporary);
    }
    const collector = new PartCollector();
    buildTemporary(collector, volume, 1);
    addEntry(entry, takePicture(collector));
  });
}
