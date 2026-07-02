import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Scene } from '../scene/Scene';
import { GameObjectData } from '../scene/GameObject';

type MeshMapEntry = {
  object3D: THREE.Object3D;
  outlineHelper?: THREE.LineSegments;
};

export class SceneEditor {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene3D: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private gridHelper: THREE.GridHelper;

  private meshMap: Map<string, MeshMapEntry> = new Map();
  private dataScene: Scene;

  // 方向光（供外部实时调节）
  private dirLight!: THREE.DirectionalLight;

  // 坐标方向指示器（3D 渲染，跟随相机旋转，透明背景）
  private axesScene: THREE.Scene;
  private axesCamera: THREE.PerspectiveCamera;
  private vpW = 0;
  private vpH = 0;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, dataScene: Scene) {
    this.container = container;
    this.canvas = canvas;
    this.dataScene = dataScene;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 场景
    this.scene3D = new THREE.Scene();
    this.scene3D.background = new THREE.Color(0xc8ccd4);
    this.scene3D.fog = new THREE.Fog(0xc8ccd4, 20, 60);

    // 相机
    this.camera = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    this.camera.position.set(5, 3, 7);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls - 左键平移, 右键旋转, 中键缩放, 滚轮缩放
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 30;
    this.orbitControls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };

    // Raycaster（点击选择用）
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 100;

    // 网格
    this.gridHelper = new THREE.GridHelper(20, 20, 0x999999, 0xcccccc);
    this.scene3D.add(this.gridHelper);

    // 环境光 + 半球光（天空/地面双色，解决背光面过暗）
    const ambient = new THREE.AmbientLight(0x888899, 0.5);
    this.scene3D.add(ambient);
    const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x445566, 0.4);
    this.scene3D.add(hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.dirLight.position.set(5, 10, 3);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(512, 512);
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 15;
    this.dirLight.shadow.camera.bottom = -15;
    this.scene3D.add(this.dirLight);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene3D.add(ground);

    // 坐标方向指示器（3D 渲染，透明背景，跟随主相机旋转）
    this.axesScene = new THREE.Scene();
    this.axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    this.axesCamera.position.set(0, 0, 2.5);
    this.buildAxesGizmo();

    // 事件
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.setupResize();
    this.resize();
    this.render();

    // 监听场景数据变化 → 同步网格
    this.dataScene.onChange(() => this.syncScene());
  }

  private setupResize(): void {
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    this.vpW = w;
    this.vpH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ==================== 鼠标交互 ==================== */

  getCanvasPoint(event: MouseEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  pickObject(event: MouseEvent): { object: GameObjectData | null; point: THREE.Vector3 | null } {
    const ndc = this.getCanvasPoint(event);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.meshMap.forEach(entry => meshes.push(entry.object3D));
    const intersections = this.raycaster.intersectObjects(meshes, true);
    if (intersections.length > 0) {
      let obj3d = intersections[0].object;
      while (obj3d && !obj3d.userData.objId) obj3d = obj3d.parent!;
      const objId = obj3d?.userData.objId as string | undefined;
      if (objId) {
        const obj = this.dataScene.getObject(objId);
        if (obj) return { object: obj, point: intersections[0].point };
      }
    }
    return { object: null, point: null };
  }

  /* ==================== 键盘 ==================== */

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = this.dataScene.getSelected();
      if (sel && document.activeElement?.tagName !== 'INPUT') {
        this.dataScene.removeObject(sel.id);
      }
    }
  }

  /* ==================== 场景同步 ==================== */

  syncScene(): void {
    const sceneObjIds = new Set(this.dataScene.objects.map(o => o.id));

    // 移除多余的 mesh
    for (const [id] of this.meshMap) {
      if (!sceneObjIds.has(id)) {
        this.removeMesh(id);
      }
    }

    // 添加/更新 mesh
    for (const obj of this.dataScene.objects) {
      this.upsertMesh(obj);
    }
    // 注意：updateSelection() 不再在此调用，改为由 onSelectionChange 触发
    // 避免 Gizmo 拖拽结束后 syncScene 重新 attach 导致物体丢失
  }

  private removeMesh(id: string): void {
    const entry = this.meshMap.get(id);
    if (!entry) return;
    this.scene3D.remove(entry.object3D);
    if (entry.outlineHelper) this.scene3D.remove(entry.outlineHelper);
    this.meshMap.delete(id);
  }

  private upsertMesh(obj: GameObjectData): void {
    let entry = this.meshMap.get(obj.id);
    if (!entry) {
      const object3D = this.createMesh(obj);
      object3D.userData.objId = obj.id;
      this.scene3D.add(object3D);
      entry = { object3D };
      this.meshMap.set(obj.id, entry);
    }
    // 同步变换
    const t = entry.object3D;
    t.position.set(obj.position.x, obj.position.y, obj.position.z);
    t.rotation.set(
      THREE.MathUtils.degToRad(obj.rotation.x),
      THREE.MathUtils.degToRad(obj.rotation.y),
      THREE.MathUtils.degToRad(obj.rotation.z)
    );
    t.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    t.visible = obj.visible;

    // 更新材质外观
    this.updateMeshAppearance(entry.object3D, obj);
  }

  private createMesh(obj: GameObjectData): THREE.Object3D {
    let geometry: THREE.BufferGeometry;
    switch (obj.type) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case 'cube':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(2, 2);
        geometry.rotateX(-Math.PI / 2); // XY→XZ 水平面, 与光追 buildPlane 一致
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 32);
        break;
      case 'capsule':
        geometry = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
        break;
      default:
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
    }
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(obj.color),
      roughness: 0.6,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private updateMeshAppearance(object3D: THREE.Object3D, obj: GameObjectData): void {
    object3D.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.color.set(obj.color);
        switch (obj.materialType) {
          case 'diffuse':
            mat.roughness = 0.6;
            mat.metalness = 0.1;
            mat.transparent = false;
            mat.opacity = 1;
            mat.depthWrite = true;
            mat.side = THREE.FrontSide;
            break;
          case 'specular':
            mat.roughness = 0.05;
            mat.metalness = 0.3;    // 不用 1.0（无 envMap 时纯金属=全黑）
            mat.transparent = false;
            mat.opacity = 1;
            mat.depthWrite = true;
            mat.side = THREE.FrontSide;
            break;
          case 'transparent':
            mat.roughness = 0.1;
            mat.metalness = 0.05;
            mat.transparent = true;
            mat.opacity = 0.4;
            mat.depthWrite = false;      // 不通写深度，让背面可见
            mat.side = THREE.DoubleSide; // 渲染正面+背面
            break;
        }
        mat.needsUpdate = true;
      }
    });
  }

  /* ==================== 坐标指示器 ==================== */

  private buildAxesGizmo(): void {
    const len = 0.7, headLen = 0.18, headW = 0.08;
    const tip = len + headLen; // 0.88

    // X（红）Y（绿）Z（蓝）三色箭头
    this.axesScene.add(new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0),
      tip, 0xff4444, headLen, headW
    ));
    this.axesScene.add(new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0),
      tip, 0x44cc44, headLen, headW
    ));
    this.axesScene.add(new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0),
      tip, 0x4488ff, headLen, headW
    ));

    // 原点白色小球
    this.axesScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    ));

    // XYZ 文字标签（Sprite）
    const labelOffset = 0.15;
    this.axesScene.add(this.makeLabel('X', '#ff4444', new THREE.Vector3( tip + labelOffset, 0, 0)));
    this.axesScene.add(this.makeLabel('Y', '#44cc44', new THREE.Vector3( 0, tip + labelOffset, 0)));
    this.axesScene.add(this.makeLabel('Z', '#4488ff', new THREE.Vector3( 0, 0, tip + labelOffset)));
  }

  private makeLabel(text: string, color: string, position: THREE.Vector3): THREE.Sprite {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = 'bold 72px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.35, 0.35, 1);
    return sprite;
  }

  /* ==================== 渲染循环 ==================== */

  private render = (): void => {
    requestAnimationFrame(this.render);
    this.orbitControls.update();

    // 主场景
    this.renderer.autoClear = true;
    this.renderer.render(this.scene3D, this.camera);

    // 右上角坐标指示器（透明背景，中心圆点始终固定不动）
    if (this.vpW > 0 && this.vpH > 0) {
      const margin = 12;
      const gizmoSize = Math.round(Math.min(this.vpW, this.vpH) * 0.14);
      const x = this.vpW - gizmoSize - margin;
      const y = this.vpH - gizmoSize - margin;

      // axesCamera 绕原点轨道，始终 lookAt 原点 → 中心圆点不动
      const rotQ = this.camera.quaternion;
      this.axesCamera.position.set(0, 0, 2.5).applyQuaternion(rotQ);
      this.axesCamera.up.set(0, 1, 0).applyQuaternion(rotQ);
      this.axesCamera.lookAt(0, 0, 0);

      this.renderer.autoClear = false;
      this.renderer.setViewport(x, y, gizmoSize, gizmoSize);
      this.renderer.setScissor(x, y, gizmoSize, gizmoSize);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.axesScene, this.axesCamera);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.vpW, this.vpH);
    }
  };

  /** 导出相机状态（供光追引擎使用） */
  getCameraState(): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number; aspect: number } {
    // 从 Three.js 相机世界矩阵中提取真正的 up 向量（OrbitControls 会改变相机朝向）
    this.camera.updateMatrixWorld();
    const worldUp = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(new THREE.Vector3(), worldUp, new THREE.Vector3());
    return {
      position: this.camera.position.clone(),
      target: this.orbitControls.target.clone(),
      up: worldUp,
      fov: this.camera.fov,
      aspect: this.camera.aspect
    };
  }

  /** 实时更新方向光朝向（供 UI 滑块调用） */
  setLightDirection(x: number, y: number, z: number): void {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const dist = 12;
    this.dirLight.position.set(x / len * dist, y / len * dist, z / len * dist);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
