// Rome WFC: a Roman town from a volume. As in Townscaper, the player only raises points of a
// grid; what stands there is worked out from the volume:
// 1. the ground is points and the quads between them (topology.js); the volume is on the points,
//    each empty or filled with one of three tiers on every level (volume.js)
// 2. the classical tier is read as formations, each a whole monument where the volume fits one
//    (formations.js, monuments.js)
// 3. the vernacular tier is built in the quads between the points and grows together into houses
//    whose walls are settled by wave function collapse (vernacular.js)
// 4. the temporary tier is stalls and shabby houses, one to a point (temporary.js)

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { PointVolume, TIER, WORK, SeededRandom, levelHeightOfTier, classicalLevelHeight, placeHash } from './volume';
import { createSquareMap, createIrregularMap, shrinkOutline } from './topology';
import { PartCollector, createMaterials, cellSize, materialsAreLoaded } from './parts';
import { buildClassicalTier } from './classical';
import { latticeViewsOf } from './charts';
import { buildVernacular } from './vernacular';
import { buildTemporary } from './temporary';
import { buildWorks, WALL_STYLES, DEFAULT_WALL_STYLE } from './works';
import { buildGardens } from './gardens';
import { facesOfPatch, stretchesOfFace } from './patches';
import { buildCatalogue, codeOfMonument } from './catalogue';
import { findCoplanarOverlaps } from './coplanar';
import { Settlement, roadRecentTraffic, SETTLEMENT_PARAMETER_DEFAULTS, LAYER_BANDS } from './settlement';
import { PUBLIC_BUILDINGS } from './city';
import { MODELS } from './models';
import { listPieceKinds, describePiece, pieceGeometry, placedPieceGeometry, measuresOfKind, minceModel } from './mince';
import { createPanelHeading, decorateExistingPanelHeadings } from './panelIcons';

decorateExistingPanelHeadings();

let squarePointCount = 30;    // points along each side of the square map (chosen in the Ground tab)
let irregularRingCount = 8;   // rings of the irregular map: at 8 about as many points as the square map of 30 (chosen in the menu)
const levelCount = 22; // a classical tower may rise 20 levels: 100 m
let map = null;
let volume = null;
let chosenWallStyle = DEFAULT_WALL_STYLE; // how the line of the city wall is drawn (works.js)
let townSeed = 1;
let brushTier = TIER.classical;
let showsBareVolume = false;

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// The masterplan: a second camera straight above the town, orthographic, north (-z) up; it is
// moved and zoomed, never turned. Which camera draws and picks: cameraInUse().
const planCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 2000);
planCamera.up.set(0, 0, -1);
const planControls = new OrbitControls(planCamera, renderer.domElement);
planControls.enableRotate = false;
planControls.screenSpacePanning = true;
planControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
planControls.enabled = false;
let isPlanView = false;
let groundCentreX = 0;
let groundCentreZ = 0;
let groundReach = 100;

function cameraInUse() {
  return isPlanView ? planCamera : camera;
}

// The plan camera over the whole ground, whatever the window's shape
function fitThePlanCamera() {
  // the ground fills the window above the strip of words at its foot, which would cover the map
  const strip = document.getElementById('statusStrip');
  const stripPixels = strip && strip.style.display !== 'none' ? strip.offsetHeight + 24 : 0;
  const freePixels = Math.max(200, window.innerHeight - stripPixels);
  const aspect = window.innerWidth / window.innerHeight;
  const halfHeight = groundReach * 1.04 * window.innerHeight / freePixels;
  const halfWidth = halfHeight * aspect;
  const metresPerPixel = 2 * halfHeight / window.innerHeight;
  const centreZ = groundCentreZ + stripPixels / 2 * metresPerPixel; // (the plan's up is -z: the centre moves down the screen)
  Object.assign(planCamera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
  planCamera.zoom = 1;
  planCamera.position.set(groundCentreX, 600, centreZ);
  planControls.target.set(groundCentreX, 0, centreZ);
  planCamera.updateProjectionMatrix();
  planControls.update();
}

function showPlanView(isOn) {
  if (isOn && isWalking) {
    stopWalking();
  }
  isPlanView = isOn;
  if (isOn) {
    fitThePlanCamera();
  }
  controls.enabled = !isOn && !isWalking;
  planControls.enabled = isOn;
  document.getElementById('planViewButton').classList.toggle('active', isOn);
  document.getElementById('perspectiveViewButton').classList.toggle('active', !isOn);
}
document.getElementById('planViewButton').addEventListener('click', function () { showPlanView(!isPlanView); });
document.getElementById('perspectiveViewButton').addEventListener('click', function () { showPlanView(false); });

// (little light from the sky, so that what the sun does not reach is clearly darker: the faces and shadows of the walls read)
scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x8f8068, 0.9)); // (0.7 until 2026-10-13: the author wants the shadows slightly lighter)
const sunLight = new THREE.DirectionalLight(0xfff2dc, 3.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight, sunLight.target);

const materials = createMaterials();
const TIER_COLOURS = [0x000000, 0xe9e2d0, 0xdcb779, 0xa98a5f, 0x8a9a5b];
const VOLUME_MATERIALS = ['', 'volumeClassical', 'volumeVernacular', 'volumeTemporary', 'grass'];
let groundGroup = null;
let townGroup = null;
let townCollector = null; // what the town was last built from, kept for checks

// The ground of a map: paving under it, the quads drawn on it, a dot on every point
function showMap(newMap) {
  map = newMap;
  volume = new PointVolume(map, levelCount);
  if (groundGroup) {
    scene.remove(groundGroup);
  }
  groundGroup = new THREE.Group();
  const bounds = map.bounds;
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreZ = (bounds.minZ + bounds.maxZ) / 2;
  const reach = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + cellSize;
  const paving = new THREE.Mesh(
    new THREE.BoxGeometry(2 * reach, 1.2, 2 * reach),
    new THREE.MeshStandardMaterial({ color: 0xcdc3ad, roughness: 1 }));
  paving.position.set(centreX, -0.6, centreZ);
  paving.receiveShadow = true;
  groundGroup.add(paving);
  const linePoints = [];
  map.cells.forEach(function (cell) {
    for (let side = 0; side < 4; side++) {
      const from = map.points[cell.corners[side]];
      const to = map.points[cell.corners[(side + 1) % 4]];
      linePoints.push(from.x, 0.02, from.z, to.x, 0.02, to.z);
    }
  });
  groundGroup.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3)),
    new THREE.LineBasicMaterial({ color: 0x9d937d, transparent: true, opacity: 0.4 })));
  const dotPositions = [];
  map.points.forEach(function (point) {
    dotPositions.push(point.x, 0.04, point.z);
  });
  groundGroup.add(new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3)),
    new THREE.PointsMaterial({ color: 0x8a7f68, size: 4, sizeAttenuation: false })));
  scene.add(groundGroup);

  camera.position.set(centreX + reach * 2.6, reach * 2.1, centreZ + reach * 3.2);
  controls.target.set(centreX, 4, centreZ);
  controls.update();
  groundCentreX = centreX;
  groundCentreZ = centreZ;
  groundReach = reach;
  if (isPlanView) {
    fitThePlanCamera();
  }
  sunLight.position.set(centreX - 60, 110, centreZ + 70);
  sunLight.target.position.set(centreX, 0, centreZ);
  Object.assign(sunLight.shadow.camera, { left: -reach * 1.5, right: reach * 1.5, top: reach * 1.5, bottom: -reach * 1.5, near: 10, far: 400 });
  sunLight.shadow.camera.updateProjectionMatrix();
  document.getElementById('squareMapButton').classList.toggle('active', map.kind === 'square');
  document.getElementById('irregularMapButton').classList.toggle('active', map.kind === 'irregular');
}

// ---------------------------------------------------------------------------
// The town, rebuilt from the volume whenever a point changes
// ---------------------------------------------------------------------------
let pickShapes = []; // one unseen shape for each filled place, for the pointer to hit
let groundToKeepOpen = []; // the points the monuments want open before them, as the town was last built
const pickGeometry = new THREE.CylinderGeometry(cellSize * 0.46, cellSize * 0.46, 1, 16); // one metre high, stretched to its block
const pickMaterial = new THREE.MeshBasicMaterial();

function rebuildTown() {
  if (townGroup) {
    scene.remove(townGroup);
    townGroup.traverse(function (object) {
      if (object.isMesh) {
        object.geometry.dispose();
      }
    });
  }
  pickShapes = volume.filledPlaces().map(function (place) {
    const pickShape = new THREE.Mesh(pickGeometry, pickMaterial);
    const blockHeight = levelHeightOfTier(place.tier);
    pickShape.scale.y = blockHeight;
    pickShape.position.set(map.points[place.pointIndex].x, volume.bottomHeightAt(place.pointIndex, place.level) + blockHeight / 2, map.points[place.pointIndex].z);
    pickShape.updateMatrixWorld();
    pickShape.userData.place = place;
    return pickShape;
  });

  const monumentNames = [];
  groundToKeepOpen = [];
  const collector = new PartCollector();
  if (showsBareVolume) {
    // every raised point as the quarters of the quads round it, drawn a little apart: three to six to a point
    volume.filledPlaces().forEach(function (place) {
      map.quartersOfPoint[place.pointIndex].forEach(function (quarter) {
        const middleX = (quarter.outline[0][0] + quarter.outline[2][0]) / 2;
        const middleZ = (quarter.outline[0][1] + quarter.outline[2][1]) / 2;
        collector.polygonPrism(VOLUME_MATERIALS[place.tier], shrinkOutline(quarter.outline, middleX, middleZ, 0.07),
          volume.bottomHeightAt(place.pointIndex, place.level) + 0.08, levelHeightOfTier(place.tier) - 0.16);
      });
    });
  } else {
    buildClassicalTier(collector, volume, groundToKeepOpen).forEach(function (name) {
      monumentNames.push(name);
    });
    buildVernacular(collector, volume, townSeed);
    buildTemporary(collector, volume, townSeed);
    volume.wallStyle = chosenWallStyle;
    buildWorks(collector, volume);
    buildGardens(collector, volume, townSeed);
  }
  townCollector = collector;
  townGroup = collector.buildMeshes(materials);
  scene.add(townGroup);
  showTheTownFaintOrSolid();
  showMonumentList(monumentNames);
  return monumentNames;
}

function showMonumentList(monumentNames) {
  const countOfName = new Map();
  monumentNames.forEach(function (name) {
    countOfName.set(name, (countOfName.get(name) || 0) + 1);
  });
  const parts = [];
  countOfName.forEach(function (count, name) {
    const label = codeOfMonument(name) + ' ' + name;
    parts.push(count > 1 ? count + ' × ' + label : label);
  });
  document.getElementById('monumentList').textContent = parts.length > 0 ? parts.join(', ') : 'none yet';
}

// ---------------------------------------------------------------------------
// The pointer: click to raise the point under it (or the place against the block under it),
// right click to take a block away
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hoverShape = new THREE.Mesh(
  new THREE.CylinderGeometry(cellSize * 0.46, cellSize * 0.46, 1, 24), // one metre high, stretched to the block it shows
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
hoverShape.visible = false;
scene.add(hoverShape);

function nearestPoint(x, z, candidatePoints) {
  let nearest = -1;
  let nearestDistance = Infinity;
  candidatePoints.forEach(function (pointIndex) {
    const distance = Math.hypot(map.points[pointIndex].x - x, map.points[pointIndex].z - z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = pointIndex;
    }
  });
  return { pointIndex: nearest, distance: nearestDistance };
}

// What lies under the pointer: { filledPlace (or null), emptyPlace (where a new block would go, or null) }
function findUnderPointer() {
  raycaster.setFromCamera(pointerPosition, cameraInUse());
  const hits = raycaster.intersectObjects(pickShapes, false);
  if (hits.length > 0) {
    const place = hits[0].object.userData.place;
    const normal = hits[0].face.normal;
    let emptyPlace = null;
    if (Math.abs(normal.y) > 0.5) {
      emptyPlace = { pointIndex: place.pointIndex, level: place.level + Math.sign(normal.y) };
    } else {
      // against the side: the neighbouring point the pointer leans towards
      const point = map.points[place.pointIndex];
      const leanX = hits[0].point.x - point.x;
      const leanZ = hits[0].point.z - point.z;
      const towards = nearestPoint(point.x + leanX * 2.2, point.z + leanZ * 2.2, Array.from(map.sideNeighboursOfPoint[place.pointIndex]));
      emptyPlace = { pointIndex: towards.pointIndex, level: place.level };
    }
    const isFree = emptyPlace.pointIndex >= 0 && volume.contains(emptyPlace.pointIndex, emptyPlace.level) && volume.tierAt(emptyPlace.pointIndex, emptyPlace.level) === TIER.empty &&
      volume.canHold(emptyPlace.pointIndex, emptyPlace.level, brushTier); // nothing suspended: only where something is under it
    return { filledPlace: place, emptyPlace: isFree ? emptyPlace : null };
  }
  const groundPoint = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
    const allPoints = map.points.map(function (point, pointIndex) {
      return pointIndex;
    });
    const nearest = nearestPoint(groundPoint.x, groundPoint.z, allPoints);
    if (nearest.distance < cellSize * 0.75 && volume.tierAt(nearest.pointIndex, 0) === TIER.empty) {
      return { filledPlace: null, emptyPlace: { pointIndex: nearest.pointIndex, level: 0 } };
    }
  }
  return { filledPlace: null, emptyPlace: null };
}

// Whether a data layer lies over the town: then the buildings are drawn faint, and the pointer
// reads the ground, not the buildings
function isADataLayerOverTheTown() {
  return settlement !== null && dataLayerName !== 'traffic' && dataLayerName !== 'none';
}

// The buildings faint (a data layer is on) or solid: each mesh of the town takes a faint copy of
// its material, or its own again
const faintCopyOfMaterial = new Map();
let faintOpacityOfTheTown = 0.13; // (a film sets it lower: a dense town, faint, still hides the layer)
function showTheTownFaintOrSolid() {
  if (!townGroup) {
    return;
  }
  const isFaint = isADataLayerOverTheTown();
  townGroup.traverse(function (object) {
    if (!object.isMesh) {
      return;
    }
    if (!object.userData.solidMaterial) {
      object.userData.solidMaterial = object.material;
    }
    const solidMaterial = object.userData.solidMaterial;
    if (isFaint && !faintCopyOfMaterial.has(solidMaterial)) {
      const faintMaterial = solidMaterial.clone();
      faintMaterial.transparent = true;
      faintMaterial.opacity = faintOpacityOfTheTown;
      faintMaterial.depthWrite = false;
      faintCopyOfMaterial.set(solidMaterial, faintMaterial);
    }
    object.material = isFaint ? faintCopyOfMaterial.get(solidMaterial) : solidMaterial;
    object.castShadow = !isFaint;
  });
}

