// Purpose: a check for z fighting. Two faces of different parts that lie in the same plane, look
// the same way and cover each other are drawn at the same depth, so the picture flickers between
// them. This finds such pairs in what a collector holds, so that the designs can be cleaned.
// (Faces that lie against each other back to back, a box standing on a box, are not reported:
// neither is seen through the other.)

const leastOverlapArea = 0.002; // square metres; less is an edge touching, not a fight

// Returns [{ firstMaterial, secondMaterial, area, normal: [x, y, z], at: [x, y, z] }], the largest
// first: for every pair of parts and plane, how much of them fights and about where.
export function findCoplanarOverlaps(collector) {
  // every triangle with its plane, gathered by plane
  const trianglesOfPlane = new Map();
  let partNumber = 0;
  collector.geometriesOfMaterial.forEach(function (geometries, materialName) {
    geometries.forEach(function (geometry) {
      partNumber++;
      const positions = geometry.getAttribute('position').array;
      for (let offset = 0; offset < positions.length; offset += 9) {
        const corners = [0, 3, 6].map(function (cornerOffset) {
          return [positions[offset + cornerOffset], positions[offset + cornerOffset + 1], positions[offset + cornerOffset + 2]];
        });
        const edgeOne = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1], corners[1][2] - corners[0][2]];
        const edgeTwo = [corners[2][0] - corners[0][0], corners[2][1] - corners[0][1], corners[2][2] - corners[0][2]];
        const normal = [
          edgeOne[1] * edgeTwo[2] - edgeOne[2] * edgeTwo[1],
          edgeOne[2] * edgeTwo[0] - edgeOne[0] * edgeTwo[2],
          edgeOne[0] * edgeTwo[1] - edgeOne[1] * edgeTwo[0],
        ];
        const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
        if (normalLength < 1e-9) {
          continue;
        }
        const unitNormal = normal.map(function (component) { return component / normalLength; });
        const distanceFromOrigin = unitNormal[0] * corners[0][0] + unitNormal[1] * corners[0][1] + unitNormal[2] * corners[0][2];
        const planeKey = unitNormal.map(function (component) { return Math.round(component * 500); }).join(',') + ',' + Math.round(distanceFromOrigin * 200);
        if (!trianglesOfPlane.has(planeKey)) {
          trianglesOfPlane.set(planeKey, []);
        }
        trianglesOfPlane.get(planeKey).push({ corners: corners, normal: unitNormal, partNumber: partNumber, materialName: materialName });
      }
    });
  });

  const fights = new Map(); // pair of parts and plane -> fight
  trianglesOfPlane.forEach(function (triangles, planeKey) {
    if (triangles.length < 2) {
      return;
    }
    // the plane seen flat: the two axes its normal leans on least
    const normal = triangles[0].normal;
    const steepestAxis = [0, 1, 2].reduce(function (best, axis) {
      return Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best;
    }, 0);
    const flatAxes = [0, 1, 2].filter(function (axis) { return axis !== steepestAxis; });
    const flatScale = 1 / Math.abs(normal[steepestAxis]); // an area seen flat, back to its true size
    const flatTriangles = triangles.map(function (triangle) {
      const flat = triangle.corners.map(function (corner) { return [corner[flatAxes[0]], corner[flatAxes[1]]]; });
      const signedArea = (flat[1][0] - flat[0][0]) * (flat[2][1] - flat[0][1]) - (flat[2][0] - flat[0][0]) * (flat[1][1] - flat[0][1]);
      return signedArea < 0 ? [flat[0], flat[2], flat[1]] : flat; // counter-clockwise
    });
    for (let first = 0; first < triangles.length; first++) {
      for (let second = first + 1; second < triangles.length; second++) {
        if (triangles[first].partNumber === triangles[second].partNumber) {
          continue;
        }
        // the first triangle cut by the three sides of the second
        let polygon = flatTriangles[first];
        for (let side = 0; side < 3 && polygon.length >= 3; side++) {
          const start = flatTriangles[second][side];
          const end = flatTriangles[second][(side + 1) % 3];
          const cut = [];
          for (let index = 0; index < polygon.length; index++) {
            const current = polygon[index];
            const next = polygon[(index + 1) % polygon.length];
            const currentSide = (end[0] - start[0]) * (current[1] - start[1]) - (end[1] - start[1]) * (current[0] - start[0]);
            const nextSide = (end[0] - start[0]) * (next[1] - start[1]) - (end[1] - start[1]) * (next[0] - start[0]);
            if (currentSide >= 0) {
              cut.push(current);
            }
            if ((currentSide > 0 && nextSide < 0) || (currentSide < 0 && nextSide > 0)) {
              const share = currentSide / (currentSide - nextSide);
              cut.push([current[0] + (next[0] - current[0]) * share, current[1] + (next[1] - current[1]) * share]);
            }
          }
          polygon = cut;
        }
        if (polygon.length < 3) {
          continue;
        }
        let area = 0;
        for (let index = 0; index < polygon.length; index++) {
          const current = polygon[index];
          const next = polygon[(index + 1) % polygon.length];
          area += (current[0] * next[1] - next[0] * current[1]) / 2;
        }
        area *= flatScale;
        if (area < 1e-6) {
          continue;
        }
        const fightKey = Math.min(triangles[first].partNumber, triangles[second].partNumber) + '/' + Math.max(triangles[first].partNumber, triangles[second].partNumber) + '/' + planeKey;
        if (!fights.has(fightKey)) {
          fights.set(fightKey, {
            firstMaterial: triangles[first].materialName, secondMaterial: triangles[second].materialName, area: 0,
            normal: normal.map(function (component) { return Math.round(component * 100) / 100; }),
            at: triangles[first].corners[0].map(function (coordinate) { return Math.round(coordinate * 100) / 100; }),
          });
        }
        fights.get(fightKey).area += area;
      }
    }
  });
  return Array.from(fights.values()).filter(function (fight) {
    return fight.area >= leastOverlapArea;
  }).sort(function (first, second) {
    return second.area - first.area;
  });
}
