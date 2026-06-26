export interface RenderSettings {
  resolution: string;      // "640x480"
  maxDepth: number;
  aaSamples: number;
  energyThreshold: number;
  useBVH: boolean;
  useGPU: boolean;
  lightColor: string;
  lightIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
}

export function defaultSettings(): RenderSettings {
  return {
    resolution: '640x480',
    maxDepth: 5,
    aaSamples: 4,
    energyThreshold: 0.01,
    useBVH: true,
    useGPU: false,
    lightColor: '#ffffff',
    lightIntensity: 1.0,
    ambientColor: '#404060',
    ambientIntensity: 0.3,
  };
}
