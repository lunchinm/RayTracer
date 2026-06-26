export interface GameObjectData {
  id: string;
  name: string;
  type: 'sphere' | 'cube' | 'plane' | 'cylinder' | 'capsule';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  materialType: 'diffuse' | 'specular' | 'transparent';
  color: string;
  visible: boolean;
}
