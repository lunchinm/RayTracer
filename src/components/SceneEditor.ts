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

  // 坐标方向指示器（CSS 独立叠加层）
  private axesOverlay: HTMLElement;

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

    // 环境光 + 方向光
    const ambient = new THREE.AmbientLight(0x888899, 0.5);
    this.scene3D.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(512, 512);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    this.scene3D.add(dirLight);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene3D.add(ground);

    // 坐标方向指示器（纯 CSS 叠加层，独立于 3D 场景）
    this.axesOverlay = document.createElement('div');
    this.axesOverlay.className = 'axes-overlay';
    this.axesOverlay.innerHTML = `
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow-x" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="#ff4444"/></marker>
          <marker id="arrow-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="#44cc44"/></marker>
          <marker id="arrow-z" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0,0 6,3 0,6" fill="#4488ff"/></marker>
        </defs>
        <!-- 原点 -->
        <circle cx="26" cy="30" r="3" fill="#dddddd" stroke="#999999" stroke-width="0.5"/>
        <!-- X 轴（正右）- 红色 -->
        <line x1="26" y1="30" x2="48" y2="30" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow-x)"/>
        <!-- Y 轴（正上）- 绿色 -->
        <line x1="26" y1="30" x2="26" y2="8" stroke="#44cc44" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow-y)"/>
        <!-- Z 轴（右下=屏幕外）- 蓝色 -->
        <line x1="26" y1="30" x2="14" y2="44" stroke="#4488ff" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow-z)"/>
        <!-- 标签 -->
        <text x="52" y="34" fill="#ff4444" font-size="9" font-weight="bold" font-family="sans-serif">X</text>
        <text x="29" y="11" fill="#44cc44" font-size="9" font-weight="bold" font-family="sans-serif" text-anchor="middle">Y</text>
        <text x="7" y="50" fill="#4488ff" font-size="9" font-weight="bold" font-family="sans-serif">Z</text>
      </svg>`;
    this.container.appendChild(this.axesOverlay);

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
            break;
          case 'specular':
            mat.roughness = 0.05;
            mat.metalness = 1.0;
            mat.transparent = false;
            mat.opacity = 1;
            break;
          case 'transparent':
            mat.roughness = 0.1;
            mat.metalness = 0.05;
            mat.transparent = true;
            mat.opacity = 0.4;
            break;
        }
        mat.needsUpdate = true;
      }
    });
  }

  /* ==================== 渲染循环 ==================== */

  private render = (): void => {
    requestAnimationFrame(this.render);
    this.orbitControls.update();
    this.renderer.render(this.scene3D, this.camera);
  };

  dispose(): void {
    this.renderer.dispose();
  }
}
