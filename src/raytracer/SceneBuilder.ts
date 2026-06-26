/**
 * 将 GameObjectData[] 转换为光追引擎可用的三角形 + 材质
 * 参考 Assets/Scripts/RayTracer.cs CollectSceneGeometry()
 */
import { GameObjectData } from '../scene/GameObject';
import { Vec3, Triangle } from './Geometry';
import { RTMaterial, createMaterial } from './Material';

export interface SceneData {
  triangles: Triangle[];
  materials: RTMaterial[];
}

const toRad = (deg: number) => deg * Math.PI / 180;

/**
 * 构建旋转矩阵 (YXZ顺序，与Three.js Euler一致)
 */
function buildRotationMatrix(rx: number, ry: number, rz: number): {
  transform(v: Vec3): Vec3;
} {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // YXZ rotation matrix
  const m00 = cy * cz + sx * sy * sz;
  const m01 = -cy * sz + sx * sy * cz;
  const m02 = cx * sy;
  const m10 = cx * sz;
  const m11 = cx * cz;
  const m12 = -sx;
  const m20 = -sy * cz + sx * cy * sz;
  const m21 = sy * sz + sx * cy * cz;
  const m22 = cx * cy;

  return {
    transform(v: Vec3): Vec3 {
      return new Vec3(
        m00 * v.x + m01 * v.y + m02 * v.z,
        m10 * v.x + m11 * v.y + m12 * v.z,
        m20 * v.x + m21 * v.y + m22 * v.z
      );
    }
  };
}

function addTriangle(
  tris: Triangle[],
  v0: Vec3, v1: Vec3, v2: Vec3,
  matIdx: number
): void {
  const n = v1.sub(v0).cross(v2.sub(v0)).normalize();
  tris.push(new Triangle(v0, v1, v2, n, n, n, matIdx));
}

/** 生成球体三角形 (UV Sphere) */
function buildSphere(
  position: Vec3, rot: { x: number; y: number; z: number },
  scale: Vec3, matIdx: number
): Triangle[] {
  const tris: Triangle[] = [];
  const r = 0.5;
  const segs = 16, rings = 8;
  const rotM = buildRotationMatrix(toRad(rot.x), toRad(rot.y), toRad(rot.z));

  const verts: Vec3[][] = [];
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI;
    const row: Vec3[] = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const v = new Vec3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      const tv = rotM.transform(v).mul(scale).add(position);
      row.push(tv);
    }
    verts.push(row);
  }

  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = verts[j][i], b = verts[j][i + 1];
      const c = verts[j + 1][i], d = verts[j + 1][i + 1];
      if (j > 0) addTriangle(tris, a, b, c, matIdx);
      if (j < rings - 1) addTriangle(tris, b, d, c, matIdx);
    }
  }
  return tris;
}

/** 生成立方体三角形 */
function buildCube(
  position: Vec3, rot: { x: number; y: number; z: number },
  scale: Vec3, matIdx: number
): Triangle[] {
  const tris: Triangle[] = [];
  const h = 0.5;
  const rotM = buildRotationMatrix(toRad(rot.x), toRad(rot.y), toRad(rot.z));

  // 8个角点
  const corners: Vec3[] = [];
  for (let x = -1; x <= 1; x += 2)
    for (let y = -1; y <= 1; y += 2)
      for (let z = -1; z <= 1; z += 2)
        corners.push(
          rotM.transform(new Vec3(x * h, y * h, z * h)).mul(scale).add(position)
        );

  // 6个面 (每面2个三角形)
  const faces: [number, number, number, number][] = [
    [0, 1, 3, 2], [4, 6, 7, 5], // X轴
    [0, 4, 5, 1], [2, 3, 7, 6], // Y轴
    [0, 2, 6, 4], [1, 5, 7, 3], // Z轴
  ];

  for (const [a, b, c, d] of faces) {
    addTriangle(tris, corners[a], corners[b], corners[c], matIdx);
    addTriangle(tris, corners[a], corners[c], corners[d], matIdx);
  }
  return tris;
}

/** 生成平面三角形 */
function buildPlane(
  position: Vec3, rot: { x: number; y: number; z: number },
  scale: Vec3, matIdx: number
): Triangle[] {
  const tris: Triangle[] = [];
  const rotM = buildRotationMatrix(toRad(rot.x), toRad(rot.y), toRad(rot.z));
  const s = 1.0; // 2×2 plane, half = 1

  const corners = [
    new Vec3(-s, 0, -s), new Vec3(s, 0, -s),
    new Vec3(-s, 0, s), new Vec3(s, 0, s),
  ].map(v => rotM.transform(v).mul(scale).add(position));

  addTriangle(tris, corners[0], corners[1], corners[2], matIdx);
  addTriangle(tris, corners[1], corners[3], corners[2], matIdx);
  return tris;
}

/** 生成圆柱体三角形 */
function buildCylinder(
  position: Vec3, rot: { x: number; y: number; z: number },
  scale: Vec3, matIdx: number
): Triangle[] {
  const tris: Triangle[] = [];
  const r = 0.5, halfH = 0.75;
  const segs = 16;
  const rotM = buildRotationMatrix(toRad(rot.x), toRad(rot.y), toRad(rot.z));

  const topCenter = rotM.transform(new Vec3(0, halfH, 0)).mul(scale).add(position);
  const botCenter = rotM.transform(new Vec3(0, -halfH, 0)).mul(scale).add(position);

  const topRing: Vec3[] = [], botRing: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    const x = r * Math.cos(theta), z = r * Math.sin(theta);
    topRing.push(rotM.transform(new Vec3(x, halfH, z)).mul(scale).add(position));
    botRing.push(rotM.transform(new Vec3(x, -halfH, z)).mul(scale).add(position));
  }

  // 侧面
  for (let i = 0; i < segs; i++) {
    addTriangle(tris, botRing[i], botRing[i + 1], topRing[i], matIdx);
    addTriangle(tris, topRing[i], botRing[i + 1], topRing[i + 1], matIdx);
  }
  // 顶盖和底盖
  for (let i = 0; i < segs; i++) {
    addTriangle(tris, topCenter, topRing[i + 1], topRing[i], matIdx);
    addTriangle(tris, botCenter, botRing[i], botRing[i + 1], matIdx);
  }
  return tris;
}

