import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
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
  private transformControls: TransformControls;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private gridHelper: THREE.GridHelper;

  private meshMap: Map<string, MeshMapEntry> = new Map();
  private dataScene: Scene;

  // 状态
  private isDragging = false;
  private mouseDownPos = new THREE.Vector2();
  private selectionOutline: THREE.LineSegments | null = null;

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

    // OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 30;

    // TransformControls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (e: any) => {
      this.orbitControls.enabled = !(e.target as TransformControls).dragging;
      if (!(e.target as TransformControls).dragging) {
        this.onTransformEnd();
      }
    });
    this.scene3D.add(this.transformControls as unknown as THREE.Object3D);

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 100;
    this.mouse = new THREE.Vector2();

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

    // 事件
    this.setupEvents();
    this.setupResize();
    this.resize();
    this.render();

    // 监听场景变化
    this.dataScene.onChange(() => this.syncScene());
  }

  private setupEvents(): void {
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
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

  private onPointerDown(e: PointerEvent): void {
    this.mouseDownPos.set(e.clientX, e.clientY);
    this.isDragging = false;
  }

  private onPointerMove(_e: PointerEvent): void {
    // 保留扩展
  }

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
    if (e.key === 'w' && !e.ctrlKey) {
      this.transformControls.setMode('translate');
    }
    if (e.key === 'e') {
      this.transformControls.setMode('rotate');
    }
    if (e.key === 'r' && !e.ctrlKey) {
      this.transformControls.setMode('scale');
    }
  }

  /* ==================== 变换结束同步 ==================== */

  private onTransformEnd(): void {
    const sel = this.dataScene.getSelected();
    if (!sel) return;
    const entry = this.meshMap.get(sel.id);
    if (!entry) return;
    const t = entry.object3D;
    this.dataScene.updateTransform(sel.id,
      { x: parseFloat(t.position.x.toFixed(3)), y: parseFloat(t.position.y.toFixed(3)), z: parseFloat(t.position.z.toFixed(3)) },
      { x: parseFloat(THREE.MathUtils.radToDeg(t.rotation.x).toFixed(1)), y: parseFloat(THREE.MathUtils.radToDeg(t.rotation.y).toFixed(1)), z: parseFloat(THREE.MathUtils.radToDeg(t.rotation.z).toFixed(1)) },
      { x: parseFloat(t.scale.x.toFixed(2)), y: parseFloat(t.scale.y.toFixed(2)), z: parseFloat(t.scale.z.toFixed(2)) }
    );
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

    // 选中状态
    this.updateSelection();
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

  private updateSelection(): void {
    // 更新 TransformControls
    const sel = this.dataScene.getSelected();
    if (sel) {
      const entry = this.meshMap.get(sel.id);
      if (entry && this.transformControls.object !== entry.object3D) {
        this.transformControls.attach(entry.object3D);
      }
    } else {
      this.transformControls.detach();
    }
  }

  /* ==================== Transform 模式切换 ==================== */

  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformControls.setMode(mode);
  }

  getTransformMode(): string {
    return this.transformControls.mode;
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
