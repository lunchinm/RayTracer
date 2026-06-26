/**
 * 光追相机模型
 * 从 Three.js PerspectiveCamera 同步参数生成世界空间射线
 */
import { Vec3, Ray } from './Geometry';

export class RayCamera {
  /** 世界空间相机位置 */
  position: Vec3;
  /** 世界空间相机前方向（单位向量） */
  forward: Vec3;
  /** 世界空间相机右方向（单位向量） */
  right: Vec3;
  /** 世界空间相机上方向（单位向量） */
  up: Vec3;

  /** 半视口高度（单位距离处） */
  halfHeight: number;
  /** 半视口宽度（单位距离处） */
  halfWidth: number;

  constructor(
    position: Vec3,
    fovDeg: number,
    aspect: number,
    lookAt: Vec3,
    worldUp: Vec3 = new Vec3(0, 1, 0)
  ) {
    this.position = position;
    this.forward = lookAt.sub(position).normalize();
    this.right = this.forward.cross(worldUp).normalize();
    this.up = this.right.cross(this.forward).normalize();

    const fovRad = fovDeg * Math.PI / 180;
    this.halfHeight = Math.tan(fovRad / 2);
    this.halfWidth = this.halfHeight * aspect;
  }

  /**
   * 从视口坐标 (vpX, vpY) ∈ [0,1]² 生成世界空间射线
   * vpY: 0=顶部, 1=底部
   */
  getRay(vpX: number, vpY: number): Ray {
    // 视口平面在 camera 前方 1 单位处
    const px = (vpX - 0.5) * 2 * this.halfWidth;   // -halfWidth ~ +halfWidth
    const py = (0.5 - vpY) * 2 * this.halfHeight;  // +halfHeight ~ -halfHeight

    const dir = this.forward
      .add(this.right.mul(px))
      .add(this.up.mul(py))
      .normalize();

    return new Ray(this.position, dir);
  }
}
