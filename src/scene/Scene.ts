import { GameObjectData } from './GameObject';

export class Scene {
  objects: GameObjectData[] = [];
  selectedId: string | null = null;
  private idCounter = 0;

  private listeners: Array<() => void> = [];

  onChange(cb: () => void) {
    this.listeners.push(cb);
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }

  addObject(type: GameObjectData['type'], name?: string): GameObjectData {
    const typeNames: Record<string, string> = {
      sphere: '球体', cube: '立方体', plane: '平面',
      cylinder: '圆柱', capsule: '胶囊体'
    };
    const obj: GameObjectData = {
      id: `obj_${++this.idCounter}`,
      name: name || `${typeNames[type]}_${this.idCounter}`,
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
}
