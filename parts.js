// Purpose: the parts buildings are made of (columns, walls with openings, pediments, roofs,
// domes), gathered by material so that a whole town becomes a handful of meshes.
//
// The materials are painted in one small picture (textures/atlas.png, made by
// tools/make_atlas.py and free to be painted over by hand): a grid of tiles, one for each
// material, told apart by textures/atlas.json. The tile of a material is repeated over its
// surfaces, laid out in metres: flat on what lies flat, and on walls and slopes along the surface
// and up it, so that courses of bricks and roof tiles run level. The window tile is laid once
// into every window. On top of the picture a part may carry a tint (the roofs: each a little
// different from the next).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import atlasLayout from './textures/atlas.json';
import atlasPictureAddress from './textures/atlas.png';

export const cellSize = 4; // metres, the width and depth of a cell (the height of a level depends on the tier: volume.js)

export const MATERIAL_COLOURS = {
  stone: 0xe9e2d0,        // travertine: columns, entablatures, monuments
  stoneShade: 0xcfc5ac,   // podiums, steps, cornices
  tile: 0xb4573a,         // terracotta roof tiles
  bronze: 0x7d6a3a,       // statues and finials
  plasterOchre: 0xdcb779,
  plasterRose: 0xd9a48c,
  plasterCream: 0xe6d6b5,
  plasterSienna: 0xc98f5e,
  interior: 0x2b2622,     // what is seen through a window or a door
  person: 0x1f4e8c,       // the figure that stands by a building to show its scale
  timber: 0x7b5a3a,
  plank: 0xa98a5f,
  thatch: 0x7c725a,
  // awnings: undyed linen, coarse hemp, a cloth dyed with madder and faded (bright dyes were dear)
  canvasMadder: 0xa9705a,
  canvasHemp: 0xa39577,
  canvasLinen: 0xd9cfb4,
  grass: 0x8a9a5b,        // a garden
  // the fields round the town: young corn, ripe corn, olives, fallow earth
  fieldGreen: 0x8a9a5b,   // (the yellow-green of the gardens, since 2026-10-13; 0x8e9e52 before)
  fieldStraw: 0xc9b56a,
  fieldOlive: 0x9aa070,
  fieldFallow: 0xb8a583,
  leaf: 0x4d6b3c,         // its trees
  leafPale: 0x8a9a78,     // the silver green of an olive
  // people: a man in white, a woman in one of the colours of dress; skin; black hair
  toga: 0xece7da,
  dressSaffron: 0xc9a24c,
  dressMadder: 0xa8604f,
  dressSage: 0x8fa58c,
  dressBlueGrey: 0x8f9fb0,
  dressMauve: 0xa98496,
  skin: 0xc99b7a,
  hair: 0x1c1815,
  water: 0x5d8fa6,
  // the bare volume, by tier
  volumeClassical: 0xe9e2d0,
  volumeVernacular: 0xdcb779,
  volumeTemporary: 0xa98a5f,
  brick: 0xb9744f,        // brickwork: houses faced in brick, party walls, the city wall
  brickPale: 0xcfa06c,    // the same of a paler, yellower clay
  cobble: 0x9c9484,       // a street: small stones
  paving: 0x77716a,       // a busy street: large slabs of basalt
  roughStone: 0xa8906c,   // rough blocks of tufa: the aqueduct
  window: 0x6b4f35,       // a window closed with its wooden shutters
  windowOpen: 0x4a3a2a,   // the same with one leaf standing open
};

export const PLASTER_MATERIALS = ['plasterOchre', 'plasterRose', 'plasterCream', 'plasterSienna'];
// What the walls of a house may be faced with: plaster, or the brick left bare
export const HOUSE_WALL_MATERIALS = PLASTER_MATERIALS.concat(['brick', 'brickPale']);
export const DRESS_MATERIALS = ['dressSaffron', 'dressMadder', 'dressSage', 'dressBlueGrey', 'dressMauve'];
// How tall people are, in metres: a man, a woman
export const heightOfAMan = 1.70;
export const heightOfAWoman = 1.58;
export const CANVAS_MATERIALS = ['canvasMadder', 'canvasHemp', 'canvasLinen', 'canvasLinen'];

export class PartCollector {
  constructor() {
    this.geometriesOfMaterial = new Map();
    this.placement = new THREE.Matrix4(); // applied to every part that is added
    this.tag = ''; // what the parts added from now on are (a wall, a head, a roof ...), kept on each part
    this.roofTint = [1, 1, 1]; // the tint of the roof tiles added from now on: red, green, blue, each about 1
    this.piecePlacements = []; // every minced piece that was placed: { piece, matrix }, so that a piece can be found again
  }