/** 生成胶囊体三角形 (半球 + 圆柱 + 半球) */
function buildCapsule(
  position: Vec3, rot: { x: number; y: number; z: number },
  scale: Vec3, matIdx: number
): Triangle[] {
  const tris: Triangle[] = [];
  const r = 0.5, halfH = 0.5; // 总高 = 2*0.5 + 1.0 = 2.0
  const segs = 16, rings = 4;
  const rotM = buildRotationMatrix(toRad(rot.x), toRad(rot.y), toRad(rot.z));

  // 上半球 (极点到圆柱顶部)
  const topPole = rotM.transform(new Vec3(0, halfH + r, 0)).mul(scale).add(position);
  const topRing0: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    topRing0.push(rotM.transform(new Vec3(r * Math.cos(theta), halfH, r * Math.sin(theta))).mul(scale).add(position));
  }
  for (let j = 0; j < rings; j++) {
    const phi0 = (j / rings) * (Math.PI / 2);
    const phi1 = ((j + 1) / rings) * (Math.PI / 2);
    const r0 = r * Math.sin(phi0), y0 = halfH + r * Math.cos(phi0);
    const r1 = r * Math.sin(phi1), y1 = halfH + r * Math.cos(phi1);
    const ringA: Vec3[] = [], ringB: Vec3[] = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      ringA.push(rotM.transform(new Vec3(r0 * Math.cos(theta), y0, r0 * Math.sin(theta))).mul(scale).add(position));
      ringB.push(rotM.transform(new Vec3(r1 * Math.cos(theta), y1, r1 * Math.sin(theta))).mul(scale).add(position));
    }
    for (let i = 0; i < segs; i++) {
      addTriangle(tris, ringA[i], ringA[i + 1], ringB[i], matIdx);
      addTriangle(tris, ringB[i], ringA[i + 1], ringB[i + 1], matIdx);
    }
  }

  // 圆柱体侧面
  const topRing: Vec3[] = [], botRing: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    topRing.push(rotM.transform(new Vec3(r * Math.cos(theta), halfH, r * Math.sin(theta))).mul(scale).add(position));
    botRing.push(rotM.transform(new Vec3(r * Math.cos(theta), -halfH, r * Math.sin(theta))).mul(scale).add(position));
  }
  for (let i = 0; i < segs; i++) {
    addTriangle(tris, botRing[i], botRing[i + 1], topRing[i], matIdx);
    addTriangle(tris, topRing[i], botRing[i + 1], topRing[i + 1], matIdx);
  }

  // 下半球
  const botPole = rotM.transform(new Vec3(0, -halfH - r, 0)).mul(scale).add(position);
  for (let j = 0; j < rings; j++) {
    const phi0 = Math.PI / 2 + (j / rings) * (Math.PI / 2);
    const phi1 = Math.PI / 2 + ((j + 1) / rings) * (Math.PI / 2);
    const r0 = r * Math.sin(phi0), y0 = -halfH + r * Math.cos(phi0);
    const r1 = r * Math.sin(phi1), y1 = -halfH + r * Math.cos(phi1);
    const ringA: Vec3[] = [], ringB: Vec3[] = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      ringA.push(rotM.transform(new Vec3(r0 * Math.cos(theta), y0, r0 * Math.sin(theta))).mul(scale).add(position));
      ringB.push(rotM.transform(new Vec3(r1 * Math.cos(theta), y1, r1 * Math.sin(theta))).mul(scale).add(position));
    }
    for (let i = 0; i < segs; i++) {
      addTriangle(tris, ringA[i], ringA[i + 1], ringB[i], matIdx);
      addTriangle(tris, ringB[i], ringA[i + 1], ringB[i + 1], matIdx);
    }
  }

  return tris;
}

/**
 * 将场景物体转换为三角形 + 材质数据
 */
export function buildSceneData(objects: GameObjectData[]): SceneData {
  const triangles: Triangle[] = [];
  const materials: RTMaterial[] = [];

  for (const obj of objects) {
    if (!obj.visible) continue;

    const mat = createMaterial(obj.materialType, obj.color);
    const matIdx = materials.length;
    materials.push(mat);

    const pos = new Vec3(obj.position.x, obj.position.y, obj.position.z);
    const rot = obj.rotation;
    const scl = new Vec3(obj.scale.x, obj.scale.y, obj.scale.z);

    let objTris: Triangle[];
    switch (obj.type) {
      case 'sphere':   objTris = buildSphere(pos, rot, scl, matIdx); break;
      case 'cube':     objTris = buildCube(pos, rot, scl, matIdx); break;
      case 'plane':    objTris = buildPlane(pos, rot, scl, matIdx); break;
      case 'cylinder': objTris = buildCylinder(pos, rot, scl, matIdx); break;
      case 'capsule':  objTris = buildCapsule(pos, rot, scl, matIdx); break;
      default: continue;
    }

    for (const tri of objTris) triangles.push(tri);
  }

  return { triangles, materials };
}
