import { Scene } from './scene/Scene';
import { GameObjectData } from './scene/GameObject';
import { createLogger, Logger } from './utils/Logger';
import { SceneEditor } from './components/SceneEditor';

export class App {
  private scene!: Scene;
  private sceneEditor!: SceneEditor;
  private logger!: Logger;

  // UI 引用
  private elHierarchy!: HTMLElement;
  private elTransform!: HTMLElement;
  private elLog!: HTMLElement;
  private elStatusFps!: HTMLElement;
  private elStatusObjects!: HTMLElement;
  private elStatusMsg!: HTMLElement;

  init(): void {
    this.scene = new Scene();
    this.bindUI();
    this.setupSceneEditor();
    this.setupToolbar();
    this.setupRenderPanel();
    this.setupKeyboard();
    this.setupMaterialDrag();
    this.setupDivider();
    this.setupClickSelection();

    // 初始化场景监听
    this.scene.onChange(() => this.onSceneChanged());
    this.scene.onSelectionChange(() => this.onSelectionChanged());

    // 默认添加几个演示物体
    this.scene.addObject('sphere', '球体_演示');
    const cube = this.scene.addObject('cube', '立方体_演示');
    this.scene.updateTransform(cube.id, { x: -2, y: 0, z: 0 });

    this.logger.info('RayTracer Web 初始化完成');
    this.setStatus('就绪');
  }

  /* ==================== UI 绑定 ==================== */

  private bindUI(): void {
    this.elHierarchy = document.getElementById('hierarchy-list')!;
    this.elTransform = document.getElementById('transform-content')!;
    this.elLog = document.getElementById('log-content')!;
    this.elStatusFps = document.getElementById('status-fps')!;
    this.elStatusObjects = document.getElementById('status-objects')!;
    this.elStatusMsg = document.getElementById('status-message')!;
    this.logger = createLogger(this.elLog);
  }

  private setupSceneEditor(): void {
    const container = document.getElementById('viewport-container')!;
    const canvas = document.getElementById('viewport') as HTMLCanvasElement;
    this.sceneEditor = new SceneEditor(container, canvas, this.scene);
  }

  /* ==================== 工具栏 ==================== */

