/**
 * 光追材质定义
 * 参考 Assets/Scripts/RayTracingMaterial.cs
 */
import { Color } from './Geometry';

export interface RTMaterial {
  diffuseColor: Color;
  specularColor: Color;
  shininess: number;       // Phong 高光指数 (1~256)
  reflectivity: number;    // ks (0~1)
  refractivity: number;    // kt (0~1)
  ior: number;             // 折射率 (1.0=空气)
  absorptionColor: Color;  // Beer-Lambert 介质吸收色
}

/** 默认漫反射材质（灰色） */
export function defaultMaterial(): RTMaterial {
  return {
    diffuseColor: new Color(0.6, 0.6, 0.6),
    specularColor: Color.white(),
    shininess: 8,
    reflectivity: 0,
    refractivity: 0,
    ior: 1,
    absorptionColor: Color.white()
  };
}

/** 从 GameObject 材质类型创建 RTMaterial */
export function createMaterial(
  materialType: 'diffuse' | 'specular' | 'transparent',
  colorHex: string
): RTMaterial {
  const diffColor = Color.fromHex(colorHex);
  switch (materialType) {
    case 'diffuse':
      return {
        diffuseColor: diffColor,
        specularColor: Color.white(),
        shininess: 8,
        reflectivity: 0,
        refractivity: 0,
        ior: 1,
        absorptionColor: Color.white()
      };
    case 'specular':
      return {
        diffuseColor: diffColor,
        specularColor: Color.white(),
        shininess: 128,
        reflectivity: 0.95,
        refractivity: 0,
        ior: 1,
        absorptionColor: Color.white()
      };
    case 'transparent':
      return {
        diffuseColor: diffColor,
        specularColor: Color.white(),
        shininess: 64,
        reflectivity: 0.1,   // Fresnel 会动态调整
        refractivity: 0.9,
        ior: 1.5,
        absorptionColor: new Color(0.98, 0.98, 0.98)
      };
  }
}
