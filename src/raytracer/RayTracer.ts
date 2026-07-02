/**
 * CPU 光线追踪核心引擎
 * Phase 3: 完整渲染方程（递归反射 + 折射 + Fresnel + Snell + Beer-Lambert）
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

  // 光照参数（需与 index.html 滑块默认值 + SceneEditor.ts DirectionalLight.position 同步）
  private lightDir = new Vec3(0.5, 1.0, 0.3).normalize();
  private lightColor = Color.white();
  private lightIntensity = 1.0;
  private ambientColor = new Color(0.25, 0.25, 0.38);
  private ambientIntensity = 0.3;
  private shadowBias = 0.001; // 阴影偏移防止自交（shadow acne）

  private pixelBuffer: Color[] = [];
  private isRendering = false;
  private totalRays = 0;
  private intersectionTests = 0;

  // 调试：首次光照计算日志
  private debugLitOnce = true;

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

        this.pixelBuffer[y * w + x] = pixelColor.clamp();
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
   * Phase 3: 完整渲染方程 I = I_local + ks * I_reflect + kt * I_refract
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

    // 判断正面/背面 + 着色法线
    const entering = ray.direction.dot(hit.faceNormal) < 0;
    const shadingNormal = entering ? hit.normal : hit.faceNormal.negate();

    // 视角方向（从表面指向相机）
    const viewDir = ray.direction.negate();
    const cosTheta = Math.min(1, Math.max(0, viewDir.dot(shadingNormal)));

    // ========== 1. 局部光照 ==========
    let result = this.computeLocalIllumination(hit, mat, viewDir, shadingNormal);

    // ========== 2. 递归镜面反射 ==========
    if (mat.reflectivity > 0 && depth > 1) {
      let kr = mat.reflectivity;

      // 透明材质：用 Fresnel 混合反射/折射比例
      if (mat.refractivity > 0) {
        const n1 = entering ? 1.0 : mat.ior;
        const n2 = entering ? mat.ior : 1.0;
        kr = mat.reflectivity * this.fresnelSchlick(cosTheta, n1, n2);
      }

      if (kr > 0.001) {
        const reflectDir = this.reflect(ray.direction, shadingNormal);
        const reflectOrigin = hit.point.add(shadingNormal.mul(this.shadowBias));
        const reflectRay = new Ray(reflectOrigin, reflectDir);
        const reflectWeight = weight.mul(mat.specularColor).mul(kr);
        result = result.add(this.traceRay(reflectRay, depth - 1, reflectWeight));
      }
    }

    // ========== 3. 递归折射（含 Snell 定律 + 全反射 + Fresnel + Beer-Lambert） ==========
    if (mat.refractivity > 0 && depth > 1) {
      const n1 = entering ? 1.0 : mat.ior;
      const n2 = entering ? mat.ior : 1.0;
      const F = this.fresnelSchlick(cosTheta, n1, n2);

      // 去除 Fresnel 反射部分后的折射权重
      const kt = mat.refractivity * (1 - F);

      if (kt > 0.001) {
        const refractDir = this.refract(viewDir, shadingNormal, n1 / n2);
        if (refractDir !== null) {
          // 折射起点向内部偏移（避免自交）
          const refractOrigin = hit.point.sub(shadingNormal.mul(this.shadowBias));
          const refractRay = new Ray(refractOrigin, refractDir);
          // Beer-Lambert: 吸收色作为能量权重衰减
          const refractWeight = weight.mul(mat.diffuseColor).mul(kt);
          result = result.add(this.traceRay(refractRay, depth - 1, refractWeight));
        }
        // 全反射：能量已计入反射分支（Fresnel），此处跳过
      }
    }

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

  /* ==================== Phong 局部光照 (含阴影) ==================== */

  /**
   * Phong 光照模型：I = ambient + shadowFactor * (diffuse + specular)
   * 阴影射线：从表面点向光源方向发射，检查是否有遮挡
   */
  private computeLocalIllumination(
    hit: HitResult,
    mat: RTMaterial,
    viewDir: Vec3,
    shadingNormal: Vec3
  ): Color {
    // 环境光（不受阴影影响）
    let result = this.ambientColor.mul(mat.diffuseColor).mul(this.ambientIntensity);

    // 阴影测试：从表面点向光源发射射线
    const inShadow = this.isInShadow(hit.point, shadingNormal);

    if (!inShadow) {
      // 方向光：漫反射 + 高光
      const NdotL = Math.max(0, shadingNormal.dot(this.lightDir));
      const diffuse = mat.diffuseColor.mul(this.lightColor).mul(this.lightIntensity * NdotL);

      const reflectDir = this.reflect(this.lightDir.negate(), shadingNormal);
      const RdotV = Math.max(0, reflectDir.dot(viewDir));
      const spec = Math.pow(RdotV, mat.shininess);
      const specular = mat.specularColor.mul(this.lightColor).mul(this.lightIntensity * spec);

      // 诊断：首次 Phong 计算值
      if (this.debugLitOnce) {
        this.debugLitOnce = false;
        console.log('[RT Debug] Phong 首次命中光照:');
        console.log(`  法线N: (${shadingNormal.x.toFixed(3)}, ${shadingNormal.y.toFixed(3)}, ${shadingNormal.z.toFixed(3)})`);
        console.log(`  光源L: (${this.lightDir.x.toFixed(3)}, ${this.lightDir.y.toFixed(3)}, ${this.lightDir.z.toFixed(3)})`);
        console.log(`  视线V: (${viewDir.x.toFixed(3)}, ${viewDir.y.toFixed(3)}, ${viewDir.z.toFixed(3)})`);
        console.log(`  N·L=${NdotL.toFixed(3)}  反射R=(${reflectDir.x.toFixed(3)}, ${reflectDir.y.toFixed(3)}, ${reflectDir.z.toFixed(3)})  R·V=${RdotV.toFixed(3)}`);
        console.log(`  漫反射=(${diffuse.r.toFixed(2)}, ${diffuse.g.toFixed(2)}, ${diffuse.b.toFixed(2)})  高光spec=${spec.toFixed(4)}`);
      }

      result = result.add(diffuse).add(specular);
    }

    return result;
  }

  /**
   * 阴影射线检测：从表面点沿光源方向发射射线
   * @returns true 如果点处于阴影中（有遮挡物）
   */
  private isInShadow(point: Vec3, normal: Vec3): boolean {
    // 偏移起点防止 self-shadowing（shadow acne）
    const origin = point.add(normal.mul(this.shadowBias));
    const shadowRay = new Ray(origin, this.lightDir);

    this.intersectionTests++;

    for (let i = 0; i < this.triangles.length; i++) {
      const tri = this.triangles[i];
      const result = this.intersectTriangle(shadowRay, tri);
      // 只要存在任何正距离交点，则该点在阴影中
      if (result !== null && result.t > 1e-6) {
        return true;
      }
    }

    return false;
  }

  /* ==================== 向量运算辅助 ==================== */

  private reflect(incident: Vec3, normal: Vec3): Vec3 {
    const d = incident.dot(normal);
    return incident.sub(normal.mul(2 * d));
  }

  /**
   * Snell 定律折射方向 (Vector Form)
   * @param incident - 入射方向 (指向表面，即 -rayDirection)
   * @param normal   - 表面法线 (指向入射介质)
   * @param eta      - n1/n2 (入射介质折射率 / 透射介质折射率)
   * @returns 折射方向，null 表示发生全反射 (TIR)
   */
  private refract(incident: Vec3, normal: Vec3, eta: number): Vec3 | null {
    const cosI = normal.dot(incident);
    const sin2T = eta * eta * (1 - cosI * cosI);
    if (sin2T > 1) return null; // 全反射

    const cosT = Math.sqrt(1 - sin2T);
    // T = eta * I + (eta * cosI - cosT) * N
    return incident.mul(eta).add(normal.mul(eta * cosI - cosT));
  }

  /**
   * Schlick 近似 Fresnel 反射率
   * @param cosTheta - cos(入射角)，clamp 到 [0,1]
   * @param n1 - 入射介质折射率
   * @param n2 - 透射介质折射率
   * @returns Fresnel 反射系数 F (0~1)
   */
  private fresnelSchlick(cosTheta: number, n1: number, n2: number): number {
    let R0 = ((n1 - n2) / (n1 + n2));
    R0 *= R0; // R0 = ((n1-n2)/(n1+n2))²
    return R0 + (1 - R0) * Math.pow(1 - cosTheta, 5);
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
