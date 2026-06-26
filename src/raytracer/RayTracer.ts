/**
 * CPU 光线追踪核心引擎
 * Phase 2: 基础光线追踪（Möller-Trumbore 求交 + Phong 局部光照）
 * 参考 Assets/Scripts/RayTracer.cs
 */
import { Vec3, Ray, Color, Triangle, HitResult, emptyHit } from './Geometry';
import { RTMaterial } from './Material';
import { RayCamera } from './Camera';
import { SceneData } from './SceneBuilder';

export class RayTracer {
  private triangles: Triangle[] = [];
  private materials: RTMaterial[] = [];
  private camera: RayCamera | null = null;

  private renderWidth = 640;
  private renderHeight = 480;
  private aaSamples = 2;
  private maxDepth = 5;
  private energyThreshold = 0.01;
  private backgroundColor = new Color(0.2, 0.25, 0.35);

  // 光照参数
  private lightDir = new Vec3(0.577, -0.577, -0.577).normalize();
  private lightColor = Color.white();
  private lightIntensity = 1.0;
  private ambientColor = new Color(0.25, 0.25, 0.38);
  private ambientIntensity = 0.3;

  private pixelBuffer: Color[] = [];
  private isRendering = false;
  private totalRays = 0;
  private intersectionTests = 0;

  // 回调
  onProgress?: (percent: number, rays: number, tests: number) => void;
  onComplete?: (pixels: ImageData) => void;

  /* ==================== 配置 ==================== */

  configure(options: {
    camera: RayCamera;
    width: number; height: number;
    aaSamples: number;
    maxDepth: number;
    energyThreshold: number;
    bgColor: Color;
    lightDir: Vec3;
    lightColor: Color; lightIntensity: number;
    ambientColor: Color; ambientIntensity: number;
  }): void {
    this.camera = options.camera;
    this.renderWidth = options.width;
    this.renderHeight = options.height;
    this.aaSamples = options.aaSamples;
    this.maxDepth = options.maxDepth;
    this.energyThreshold = options.energyThreshold;
    this.backgroundColor = options.bgColor;
    this.lightDir = options.lightDir.normalize();
    this.lightColor = options.lightColor;
    this.lightIntensity = options.lightIntensity;
    this.ambientColor = options.ambientColor;
    this.ambientIntensity = options.ambientIntensity;
  }

  setScene(scene: SceneData): void {
    this.triangles = scene.triangles;
    this.materials = scene.materials;
  }

  /* ==================== 公开接口 ==================== */

  async render(): Promise<ImageData> {
    if (!this.camera) throw new Error('Camera not configured');
    if (this.isRendering) throw new Error('Already rendering');

    this.isRendering = true;
    this.totalRays = 0;
    this.intersectionTests = 0;

    const w = this.renderWidth, h = this.renderHeight;
    this.pixelBuffer = new Array(w * h);

    const totalRows = h;
    const rowsPerBatch = 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let pixelColor = Color.black();

        if (this.aaSamples > 1) {
          const invN = 1 / (this.aaSamples * this.aaSamples);
          for (let iy = 0; iy < this.aaSamples; iy++) {
            for (let ix = 0; ix < this.aaSamples; ix++) {
              const px = x + (ix + 0.5) / this.aaSamples;
              const py = y + (iy + 0.5) / this.aaSamples;
              pixelColor = pixelColor.add(this.tracePixel(px, py));
            }
          }
          pixelColor = pixelColor.mul(invN);
        } else {
          pixelColor = this.tracePixel(x + 0.5, y + 0.5);
        }

        // Y 轴翻转 (canvas 坐标原点在左上)
        this.pixelBuffer[(h - 1 - y) * w + x] = pixelColor.clamp();
      }