// The point of the ground the pointer is over, or -1
function pointUnderPointerOnTheGround() {
  raycaster.setFromCamera(pointerPosition, cameraInUse());
  const groundPoint = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
    return -1;
  }
  let nearest = -1;
  let leastDistance = cellSize * 0.8;
  for (let pointIndex = 0; pointIndex < map.points.length; pointIndex++) {
    const distance = Math.hypot(map.points[pointIndex].x - groundPoint.x, map.points[pointIndex].z - groundPoint.z);
    if (distance < leastDistance) {
      leastDistance = distance;
      nearest = pointIndex;
    }
  }
  return nearest;
}

// the mark on the point that is read while a data layer is on
const dataPointMark = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.95, 28).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x1d2228, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
dataPointMark.renderOrder = 6;
dataPointMark.visible = false;
scene.add(dataPointMark);

// In a settlement, a small note beside the pointer. With a data layer on: everything known of the
// point of the ground the pointer is over. Otherwise: whose building the pointer is on.
function showHouseholdTip(pointerX, pointerY) {
  const tip = document.getElementById('householdTip');
  let text = null;
  dataPointMark.visible = false;
  if (isADataLayerOverTheTown()) {
    const pointIndex = pointUnderPointerOnTheGround();
    if (pointIndex !== -1) {
      text = settlement.describeDataAt(pointIndex).join('\n');
      dataPointMark.position.set(map.points[pointIndex].x, 0.09, map.points[pointIndex].z);
      dataPointMark.visible = true;
    }
  } else {
    const filledPlace = settlement !== null ? findUnderPointer().filledPlace : null;
    text = filledPlace ? settlement.describePoint(filledPlace.pointIndex) : null;
  }
  if (!text) {
    tip.style.display = 'none';
    return;
  }
  tip.style.whiteSpace = 'pre-line';
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = (pointerX + 16) + 'px';
  tip.style.top = (pointerY + 16) + 'px';
}

function showHover() {
  if (isADataLayerOverTheTown()) { // the pointer reads the data then; nothing is built
    hoverShape.visible = false;
    return;
  }
  const target = findUnderPointer().emptyPlace;
  if (!target || !volume.canHold(target.pointIndex, target.level, brushTier)) {
    hoverShape.visible = false;
    return;
  }
  hoverShape.visible = true;
  hoverShape.material.color.setHex(TIER_COLOURS[brushTier]);
  const blockHeight = levelHeightOfTier(brushTier);
  hoverShape.scale.y = blockHeight;
  hoverShape.position.set(map.points[target.pointIndex].x, volume.bottomHeightAt(target.pointIndex, target.level) + blockHeight / 2, map.points[target.pointIndex].z);
}

const clickMovementTolerance = 5; // pixels; a longer drag turns the view
let pointerDownPosition = null;
renderer.domElement.addEventListener('pointerdown', function (event) {
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointermove', function (event) {
  if (isWalking) {
    lookRoundWhileWalking(event);
    return;
  }
  pointerPosition.set(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  showHover();
  showHouseholdTip(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerup', function (event) {
  if (isWalking || isADataLayerOverTheTown() || !isBuildMode) {
    return;
  }
  if (!pointerDownPosition || Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y) > clickMovementTolerance) {
    return;
  }
  const under = findUnderPointer();
  if (event.button === 2) {
    if (under.filledPlace) {
      volume.setTier(under.filledPlace.pointIndex, under.filledPlace.level, TIER.empty);
      rebuildTown();
    }
  } else if (event.button === 0 && under.emptyPlace) {
    if (volume.setTier(under.emptyPlace.pointIndex, under.emptyPlace.level, brushTier)) {
      rebuildTown();
    }
  }
  showHover();
});
renderer.domElement.addEventListener('contextmenu', function (event) {
  event.preventDefault();
});

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------
function chooseBrushTier(tier) {
  brushTier = tier;
  document.querySelectorAll('.tierButton').forEach(function (button) {
    button.classList.toggle('active', Number(button.dataset.tier) === tier);
  });
}
document.querySelectorAll('.tierButton').forEach(function (button) {
  button.addEventListener('click', function () {
    chooseBrushTier(Number(button.dataset.tier));
  });
});
window.addEventListener('keydown', function (event) {
  if (event.key === '1' || event.key === '2' || event.key === '3') {
    chooseBrushTier(Number(event.key));
  }
});
document.getElementById('clearButton').addEventListener('click', function () {
  stopSettling();
  settlement = null;
  showDataLayer();
  volume.clear();
  rebuildTown();
});
document.getElementById('volumeButton').addEventListener('click', function () {
  showsBareVolume = !showsBareVolume;
  this.classList.toggle('active', showsBareVolume);
  rebuildTown();
});
// Building by hand is a mode: on, the clicks raise and take away blocks and the tiers to build
// with are shown; off, the clicks only read the ground
let isBuildMode = true;
document.getElementById('buildButton').addEventListener('click', function () {
  isBuildMode = !isBuildMode;
  this.classList.toggle('active', isBuildMode);
  document.getElementById('buildTools').style.display = isBuildMode ? '' : 'none';
});
document.getElementById('squareMapButton').addEventListener('click', function () {
  startMap('square');
});
document.getElementById('irregularMapButton').addEventListener('click', function () {
  startMap('irregular');
});

// The ground: 'square' (with its forum, to look at the parts) or 'irregular' (empty, to settle).
// ('largeIrregular', the name of the irregular ground in the saved runs and the tools until
// 2026-10-13, when the small irregular ground went, is the same.)
function startMap(kind) {
  if (kind === 'largeIrregular') {
    kind = 'irregular';
  }
  stopWalking();
  peopleWalking = [];
  currentMapKind = kind;
  stopSettling();
  settlement = null;
  showDataLayer();
  if (kind === 'square') {
    showMap(createSquareMap(squarePointCount, squarePointCount, cellSize));
    fillTown();
  } else {
    showMap(createIrregularMap(irregularRingCount, cellSize, 7));
    volume.clear(); // a ground to settle: it starts empty
  }
  return rebuildTown();
}

// ---------------------------------------------------------------------------
// The settlement: a town that settles by itself (settlement.js), a few days every second
// ---------------------------------------------------------------------------
let settlement = null;
let isSettling = false;
let settlementNeedsRebuilding = false;
let lastSettlementStepTime = 0;
let lastSettlementRebuildTime = 0;
let dataLayerMesh = null;
let dataLayerLines = null;   // the lines of a layer (the boundaries of the holdings), drawn after the layer
let dataLayerOverlay = null; // the works drawn over a plan (the aqueduct, the fountains), drawn after the layer
const millisecondsPerDay = 60;
const millisecondsBetweenRebuilds = 2500; // a full town takes over a second to rebuild

function stopSettling() {
  isSettling = false;
  document.getElementById('settleButton').classList.remove('active');
}

function startNewSettlement() {
  volume.clear();
  settlement = new Settlement(map, volume, Date.now() % 1000000, readParameters());
  isSettling = true;
  settlementNeedsRebuilding = true;
  document.getElementById('settleButton').classList.add('active');
}

// The town of a settlement rebuilt. The monuments then tell which ground they want open before
// them; where the settlement has to clear a building away for that, the town is built once more.
function rebuildSettledTown() {
  let monumentNames = rebuildTown();
  // (the squares before the public buildings stay open too)
  const squares = [];
  volume.publicBuildings.forEach(function (building) { (building.openPoints || []).forEach(function (pointIndex) { squares.push(pointIndex); }); });
  for (let attempt = 0; attempt < 3 && settlement !== null && settlement.keepOpen(groundToKeepOpen.concat(squares)); attempt++) {
    monumentNames = rebuildTown();
  }
  return monumentNames;
}

// The data layers: what the settlement knows of every point, drawn on the ground.
// 'traffic' is drawn as ground (a dark patch on every free point people have crossed lately,
// darker the more they do, and larger where it counts as road); the others are drawn over the
// town, seen through the buildings, as the patch of ground round each point.
const DATA_LAYER_LEGENDS = {
  journeys: 'Traffic: the journeys that crossed a point and passed beside it, the older ones fading, as it enters the value of a location.',
  traffic: 'The paths people have trodden lately that are not yet streets. Streets are cobbled, busy streets paved.',
  streets: 'Free ground by its grade: street (pale), busy street (red). Blue: ground kept open before a monument.',
  owners: 'One colour for every household: its parcel. Houses grow together only inside a parcel.',
  livelihood: 'Farmers (pale) and merchants (red).',
  security: 'Security: what the households and the public buildings bring to the ground round them (pale: little, red: much).',
  location: 'The value of a location, a square metre: traffic × security (pale: low, red: high).',
  landPrice: 'The value of land, a square metre: property value − building value; open land as if a standard building stood on it (pale: low, red: high).',
  height: 'How many floors stand on each point (pale: one, red: six).',
  use: 'Land use: private ground with its gardens (terracotta), streets (grey), open space (pale green), public buildings and the squares of the fountains (violet); the city wall black, open at the gates, the aqueduct a blue line, the basins of the fountains blue.',
  holding: 'The plan of the holdings: a line round each connected property, each household in a colour of its own, gardens green; streets grey, open ground sand, public buildings violet, the city wall black, open at the gates, the aqueduct a blue line.',
  arrival: 'When the owner of each point arrived (pale: the oldest families, red: the newcomers).',
  rent: 'What each point lets for in a day (pale: little, red: much).',
  money: 'What each household holds (pale: little, red: much).',
  worth: 'What each parcel is worth, land and building (pale: little, red: much).',
  pressure: 'How near a building is to being broken through by traffic (red: about to fall).',
  works: 'The works of the city: walls (dark), gates (gold), the aqueduct (blue), fountains (bright blue); the ground within the walls is tinted.',
  none: 'No data shown.',
};
let dataLayerName = 'none';
const paleLayerColour = new THREE.Color(0xf6ecb9);
const strongLayerColour = new THREE.Color(0xb3261e);
const keptOpenLayerColour = new THREE.Color(0x3b82c4);
const wallLayerColour = new THREE.Color(0x2b2622);
const gateLayerColour = new THREE.Color(0xd9a520);
const fountainLayerColour = new THREE.Color(0x35c6e8);
const LAND_USE_COLOURS = { private: 0xc9633f, street: 0x8d8577, open: 0xcfd6ae, public: 0x8b74b8 };
const holdingGroundColour = new THREE.Color(0xf3e9c8);
const holdingGardenColour = new THREE.Color(0xd3e0b4);   // a garden, within its property's border
// the other kinds of ground on the plan of the holdings, flat: an abstract map, nothing of the
// view showing through (the author, 2026-10-12)
const HOLDING_PLAN_COLOURS = { street: 0xa49c8c, open: 0xe2d8bd, public: 0x8b74b8 };
const aqueductPlanColour = new THREE.Color(0x6fb1e4); // (0x3b82c4 until 2026-10-13: the author wants it lighter)
const aqueductPlanWidth = 0.7;
const fountainPlanWidth = 1.6;

// The aqueduct on the plan: a blue line from each duct point to the next, over whatever ground it
// crosses; a fountain a small blue square. Pushes triangles into positions and colours.
function addAqueductInPlan(positions, colours) {
  function pushQuad(corners) {
    [[0, 1, 2], [0, 2, 3]].forEach(function (triangle) {
      triangle.forEach(function (cornerIndex) {
        positions.push(corners[cornerIndex][0], 0.075, corners[cornerIndex][1]);
        colours.push(aqueductPlanColour.r, aqueductPlanColour.g, aqueductPlanColour.b);
      });
    });
  }
  // a fountain with its square: its basin, a blue bar along the back row of the square
  const isOnASquare = new Set();
  (volume.fountains || []).forEach(function (fountain) {
    fountain.pointIndices.forEach(function (pointIndex) { isOnASquare.add(pointIndex); });
    const backFirst = map.points[fountain.backRow[0]];
    const backLast = map.points[fountain.backRow[fountain.backRow.length - 1]];
    const end = map.points[fountain.endPoint];
    const frontMiddle = map.points[fountain.frontRow[1]];
    const alongLength = Math.hypot(backLast.x - backFirst.x, backLast.z - backFirst.z) || 1;
    const alongX = (backLast.x - backFirst.x) / alongLength;
    const alongZ = (backLast.z - backFirst.z) / alongLength;
    const frontLength = Math.hypot(frontMiddle.x - end.x, frontMiddle.z - end.z) || 1;
    const frontX = (frontMiddle.x - end.x) / frontLength;
    const frontZ = (frontMiddle.z - end.z) / frontLength;
    const halfLength = alongLength / 2 + 0.8;
    const middleX = end.x + frontX * 1.6;
    const middleZ = end.z + frontZ * 1.6;
    pushQuad([[middleX - alongX * halfLength, middleZ - alongZ * halfLength], [middleX + alongX * halfLength, middleZ + alongZ * halfLength],
      [middleX + alongX * halfLength + frontX * fountainPlanWidth, middleZ + alongZ * halfLength + frontZ * fountainPlanWidth],
      [middleX - alongX * halfLength + frontX * fountainPlanWidth, middleZ - alongZ * halfLength + frontZ * fountainPlanWidth]]);
  });
  map.points.forEach(function (point, pointIndex) {
    const works = volume.works[pointIndex];
    if ((works & WORK.fountain) !== 0 && !isOnASquare.has(pointIndex)) {
      const half = fountainPlanWidth / 2;
      pushQuad([[point.x - half, point.z - half], [point.x + half, point.z - half], [point.x + half, point.z + half], [point.x - half, point.z + half]]);
    }
    if ((works & WORK.duct) === 0) {
      return;
    }
    map.sideNeighboursOfPoint[pointIndex].forEach(function (neighbourPoint) {
      if (neighbourPoint < pointIndex || (volume.works[neighbourPoint] & WORK.duct) === 0) {
        return;
      }
      const neighbour = map.points[neighbourPoint];
      const acrossX = neighbour.z - point.z;
      const acrossZ = -(neighbour.x - point.x);
      const length = Math.hypot(acrossX, acrossZ) || 1;
      const offsetX = acrossX / length * aqueductPlanWidth / 2;
      const offsetZ = acrossZ / length * aqueductPlanWidth / 2;
      pushQuad([[point.x + offsetX, point.z + offsetZ], [neighbour.x + offsetX, neighbour.z + offsetZ],
        [neighbour.x - offsetX, neighbour.z - offsetZ], [point.x - offsetX, point.z - offsetZ]]);
    });
  });
}
const holdingBoundaryColour = new THREE.Color(0x100c08);
const holdingBoundaryWidth = 0.12;   // a hairline: a pixel at four times the zoom of a whole town of 80 (a solid pixel line looked fat beside the small parcels, the author, 2026-10-12)
const wallPlanColour = new THREE.Color(0x000000);

// The city wall on the plan, solid black: the patch of every wall point filled; a gate point is
// left open, so that the opening shows. Pushes triangles into positions and colours.
function addWallsInPlan(positions, colours) {
  map.points.forEach(function (point, pointIndex) {
    const works = volume.works[pointIndex];
    if ((works & WORK.wall) === 0 || (works & WORK.gate) !== 0) {
      return;
    }
    map.quartersOfPoint[pointIndex].forEach(function (quarter) {
      [[0, 1, 2], [0, 2, 3]].forEach(function (triangle) {
        triangle.forEach(function (cornerIndex) {
          positions.push(quarter.outline[cornerIndex][0], 0.07, quarter.outline[cornerIndex][1]);
          colours.push(wallPlanColour.r, wallPlanColour.g, wallPlanColour.b);
        });
      });
    });
  });
}

// The boundaries of the holdings: hairlines of a fixed width on the ground, so that they are a
// faint web when the whole town is in the window and firm lines when a block is; along every face
// of a held point's patch that looks at ground another household holds, or nobody; two
// neighbouring holdings share the line. Returns them as a mesh.
function holdingBoundaryLines() {
  const positions = [];
  map.points.forEach(function (point, pointIndex) {
    const household = settlement.ownerOfPoint[pointIndex];
    if (household === null || household.isCity) {
      return;
    }
    facesOfPatch(map, pointIndex).forEach(function (face) {
      if (settlement.ownerOfPoint[face.neighbourPoint] === household) {
        return;
      }
      stretchesOfFace(face).forEach(function (stretch) {
        const acrossX = stretch[1][1] - stretch[0][1];
        const acrossZ = -(stretch[1][0] - stretch[0][0]);
        const length = Math.hypot(acrossX, acrossZ) || 1;
        const offsetX = acrossX / length * holdingBoundaryWidth / 2;
        const offsetZ = acrossZ / length * holdingBoundaryWidth / 2;
        const corners = [
          [stretch[0][0] + offsetX, stretch[0][1] + offsetZ], [stretch[1][0] + offsetX, stretch[1][1] + offsetZ],
          [stretch[1][0] - offsetX, stretch[1][1] - offsetZ], [stretch[0][0] - offsetX, stretch[0][1] - offsetZ],
        ];
        [[0, 1, 2], [0, 2, 3]].forEach(function (triangle) {
          triangle.forEach(function (cornerIndex) {
            positions.push(corners[cornerIndex][0], 0.09, corners[cornerIndex][1]);
          });
        });
      });
    });
  });
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: holdingBoundaryColour, depthTest: false, transparent: true, side: THREE.DoubleSide }));
  lines.renderOrder = 6;
  return lines;
}