  // Parts added from now on are placed at a position and turned by quarter turns about the vertical
  placeAt(x, y, z, quarterTurnCount) {
    this.placement.makeRotationY(quarterTurnCount * Math.PI / 2);
    this.placement.setPosition(x, y, z);
  }

  // Parts added from now on are placed at a position, their front (+z) turned towards a direction in plan
  placeFacing(x, y, z, frontX, frontZ) {
    this.placement.makeRotationY(Math.atan2(frontX, frontZ));
    this.placement.setPosition(x, y, z);
  }

  // keepsItsOwnLayout: the part brings its own layout on its tile (a window pane); every other
  // part is laid out by where its surfaces lie when the meshes are built
  add(materialName, geometry, keepsItsOwnLayout) {
    const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!keepsItsOwnLayout) {
      prepared.deleteAttribute('uv');
    }
    prepared.applyMatrix4(this.placement);
    prepared.userData.tag = this.tag;
    if (materialName === 'tile' && !prepared.getAttribute('color')) {
      prepared.userData.tint = this.roofTint.slice();
    }
    if (!this.geometriesOfMaterial.has(materialName)) {
      this.geometriesOfMaterial.set(materialName, []);
    }
    this.geometriesOfMaterial.get(materialName).push(prepared);
  }

  // A box standing on bottomY, centred on (centreX, centreZ)
  box(materialName, sizeX, sizeY, sizeZ, centreX, bottomY, centreZ) {
    const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
    geometry.translate(centreX, bottomY + sizeY / 2, centreZ);
    this.add(materialName, geometry);
  }

  cylinder(materialName, topRadius, bottomRadius, height, centreX, bottomY, centreZ, segmentCount) {
    const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, segmentCount || 14);
    geometry.translate(centreX, bottomY + height / 2, centreZ);
    this.add(materialName, geometry);
  }

  // A column: a plinth, a shaft that narrows upwards, a capital
  column(centreX, bottomY, centreZ, height, radius, materialName) {
    const material = materialName || 'stone';
    const plinthHeight = radius * 0.5;
    const capitalHeight = radius * 0.7;
    this.box(material, radius * 2.6, plinthHeight, radius * 2.6, centreX, bottomY, centreZ);
    this.cylinder(material, radius * 0.82, radius, height - plinthHeight - capitalHeight, centreX, bottomY + plinthHeight, centreZ, 12);
    this.box(material, radius * 2.7, capitalHeight, radius * 2.7, centreX, bottomY + height - capitalHeight, centreZ);
  }

  // A triangular prism: a pediment or a gabled roof. Its ridge runs along z (or along x), its
  // span is across; it stands on bottomY, centred on (centreX, centreZ).
  prism(materialName, span, rise, length, centreX, bottomY, centreZ, ridgeRunsAlongX) {
    const outline = new THREE.Shape();
    outline.moveTo(-span / 2, 0);
    outline.lineTo(span / 2, 0);
    outline.lineTo(0, rise);
    outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: length, bevelEnabled: false });
    geometry.translate(0, 0, -length / 2);
    if (ridgeRunsAlongX) {
      geometry.rotateY(Math.PI / 2);
    }
    geometry.translate(centreX, bottomY, centreZ);
    this.add(materialName, geometry);
  }

  // A roof of four slopes rising to a point
  pyramid(materialName, sizeX, sizeZ, rise, centreX, bottomY, centreZ) {
    const geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    geometry.rotateY(Math.PI / 4);
    geometry.scale(sizeX, rise, sizeZ);
    geometry.translate(centreX, bottomY + rise / 2, centreZ);
    this.add(materialName, geometry);
  }

  // A standing figure, to give a building its scale and its life: a man 1.70 m tall in white, or
  // a woman 1.58 m tall in one of the colours of dress; both with black hair. Which it is follows
  // from where it stands, so it stays.
  person(centreX, bottomY, centreZ) {
    const earlierTag = this.tag;
    this.tag = 'person';
    const mixed = Math.sin(centreX * 12.9898 + centreZ * 78.233 + bottomY * 37.719) * 43758.5453;
    const share = mixed - Math.floor(mixed);
    const isAWoman = share < 0.5;
    const scale = (isAWoman ? heightOfAWoman : heightOfAMan) / heightOfAMan;
    const dress = isAWoman ? DRESS_MATERIALS[Math.floor(share * 2 * DRESS_MATERIALS.length)] : 'toga';
    this.cylinder(dress, 0.15 * scale, 0.21 * scale, 1.42 * scale, centreX, bottomY, centreZ, 10);
    this.cylinder('skin', 0.105 * scale, 0.105 * scale, 0.2 * scale, centreX, bottomY + 1.43 * scale, centreZ, 10);
    this.cylinder('hair', 0.118 * scale, 0.118 * scale, 0.07 * scale, centreX, bottomY + 1.63 * scale, centreZ, 10);
    this.tag = earlierTag;
  }

  // Half a sphere, flattened or raised to a height
  dome(materialName, radius, height, centreX, bottomY, centreZ) {
    const geometry = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    geometry.scale(1, height / radius, 1);
    geometry.translate(centreX, bottomY, centreZ);
    this.add(materialName, geometry);
  }

  // A wall with openings cut through it. The wall is width wide along x and thickness deep along
  // z before it is turned by quarter turns; it stands on bottomY, centred on (centreX, centreZ).
  // openings: [{ centre (along the width, from the middle of the wall), bottom, width, height, isArched }]
  wall(materialName, width, height, thickness, openings, centreX, bottomY, centreZ, quarterTurnCount) {
    // an opening that begins at the floor (bottom 0) is cut out of the outline of the wall
    // itself, so that nothing of the wall is left under it; the others are holes in it
    const allOpenings = openings || [];
    const floorOpenings = allOpenings.filter(function (opening) {
      return opening.bottom <= 0;
    }).sort(function (first, second) {
      return first.centre - second.centre;
    });
    const outline = new THREE.Shape();
    outline.moveTo(-width / 2, 0);
    floorOpenings.forEach(function (opening) {
      const left = opening.centre - opening.width / 2;
      const right = opening.centre + opening.width / 2;
      outline.lineTo(left, 0);
      if (opening.isArched) {
        const springHeight = opening.height - opening.width / 2;
        outline.lineTo(left, springHeight);
        outline.absarc(opening.centre, springHeight, opening.width / 2, Math.PI, 0, true);
      } else {
        outline.lineTo(left, opening.height);
        outline.lineTo(right, opening.height);
      }
      outline.lineTo(right, 0);
    });
    outline.lineTo(width / 2, 0);
    outline.lineTo(width / 2, height);
    outline.lineTo(-width / 2, height);
    outline.closePath();
    allOpenings.filter(function (opening) {
      return opening.bottom > 0;
    }).forEach(function (opening) {
      const left = opening.centre - opening.width / 2;
      const right = opening.centre + opening.width / 2;
      const bottom = opening.bottom;
      const hole = new THREE.Path();
      hole.moveTo(left, bottom);
      if (opening.isArched) {
        const springHeight = bottom + opening.height - opening.width / 2;
        hole.lineTo(left, springHeight);
        hole.absarc(opening.centre, springHeight, opening.width / 2, Math.PI, 0, true);
        hole.lineTo(right, bottom);
      } else {
        hole.lineTo(left, bottom + opening.height);
        hole.lineTo(right, bottom + opening.height);
        hole.lineTo(right, bottom);
      }
      hole.closePath();
      outline.holes.push(hole);
    });
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
    geometry.translate(0, 0, -thickness / 2);
    geometry.rotateY((quarterTurnCount || 0) * Math.PI / 2);
    geometry.translate(centreX, bottomY, centreZ);
    this.add(materialName, geometry);
  }

  // A wall with openings between two points in plan (see wall for the openings)
  wallBetween(materialName, startX, startZ, endX, endZ, bottomY, height, thickness, openings) {
    const length = Math.hypot(endX - startX, endZ - startZ);
    const outline = new THREE.Shape();
    outline.moveTo(-length / 2, 0);
    outline.lineTo(length / 2, 0);
    outline.lineTo(length / 2, height);
    outline.lineTo(-length / 2, height);
    outline.closePath();
    (openings || []).forEach(function (opening) {
      const left = opening.centre - opening.width / 2;
      const right = opening.centre + opening.width / 2;
      const bottom = Math.max(opening.bottom, 0.04);
      const hole = new THREE.Path();
      hole.moveTo(left, bottom);
      if (opening.isArched) {
        const springHeight = bottom + opening.height - opening.width / 2;
        hole.lineTo(left, springHeight);
        hole.absarc(opening.centre, springHeight, opening.width / 2, Math.PI, 0, true);
        hole.lineTo(right, bottom);
      } else {
        hole.lineTo(left, bottom + opening.height);
        hole.lineTo(right, bottom + opening.height);
        hole.lineTo(right, bottom);
      }
      hole.closePath();
      outline.holes.push(hole);
    });
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
    geometry.translate(0, 0, -thickness / 2);
    const turn = Math.atan2(-(endZ - startZ), endX - startX); // the wall's length, along x, turned onto the line
    geometry.rotateY(turn);
    geometry.translate((startX + endX) / 2, bottomY, (startZ + endZ) / 2);
    this.add(materialName, geometry);
    // shutters in every window (not in a door or a shop arch, which stand open): the window tile
    // laid once over the opening, in the middle of the wall's thickness. Some stand half open:
    // which ones follows from where the window is, so a window keeps its look.
    const collector = this;
    (openings || []).forEach(function (opening) {
      if (opening.bottom < 0.1) {
        return;
      }
      const left = opening.centre - opening.width / 2;
      const right = opening.centre + opening.width / 2;
      const top = opening.bottom + opening.height;
      const pane = new THREE.BufferGeometry();
      pane.setAttribute('position', new THREE.Float32BufferAttribute([
        left, opening.bottom, 0, right, opening.bottom, 0, right, top, 0,
        left, opening.bottom, 0, right, top, 0, left, top, 0], 3));
      pane.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      pane.computeVertexNormals();
      pane.rotateY(turn);
      pane.translate((startX + endX) / 2, bottomY, (startZ + endZ) / 2);
      // a number between 0 and 1 from the place of the window, well mixed
      const mixed = Math.sin((startX + endX) * 12.9898 + (startZ + endZ) * 78.233 + bottomY * 37.719 + opening.centre * 4.581) * 43758.5453;
      const shareOfPlace = mixed - Math.floor(mixed);
      collector.add(shareOfPlace < 0.3 ? 'windowOpen' : 'window', pane, true);
    });
  }

  // An upright prism over a polygon in plan ([[x, z], ...], convex), from bottomY up by height
  polygonPrism(materialName, polygon, bottomY, height) {
    const coordinates = [];
    const topY = bottomY + height;
    for (let index = 1; index + 1 < polygon.length; index++) {
      coordinates.push(polygon[0][0], topY, polygon[0][1], polygon[index + 1][0], topY, polygon[index + 1][1], polygon[index][0], topY, polygon[index][1]);
      coordinates.push(polygon[0][0], bottomY, polygon[0][1], polygon[index][0], bottomY, polygon[index][1], polygon[index + 1][0], bottomY, polygon[index + 1][1]);
    }
    for (let index = 0; index < polygon.length; index++) {
      const here = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      coordinates.push(here[0], bottomY, here[1], next[0], topY, next[1], next[0], bottomY, next[1]);
      coordinates.push(here[0], bottomY, here[1], here[0], topY, here[1], next[0], topY, next[1]);
    }
    this.addTriangles(materialName, coordinates);
  }

  // Loose triangles, three points each, as a flat list of coordinates. tints (optional): red,
  // green and blue for every point, each about 1, laid over the picture of the material.
  addTriangles(materialName, coordinates, tints) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
    if (tints) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
    }
    geometry.computeVertexNormals();
    this.add(materialName, geometry);
  }

  // A flight of steps rising towards -z, its top edge at z = topEdgeZ
  steps(materialName, width, totalRise, stepCount, centreX, bottomY, topEdgeZ) {
    const stepRise = totalRise / stepCount;
    const stepDepth = 0.35;
    for (let step = 0; step < stepCount; step++) {
      const depth = stepDepth * (stepCount - step);
      this.box(materialName, width, stepRise, depth, centreX, bottomY + step * stepRise, topEdgeZ + depth / 2);
    }
  }

  // One mesh for each material, with shadows
  buildMeshes(materials) {
    const group = new THREE.Group();
    this.geometriesOfMaterial.forEach(function (geometries, materialName) {
      const tile = atlasLayout.tiles[materialName];
      geometries.forEach(function (geometry) {
        if (!geometry.getAttribute('uv')) {
          layOutOnItsTile(geometry, tile ? tile.metresPerRepeat : 1);
        }
        if (!geometry.getAttribute('color')) {
          const tint = geometry.userData.tint || [1, 1, 1];
          const pointCount = geometry.getAttribute('position').count;
          const tints = new Float32Array(pointCount * 3);
          for (let pointNumber = 0; pointNumber < pointCount; pointNumber++) {
            tints.set(tint, pointNumber * 3);
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(tints, 3));
        }
      });
      const merged = mergeGeometries(geometries, false);
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, materials[materialName]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }
}

// Lays a part out on the tile of its material, triangle by triangle, in metres: what lies flat
// by its place in plan; a wall or a slope by the distance along it and the distance up it, so
// that the courses of a tile run level along walls and along the eaves of roofs.
function layOutOnItsTile(geometry, metresPerRepeat) {
  const positions = geometry.getAttribute('position');
  const layout = new Float32Array(positions.count * 2);
  for (let firstPoint = 0; firstPoint + 2 < positions.count; firstPoint += 3) {
    const firstX = positions.getX(firstPoint), firstY = positions.getY(firstPoint), firstZ = positions.getZ(firstPoint);
    const toSecondX = positions.getX(firstPoint + 1) - firstX, toSecondY = positions.getY(firstPoint + 1) - firstY, toSecondZ = positions.getZ(firstPoint + 1) - firstZ;
    const toThirdX = positions.getX(firstPoint + 2) - firstX, toThirdY = positions.getY(firstPoint + 2) - firstY, toThirdZ = positions.getZ(firstPoint + 2) - firstZ;
    let normalX = toSecondY * toThirdZ - toSecondZ * toThirdY;
    let normalY = toSecondZ * toThirdX - toSecondX * toThirdZ;
    let normalZ = toSecondX * toThirdY - toSecondY * toThirdX;
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    normalX /= normalLength;
    normalY /= normalLength;
    normalZ /= normalLength;
    const steepness = Math.hypot(normalX, normalZ); // 0 lying flat, 1 standing upright
    for (let corner = 0; corner < 3; corner++) {
      const x = positions.getX(firstPoint + corner), y = positions.getY(firstPoint + corner), z = positions.getZ(firstPoint + corner);
      let along = x;
      let up = z;
      if (steepness > 0.3) {
        along = (x * normalZ - z * normalX) / steepness;
        up = y / steepness;
      }
      layout[(firstPoint + corner) * 2] = along / metresPerRepeat;
      layout[(firstPoint + corner) * 2 + 1] = up / metresPerRepeat;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(layout, 2));
}

// The materials, each with its tile of the atlas as its picture. Until the atlas has been read
// a material shows its plain colour; materialsAreLoaded is fulfilled when the tiles are in.
let tellThatMaterialsAreLoaded = null;
export const materialsAreLoaded = new Promise(function (resolve) {
  tellThatMaterialsAreLoaded = resolve;
});

export function createMaterials() {
  const materials = {};
  const tileSizePixels = atlasLayout.tileSizePixels;
  const tilePictures = {};
  Object.keys(MATERIAL_COLOURS).forEach(function (materialName) {
    const tilePicture = document.createElement('canvas');
    tilePicture.width = tileSizePixels;
    tilePicture.height = tileSizePixels;
    const brush = tilePicture.getContext('2d');
    brush.fillStyle = '#' + MATERIAL_COLOURS[materialName].toString(16).padStart(6, '0');
    brush.fillRect(0, 0, tileSizePixels, tileSizePixels);
    tilePictures[materialName] = tilePicture;
    const texture = new THREE.CanvasTexture(tilePicture);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    materials[materialName] = new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true,
      roughness: materialName === 'water' ? 0.15 : 0.9,
      metalness: materialName === 'bronze' ? 0.6 : 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  });
  const atlasPicture = new Image();
  atlasPicture.onload = function () {
    Object.keys(atlasLayout.tiles).forEach(function (materialName) {
      if (!materials[materialName]) {
        return;
      }
      const tile = atlasLayout.tiles[materialName];
      tilePictures[materialName].getContext('2d').drawImage(atlasPicture,
        tile.column * tileSizePixels, tile.row * tileSizePixels, tileSizePixels, tileSizePixels, 0, 0, tileSizePixels, tileSizePixels);
      materials[materialName].map.needsUpdate = true;
    });
    tellThatMaterialsAreLoaded();
  };
  atlasPicture.onerror = function () {
    tellThatMaterialsAreLoaded(); // without the picture the town keeps its plain colours
  };
  atlasPicture.src = atlasPictureAddress;
  return materials;
}