      // 渐进式报告进度
      if (y % rowsPerBatch === 0 || y === h - 1) {
        const pct = Math.round(((y + 1) / totalRows) * 100);
        this.onProgress?.(pct, this.totalRays, this.intersectionTests);
        await this.yield_();
      }
    }

    this.isRendering = false;

    // 生成 ImageData
    return this.toImageData();
  }

  cancel(): void {
    this.isRendering = false;
  }

  /* ==================== 像素追踪 ==================== */

  private tracePixel(px: number, py: number): Color {
    const vpX = px / this.renderWidth;
    const vpY = py / this.renderHeight; // 0=top
    const ray = this.camera!.getRay(vpX, vpY);
    this.totalRays++;
    return this.traceRay(ray, this.maxDepth, Color.white());
  }

  /* ==================== 核心递归 ==================== */

  /**
   * traceRay(ray, depth, weight)
   * Phase 2: 仅计算局部 Phong 光照（无递归反射/折射）
   */
  private traceRay(ray: Ray, depth: number, weight: Color): Color {
    // 能量衰减终止
    if (weight.sum() < this.energyThreshold) return Color.black();

    // Russian Roulette (超过深度时用)
    if (depth <= 0) {
      const p = weight.maxChannel();
      if (p <= 0 || Math.random() > p) return Color.black();
      weight = weight.mul(1 / p);
    }

    const hit = this.intersectScene(ray);
    if (!hit.hit) return this.backgroundColor;

    const mat = this.materials[hit.materialIndex];
    if (!mat) return Color.black();

    // 判断正面/背面
    const entering = ray.direction.dot(hit.faceNormal) < 0;
    const shadingNormal = entering ? hit.normal : hit.faceNormal.negate();

    // 局部光照
    let result = this.computeLocalIllumination(hit, mat, ray.direction, shadingNormal);

    // Phase 2: 无递归反射/折射，直接返回
    return result;
  }

  /* ==================== 场景求交 ==================== */

  /**
   * 暴力遍历所有三角形（BVH 将在 Phase 4 加入）
   */
  private intersectScene(ray: Ray): HitResult {
    let best = emptyHit();

    for (let i = 0; i < this.triangles.length; i++) {
      this.intersectionTests++;
      const tri = this.triangles[i];
      const result = this.intersectTriangle(ray, tri);
      if (result !== null && result.t > 1e-6 && result.t < best.t) {
        result.materialIndex = tri.materialIndex;
        best = result;
      }
    }

    return best;
  }

  /* ==================== Möller-Trumbore 三角形求交 ==================== */

  /**
   * Möller-Trumbore 算法：射线与三角形求交
   * 返回交点 t、位置、重心坐标插值法线、面法线
   */
  private intersectTriangle(ray: Ray, tri: Triangle): HitResult | null {
    const h = ray.direction.cross(tri.edge2);
    const a = tri.edge1.dot(h);

    if (Math.abs(a) < 1e-7) return null; // 平行

    const f = 1 / a;
    const s = ray.origin.sub(tri.v0);
    const u = f * s.dot(h);

    if (u < 0 || u > 1) return null;

    const q = s.cross(tri.edge1);
    const v = f * ray.direction.dot(q);

    if (v < 0 || u + v > 1) return null;

    const t = f * tri.edge2.dot(q);
    if (t < 1e-6) return null;

    // 重心坐标插值法线（平滑着色）
    const w = 1 - u - v;
    const interpolated = tri.n0.mul(w).add(tri.n1.mul(u)).add(tri.n2.mul(v)).normalize();

    return {
      hit: true,
      t,
      point: ray.getPoint(t),
      normal: interpolated,
      faceNormal: tri.faceNormal,
      materialIndex: tri.materialIndex
    };
  }

  /* ==================== Phong 局部光照 ==================== */

  /**
   * Phong 光照模型：I = ambient + diffuse + specular
   * 参考 RayTracer.cs ComputeLocalIlluminationWithNormal()
   */
  private computeLocalIllumination(
    _hit: HitResult,
    mat: RTMaterial,
    viewDir: Vec3,
    shadingNormal: Vec3
  ): Color {
    // 环境光
    let result = this.ambientColor.mul(mat.diffuseColor).mul(this.ambientIntensity);

    // 方向光：漫反射 + 高光
    const NdotL = Math.max(0, shadingNormal.dot(this.lightDir));
    const diffuse = mat.diffuseColor.mul(this.lightColor).mul(this.lightIntensity * NdotL);

    const reflectDir = this.reflect(this.lightDir.negate(), shadingNormal);
    const RdotV = Math.max(0, reflectDir.dot(viewDir.negate()));
    const spec = Math.pow(RdotV, mat.shininess);
    const specular = mat.specularColor.mul(this.lightColor).mul(this.lightIntensity * spec);

    result = result.add(diffuse).add(specular);
    return result;
  }

  /* ==================== 向量运算辅助 ==================== */

  private reflect(incident: Vec3, normal: Vec3): Vec3 {
    const d = incident.dot(normal);
    return incident.sub(normal.mul(2 * d));
  }

  /* ==================== 输出 ==================== */

  private toImageData(): ImageData {
    const w = this.renderWidth, h = this.renderHeight;
    const data = new Uint8ClampedArray(w * h * 4);

    for (let i = 0; i < w * h; i++) {
      // Gamma 校正
      const c = this.pixelBuffer[i]?.toSRGB() ?? Color.black();
      const idx = i * 4;
      data[idx] = Math.round(c.r * 255);
      data[idx + 1] = Math.round(c.g * 255);
      data[idx + 2] = Math.round(c.b * 255);
      data[idx + 3] = 255;
    }

    return new ImageData(data, w, h);
  }

  private yield_(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  getStats(): { rays: number; tests: number } {
    return { rays: this.totalRays, tests: this.intersectionTests };
  }
}