// The streets, as ground: on every free point that is used as street, the patch of ground round
// the point (the quarters of the quads that meet at it, so skewed with the grid), cobbled; the
// busy streets are paved with large slabs. They are made anew whenever the data is shown, since
// streets come and go without the town being rebuilt.
let streetGroup = null;
function showStreets() {
  if (streetGroup) {
    scene.remove(streetGroup);
    streetGroup.traverse(function (object) {
      if (object.isMesh) {
        object.geometry.dispose();
      }
    });
    streetGroup = null;
  }
  if (settlement === null || volume.streetGrades === null) {
    return;
  }
  // the streets cobbled or paved; the free ground that is nobody's and no street is farmland, in
  // fields of green and straw (each point its own field, so that the fields are skewed with the grid)
  const coordinatesOfMaterial = { cobble: [], paving: [], fieldGreen: [], fieldStraw: [], fieldOlive: [], fieldFallow: [] };
  const fieldNames = ['fieldGreen']; // (one yellow-green for all the fields, as the gardens: the author, 2026-10-13; four colours until then)
  map.points.forEach(function (point, pointIndex) {
    const grade = volume.streetGrades[pointIndex];
    const isAStreet = grade > 0 || (volume.works[pointIndex] & 18) !== 0; // also a gate and the passage of an arch
    if (!settlement.isFree(pointIndex) || (volume.works[pointIndex] & 1) !== 0) {
      return;
    }
    if (!isAStreet && volume.works[pointIndex] === 0 && !settlement.isKeptOpen[pointIndex] && !point.isOnBoundary) {
      const fieldCoordinates = coordinatesOfMaterial[fieldNames[Math.floor(placeHash(pointIndex, 0, 91) * fieldNames.length)]];
      map.quartersOfPoint[pointIndex].forEach(function (quarter) {
        [[0, 2, 1], [0, 3, 2]].forEach(function (triangle) {
          triangle.forEach(function (cornerIndex) {
            fieldCoordinates.push(quarter.outline[cornerIndex][0], 0.03, quarter.outline[cornerIndex][1]);
          });
        });
      });
      return;
    }
    if (!isAStreet) {
      return;
    }
    const coordinates = coordinatesOfMaterial[grade === 2 ? 'paving' : 'cobble'];
    map.quartersOfPoint[pointIndex].forEach(function (quarter) {
      [[0, 2, 1], [0, 3, 2]].forEach(function (triangle) {
        triangle.forEach(function (cornerIndex) {
          coordinates.push(quarter.outline[cornerIndex][0], 0.05, quarter.outline[cornerIndex][1]);
        });
      });
    });
  });
  const collector = new PartCollector();
  Object.keys(coordinatesOfMaterial).forEach(function (materialName) {
    if (coordinatesOfMaterial[materialName].length > 0) {
      collector.addTriangles(materialName, coordinatesOfMaterial[materialName]);
    }
  });
  streetGroup = collector.buildMeshes(materials);
  streetGroup.traverse(function (object) {
    object.castShadow = false;
  });
  scene.add(streetGroup);
}

// The city in numbers, as it stands now: a line at the foot of the window, a table in the Data
// tab, and the households over the days as a chart.
let householdHistory = []; // { day, inHuts, inHouses, classical }
function showStatistics() {
  if (settlement === null) {
    showStatisticCards({});
    householdHistory = [];
    drawHistory();
    return;
  }
  const statistics = settlement.statistics();
  if (householdHistory.length === 0 || householdHistory[householdHistory.length - 1].day !== statistics.days) {
    if (householdHistory.length > 0 && householdHistory[householdHistory.length - 1].day > statistics.days) {
      householdHistory = []; // another settlement
    }
    householdHistory.push({ day: statistics.days, inHuts: statistics.householdsInHuts, inHouses: statistics.householdsInHouses, classical: statistics.householdsClassical });
  }
  showStatisticCards(Object.assign({ treasury: Math.round(settlement.city.money) }, statistics));
  const richest = document.getElementById('richestHouseholds');
  richest.innerHTML = '';
  settlement.richestHouseholds(12).forEach(function (household) {
    const tableRow = document.createElement('tr');
    [household.name, household.points + (household.points === 1 ? ' point' : ' points'), household.money].forEach(function (text) {
      const cell = document.createElement('td');
      cell.textContent = text;
      tableRow.appendChild(cell);
    });
    richest.appendChild(tableRow);
  });
  const chronicle = document.getElementById('cityChronicle');
  chronicle.innerHTML = '';
  settlement.city.chronicle.forEach(function (entry) {
    const line = document.createElement('div');
    line.textContent = 'Day ' + entry.day + ': ' + entry.text;
    chronicle.appendChild(line);
  });
  drawHistory();
}

// the numbers in cards by their subject; a number of no card goes to the last
const STATISTIC_GROUPS = [
  ['PEOPLE', ['days', 'households', 'farmers', 'merchants', 'householdsInHuts', 'householdsInHouses', 'householdsClassical', 'householdsInDebt', 'householdsWithoutWater', 'meanMoneyOfAHousehold', 'fortunesWon', 'fortunesLost']],
  ['HOLDINGS AND LAND', ['largestHoldingPoints', 'meanHoldingPoints', 'shareOfGroundSettled', 'gardenPoints', 'acquisitions', 'streetsTaken', 'landSoldByTheCity', 'meanLandPriceOfAParcel']],
  ['BUILDINGS', ['hutBlocks', 'houseBlocks', 'houseBlocksWithClassicalFloors', 'classicalBlocks', 'towerBlocks', 'roofTerraces', 'mostLevelsOfABlock', 'meanLevelsOfABlock', 'investments', 'shopFronts', 'buildingsBrokenThrough', 'buildingsClearedBeforeMonuments']],
  ['VALUE, RENT AND TAX', ['worthOfAllProperty', 'rentOfAllEachDay', 'taxCollected']],
  ['STREETS AND TRAFFIC', ['roadPoints', 'busyStreetPoints', 'streetShareOfTheGroundInUse', 'shareOfJourneysToVenues', 'shareOfJourneysToOtherTowns']],
  ['LAND USE', ['landUsePrivate', 'landUseStreet', 'landUseOpen', 'landUsePublic']],
  ['THE CITY', ['treasury', 'publicBuildings', 'fountains', 'aqueductPoints', 'walls', 'wallPoints', 'gates', 'moneySpentByTheCity', 'citySpentOn']],
  ['OTHER', []],
];
function addStatisticRow(card, label, value) {
  const row = document.createElement('div');
  row.className = 'statisticRow';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  const valueSpan = document.createElement('span');
  valueSpan.textContent = wordsOfStatistic(value);
  row.appendChild(labelSpan);
  row.appendChild(valueSpan);
  card.appendChild(row);
}
// a whole number as it is, a fraction to two decimals, a large amount rounded, nothing as 'none'
function wordsOfStatistic(value) {
  if (value === '' || value === undefined || value === null) {
    return 'none';
  }
  if (typeof value !== 'number') {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(2);
}
function showStatisticCards(statistics) {
  const grid = document.getElementById('statisticsGroups');
  grid.querySelectorAll('.card.numbers').forEach(function (card) { card.remove(); });
  const firstFixedCard = document.getElementById('richestCard');
  const namesPlaced = new Set();
  STATISTIC_GROUPS.forEach(function (group) {
    const names = group[1].length > 0 ? group[1].filter(function (name) { return statistics[name] !== undefined; })
      : Object.keys(statistics).filter(function (name) { return !namesPlaced.has(name); });
    if (names.length === 0) {
      return;
    }
    const card = document.createElement('div');
    card.className = 'card numbers';
    const title = createPanelHeading(group[0]);
    card.appendChild(title);
    names.forEach(function (name) {
      namesPlaced.add(name);
      let value = statistics[name];
      if (typeof value === 'string' && value.charAt(0) === '{') {
        value = JSON.parse(value); // (the numbers by kind come as JSON, for the tools)
      }
      if (value !== null && typeof value === 'object') { // (a number for each kind: a row for each)
        Object.keys(value).forEach(function (kind) {
          addStatisticRow(card, wordsOfName(name) + ': ' + wordsOfName(kind), value[kind]);
        });
      } else {
        addStatisticRow(card, wordsOfName(name), value);
      }
    });
    grid.insertBefore(card, firstFixedCard);
  });
}

function drawHistory() {
  const canvas = document.getElementById('historyChart');
  if (!canvas) {
    return; // (the chart left the interface on 2026-10-13: it told little)
  }
  const brush = canvas.getContext('2d');
  brush.clearRect(0, 0, canvas.width, canvas.height);
  if (householdHistory.length < 2) {
    return;
  }
  const lastDay = householdHistory[householdHistory.length - 1].day;
  const firstDay = householdHistory[0].day;
  let mostHouseholds = 1;
  householdHistory.forEach(function (entry) {
    mostHouseholds = Math.max(mostHouseholds, entry.inHuts, entry.inHouses, entry.classical);
  });
  [['inHuts', '#b59d5b'], ['inHouses', '#b4573a'], ['classical', '#6f6a66']].forEach(function (series) {
    brush.beginPath();
    householdHistory.forEach(function (entry, index) {
      const x = 8 + (canvas.width - 16) * (entry.day - firstDay) / Math.max(1, lastDay - firstDay);
      const y = canvas.height - 8 - (canvas.height - 16) * entry[series[0]] / mostHouseholds;
      if (index === 0) {
        brush.moveTo(x, y);
      } else {
        brush.lineTo(x, y);
      }
    });
    brush.strokeStyle = series[1];
    brush.lineWidth = 4;
    brush.stroke();
  });
  document.getElementById('historyLegend').textContent = 'Households over the days ' + firstDay + ' to ' + lastDay + ' (most: ' + mostHouseholds +
    '): yellow in huts, red in houses, grey classical.';
}

function showDataLayer() {
  showStreets();
  showStatistics();
  showTheTownFaintOrSolid();
  if (!isADataLayerOverTheTown()) {
    dataPointMark.visible = false;
  }
  if (dataLayerMesh) {
    scene.remove(dataLayerMesh);
    dataLayerMesh.geometry.dispose();
    dataLayerMesh.material.dispose();
    dataLayerMesh = null;
  }
  if (dataLayerLines) {
    scene.remove(dataLayerLines);
    dataLayerLines.geometry.dispose();
    dataLayerLines.material.dispose();
    dataLayerLines = null;
  }
  if (dataLayerOverlay) {
    scene.remove(dataLayerOverlay);
    dataLayerOverlay.geometry.dispose();
    dataLayerOverlay.material.dispose();
    dataLayerOverlay = null;
  }
  // (a layer with fixed bands names them: the same colour for the same value, always)
  document.getElementById('dataLayerLegend').textContent = dataLayerName === 'none' ? '' : DATA_LAYER_LEGENDS[dataLayerName] +
    (LAYER_BANDS[dataLayerName] ? ' Fixed bands, pale to red, from: ' + LAYER_BANDS[dataLayerName].join(', ') + '.' : '');
  if (settlement === null || dataLayerName === 'none') {
    return;
  }
  const positions = [];
  const colours = [];
  const geometry = new THREE.BufferGeometry();
  if (dataLayerName === 'traffic') {
    const trodden = new THREE.Color(0xb7a98c);
    const street = new THREE.Color(0x6f6455);
    // (the streets themselves are ground: showStreets; here are the paths that are not yet streets)
    map.points.forEach(function (point, pointIndex) {
      const traffic = settlement.recentTraffic[pointIndex];
      if (traffic < 0.5 || !settlement.isFree(pointIndex) || volume.streetGrades[pointIndex] > 0 || volume.works[pointIndex] !== 0) {
        return;
      }
      const colour = trodden.clone().lerp(street, Math.min(1, traffic / roadRecentTraffic) * 0.6);
      map.quartersOfPoint[pointIndex].forEach(function (quarter) {
        const outline = shrinkOutline(quarter.outline, point.x, point.z, -0.6);
        [[0, 2, 1], [0, 3, 2]].forEach(function (triangle) {
          triangle.forEach(function (cornerIndex) {
            positions.push(point.x + (outline[cornerIndex][0] - point.x) * 0.55, 0.03, point.z + (outline[cornerIndex][1] - point.z) * 0.55);
            colours.push(colour.r, colour.g, colour.b);
          });
        });
      });
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    dataLayerMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    scene.add(dataLayerMesh);
    return;
  }
  map.points.forEach(function (point, pointIndex) {
    let colour = null;
    const value = settlement.layerValueAt(dataLayerName, pointIndex);
    if (dataLayerName === 'works') {
      const works = volume.works[pointIndex];
      if (works & 2) {
        colour = gateLayerColour;
      } else if (works & 1) {
        colour = wallLayerColour;
      } else if (works & 8) {
        colour = fountainLayerColour;
      } else if (works & 4) {
        colour = keptOpenLayerColour;
      } else if (settlement.isWithinWalls[pointIndex]) {
        colour = paleLayerColour;
      } else {
        return;
      }
    } else if (dataLayerName === 'streets' && (settlement.isKeptOpen[pointIndex] || settlement.isAGuaranteedPassage[pointIndex])) {
      colour = keptOpenLayerColour;
    } else if (dataLayerName === 'holding') {
      const use = settlement.layerValueAt('use', pointIndex);
      if (use === 'private') {
        // (each household in a pale colour of its own, its gardens green)
        colour = volume.tierAt(pointIndex, 0) === TIER.garden ? holdingGardenColour : new THREE.Color().setHSL((value * 0.618034) % 1, 0.5, 0.8);
      } else {
        colour = new THREE.Color(HOLDING_PLAN_COLOURS[use]);
      }
    } else if (value === null) {
      return;
    } else if (dataLayerName === 'owners') {
      colour = new THREE.Color().setHSL((value * 0.618034) % 1, 0.62, 0.5 + 0.12 * ((value * 7) % 3 - 1));
    } else if (dataLayerName === 'use') {
      colour = new THREE.Color(LAND_USE_COLOURS[value]);
    } else {
      colour = paleLayerColour.clone().lerp(strongLayerColour, value);
    }
    // the patch of ground round the point: the quarters of the quads that meet at it
    map.quartersOfPoint[pointIndex].forEach(function (quarter) {
      [[0, 1, 2], [0, 2, 3]].forEach(function (triangle) {
        triangle.forEach(function (cornerIndex) {
          positions.push(quarter.outline[cornerIndex][0], 0.06, quarter.outline[cornerIndex][1]);
          colours.push(colour.r, colour.g, colour.b);
        });
      });
    });
  });
  if (dataLayerName === 'holding') {
    dataLayerLines = holdingBoundaryLines();
    scene.add(dataLayerLines);
  }
  addWallsInPlan(positions, colours);
  if (dataLayerName === 'holding' || dataLayerName === 'use') {
    // (a mesh of its own, drawn after the plan: within one mesh the line was lost under the ground)
    const overlayPositions = [];
    const overlayColours = [];
    addAqueductInPlan(overlayPositions, overlayColours);
    const overlayGeometry = new THREE.BufferGeometry();
    overlayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(overlayPositions, 3));
    overlayGeometry.setAttribute('color', new THREE.Float32BufferAttribute(overlayColours, 3));
    dataLayerOverlay = new THREE.Mesh(overlayGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    dataLayerOverlay.renderOrder = 7;
    scene.add(dataLayerOverlay);
  }
  // (the holdings and the land use are abstract maps: fully covering, flat colours, nothing of
  // the view showing through; the material stays transparent so that it is drawn after the faint
  // town, not under it)
  const isOpaque = dataLayerName === 'holding' || dataLayerName === 'use';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  dataLayerMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: isOpaque ? 1 : 0.82, depthTest: false, side: THREE.DoubleSide }));
  dataLayerMesh.renderOrder = 5;
  scene.add(dataLayerMesh);
}

