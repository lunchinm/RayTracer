import { GameObjectData } from './GameObject';

export class Scene {
  objects: GameObjectData[] = [];
  selectedId: string | null = null;
  private _idCounter = 0;

  private listeners: Array<() => void> = [];
  private selListeners: Array<() => void> = [];

  onChange(cb: () => void) {
    this.listeners.push(cb);
  }

  onSelectionChange(cb: () => void) {
    this.selListeners.push(cb);
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }

  private notifySelection() {
    for (const cb of this.selListeners) cb();
  }

  /** 从快照恢复场景（用于 localStorage 持久化） */
  restoreSnapshot(objects: GameObjectData[], nextId: number): void {
    this.objects = objects;
    this._idCounter = nextId;
    this.selectedId = objects.length > 0 ? objects[objects.length - 1].id : null;
    this.notify();
    if (!this.selectedId) this.notifySelection();
  }

  get idCounter(): number { return this._idCounter; }

  addObject(type: GameObjectData['type'], name?: string): GameObjectData {
    const typeNames: Record<string, string> = {
      sphere: '球体', cube: '立方体', plane: '平面',
      cylinder: '圆柱', capsule: '胶囊体'
    };
    const obj: GameObjectData = {
      id: `obj_${++this._idCounter}`,
      name: name || `${typeNames[type]}_${this._idCounter}`,
      type,
      position: { x: 0, y: type === 'plane' ? -1 : 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      materialType: 'diffuse',
      color: '#8080c0',
      visible: true,
    };
    this.objects.push(obj);
    this.selectedId = obj.id;
    this.notify();
    return obj;
  }

  removeObject(id: string): void {
    const idx = this.objects.findIndex(o => o.id === id);
    if (idx === -1) return;
    this.objects.splice(idx, 1);
    if (this.selectedId === id) {
      this.selectedId = this.objects.length > 0 ? this.objects[this.objects.length - 1].id : null;
    }
    this.notify();
  }

  selectObject(id: string | null): void {
    this.selectedId = id;
    this.notifySelection();
    this.notify();
  }

  getSelected(): GameObjectData | null {
    if (!this.selectedId) return null;
    return this.objects.find(o => o.id === this.selectedId) || null;
  }

  getObject(id: string): GameObjectData | undefined {
    return this.objects.find(o => o.id === id);
  }

  updateTransform(
    id: string,
    pos?: Partial<GameObjectData['position']>,
    rot?: Partial<GameObjectData['rotation']>,
    scl?: Partial<GameObjectData['scale']>
  ): void {
    const obj = this.getObject(id);
    if (!obj) return;
    if (pos) Object.assign(obj.position, pos);
    if (rot) Object.assign(obj.rotation, rot);
    if (scl) Object.assign(obj.scale, scl);
    this.notify();
  }

  updateMaterial(id: string, materialType: GameObjectData['materialType'], color?: string): void {
    const obj = this.getObject(id);
    if (!obj) return;
    obj.materialType = materialType;
    if (color !== undefined) obj.color = color;
    this.notify();
  }

  renameObject(id: string, newName: string): void {
    const obj = this.getObject(id);
    if (!obj) return;
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    obj.name = trimmed;
    this.notify();
  }
}
