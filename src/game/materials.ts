import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { color3 } from './palette';

/**
 * Every material in the scene, cached by colour.
 *
 * A material's identity is its colour and how it takes light, nothing else, so two parts painted the
 * same tone share one material and one draw state. That is what keeps a hundred units built from a
 * handful of boxes cheap to draw.
 */
export interface MaterialLibrary {
  /** A matte surface that takes light and casts shade. The default for anything solid. */
  surface(hex: number): StandardMaterial;
  /** A surface with a little light of its own: accent stripes, lamps, crystal. */
  glowing(hex: number, strength?: number): StandardMaterial;
  /** Flat colour that ignores lighting entirely: markers, health bars, the ground apron. */
  unlit(hex: number, alpha?: number): StandardMaterial;
  dispose(): void;
}

/** Restrained highlights: the field should read as matte, not as polished plastic. */
const SPECULAR = new Color3(0.06, 0.06, 0.06);
const DEFAULT_GLOW = 0.35;

export function createMaterialLibrary(scene: Scene): MaterialLibrary {
  const cache = new Map<string, StandardMaterial>();

  const get = (key: string, build: () => StandardMaterial): StandardMaterial => {
    const existing = cache.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const material = build();
    cache.set(key, material);
    return material;
  };

  return {
    surface(hex) {
      return get(`surface:${hex}`, () => {
        const material = new StandardMaterial(`surface:${hex}`, scene);
        material.diffuseColor = color3(hex);
        material.specularColor = SPECULAR;
        return material;
      });
    },

    glowing(hex, strength = DEFAULT_GLOW) {
      return get(`glow:${hex}:${strength}`, () => {
        const material = new StandardMaterial(`glow:${hex}:${strength}`, scene);
        material.diffuseColor = color3(hex);
        material.emissiveColor = color3(hex).scale(strength);
        material.specularColor = SPECULAR;
        return material;
      });
    },

    unlit(hex, alpha = 1) {
      return get(`unlit:${hex}:${alpha}`, () => {
        const material = new StandardMaterial(`unlit:${hex}:${alpha}`, scene);
        material.disableLighting = true;
        material.diffuseColor = Color3.Black();
        material.emissiveColor = color3(hex);
        material.alpha = alpha;
        return material;
      });
    },

    dispose() {
      for (const material of cache.values()) {
        material.dispose();
      }
      cache.clear();
    },
  };
}