// a layer button shows its layer; pressed again, it takes the layer off (no button for 'none')
document.querySelectorAll('#dataLayerButtons button').forEach(function (button) {
  button.addEventListener('click', function () {
    dataLayerName = dataLayerName === button.dataset.layer ? 'none' : button.dataset.layer;
    document.querySelectorAll('#dataLayerButtons button').forEach(function (other) {
      other.classList.toggle('active', other.dataset.layer === dataLayerName);
    });
    showDataLayer();
  });
});

// ---------------------------------------------------------------------------
// The panel of settings: its tabs, the sizes of the grounds, the parameters of a settlement
// ---------------------------------------------------------------------------
// the line of the city wall
(function () {
  const list = document.getElementById('wallStyleList');
  WALL_STYLES.forEach(function (styleName) {
    const option = document.createElement('option');
    option.value = styleName;
    option.textContent = wordsOfName(styleName);
    list.appendChild(option);
  });
  list.value = DEFAULT_WALL_STYLE;
  list.addEventListener('change', function () {
    chosenWallStyle = this.value;
    rebuildSettledTown();
    showDataLayer();
  });
})();
document.getElementById('squareSizeList').addEventListener('change', function () {
  squarePointCount = Number(this.value);
  startMap('square');
});
document.getElementById('irregularSizeList').addEventListener('change', function () {
  irregularRingCount = Number(this.value);
  startMap('irregular');
});

// a name of the code in plain words: 'moneyKeptEachDay' -> 'money kept each day'
function wordsOfName(name) {
  return name.replace(/([A-Z])/g, function (letter) { return ' ' + letter.toLowerCase(); });
}
// one line of the panel: a name and a number to set
function addParameterRow(container, name, value, parameterName) {
  const row = document.createElement('div');
  row.className = 'parameterRow';
  const label = document.createElement('label');
  label.textContent = wordsOfName(name);
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = value;
  if (parameterName) {
    input.dataset.parameter = parameterName;
  }
  row.appendChild(label);
  row.appendChild(input);
  container.appendChild(row);
  return input;
}
// The parameters in cards by their subject, each opened by the first parameter of it (in the
// order of the defaults), with a line on what the card is about
const PARAMETER_GROUPS = [
  { title: 'VALUES, RENT AND TAX', firstParameter: 'tileValueScale',
    about: 'What a tile is worth from its location, what it lets for and costs to keep in a year, what the city takes in tax and on a sale, and the yield an investment has to promise.' },
  { title: 'WHAT RAISES A PROPERTY', firstParameter: 'backwardTileUtility',
    about: 'The utility of a tile by where it stands, and the bonuses that a classical portal or top, a garden and a tower give every tile of the property.' },
  { title: 'LAND', firstParameter: 'vacantLandFactor',
    about: 'What vacant ground, a street and farmland are worth, the loss on a point far from home, and the premium paid on a neighbour\'s property.' },
  { title: 'HOUSEHOLDS AND THEIR FORTUNES', firstParameter: 'startingCapital',
    about: 'What newcomers bring, farmers and merchants, when a farmer turns merchant, how often a household looks for an investment, and the strokes of fortune that set the families apart.' },
  { title: 'TOWERS', firstParameter: 'householdsForEachTower',
    about: 'How many towers the town has room for, and how rich a household has to be to raise one for its own sake.' },
  { title: 'ARRIVALS AND TRAFFIC', firstParameter: 'journeysPerHouseholdEachDay',
    about: 'How often people arrive and travel, how much of the ground may be built on, how traffic fades and makes a street busy, shops opening, and what a building in the way costs a journey.' },
  { title: 'THE CITY: WATER, WALL, WORKS', firstParameter: 'householdsScaleOfPublicBuildings',
    about: 'From how many households the city builds fountains and a wall, what its works cost it, and the scale of all the public buildings\' bars.' },
];
(function () {
  const grid = document.getElementById('parameterGroups');
  const firstFixedCard = document.getElementById('publicBuildingCard');
  let card = null;
  Object.keys(SETTLEMENT_PARAMETER_DEFAULTS).forEach(function (name) {
    PARAMETER_GROUPS.forEach(function (group) {
      if (group.firstParameter === name) {
        card = document.createElement('div');
        card.className = 'card';
        const title = createPanelHeading(group.title);
        const about = document.createElement('div');
        about.className = 'cardHint';
        about.textContent = group.about;
        card.appendChild(title);
        card.appendChild(about);
        grid.insertBefore(card, firstFixedCard);
      }
    });
    addParameterRow(card, name, SETTLEMENT_PARAMETER_DEFAULTS[name], name);
  });
})();
// the bars of the public buildings are set in the list itself: they hold from then on
PUBLIC_BUILDINGS.forEach(function (building) {
  const input = addParameterRow(document.getElementById('publicBuildingBars'), building.kind, building.householdsNeeded, '');
  input.dataset.publicBuilding = building.kind;
  input.addEventListener('change', function () {
    building.householdsNeeded = Number(input.value);
  });
});

// ---------------------------------------------------------------------------
// The parameters saved and loaded as a file, and the history of their changes (the author,
// 2026-10-13): every change made in the panel is kept, with its time, what it was and what it
// became, in this browser (localStorage) and in every parameters file saved.
// ---------------------------------------------------------------------------
const PARAMETER_HISTORY_KEY = 'romeParameterHistory';
const mostHistoryEntriesKept = 500;
let parameterHistory = [];
try {
  parameterHistory = JSON.parse(localStorage.getItem(PARAMETER_HISTORY_KEY) || '[]');
} catch (error) {
  parameterHistory = [];
}
// every setting of the panel: the settlement's and the city's parameters, the bars of the
// public buildings, the wall line
function settingsOfThePanel() {
  const settings = {};
  document.querySelectorAll('input[data-parameter]').forEach(function (input) {
    settings[input.dataset.parameter] = Number(input.value);
  });
  document.querySelectorAll('input[data-public-building]').forEach(function (input) {
    settings['householdsNeededFor:' + input.dataset.publicBuilding] = Number(input.value);
  });
  settings.wallStyle = document.getElementById('wallStyleList').value;
  return settings;
}
let settingsShown = null; // (the settings as they stood before the latest change)
function rememberParameterChange(name, valueBefore, valueAfter, cause) {
  parameterHistory.push({ time: new Date().toISOString(), name: name, from: valueBefore, to: valueAfter, cause: cause || 'set in the panel' });
  if (parameterHistory.length > mostHistoryEntriesKept) {
    parameterHistory.splice(0, parameterHistory.length - mostHistoryEntriesKept);
  }
  try {
    localStorage.setItem(PARAMETER_HISTORY_KEY, JSON.stringify(parameterHistory));
  } catch (error) {
    // (no storage: the history lives for this page only)
  }
}
// the settings compared with those last shown: a history entry for each that changed
function noteTheChangesOfThePanel(cause) {
  const settings = settingsOfThePanel();
  if (settingsShown !== null) {
    Object.keys(settings).forEach(function (name) {
      if (settings[name] !== settingsShown[name]) {
        rememberParameterChange(name, settingsShown[name], settings[name], cause);
      }
    });
  }
  settingsShown = settings;
  showParameterHistory();
}
// a time kept in the ISO form (UTC) shown in the clock of this computer: '2026-10-13 20:20'
function wordsOfTime(isoTime) {
  const time = new Date(isoTime);
  if (Number.isNaN(time.getTime())) {
    return String(isoTime);
  }
  function twoDigits(number) {
    return String(number).padStart(2, '0');
  }
  return time.getFullYear() + '-' + twoDigits(time.getMonth() + 1) + '-' + twoDigits(time.getDate()) + ' ' + twoDigits(time.getHours()) + ':' + twoDigits(time.getMinutes());
}
function wordsOfParameterChange(entry) {
  const name = entry.name.indexOf('householdsNeededFor:') === 0 ? 'households needed for a ' + wordsOfName(entry.name.slice('householdsNeededFor:'.length)) : wordsOfName(entry.name);
  return wordsOfTime(entry.time) + ' · ' + name + ': ' + entry.from + ' → ' + entry.to + (entry.cause && entry.cause !== 'set in the panel' ? ' (' + entry.cause + ')' : '');
}
function showParameterHistory() {
  const list = document.getElementById('parameterHistory');
  list.innerHTML = '';
  if (parameterHistory.length === 0) {
    list.textContent = 'No change yet.';
    return;
  }
  parameterHistory.slice().reverse().forEach(function (entry) {
    const line = document.createElement('div');
    line.textContent = wordsOfParameterChange(entry);
    list.appendChild(line);
  });
}
// the panel's settings set from a saved object (what it does not name stays), with a cause for the history
function applySettingsToThePanel(settings, cause) {
  document.querySelectorAll('input[data-parameter]').forEach(function (input) {
    if (settings[input.dataset.parameter] !== undefined) {
      input.value = settings[input.dataset.parameter];
    }
  });
  document.querySelectorAll('input[data-public-building]').forEach(function (input) {
    const value = settings['householdsNeededFor:' + input.dataset.publicBuilding];
    if (value !== undefined) {
      input.value = value;
      PUBLIC_BUILDINGS.forEach(function (building) {
        if (building.kind === input.dataset.publicBuilding) {
          building.householdsNeeded = Number(value);
        }
      });
    }
  });
  if (settings.wallStyle !== undefined && WALL_STYLES.indexOf(settings.wallStyle) >= 0) {
    document.getElementById('wallStyleList').value = settings.wallStyle;
    chosenWallStyle = settings.wallStyle;
  }
  noteTheChangesOfThePanel(cause);
}
document.getElementById('settingsPanel').addEventListener('change', function () {
  noteTheChangesOfThePanel('set in the panel');
});
document.getElementById('saveParametersButton').addEventListener('click', function () {
  const name = 'parameters_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = { kind: 'romeParameters', savedAt: new Date().toISOString(), settings: settingsOfThePanel(), history: parameterHistory };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  link.download = name + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
  document.getElementById('parameterFileStatus').textContent = 'Saved as ' + name + '.json, in the downloads, with ' + parameterHistory.length + ' changes of history.';
});
document.getElementById('loadParametersButton').addEventListener('click', function () {
  document.getElementById('loadParametersInput').click();
});
document.getElementById('loadParametersInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const loaded = JSON.parse(reader.result);
      const settings = loaded.settings || loaded.parameters || loaded;
      applySettingsToThePanel(settings, 'loaded from ' + file.name);
      document.getElementById('parameterFileStatus').textContent = 'Loaded ' + file.name + (loaded.savedAt ? ', saved ' + wordsOfTime(loaded.savedAt) : '') + '.';
    } catch (error) {
      document.getElementById('parameterFileStatus').textContent = 'Not a parameters file: ' + error.message;
    }
  };
  reader.readAsText(file);
  this.value = '';
});
document.getElementById('defaultParametersButton').addEventListener('click', function () {
  const defaults = Object.assign({}, SETTLEMENT_PARAMETER_DEFAULTS);
  PUBLIC_BUILDINGS.forEach(function (building) {
    defaults['householdsNeededFor:' + building.kind] = DEFAULT_HOUSEHOLDS_NEEDED[building.kind];
  });
  defaults.wallStyle = DEFAULT_WALL_STYLE;
  applySettingsToThePanel(defaults, 'back to the defaults');
  document.getElementById('parameterFileStatus').textContent = 'Every parameter is at its default.';
});
document.getElementById('forgetParameterHistoryButton').addEventListener('click', function () {
  parameterHistory = [];
  try {
    localStorage.removeItem(PARAMETER_HISTORY_KEY);
  } catch (error) {
    // (no storage)
  }
  showParameterHistory();
});
const DEFAULT_HOUSEHOLDS_NEEDED = {};
PUBLIC_BUILDINGS.forEach(function (building) { DEFAULT_HOUSEHOLDS_NEEDED[building.kind] = building.householdsNeeded; });
settingsShown = settingsOfThePanel();
showParameterHistory();
// the parameters as the panel has them, for a new settlement
function readParameters() {
  const parameters = {};
  document.querySelectorAll('input[data-parameter]').forEach(function (input) {
    const value = Number(input.value);
    if (input.value !== '' && Number.isFinite(value)) {
      parameters[input.dataset.parameter] = value;
    }
  });
  return parameters;
}
// ... and the panel showing the parameters of a settlement (a saved run that was loaded)
function showParameters(parameters) {
  document.querySelectorAll('input[data-parameter]').forEach(function (input) {
    if (parameters[input.dataset.parameter] !== undefined) {
      input.value = parameters[input.dataset.parameter];
    }
  });
  if (typeof noteTheChangesOfThePanel === 'function' && settingsShown !== null) {
    noteTheChangesOfThePanel('of a loaded town');
  }
}

