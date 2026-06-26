/**
 * 光追基础几何类型：Vec3, Ray, Triangle, AABB, HitResult
 * 参考 Assets/Scripts/RayTracer.cs
 */

export class Vec3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}

  static from(v: { x: number; y: number; z: number }): Vec3 {
    return new Vec3(v.x, v.y, v.z);
  }

  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }

  add(v: Vec3): Vec3 { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v: Vec3): Vec3 { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  mul(s: number | Vec3): Vec3 {
    if (typeof s === 'number') return new Vec3(this.x * s, this.y * s, this.z * s);
    return new Vec3(this.x * s.x, this.y * s.y, this.z * s.z);
  }
  div(s: number): Vec3 { return new Vec3(this.x / s, this.y / s, this.z / s); }

  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }

  cross(v: Vec3): Vec3 {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lengthSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }

  normalize(): Vec3 {
    const len = this.length();
    return len > 1e-10 ? this.div(len) : new Vec3();
  }

  negate(): Vec3 { return new Vec3(-this.x, -this.y, -this.z); }

  /** component-wise max */
  static max(a: Vec3, b: Vec3): Vec3 {
    return new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
  }

  /** component-wise min */
  static min(a: Vec3, b: Vec3): Vec3 {
    return new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
  }

  static lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return new Vec3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  }

  equals(v: Vec3, eps = 1e-8): boolean {
    return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps && Math.abs(this.z - v.z) < eps;
  }

  toString(): string { return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`; }
}

export class Ray {
  constructor(
    public origin: Vec3,
    public direction: Vec3
  ) {}

  getPoint(t: number): Vec3 {
    return this.origin.add(this.direction.mul(t));
  }
}

export class Color {
  constructor(
    public r: number = 0,
    public g: number = 0,
    public b: number = 0
  ) {}

  static black(): Color { return new Color(0, 0, 0); }
  static white(): Color { return new Color(1, 1, 1); }
  static fromHex(hex: string): Color {
    const h = hex.replace('#', '');
    return new Color(
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255
    );
  }

  clone(): Color { return new Color(this.r, this.g, this.b); }

  add(c: Color): Color { return new Color(this.r + c.r, this.g + c.g, this.b + c.b); }
  mul(s: number | Color): Color {
    if (typeof s === 'number') return new Color(this.r * s, this.g * s, this.b * s);
    return new Color(this.r * s.r, this.g * s.g, this.b * s.b);
  }
  lerp(c: Color, t: number): Color {
    return new Color(
      this.r + (c.r - this.r) * t,
      this.g + (c.g - this.g) * t,
      this.b + (c.b - this.b) * t
    );
  }

  maxChannel(): number { return Math.max(this.r, this.g, this.b); }
  sum(): number { return this.r + this.g + this.b; }

  clamp(): Color {
    return new Color(
      Math.max(0, Math.min(1, this.r)),
      Math.max(0, Math.min(1, this.g)),
      Math.max(0, Math.min(1, this.b))
    );
  }

  /** 近似 Gamma 校正 (sRGB) */
  toSRGB(): Color {
    const gamma = 1 / 2.2;
    return new Color(
      Math.pow(Math.max(0, Math.min(1, this.r)), gamma),
      Math.pow(Math.max(0, Math.min(1, this.g)), gamma),
      Math.pow(Math.max(0, Math.min(1, this.b)), gamma)
    );
  }
}

/**
 * 三角形（世界坐标，预计算边和法线）
 * 参考 RayTracer.cs Triangle struct
 */
export class Triangle {
  public edge1: Vec3;
  public edge2: Vec3;
  public faceNormal: Vec3;

  constructor(
    public v0: Vec3,
    public v1: Vec3,
    public v2: Vec3,
    public n0: Vec3,
    public n1: Vec3,
    public n2: Vec3,
    public materialIndex: number
  ) {
    this.edge1 = v1.sub(v0);
    this.edge2 = v2.sub(v0);
    this.faceNormal = this.edge1.cross(this.edge2).normalize();
  }
}

/** AABB 包围盒 */
export class AABB {
  constructor(
    public min: Vec3 = new Vec3(Infinity, Infinity, Infinity),
    public max: Vec3 = new Vec3(-Infinity, -Infinity, -Infinity)
  ) {}

  get center(): Vec3 {
    return this.min.add(this.max).mul(0.5);
  }

  expand(v: Vec3): void {
    this.min = Vec3.min(this.min, v);
    this.max = Vec3.max(this.max, v);
  }

  /** Slab 方法：射线-AABB求交，返回 tMin/tMax */
  intersectRay(ray: Ray): { tMin: number; tMax: number } | null {
    let tMin = -Infinity;
    let tMax = Infinity;

    const origins = [ray.origin.x, ray.origin.y, ray.origin.z];
    const dirs = [ray.direction.x, ray.direction.y, ray.direction.z];
    const mins = [this.min.x, this.min.y, this.min.z];
    const maxs = [this.max.x, this.max.y, this.max.z];

    for (let i = 0; i < 3; i++) {
      if (Math.abs(dirs[i]) < 1e-10) {
        if (origins[i] < mins[i] || origins[i] > maxs[i]) return null;
      } else {
        const invD = 1 / dirs[i];
        let t0 = (mins[i] - origins[i]) * invD;
        let t1 = (maxs[i] - origins[i]) * invD;
        if (t0 > t1) { [t0, t1] = [t1, t0]; }
        tMin = Math.max(tMin, t0);
        tMax = Math.min(tMax, t1);
        if (tMin > tMax) return null;
      }
    }
    return { tMin, tMax };
  }
}

/** 求交结果 */
export interface HitResult {
  hit: boolean;
  t: number;
  point: Vec3;
  normal: Vec3;       // 重心坐标插值法线（平滑着色用）
  faceNormal: Vec3;   // 三角形几何法线
  materialIndex: number;
}

export function emptyHit(): HitResult {
  return {
    hit: false, t: Infinity,
    point: new Vec3(), normal: new Vec3(), faceNormal: new Vec3(),
    materialIndex: -1
  };
}