  private setupToolbar(): void {
    const addBtns: Record<string, () => string> = {
      'btn-add-sphere':    () => this.scene.addObject('sphere').name,
      'btn-add-cube':      () => this.scene.addObject('cube').name,
      'btn-add-plane':     () => this.scene.addObject('plane').name,
      'btn-add-cylinder':  () => this.scene.addObject('cylinder').name,
      'btn-add-capsule':   () => this.scene.addObject('capsule').name,
    };
    for (const [id, fn] of Object.entries(addBtns)) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          const objName = fn();
          this.logger.info(`添加物体: ${objName}`);
          this.setStatus(`已添加 ${objName}`);
        });
      }
    }

    document.getElementById('btn-render')?.addEventListener('click', () => this.startRender());
  }

  /* ==================== 渲染面板设置 ==================== */

  private setupRenderPanel(): void {
    // GPU 提示
    const gpuCheck = document.getElementById('setting-gpu') as HTMLInputElement;
    const gpuHint = document.getElementById('gpu-hint')!;
    if (!(navigator as any).gpu) {
      gpuCheck.disabled = true;
      gpuCheck.checked = false;
      gpuHint.textContent = '(浏览器不支持 WebGPU)';
    }

    // 光照滑块
    const lightIntensity = document.getElementById('light-intensity') as HTMLInputElement;
    const lightIntensityVal = document.getElementById('light-intensity-val')!;
    lightIntensity.addEventListener('input', () => {
      lightIntensityVal.textContent = parseFloat(lightIntensity.value).toFixed(2);
    });

    const ambientIntensity = document.getElementById('ambient-intensity') as HTMLInputElement;
    const ambientIntensityVal = document.getElementById('ambient-intensity-val')!;
    ambientIntensity.addEventListener('input', () => {
      ambientIntensityVal.textContent = parseFloat(ambientIntensity.value).toFixed(2);
    });
  }

  /* ==================== 材质拖拽 ==================== */

  private setupMaterialDrag(): void {
    const items = document.querySelectorAll('.material-item');
    items.forEach(item => {
      const el = item as HTMLElement;
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/plain', el.dataset.material || '');
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
      });
    });

    // 场景层级列表作为拖放目标
    this.elHierarchy.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    this.elHierarchy.addEventListener('drop', (e) => {
      e.preventDefault();
      const materialType = e.dataTransfer!.getData('text/plain') as GameObjectData['materialType'];
      const target = (e.target as HTMLElement).closest('.hierarchy-item');
      if (!target) return;
      const objId = (target as HTMLElement).dataset.id;
      if (!objId || !materialType) return;
      this.scene.updateMaterial(objId, materialType);
      const obj = this.scene.getObject(objId);
      this.logger.info(`材质变更: ${obj?.name} → ${materialType}`);
    });
  }

  /* ==================== 点击选择 ==================== */

  private setupClickSelection(): void {
    const canvas = document.getElementById('viewport') as HTMLCanvasElement;
    let mouseDownPos = { x: 0, y: 0 };
    let mouseDown = false;

    canvas.addEventListener('pointerdown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      mouseDown = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      const moved = Math.sqrt(dx * dx + dy * dy) > 3; // 3px 阈值区分点击/拖拽
      if (!moved && e.button === 0) {
        const result = this.sceneEditor.pickObject(e);
        if (result.object) {
          this.scene.selectObject(result.object.id);
        } else {
          this.scene.selectObject(null);
        }
      }
      mouseDown = false;
    });
  }

  /* ==================== 键盘 ==================== */

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        // 不在输入框中按 R 触发渲染
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          this.startRender();
        }
      }
    });
  }

  /* ==================== 分割线拖拽 ==================== */

  private setupDivider(): void {
    // 统一拖拽状态管理（左右分割线 / 上下分割线互斥）
    let dragTarget: 'vertical' | 'horizontal' | null = null;

    // 左右分割线
    const vdivider = document.getElementById('divider')!;
    const renderPanel = document.getElementById('render-panel')!;

    vdivider.addEventListener('pointerdown', (e) => {
      dragTarget = 'vertical';
      vdivider.setPointerCapture(e.pointerId);
    });

    // 上下分割线
    const hdivider = document.getElementById('hdivider')!;
    const scenePanels = document.getElementById('scene-panels')!;

    hdivider.addEventListener('pointerdown', (e) => {
      dragTarget = 'horizontal';
      hdivider.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragTarget) return;
      if (dragTarget === 'vertical') {
        const main = document.getElementById('main-container')!;
        const rect = main.getBoundingClientRect();
        const newWidth = Math.max(240, Math.min(500, rect.right - e.clientX));
        renderPanel.style.width = `${newWidth}px`;
      } else {
        const main = document.getElementById('main-container')!;
        const mainRect = main.getBoundingClientRect();
        // 面板高度 = 主容器底部 - 鼠标位置
        const newHeight = Math.max(80, Math.min(500, mainRect.bottom - e.clientY));
        scenePanels.style.height = `${newHeight}px`;
        // 触发 ResizeObserver 重新计算 3D 视口
        window.dispatchEvent(new Event('resize'));
      }
    });

    window.addEventListener('pointerup', () => {
      dragTarget = null;
    });
  }

  /* ==================== 场景变化回调 ==================== */

  /**
   * 场景数据变化（增/删/变换）- 仅更新层级和计数，不重建变换面板
   * 变换面板仅在选中对象变化时重建，避免输入被覆盖
   */
  private onSceneChanged(): void {
    this.updateHierarchy();
    this.elStatusObjects.textContent = `物体: ${this.scene.objects.length}`;
  }

  /**
   * 选中对象变化 - 重建变换面板（唯一重建入口）
   */
  private onSelectionChanged(): void {
    this.updateTransformPanel();
  }

  private updateHierarchy(): void {
    this.elHierarchy.innerHTML = '';
    if (this.scene.objects.length === 0) {
      this.elHierarchy.innerHTML = '<div class="empty-hint">场景为空，请添加物体</div>';
      return;
    }
    const typeLabels: Record<string, string> = {
      sphere: '球', cube: '方', plane: '面', cylinder: '柱', capsule: '囊'
    };
    for (const obj of this.scene.objects) {
      const div = document.createElement('div');
      div.className = `hierarchy-item${obj.id === this.scene.selectedId ? ' selected' : ''}`;
      div.dataset.id = obj.id;
      div.innerHTML = `
        <span class="type-icon">[${typeLabels[obj.type] || '?'}]</span>
        <span class="item-name">${obj.name}</span>
        <span class="item-delete" data-delete="${obj.id}">x</span>
      `;
      div.addEventListener('click', (e) => {
        const deleteBtn = (e.target as HTMLElement).closest('.item-delete');
        if (deleteBtn) {
          e.stopPropagation();
          this.scene.removeObject(obj.id);
          this.logger.info(`删除物体: ${obj.name}`);
          return;
        }
        this.scene.selectObject(obj.id);
      });
      this.elHierarchy.appendChild(div);
    }
  }

  private updateTransformPanel(): void {
    const sel = this.scene.getSelected();
    if (!sel) {
      this.elTransform.innerHTML = '<div class="empty-hint">请选中一个物体</div>';
      return;
    }
    this.elTransform.innerHTML = `
      <div class="transform-section">
        <h4>位置 (Position)</h4>
        <div class="transform-row">
          <label>X</label><input type="number" data-field="pos.x" value="${sel.position.x}" step="0.1">
          <label>Y</label><input type="number" data-field="pos.y" value="${sel.position.y}" step="0.1">
          <label>Z</label><input type="number" data-field="pos.z" value="${sel.position.z}" step="0.1">
        </div>
      </div>
      <div class="transform-section">
        <h4>旋转 (Rotation) °</h4>
        <div class="transform-row">
          <label>X</label><input type="number" data-field="rot.x" value="${sel.rotation.x}" step="1">
          <label>Y</label><input type="number" data-field="rot.y" value="${sel.rotation.y}" step="1">
          <label>Z</label><input type="number" data-field="rot.z" value="${sel.rotation.z}" step="1">
        </div>
      </div>
      <div class="transform-section">
        <h4>缩放 (Scale)</h4>
        <div class="transform-row">
          <label>X</label><input type="number" data-field="scl.x" value="${sel.scale.x}" step="0.1" min="0.1">
          <label>Y</label><input type="number" data-field="scl.y" value="${sel.scale.y}" step="0.1" min="0.1">
          <label>Z</label><input type="number" data-field="scl.z" value="${sel.scale.z}" step="0.1" min="0.1">
        </div>
      </div>
      <div class="transform-section">
        <h4>物体颜色</h4>
        <div class="transform-row">
          <input type="color" data-field="color" value="${sel.color}" style="width:100%;height:28px;">
        </div>
      </div>
    `;

    // 绑定输入事件
    this.elTransform.querySelectorAll('input').forEach(inp => {
      const field = (inp as HTMLInputElement).dataset.field!;
      inp.addEventListener('input', () => {
        const val = parseFloat((inp as HTMLInputElement).value) || 0;
        if (field === 'color') {
          this.scene.updateMaterial(sel.id, sel.materialType, (inp as HTMLInputElement).value);
          return;
        }
        const [cat, axis] = field.split('.') as [string, string];
        if (cat === 'pos') this.scene.updateTransform(sel.id, { [axis]: val });
        if (cat === 'rot') this.scene.updateTransform(sel.id, undefined, { [axis]: val });
        if (cat === 'scl') this.scene.updateTransform(sel.id, undefined, undefined, { [axis]: val });
      });
    });
  }

  /* ==================== 渲染触发（Phase 2 实现） ==================== */

  private startRender(): void {
    this.logger.info('渲染功能将在 Phase 2 实现');
    this.setStatus('渲染功能待实现 (Phase 2)');
  }

  /* ==================== 状态栏 ==================== */

  private setStatus(msg: string): void {
    this.elStatusMsg.textContent = msg;
  }
}