// A saved run shown (tools/run_batch.js writes them): its ground, its town and its settlement as
// they stood at the end, to be looked at and turned in space, with the data layers, and to be
// let live on with its own parameters.
let currentMapKind = 'square';
function showSavedRun(run) {
  if (run.groundSize) { // (the runs saved before the grounds had sizes were all of the first size)
    squarePointCount = run.groundSize.squarePointCount;
    irregularRingCount = run.groundSize.largeIrregularRingCount;
  } else {
    squarePointCount = 30;
    irregularRingCount = 8;
  }
  document.getElementById('squareSizeList').value = String(squarePointCount);
  document.getElementById('irregularSizeList').value = String(irregularRingCount);
  startMap(run.ground);
  volume.clear();
  settlement = Settlement.restore(map, volume, run.saved);
  showParameters(settlement.parameters);
  rebuildSettledTown();
  showDataLayer();
  document.getElementById('settlementStatus').textContent = settlement.summary();
}

// Save: the town with its settlement and its parameters, as a file the browser hands over. Load:
// such a file, or one a tool saved; Settle then lets it live on with its own parameters.
document.getElementById('saveTownButton').addEventListener('click', function () {
  const hint = document.getElementById('saveLoadHint');
  if (settlement === null) {
    hint.textContent = 'There is no settlement to save yet: Settle first.';
    return;
  }
  const run = window.rome.saveRun();
  run.name = 'town_' + settlement.seed + '_day_' + settlement.dayCount;
  run.label = run.name + ' · ' + settlement.summary();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(run)], { type: 'application/json' }));
  link.download = run.name + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
  hint.textContent = 'Saved as ' + run.name + '.json (in the downloads).';
});
document.getElementById('loadTownButton').addEventListener('click', function () {
  document.getElementById('loadTownInput').click();
});
document.getElementById('loadTownInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const run = JSON.parse(reader.result);
      showSavedRun(run);
      document.getElementById('saveLoadHint').textContent = 'Loaded ' + file.name + ' at day ' + settlement.dayCount + '. Settle lets it live on.';
    } catch (error) {
      document.getElementById('saveLoadHint').textContent = 'Not a saved town: ' + error.message;
    }
  };
  reader.readAsText(file);
  this.value = '';
});
// ---------------------------------------------------------------------------
// The save slots on the server side (vite.config.js keeps them in saves/; the author,
// 2026-10-13): each holds a town with its settlement, the parameters of the panel and a
// thumbnail of the view. Save overwrites a slot; Load brings its town back and its parameters
// into the panel; Empty frees it.
// ---------------------------------------------------------------------------
const thumbnailWidth = 320;
const thumbnailHeight = 180;
function thumbnailOfTheView() {
  renderer.render(scene, cameraInUse());
  const picture = document.createElement('canvas');
  picture.width = thumbnailWidth;
  picture.height = thumbnailHeight;
  const brush = picture.getContext('2d');
  // the middle of the view, cropped to the thumbnail's shape
  const source = renderer.domElement;
  const scale = Math.max(thumbnailWidth / source.width, thumbnailHeight / source.height);
  const drawnWidth = source.width * scale;
  const drawnHeight = source.height * scale;
  brush.drawImage(source, (thumbnailWidth - drawnWidth) / 2, (thumbnailHeight - drawnHeight) / 2, drawnWidth, drawnHeight);
  return picture.toDataURL('image/jpeg', 0.8);
}
function wordsOfSlot(meta) {
  return meta.label + (meta.savedAt ? ' · ' + wordsOfTime(meta.savedAt) : '');
}
function showSlotHint(text) {
  document.getElementById('slotHint').textContent = text;
}
function showTheSlots() {
  return fetch('saves/slots').then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  }).then(function (reply) {
    const list = document.getElementById('saveSlots');
    list.innerHTML = '';
    reply.slots.forEach(function (slot) {
      const row = document.createElement('div');
      row.className = 'slotRow';
      const picture = document.createElement('img');
      picture.className = 'slotPicture';
      picture.alt = '';
      if (slot.hasThumbnail) {
        picture.src = 'saves/slot_' + slot.slot + '.jpg?t=' + Date.now();
      }
      const words = document.createElement('div');
      words.className = 'slotWords';
      words.textContent = 'Slot ' + slot.slot + (slot.meta ? ': ' + slot.meta.label : ': empty');
      if (slot.meta && slot.meta.savedAt) {
        const when = document.createElement('small');
        when.textContent = 'saved ' + wordsOfTime(slot.meta.savedAt);
        words.appendChild(when);
      }
      const buttons = document.createElement('div');
      buttons.className = 'slotButtons';
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.title = 'Save the town as it stands, with its parameters and a picture, in this slot' + (slot.meta ? ' (over what is there)' : '');
      saveButton.addEventListener('click', function () { saveToSlot(slot.slot); });
      const loadButton = document.createElement('button');
      loadButton.textContent = 'Load';
      loadButton.disabled = !slot.meta;
      loadButton.title = 'Bring this town back, its parameters into the panel';
      loadButton.addEventListener('click', function () { loadFromSlot(slot.slot); });
      buttons.appendChild(saveButton);
      buttons.appendChild(loadButton);
      if (slot.meta) {
        const emptyButton = document.createElement('button');
        emptyButton.textContent = 'Empty';
        emptyButton.title = 'Free this slot';
        emptyButton.addEventListener('click', function () { emptyTheSlot(slot.slot); });
        buttons.appendChild(emptyButton);
      }
      words.appendChild(buttons);
      row.appendChild(picture);
      row.appendChild(words);
      list.appendChild(row);
    });
    showSlotHint(reply.slotCount + ' slots on the server, in saves/.');
  }).catch(function (error) {
    showSlotHint('The slots need the development server (npm run dev): ' + error.message);
  });
}
function saveToSlot(slotNumber) {
  if (settlement === null) {
    showSlotHint('There is no settlement to save yet: Settle first.');
    return;
  }
  const run = window.rome.saveRun();
  const label = (run.ground === 'square' ? 'square ' + squarePointCount : 'irregular ' + irregularRingCount) +
    ' · seed ' + settlement.seed + ' · day ' + settlement.dayCount + ' · ' + settlement.households.length + ' households';
  run.name = 'slot_' + slotNumber;
  run.label = label;
  showSlotHint('Saving to slot ' + slotNumber + ' ...');
  fetch('saves/slot/' + slotNumber, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run: run, settings: settingsOfThePanel(), thumbnail: thumbnailOfTheView(), label: label }),
  }).then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return showTheSlots();
  }).then(function () {
    showSlotHint('Saved in slot ' + slotNumber + ': ' + label + '.');
  }).catch(function (error) {
    showSlotHint('Not saved: ' + error.message);
  });
}
function loadFromSlot(slotNumber) {
  showSlotHint('Loading slot ' + slotNumber + ' ...');
  fetch('saves/slot/' + slotNumber).then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  }).then(function (slot) {
    showSavedRun(slot.run);
    if (slot.settings) {
      applySettingsToThePanel(slot.settings, 'loaded from slot ' + slotNumber);
    }
    showSlotHint('Loaded slot ' + slotNumber + ' at day ' + settlement.dayCount + '. Settle lets it live on.');
  }).catch(function (error) {
    showSlotHint('Not loaded: ' + error.message);
  });
}
function emptyTheSlot(slotNumber) {
  fetch('saves/slot/' + slotNumber, { method: 'DELETE' }).then(function () {
    return showTheSlots();
  }).then(function () {
    showSlotHint('Slot ' + slotNumber + ' emptied.');
  });
}
showTheSlots();

// Called every frame: lets the days pass, and rebuilds the town now and then when it has changed
function letTheSettlementLive(now) {
  if (!isSettling || settlement === null) {
    return;
  }
  if (now - lastSettlementStepTime >= millisecondsPerDay) {
    lastSettlementStepTime = now;
    settlementNeedsRebuilding = settlement.step() || settlementNeedsRebuilding;
  }
  if (now - lastSettlementRebuildTime >= millisecondsBetweenRebuilds) {
    lastSettlementRebuildTime = now;
    if (settlementNeedsRebuilding) {
      settlementNeedsRebuilding = false;
      rebuildSettledTown();
    }
    showDataLayer();
    document.getElementById('settlementStatus').textContent = settlement.summary();
  }
}

document.getElementById('settleButton').addEventListener('click', function () {
  if (isSettling) {
    stopSettling();
  } else if (settlement !== null) {
    isSettling = true;
    this.classList.add('active');
  } else {
    startNewSettlement();
  }
});

// The town a map starts with
function fillTown() {
  if (map.kind === 'square') {
    fillForum();
  } else {
    fillRandomTown(townSeed);
  }
}

// On the square map: fills a box of points with a tier, from (column, level, row), so many along x, y and z
function fillBox(tier, column, level, row, columnCount, boxLevelCount, rowCount) {
  for (let levelOffset = 0; levelOffset < boxLevelCount; levelOffset++) {
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
      for (let columnOffset = 0; columnOffset < columnCount; columnOffset++) {
        if (column + columnOffset < map.pointColumnCount && row + rowOffset < map.pointRowCount) {
          volume.setTier((row + rowOffset) * map.pointColumnCount + column + columnOffset, level + levelOffset, tier);
        }
      }
    }
  }
}

// A forum: classical volumes of many sizes, the hard specials among them, with houses and stalls round it (square map)
function fillForum() {
  volume.clear();
  const classical = TIER.classical;
  fillBox(classical, 1, 0, 1, 2, 3, 4);
  fillBox(classical, 5, 0, 1, 3, 3, 3);
  fillBox(classical, 10, 0, 1, 1, 4, 1);
  fillBox(classical, 12, 0, 1, 3, 1, 5);
  fillBox(classical, 1, 0, 7, 1, 1, 4);
  fillBox(classical, 4, 0, 6, 1, 1, 1);   // a tholos, standing free
  fillBox(classical, 9, 0, 5, 1, 1, 1);
  fillBox(classical, 6, 0, 6, 1, 2, 2);
  fillBox(classical, 12, 0, 8, 2, 2, 2);
  fillBox(classical, 9, 0, 8, 2, 1, 2);
  fillBox(classical, 15, 0, 7, 1, 2, 5);
  fillBox(classical, 4, 0, 8, 1, 2, 1);
  fillBox(classical, 16, 0, 14, 5, 2, 5); // the Pantheon: the base,
  fillBox(classical, 17, 2, 15, 3, 2, 3); // and the dome on the middle of it
  fillBox(classical, 17, 0, 1, 3, 2, 5);
  fillBox(classical, 1, 0, 16, 5, 1, 6);  // a great basilica: the base with the aisles,
  fillBox(classical, 2, 1, 16, 3, 1, 6);  // and the nave on it
  fillBox(classical, 18, 0, 8, 2, 3, 2);
  // the low temples, so that every part of the panel has a place in the town
  fillBox(classical, 8, 0, 17, 2, 1, 3);
  fillBox(classical, 12, 0, 17, 1, 1, 2);
  // a court: a ring of points round an open middle
  fillBox(classical, 1, 0, 12, 3, 1, 3);
  fillBox(TIER.empty, 2, 0, 13, 1, 1, 1);
  // houses that have grown together, of several heights
  const vernacular = TIER.vernacular;
  fillBox(vernacular, 5, 0, 11, 3, 2, 2);
  fillBox(vernacular, 5, 2, 11, 2, 1, 2);
  fillBox(vernacular, 5, 0, 13, 1, 3, 2);
  fillBox(vernacular, 8, 0, 12, 1, 1, 3);
  fillBox(vernacular, 10, 0, 11, 2, 3, 2);
  fillBox(vernacular, 10, 0, 13, 3, 1, 2);
  // stalls on the market, and shabby houses: a shop below, a closed room above
  const temporary = TIER.temporary;
  fillBox(temporary, 3, 0, 10, 1, 1, 1);
  fillBox(temporary, 7, 0, 9, 2, 1, 1);
  fillBox(temporary, 7, 1, 9, 1, 1, 1);
  fillBox(temporary, 13, 0, 11, 1, 2, 1);
  fillBox(temporary, 14, 0, 14, 2, 1, 1);
}

// A town of chance, on either map: a few monuments, clusters of houses, stalls in between
function fillRandomTown(seed) {
  volume.clear();
  const random = new SeededRandom(seed);
  const innerPoints = [];
  map.points.forEach(function (point, pointIndex) {
    if (!point.isOnBoundary) {
      innerPoints.push(pointIndex);
    }
  });
  function hasBuildingNear(pointIndex) {
    const nearPoints = [pointIndex].concat(Array.from(map.quadNeighboursOfPoint[pointIndex]));
    return nearPoints.some(function (nearPoint) {
      return volume.tierAt(nearPoint, 0) === TIER.classical || volume.tierAt(nearPoint, 0) === TIER.vernacular;
    });
  }
  // monuments on single points: stacks of one to four levels
  for (let monument = 0; monument < 7; monument++) {
    const pointIndex = innerPoints[random.nextInt(innerPoints.length)];
    if (!hasBuildingNear(pointIndex)) {
      const height = 1 + random.nextInt(4);
      for (let level = 0; level < height; level++) {
        volume.setTier(pointIndex, level, TIER.classical);
      }
    }
  }
  // houses: walks from point to point over the sides of the quads, of one to three levels
  for (let cluster = 0; cluster < 6; cluster++) {
    let pointIndex = innerPoints[random.nextInt(innerPoints.length)];
    for (let step = 0; step < 9; step++) {
      const nearClassical = [pointIndex].concat(Array.from(map.quadNeighboursOfPoint[pointIndex])).some(function (nearPoint) {
        return volume.tierAt(nearPoint, 0) === TIER.classical;
      });
      if (!nearClassical && !map.points[pointIndex].isOnBoundary) {
        const height = 1 + random.nextInt(3);
        for (let level = 0; level < height; level++) {
          volume.setTier(pointIndex, level, TIER.vernacular);
        }
      }
      const neighbours = Array.from(map.sideNeighboursOfPoint[pointIndex]);
      pointIndex = neighbours[random.nextInt(neighbours.length)];
    }
  }
  for (let stall = 0; stall < 14; stall++) {
    const pointIndex = innerPoints[random.nextInt(innerPoints.length)];
    if (volume.tierAt(pointIndex, 0) === TIER.empty) {
      volume.setTier(pointIndex, 0, TIER.temporary);
      if (random.nextFloat() < 0.4) {
        volume.setTier(pointIndex, 1, TIER.temporary);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The people on their ways. The settlement reckons its journeys day by day, far faster than
// anyone walks; the ways of the latest journeys are kept, and people are shown walking them
// afterwards at a walking pace, one after another as there is room for them. So what is seen
// walking lags well behind the reckoning: it is the town's traffic shown, not driven.
// ---------------------------------------------------------------------------
const mostPeopleWalking = 180;
const secondsBetweenPeopleSettingOut = 0.12;
const walkingSpeed = 2.4; // metres a second: a brisk walk, so that a journey can be followed
// A person is two shapes: the dress (white for a man, a colour for a woman), and the head with
// its skin and its black hair. A man is 1.70 m tall, a woman 1.58 m: the shapes are made for a
// man and made smaller for a woman.
const dressGeometry = new THREE.CylinderGeometry(0.15, 0.21, 1.42, 8);
dressGeometry.translate(0, 0.71, 0);
const headGeometry = (function () {
  const face = new THREE.CylinderGeometry(0.105, 0.105, 0.2, 8);
  face.translate(0, 1.53, 0);
  const hair = new THREE.CylinderGeometry(0.118, 0.118, 0.07, 8);
  hair.translate(0, 1.665, 0);
  [[face, new THREE.Color(0xc99b7a)], [hair, new THREE.Color(0x1c1815)]].forEach(function (part) {
    const colours = new Float32Array(part[0].getAttribute('position').count * 3);
    for (let pointNumber = 0; pointNumber < colours.length / 3; pointNumber++) {
      colours.set([part[1].r, part[1].g, part[1].b], pointNumber * 3);
    }
    part[0].setAttribute('color', new THREE.BufferAttribute(colours, 3));
  });
  return mergeGeometries([face, hair], false);
}());
const colourOfAMansDress = 0xece7da;
const COLOURS_OF_WOMENS_DRESS = [0xc9a24c, 0xa8604f, 0x8fa58c, 0x8f9fb0, 0xa98496, 0xd9c7a0];
const heightOfAManWalking = 1.70;
const heightOfAWomanWalking = 1.58;
const peopleMesh = new THREE.InstancedMesh(dressGeometry, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), mostPeopleWalking);
const headsMesh = new THREE.InstancedMesh(headGeometry, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }), mostPeopleWalking);
[peopleMesh, headsMesh].forEach(function (mesh) {
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
});
let peopleWalking = []; // { places: [{x, z}, ...], distanceWalked, lengthOfTheWay, speed, sideways, colour }
let secondsSinceSomeoneSetOut = 0;
const personMatrix = new THREE.Matrix4();
const personColour = new THREE.Color();

function letThePeopleWalk(secondsPassed) {
  if (settlement === null) {
    peopleWalking = [];
    peopleMesh.count = 0;
    headsMesh.count = 0;
    return;
  }
  // someone sets out on the oldest way that is kept
  secondsSinceSomeoneSetOut += secondsPassed;
  while (secondsSinceSomeoneSetOut >= secondsBetweenPeopleSettingOut && peopleWalking.length < mostPeopleWalking && settlement.journeysToShow.length > 0) {
    secondsSinceSomeoneSetOut -= secondsBetweenPeopleSettingOut;
    const way = settlement.journeysToShow.shift();
    if (way.length < 2) {
      continue;
    }
    let lengthOfTheWay = 0;
    const places = way.map(function (pointIndex) { return map.points[pointIndex]; });
    for (let step = 1; step < places.length; step++) {
      lengthOfTheWay += Math.hypot(places[step].x - places[step - 1].x, places[step].z - places[step - 1].z);
    }
    const mixed = Math.sin(way[0] * 12.9898 + way.length * 78.233 + peopleWalking.length * 3.7) * 43758.5453;
    const share = mixed - Math.floor(mixed);
    peopleWalking.push({
      places: places, distanceWalked: 0, lengthOfTheWay: lengthOfTheWay, speed: walkingSpeed * (0.8 + 0.4 * share),
      sideways: (share - 0.5) * 1.6,
      // a man or a woman, each a little taller or shorter than most
      colour: share < 0.5 ? COLOURS_OF_WOMENS_DRESS[Math.floor(share * 2 * COLOURS_OF_WOMENS_DRESS.length)] : colourOfAMansDress,
      tallness: ((share < 0.5 ? heightOfAWomanWalking : heightOfAManWalking) + (((share * 97) % 1) - 0.5) * 0.14) / heightOfAManWalking,
    });
  }
  secondsSinceSomeoneSetOut = Math.min(secondsSinceSomeoneSetOut, secondsBetweenPeopleSettingOut);
  peopleWalking = peopleWalking.filter(function (person) {
    person.distanceWalked += person.speed * secondsPassed;
    return person.distanceWalked < person.lengthOfTheWay;
  });
  peopleWalking.forEach(function (person, personNumber) {
    let distanceLeft = person.distanceWalked;
    let step = 1;
    let stepLength = Math.hypot(person.places[1].x - person.places[0].x, person.places[1].z - person.places[0].z);
    while (distanceLeft > stepLength && step < person.places.length - 1) {
      distanceLeft -= stepLength;
      step++;
      stepLength = Math.hypot(person.places[step].x - person.places[step - 1].x, person.places[step].z - person.places[step - 1].z);
    }
    const from = person.places[step - 1];
    const to = person.places[step];
    const share = stepLength > 0 ? Math.min(1, distanceLeft / stepLength) : 0;
    const alongX = stepLength > 0 ? (to.x - from.x) / stepLength : 1;
    const alongZ = stepLength > 0 ? (to.z - from.z) / stepLength : 0;
    // each keeps a little to one side of the middle of the street
    personMatrix.makeScale(person.tallness, person.tallness, person.tallness);
    personMatrix.setPosition(from.x + (to.x - from.x) * share - alongZ * person.sideways, 0.06, from.z + (to.z - from.z) * share + alongX * person.sideways);
    peopleMesh.setMatrixAt(personNumber, personMatrix);
    headsMesh.setMatrixAt(personNumber, personMatrix);
    peopleMesh.setColorAt(personNumber, personColour.setHex(person.colour));
  });
  peopleMesh.count = peopleWalking.length;
  headsMesh.count = peopleWalking.length;
  peopleMesh.instanceMatrix.needsUpdate = true;
  headsMesh.instanceMatrix.needsUpdate = true;
  if (peopleMesh.instanceColor) {
    peopleMesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Walking in the city: the camera at the height of the eyes, moved with the keys, turned by
// dragging. One walks on the streets and the open ground, not through buildings or walls
// (through a gate and under the aqueduct one does).
// ---------------------------------------------------------------------------
let isWalking = false;
let walkingYaw = 0;       // the way one looks, turned about the vertical
let walkingPitch = 0;     // and up or down
const eyeHeight = 1.65;
const keysHeldDown = new Set();
let cameraBeforeWalking = null;

function mayStandAt(x, z) {
  let nearest = 0;
  let leastDistance = Infinity;
  for (let pointIndex = 0; pointIndex < map.points.length; pointIndex++) {
    const distance = Math.hypot(map.points[pointIndex].x - x, map.points[pointIndex].z - z);
    if (distance < leastDistance) {
      leastDistance = distance;
      nearest = pointIndex;
    }
  }
  if (leastDistance > cellSize * 1.5) {
    return false; // off the ground
  }
  const works = volume.works[nearest];
  if ((works & 1) !== 0 || (works & 8) !== 0) {
    return false; // a wall, a fountain
  }
  return volume.tierAt(nearest, 0) === TIER.empty || (works & 16) !== 0; // open ground, or the passage of an arch
}

function startWalking() {
  if (isPlanView) {
    showPlanView(false);
  }
  cameraBeforeWalking = { position: camera.position.clone(), target: controls.target.clone(), fieldOfView: camera.fov, near: camera.near };
  // one starts on the open ground nearest to what the view was turned on
  let start = null;
  let leastDistance = Infinity;
  map.points.forEach(function (point) {
    const distance = Math.hypot(point.x - controls.target.x, point.z - controls.target.z);
    if (distance < leastDistance && mayStandAt(point.x, point.z)) {
      leastDistance = distance;
      start = point;
    }
  });
  if (start === null) {
    return;
  }
  isWalking = true;
  controls.enabled = false;
  hoverShape.visible = false;
  document.getElementById('householdTip').style.display = 'none';
  walkingYaw = Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z);
  walkingPitch = 0;
  camera.position.set(start.x, eyeHeight, start.z);
  camera.fov = 68;
  camera.near = 0.1;
  camera.updateProjectionMatrix();
  document.getElementById('walkButton').classList.add('active');
  document.getElementById('walkHint').style.display = 'block';
}

function stopWalking() {
  if (!isWalking) {
    return;
  }
  isWalking = false;
  controls.enabled = true;
  camera.position.copy(cameraBeforeWalking.position);
  controls.target.copy(cameraBeforeWalking.target);
  camera.fov = cameraBeforeWalking.fieldOfView;
  camera.near = cameraBeforeWalking.near;
  camera.updateProjectionMatrix();
  controls.update();
  document.getElementById('walkButton').classList.remove('active');
  document.getElementById('walkHint').style.display = 'none';
}

function lookRoundWhileWalking(event) {
  if (event.buttons === 0) {
    return;
  }
  walkingYaw -= event.movementX * 0.004;
  walkingPitch = Math.max(-1.2, Math.min(1.2, walkingPitch - event.movementY * 0.004));
}

function walkAStep(secondsPassed) {
  const forwards = (keysHeldDown.has('w') || keysHeldDown.has('arrowup') ? 1 : 0) - (keysHeldDown.has('s') || keysHeldDown.has('arrowdown') ? 1 : 0);
  const sideways = (keysHeldDown.has('d') || keysHeldDown.has('arrowright') ? 1 : 0) - (keysHeldDown.has('a') || keysHeldDown.has('arrowleft') ? 1 : 0);
  const speed = (keysHeldDown.has('shift') ? 9 : 3.2) * secondsPassed;
  const lookX = Math.sin(walkingYaw);
  const lookZ = Math.cos(walkingYaw);
  const stepX = (lookX * forwards - lookZ * sideways) * speed;
  const stepZ = (lookZ * forwards + lookX * sideways) * speed;
  // the whole step, or as much of it as is free: along one direction only, sliding along a wall
  if (mayStandAt(camera.position.x + stepX, camera.position.z + stepZ)) {
    camera.position.x += stepX;
    camera.position.z += stepZ;
  } else if (mayStandAt(camera.position.x + stepX, camera.position.z)) {
    camera.position.x += stepX;
  } else if (mayStandAt(camera.position.x, camera.position.z + stepZ)) {
    camera.position.z += stepZ;
  }
  camera.position.y = eyeHeight;
  camera.lookAt(camera.position.x + lookX * Math.cos(walkingPitch), eyeHeight + Math.sin(walkingPitch), camera.position.z + lookZ * Math.cos(walkingPitch));
}

window.addEventListener('keydown', function (event) {
  keysHeldDown.add(event.key.toLowerCase());
  if (event.key === 'Escape') {
    if (isWalking) {
      stopWalking();
      return;
    }
    // (the author, 2026-10-14: Escape closes whatever panel is open, or opens the menu)
    const openPanel = ['menuPanel', 'settingsPanel', 'statisticsPanel', 'catalogue'].find(function (name) {
      return !document.getElementById(name).classList.contains('hidden');
    });
    showPanel(openPanel || 'menuPanel', !openPanel);
  }
});
window.addEventListener('keyup', function (event) {
  keysHeldDown.delete(event.key.toLowerCase());
});
document.getElementById('walkButton').addEventListener('click', function () {
  if (isWalking) {
    stopWalking();
  } else {
    startWalking();
  }
  this.blur(); // so that the keys go to the walk, not to the button
});

let timeOfTheLastFrame = 0;
let isFilming = false;
function animate(now) {
  requestAnimationFrame(animate);
  const secondsPassed = Math.min(0.1, ((now || 0) - timeOfTheLastFrame) / 1000);
  timeOfTheLastFrame = now || 0;
  letTheSettlementLive(now || 0);
  if (!isFilming) { // (a film moves the people itself, a frame at a time)
    letThePeopleWalk(secondsPassed);
  }
  if (isWalking) {
    walkAStep(secondsPassed);
  } else if (isPlanView) {
    planControls.update();
  } else {
    controls.update();
  }
  renderer.render(scene, cameraInUse());
}
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (isPlanView) {
    fitThePlanCamera();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
});
startMap('square');
// A kind of piece lit up in the town, wherever it was placed: for looking at where a piece of the
// parts panel is used. kindKey null lights nothing.
const townHighlightGroup = new THREE.Group();
scene.add(townHighlightGroup);
const townHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a1c, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide });
const townHighlightLineMaterial = new THREE.LineBasicMaterial({ color: 0xff2a00, depthTest: false });
function showKindInTown(kindKey) {
  townHighlightGroup.children.slice().forEach(function (mesh) {
    townHighlightGroup.remove(mesh);
    mesh.geometry.dispose();
  });
  if (kindKey === null || townCollector === null) {
    return;
  }
  townCollector.piecePlacements.forEach(function (placement) {
    if (placement.piece.kindKey === kindKey) {
      const geometry = placedPieceGeometry(placement);
      const mesh = new THREE.Mesh(geometry, townHighlightMaterial);
      mesh.renderOrder = 10;
      townHighlightGroup.add(mesh);
      // a small or hidden piece would not be found by its colour alone: the quad it lies in is
      // drawn round it, with a mast over it that shows above the roofs
      const quadCorners = placement.corners
        ? placement.corners.map(function (corner) { return new THREE.Vector3(corner.x, placement.floorY, corner.z); })
        : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (corner) {
          return new THREE.Vector3(corner[0] * cellSize / 2, 0, corner[1] * cellSize / 2).applyMatrix4(placement.matrix);
        });
      const framePoints = [];
      const middle = new THREE.Vector3();
      quadCorners.forEach(function (corner, index) {
        const next = quadCorners[(index + 1) % 4];
        const cornerOnTop = corner.clone().setY(corner.y + classicalLevelHeight);
        const nextOnTop = next.clone().setY(next.y + classicalLevelHeight);
        framePoints.push(corner, next, cornerOnTop, nextOnTop, corner, cornerOnTop);
        middle.add(cornerOnTop);
      });
      middle.multiplyScalar(0.25);
      const frame = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(framePoints), townHighlightLineMaterial);
      frame.renderOrder = 11;
      townHighlightGroup.add(frame);
      const mast = new THREE.Line(new THREE.BufferGeometry().setFromPoints([middle, new THREE.Vector3(middle.x, middle.y + 30, middle.z)]), townHighlightLineMaterial);
      mast.renderOrder = 11;
      townHighlightGroup.add(mast);
    }
  });
}
// (its pictures are taken once, so they wait for the tiles of the materials)
materialsAreLoaded.then(function () {
  buildCatalogue(document.getElementById('catalogue'), materials, showKindInTown);
});
// the parts panel is wide, the main thing to work on; the button makes room for the town
document.getElementById('catalogueWidthButton').addEventListener('click', function (event) {
  const isNarrow = document.getElementById('catalogue').classList.toggle('narrow');
  event.currentTarget.textContent = isNarrow ? 'Wide' : 'Narrow';
});
// The panels at the right open from the round buttons and close with their cross; one panel at a
// time, so that the town stays in view (after the Spring Show interface)
function showPanel(panelName, isShown) {
  const panels = { catalogue: 'partsButton', settingsPanel: 'parametersButton', menuPanel: 'menuButton', statisticsPanel: 'statisticsButton' };
  Object.keys(panels).forEach(function (name) {
    const isThisOne = name === panelName && isShown;
    document.getElementById(name).classList.toggle('hidden', !isThisOne);
    document.getElementById(panels[name]).classList.toggle('armed', isThisOne);
  });
}
document.getElementById('partsButton').addEventListener('click', function () {
  showPanel('catalogue', document.getElementById('catalogue').classList.contains('hidden'));
});
document.getElementById('parametersButton').addEventListener('click', function () {
  showPanel('settingsPanel', document.getElementById('settingsPanel').classList.contains('hidden'));
});
document.getElementById('menuButton').addEventListener('click', function () {
  showPanel('menuPanel', document.getElementById('menuPanel').classList.contains('hidden'));
});
document.getElementById('statisticsButton').addEventListener('click', function () {
  showPanel('statisticsPanel', document.getElementById('statisticsPanel').classList.contains('hidden'));
});
document.getElementById('menuCloseButton').addEventListener('click', function () { showPanel('menuPanel', false); });
document.getElementById('statisticsCloseButton').addEventListener('click', function () { showPanel('statisticsPanel', false); });
document.getElementById('catalogueCloseButton').addEventListener('click', function () { showPanel('catalogue', false); });
document.getElementById('settingsCloseButton').addEventListener('click', function () { showPanel('settingsPanel', false); });
document.querySelectorAll('.openParametersButton').forEach(function (button) {
  button.addEventListener('click', function () { showPanel('settingsPanel', true); });
});
animate();

// For screenshots and tests: the page driven from outside
window.rome = {
  // For a film of a settlement (tools/record_settlement.js). filmStart: a new settlement on a
  // ground ('square' or 'largeIrregular'), the interface hidden, a caption in the corner, the sun
  // lower for longer shadows. filmFrame: the settlement lives so many days, the town is rebuilt
  // if it changed, and the camera moves on along its circle; returns how the town stands.
  // ---- For the introduction film (film/capture_growth.js): a settlement that is filmed frame by
  // frame, the interface hidden.
  // filmPrepare: a new settlement on a ground of a size, from a seed, with parameters; returns
  // the bounds of the ground. filmAdvance: so many days lived, the town rebuilt if it changed;
  // returns its numbers and what the city did meanwhile. filmPeople: the people walk on by so
  // many seconds (or are hidden). filmLoad: a saved run shown instead.
  filmPrepare: function (ground, seed, pointsAlongASide, ringCount, parameters) {
    isFilming = true;
    squarePointCount = pointsAlongASide;
    irregularRingCount = ringCount;
    startMap(ground);
    volume.clear();
    settlement = new Settlement(map, volume, seed, parameters || {});
    rebuildSettledTown();
    dataLayerName = 'none';
    showDataLayer();
    return rome.filmScreen();
  },
  filmLoad: function (run) {
    isFilming = true;
    showSavedRun(run);
    dataLayerName = 'none';
    showDataLayer();
    return rome.filmScreen();
  },
  // the interface hidden, the shadows reaching over the whole ground; returns the bounds
  filmScreen: function () {
    ['toolbar', 'catalogue', 'statusStrip', 'householdTip', 'walkHint', 'rightCol', 'settingsPanel', 'menuPanel', 'statisticsPanel'].forEach(function (elementName) {
      const element = document.getElementById(elementName);
      if (element) {
        element.style.display = 'none';
        element.style.visibility = 'hidden';
      }
    });
    hoverShape.visible = false;
    dataPointMark.visible = false;
    const reach = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ) / 2;
    const centreX = (map.bounds.minX + map.bounds.maxX) / 2;
    const centreZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    sunLight.position.set(centreX - reach * 1.1, reach * 1.3 + 60, centreZ + reach * 0.8);
    sunLight.target.position.set(centreX, 0, centreZ);
    sunLight.target.updateMatrixWorld();
    Object.assign(sunLight.shadow.camera, { left: -reach * 1.6, right: reach * 1.6, top: reach * 1.6, bottom: -reach * 1.6, near: 1, far: reach * 6 + 200 });
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.mapSize.set(8192, 8192);
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
    return { centreX: centreX, centreZ: centreZ, reach: reach, pointCount: map.points.length };
  },
  filmAdvance: function (dayCount) {
    const chronicleLengthBefore = settlement.city.chronicle.length;
    let volumeChanged = false;
    for (let day = 0; day < dayCount; day++) {
      volumeChanged = settlement.step() || volumeChanged;
    }
    if (volumeChanged) {
      rebuildSettledTown();
    }
    showDataLayer();
    dataPointMark.visible = false;
    return {
      day: settlement.dayCount, statistics: settlement.statistics(), treasury: Math.round(settlement.city.money),
      events: settlement.city.chronicle.slice(chronicleLengthBefore),
    };
  },
  filmFaintOpacity: function (opacity) { faintOpacityOfTheTown = opacity; faintCopyOfMaterial.clear(); return true; },
  filmLayer: function (layerName) {
    dataLayerName = layerName;
    showDataLayer();
    dataPointMark.visible = false;
    return true;
  },
  filmPeople: function (seconds, isShown) {
    peopleMesh.visible = isShown;
    headsMesh.visible = isShown;
    if (isShown) {
      letThePeopleWalk(seconds);
    }
    return peopleWalking.length;
  },
  // A way for the camera to walk: of the journeys people made lately, the longest that passes a
  // gate (or the longest of all); as its places, and the place of the gate along it (-1: none)
  filmWalkPath: function () {
    let best = null;
    let bestScore = -1;
    settlement.journeysToShow.forEach(function (way) {
      const gateAt = way.findIndex(function (pointIndex) { return (volume.works[pointIndex] & 2) !== 0; });
      // a way through a gate, with ground enough on both sides of it
      const score = way.length + (gateAt >= 6 && gateAt <= way.length - 5 ? 1000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { way: way, gateAt: gateAt };
      }
    });
    if (best === null) {
      return null;
    }
    return {
      places: best.way.map(function (pointIndex) { return { x: map.points[pointIndex].x, z: map.points[pointIndex].z }; }),
      gateAt: best.gateAt,
    };
  },
  // the places of the city for the camera: its public buildings, its gates (each with the way
  // across the wall), its fountains
  filmPlaces: function () {
    const places = rome.cityPlaces();
    places.forEach(function (place) {
      if (place.kind !== 'gate') {
        return;
      }
      let gatePoint = 0;
      let leastDistance = Infinity;
      map.points.forEach(function (point, pointIndex) {
        const distance = Math.hypot(point.x - place.x, point.z - place.z);
        if (distance < leastDistance && (volume.works[pointIndex] & 2)) {
          leastDistance = distance;
          gatePoint = pointIndex;
        }
      });
      const wallNeighbours = Array.from(map.sideNeighboursOfPoint[gatePoint]).filter(function (neighbourPoint) { return (volume.works[neighbourPoint] & 3) !== 0; });
      if (wallNeighbours.length === 2) {
        const first = map.points[wallNeighbours[0]];
        const second = map.points[wallNeighbours[1]];
        const alongX = second.x - first.x;
        const alongZ = second.z - first.z;
        const length = Math.hypot(alongX, alongZ) || 1;
        // across the wall: the way through the gate, turned towards the middle of the ground (inwards)
        place.acrossX = -alongZ / length;
        place.acrossZ = alongX / length;
        const towardsTheMiddleX = (map.bounds.minX + map.bounds.maxX) / 2 - map.points[gatePoint].x;
        const towardsTheMiddleZ = (map.bounds.minZ + map.bounds.maxZ) / 2 - map.points[gatePoint].z;
        if (place.acrossX * towardsTheMiddleX + place.acrossZ * towardsTheMiddleZ < 0) {
          place.acrossX = -place.acrossX;
          place.acrossZ = -place.acrossZ;
        }
      }
      place.x = map.points[gatePoint].x;
      place.z = map.points[gatePoint].z;
    });
    return places;
  },
  filmStart: function (kind, seed) {
    startMap(kind);
    volume.clear();
    settlement = new Settlement(map, volume, seed);
    rebuildTown();
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('statusStrip').style.display = 'none';
    document.getElementById('catalogue').style.display = 'none';
    document.getElementById('rightCol').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('menuPanel').style.display = 'none';
    document.getElementById('statisticsPanel').style.display = 'none';
    hoverShape.visible = false;
    const caption = document.createElement('div');
    caption.id = 'filmCaption';
    caption.style.cssText = 'position: fixed; left: 48px; bottom: 40px; font: 500 26px "Segoe UI", sans-serif; color: #2b2622; background: rgba(250, 248, 243, 0.82); padding: 10px 18px; border-radius: 8px;';
    document.body.appendChild(caption);
    const centreX = (map.bounds.minX + map.bounds.maxX) / 2;
    const centreZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    sunLight.position.set(centreX - 110, 85, centreZ + 60);
    sunLight.shadow.mapSize.set(4096, 4096);
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
    return map.points.length;
  },
  filmFrame: function (dayCount, frameNumber, frameCount) {
    let volumeChanged = false;
    for (let day = 0; day < dayCount; day++) {
      volumeChanged = settlement.step() || volumeChanged;
    }
    if (volumeChanged) {
      rebuildSettledTown();
    }
    showDataLayer();
    const centreX = (map.bounds.minX + map.bounds.maxX) / 2;
    const centreZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    const reach = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ) / 2;
    // once round the town in the whole film, coming closer and lower as the town grows
    const progress = frameNumber / Math.max(1, frameCount - 1);
    const angle = 0.6 + progress * Math.PI * 2;
    const distance = reach * (3.5 - 1.0 * progress);
    const height = reach * (2.1 - 0.9 * progress);
    camera.position.set(centreX + distance * Math.sin(angle), height, centreZ + distance * Math.cos(angle));
    controls.target.set(centreX, 3, centreZ);
    controls.update();
    const summary = settlement.summary();
    document.getElementById('filmCaption').textContent = summary.split(' · ').slice(0, 2).join(' · ');
    return summary;
  },
  // the settlement lived on for so many days, without rebuilding the town; returns how it stands
  settleOn: function (dayCount) {
    for (let day = 0; day < dayCount; day++) {
      settlement.step();
    }
    return settlement.summary();
  },
  rebuild: function () { rebuildSettledTown(); showDataLayer(); return true; },
  // the measures of the town's form and wealth (Gini and the like), for the tools
  studyNumbers: function () { return settlement.studyNumbers(); },
  // the settlement as it stands, as a run the app can load again (tools/test_runs.js saves it)
  saveRun: function () {
    const monumentNames = rebuildSettledTown();
    const countOfMonument = {};
    monumentNames.forEach(function (name) {
      countOfMonument[name] = (countOfMonument[name] || 0) + 1;
    });
    return {
      statistics: settlement.statistics(), monuments: countOfMonument, parameters: settlement.parameters, saved: settlement.save(),
      groundSize: { squarePointCount: squarePointCount, largeIrregularRingCount: irregularRingCount }, ground: currentMapKind, seed: settlement.seed,
    };
  },
  // for pictures: the houses with a classical ground floor, each with the free point before it
  // (where a camera may stand): [{ x, z, streetX, streetZ }]
  portalsOfTheTown: function () {
    const found = [];
    for (let pointIndex = 0; pointIndex < volume.pointCount && found.length < 40; pointIndex++) {
      if (volume.tierAt(pointIndex, 0) !== TIER.classical || volume.tierAt(pointIndex, 1) !== TIER.vernacular || volume.publicBuildingOfPoint[pointIndex] !== 0) {
        continue;
      }
      const street = Array.from(map.sideNeighboursOfPoint[pointIndex]).find(function (neighbourPoint) {
        return volume.tierAt(neighbourPoint, 0) === TIER.empty && (settlement === null || settlement.isRoad(neighbourPoint));
      });
      if (street !== undefined) {
        found.push({ x: map.points[pointIndex].x, z: map.points[pointIndex].z, streetX: map.points[street].x, streetZ: map.points[street].z });
      }
    }
    return found;
  },
  // how the line of the city wall is drawn: one of WALL_STYLES (works.js)
  setWallStyle: function (styleName) { chosenWallStyle = styleName; document.getElementById('wallStyleList').value = styleName; rebuildSettledTown(); showDataLayer(); return styleName; },
  // a data layer shown: 'traffic', 'streets', 'owners', 'stage', 'money', 'worth', 'pressure' or 'none'
  dataLayer: function (layerName) { dataLayerName = layerName; showDataLayer(); return true; },
  // a new settlement, lived for so many days at once; returns how it stands
  settle: function (dayCount, seed) {
    volume.clear();
    settlement = new Settlement(map, volume, seed || 1);
    for (let day = 0; day < dayCount; day++) {
      settlement.step();
    }
    rebuildSettledTown();
    showDataLayer();
    return settlement.summary();
  },
  // the parts of the panel (their codes) that lie nowhere in the town as it stands
  partsNotInTown: function () {
    const kindsInTown = new Set(townCollector.piecePlacements.map(function (placement) {
      return placement.piece.kindKey;
    }));
    return Array.from(document.querySelectorAll('#catalogue .catalogueEntry')).filter(function (row) {
      return row.dataset.kind && !kindsInTown.has(row.dataset.kind);
    }).map(function (row) {
      return row.querySelector('b').textContent;
    });
  },
  // the faces of one piece of a model, for finding out in what two pieces differ: the model by
  // its place in MODELS, the piece by its slices ('across:along:level'), turned by quarter turns
  // about the vertical; the area of its faces, gathered by material and by the plane they lie in
  facesOfPiece: function (modelNumber, placeName, quarterTurnCount) {
    const place = minceModel(MODELS[modelNumber]).places.get(placeName);
    const faces = [];
    const areaOfPlane = new Map();
    place.piece.trianglesOfMaterial.forEach(function (triangles, materialName) {
      for (let offset = 0; offset < triangles.length; offset += 9) {
        const corners = [0, 3, 6].map(function (cornerOffset) {
          let x = triangles[offset + cornerOffset];
          let z = triangles[offset + cornerOffset + 2];
          for (let turn = 0; turn < (quarterTurnCount || 0); turn++) {
            const turnedX = z;
            z = -x;
            x = turnedX;
          }
          return [x, triangles[offset + cornerOffset + 1], z];
        });
        const lowest = [0, 1, 2].map(function (axis) { return Math.min(corners[0][axis], corners[1][axis], corners[2][axis]); });
        const highest = [0, 1, 2].map(function (axis) { return Math.max(corners[0][axis], corners[1][axis], corners[2][axis]); });
        const edgeOne = [0, 1, 2].map(function (axis) { return corners[1][axis] - corners[0][axis]; });
        const edgeTwo = [0, 1, 2].map(function (axis) { return corners[2][axis] - corners[0][axis]; });
        const area = Math.hypot(edgeOne[1] * edgeTwo[2] - edgeOne[2] * edgeTwo[1], edgeOne[2] * edgeTwo[0] - edgeOne[0] * edgeTwo[2], edgeOne[0] * edgeTwo[1] - edgeOne[1] * edgeTwo[0]) / 2;
        // faces that lie flat are gathered by the plane they lie in; the others by their box
        const flatAxis = [0, 1, 2].find(function (axis) { return highest[axis] - lowest[axis] < 0.001; });
        const name = materialName + (flatAxis === undefined
          ? ' slanted ' + lowest.map(function (value) { return value.toFixed(1); }).join(',')
          : ' ' + 'xyz'[flatAxis] + '=' + lowest[flatAxis].toFixed(2));
        areaOfPlane.set(name, (areaOfPlane.get(name) || 0) + area);
      }
    });
    areaOfPlane.forEach(function (area, name) {
      faces.push(name + ' : ' + area.toFixed(2));
    });
    return faces.sort().join(' | ');
  },
  // what the kind of piece shown under a code of the parts panel ('P12') measures
  measuresOfPart: function (code) {
    const row = Array.from(document.querySelectorAll('#catalogue .catalogueEntry')).find(function (entry) {
      return entry.querySelector('b').textContent === code;
    });
    const measures = measuresOfKind(row.dataset.kind);
    return row.textContent + ' :: ' + measures.materialNames + ' :: ' + measures.numbers.map(function (number) { return number.toFixed(2); }).join(' ');
  },
  // the kinds of piece cut so far, for checks: [{ label, layer, models, pieceCount, kindKey }]
  pieceKinds: function () {
    return listPieceKinds().map(function (kind) {
      const piece = kind.pieces[0];
      return { label: describePiece(piece), layer: piece.layer, models: Array.from(piece.modelNames).join(','), pieceCount: kind.pieces.length, kindKey: kind.kindKey };
    });
  },
  // z fighting: faces of different parts in one plane that cover each other, in the town as it
  // stands ('town') or in every classical model on its own ('models'); the worst of each, as text
  findCoplanarOverlaps: function (where) {
    function describe(title, collector) {
      // two faces of one material in one plane look the same whichever is drawn: only fights between materials show
      const fights = findCoplanarOverlaps(collector).filter(function (fight) {
        return fight.firstMaterial !== fight.secondMaterial;
      });
      const totalArea = fights.reduce(function (sum, fight) { return sum + fight.area; }, 0);
      return title + ': ' + fights.length + ' fights, ' + totalArea.toFixed(2) + ' m2' + fights.slice(0, where === 'all' ? 400 : 6).map(function (fight) {
        return ' | ' + fight.area.toFixed(3) + ' m2 ' + fight.firstMaterial + ' on ' + fight.secondMaterial + ', facing ' + fight.normal.join(' ') + ', near ' + fight.at.join(' ');
      }).join('');
    }
    if (where === 'models') {
      return MODELS.map(function (model, index) {
        const collector = new PartCollector();
        model.build(collector);
        return describe('M' + (index + 1) + ' ' + model.name, collector);
      }).join(' || ');
    }
    return describe('town', townCollector); // 'all' lists every fight of the town
  },
  // how the classical points of the town are read: how many lie in a lattice (their buildings are
  // skewed with the quads) and how many are read alone (placed whole), and in how many lattices
  classicalReading: function () {
    const views = latticeViewsOf(volume);
    const starPoints = views.filter(function (view) { return view.isStar; });
    let quadCountsOfStars = {};
    starPoints.forEach(function (view) {
      const quadCount = map.quartersOfPoint[view.pointIndex].length;
      quadCountsOfStars[quadCount] = (quadCountsOfStars[quadCount] || 0) + 1;
    });
    let pointsInLattices = 0;
    views.forEach(function (view) {
      if (!view.isStar) {
        view.columnOfPoint.forEach(function (column, pointIndex) {
          if (view.isMember(pointIndex) && volume.filledPlaces().some(function (place) { return place.pointIndex === pointIndex && place.tier === TIER.classical; })) {
            pointsInLattices++;
          }
        });
      }
    });
    return { latticeCount: views.length - starPoints.length, pointsInLattices: pointsInLattices, pointsReadAlone: starPoints.length, quadCountsOfPointsReadAlone: quadCountsOfStars };
  },
  // where the city's buildings and its works stand, for looking at them: the middle of each
  // public building, and one point of each kind of work
  cityPlaces: function () {
    const places = volume.publicBuildings.map(function (building) {
      let point = building.free;
      if (!point) {
        const middleRow = building.grid[Math.floor(building.grid.length / 2)];
        point = map.points[middleRow[Math.floor(middleRow.length / 2)]];
      }
      return { kind: building.kind, x: Math.round(point.x), z: Math.round(point.z), frontX: building.free ? building.free.frontX : 0, frontZ: building.free ? building.free.frontZ : 1 };
    });
    [['gate', 2, 40], ['fountain', 8, 1], ['wall', 1, 100000]].forEach(function (work) {
      let found = 0;
      for (let pointIndex = 0; pointIndex < volume.pointCount && found < work[2]; pointIndex++) {
        if (volume.works[pointIndex] & work[1]) {
          places.push({ kind: work[0], x: Math.round(map.points[pointIndex].x), z: Math.round(map.points[pointIndex].z) });
          found++;
        }
      }
    });
    places.forEach(function (place) {
      const nearest = map.points.reduce(function (best, point, pointIndex) {
        return Math.hypot(point.x - place.x, point.z - place.z) < Math.hypot(map.points[best].x - place.x, map.points[best].z - place.z) ? pointIndex : best;
      }, 0);
      place.withinTheWalls = settlement !== null && settlement.isWithinWalls[nearest] === 1;
    });
    return places;
  },
  // the least and the greatest tint on the meshes of the town, for each of red, green and blue,
  // by the size of the mesh (its number of points): to check that tints reach the meshes
  tintRanges: function () {
    const ranges = [];
    townGroup.traverse(function (object) {
      const tints = object.isMesh ? object.geometry.getAttribute('color') : null;
      if (!tints) {
        return;
      }
      let least = Infinity;
      let greatest = -Infinity;
      for (let index = 0; index < tints.array.length; index++) {
        least = Math.min(least, tints.array[index]);
        greatest = Math.max(greatest, tints.array[index]);
      }
      if (greatest - least > 0.001) {
        ranges.push({ points: tints.count, least: Math.round(least * 100) / 100, greatest: Math.round(greatest * 100) / 100, usesTints: object.material.vertexColors });
      }
    });
    return ranges;
  },
  startMap: function (kind) { return startMap(kind); },
  // For the study of the economy (tools/economy_study.js): a settlement lived for so many days with
  // nothing drawn, its numbers taken every so many days. (The ground before the monuments is not
  // kept open, since that is found when the town is built.)
  studyEconomy: function (ground, seed, pointsAlongASide, ringCount, parameters, dayCount, daysBetweenSamples) {
    if (currentMapKind !== ground || squarePointCount !== pointsAlongASide || irregularRingCount !== ringCount) {
      squarePointCount = pointsAlongASide;
      irregularRingCount = ringCount;
      startMap(ground);
    }
    volume.clear();
    settlement = new Settlement(map, volume, seed, parameters || {});
    const samples = [];
    for (let day = 1; day <= dayCount; day++) {
      settlement.step();
      if (day % daysBetweenSamples === 0) {
        samples.push(Object.assign({ day: day }, settlement.statistics(), settlement.studyNumbers()));
      }
    }
    return { parameters: settlement.parameters, samples: samples, pointCount: map.points.length, points: settlement.pointsForMaps() };
  },
  // what the note beside the pointer says of a point while a data layer is on
  describeDataAt: function (pointIndex) { return settlement.describeDataAt(pointIndex); },
  // walking: begin or end a walk, and how many people are shown walking their journeys
  walk: function (isToWalk) { if (isToWalk) { startWalking(); } else { stopWalking(); } return isWalking; },
  peopleWalking: function () { return peopleWalking.length; },
  // the households by name: the richest, and whoever owns a point
  richestHouseholds: function (count) { return settlement.richestHouseholds(count); },
  describePoint: function (pointIndex) { return settlement.describePoint(pointIndex); },
  householdNames: function () { return settlement.households.map(function (household) { return household.name; }); },
  chronicle: function () { return settlement.city.chronicle.map(function (entry) { return entry.day + ': ' + entry.text; }); },
  // the sizes of the grounds: points along a side of the square one, rings of the large irregular one
  // (the ground that is shown is made anew at its new size)
  setGroundSize: function (pointsAlongASide, ringCount) { squarePointCount = pointsAlongASide; irregularRingCount = ringCount; startMap(currentMapKind); return map.points.length; },
  // One run of the settlement for a batch (tools/run_batch.js): on a ground, from a seed, with
  // parameters, lived for so many days with nothing drawn on the way; then the town is built
  // once and looked at from above its corner. Returns its numbers, its monuments and its state.
  runSimulation: function (ground, seed, dayCount, parameters, groundSize) {
    const sizeChanged = groundSize && (groundSize.squarePointCount !== squarePointCount || groundSize.largeIrregularRingCount !== irregularRingCount);
    if (sizeChanged) {
      squarePointCount = groundSize.squarePointCount;
      irregularRingCount = groundSize.largeIrregularRingCount;
    }
    if (currentMapKind !== ground || sizeChanged) {
      startMap(ground);
    }
    volume.clear();
    settlement = new Settlement(map, volume, seed, parameters);
    for (let day = 0; day < dayCount; day++) {
      settlement.step();
    }
    const monumentNames = rebuildSettledTown();
    showDataLayer();
    const centreX = (map.bounds.minX + map.bounds.maxX) / 2;
    const centreZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
    const reach = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ) / 2;
    camera.position.set(centreX + reach * 0.9, reach * 1.9, centreZ + reach * 1.9);
    controls.target.set(centreX, 0, centreZ);
    controls.update();
    const countOfMonument = {};
    monumentNames.forEach(function (name) {
      countOfMonument[name] = (countOfMonument[name] || 0) + 1;
    });
    return {
      statistics: settlement.statistics(), monuments: countOfMonument, parameters: settlement.parameters, saved: settlement.save(),
      groundSize: { squarePointCount: squarePointCount, largeIrregularRingCount: irregularRingCount },
    };
  },
  showSavedRun: function (run) { showSavedRun(run); return settlement.summary(); },
  fillForum: function () { fillForum(); return rebuildTown(); },
  fillRandomTown: function (seed) { townSeed = seed; fillRandomTown(seed); return rebuildTown(); },
  clear: function () { volume.clear(); return rebuildTown(); },
  fillBox: function (tierName, column, level, row, columnCount, boxLevelCount, rowCount) {
    fillBox(TIER[tierName], column, level, row, columnCount, boxLevelCount, rowCount);
    return rebuildTown();
  },
  // the points on the rim of the ground
  rimPoints: function () {
    return map.points.map(function (point, pointIndex) { return point.isOnBoundary ? pointIndex : -1; }).filter(function (pointIndex) { return pointIndex >= 0; });
  },
  // the corner points of every quad of the ground, for tests that build by the quads
  cellCorners: function () {
    return map.cells.map(function (cell) { return cell.corners.slice(); });
  },
  setPoint: function (tierName, pointIndex, level) {
    volume.setTier(pointIndex, level, TIER[tierName]);
    return rebuildTown();
  },
  // how many quads meet at each point, counted over the points that are not on the rim: { 3: n, 4: n, ... }
  quadsRoundPoints: function () {
    const counts = {};
    map.points.forEach(function (point, pointIndex) {
      if (!point.isOnBoundary) {
        const quadCount = map.quartersOfPoint[pointIndex].length;
        counts[quadCount] = (counts[quadCount] || 0) + 1;
      }
    });
    return counts;
  },
  showBareVolume: function (isShown) { showsBareVolume = isShown; return rebuildTown(); },
  view: function (x, y, z, targetX, targetY, targetZ, angleOfViewDegrees) {
    camera.position.set(x, y, z);
    controls.target.set(targetX, targetY, targetZ);
    if (angleOfViewDegrees) {
      camera.fov = angleOfViewDegrees;
      camera.updateProjectionMatrix();
    }
    controls.update();
    camera.updateMatrixWorld();
    return true;
  },
  // the masterplan on or off: the town straight from above, the whole ground in the window
  planView: function (isOn, zoom) {
    showPlanView(isOn !== false);
    if (isPlanView && zoom) {
      planCamera.zoom = zoom;
      planCamera.updateProjectionMatrix();
    }
    return isPlanView;
  },
  // the settlement itself, for the tools that study a town (null before a town settles)
  theSettlement: function () { return settlement; },
  // how many vertices the data layer holds (for checking the tools)
  dataLayerVertexCount: function () { return dataLayerMesh ? dataLayerMesh.geometry.attributes.position.count : 0; },
  dataLayerVertex: function (index) {
    const position = dataLayerMesh.geometry.attributes.position;
    const colour = dataLayerMesh.geometry.attributes.color;
    return { x: position.getX(index), y: position.getY(index), z: position.getZ(index), r: colour.getX(index), g: colour.getY(index), b: colour.getZ(index) };
  },
  // the buildings shown or hidden (a plan of the ground alone)
  showTown: function (isShown) { if (townGroup) { townGroup.visible = isShown !== false; } return true; },
  hideInterface: function () {
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('statusStrip').style.display = 'none';
    document.getElementById('catalogue').style.display = 'none';
    document.getElementById('rightCol').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('menuPanel').style.display = 'none';
    document.getElementById('statisticsPanel').style.display = 'none';
    hoverShape.visible = false;
    return true;
  },
};
