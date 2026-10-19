import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { VEHICLE_EFFECTS_CONFIG, isValidVehicleEffectsConfig } from '../config/vehicleEffects';
import type { VehicleDustProfile } from '../config/types';
import type { MaterialLibrary } from './materials';
import { RecyclingRing, unitHash } from './vehicleEffectsState';

interface Puff {
  readonly mesh: Mesh;
  profile: VehicleDustProfile | null;
  elapsedSeconds: number;
  startY: number;
  /** Drift velocity in tiles per second, fixed at emission. */
  velocityX: number;
  velocityZ: number;
}

const CONFIG = VEHICLE_EFFECTS_CONFIG.dust;
/** Soft ground height a puff is born at, so it reads as kicked up by the wheel or track. */
const GROUND_LIFT_TILES = 0.06;

/**
 * Bounded dust trail pool. Puffs are low-poly spheres that expand, rise a little, drift backwards
 * and fade. The pool is fixed: when it is full the oldest puff is reused, so a long match never
 * allocates. It advances only from `update`, which paused matches do not call.
 */
export class VehicleDustView {
  private readonly puffs: Puff[];
  private readonly ring = new RecyclingRing(CONFIG.poolCapacity);
  private emitted = 0;

  public constructor(scene: Scene, private readonly materials: MaterialLibrary) {
    if (!isValidVehicleEffectsConfig(VEHICLE_EFFECTS_CONFIG)) {
      throw new Error('Vehicle effects configuration is invalid.');
    }
    const source = CreateIcoSphere('vehicle:dust:source', { radius: 0.5, subdivisions: 1, flat: true }, scene);
    source.setEnabled(false);
    this.puffs = Array.from({ length: CONFIG.poolCapacity }, (_, index) => {
      const mesh = source.clone(`vehicle:dust:${index}`);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      return { mesh, profile: null, elapsedSeconds: 0, startY: 0, velocityX: 0, velocityZ: 0 };
    });
    source.dispose();
  }

  /**
   * Starts one puff at a scene position. `backX/backZ` is the unit vector pointing away from the
   * direction of travel; the puff drifts along it with a little deterministic sideways scatter.
   */
  public emit(profile: VehicleDustProfile, x: number, z: number, backX: number, backZ: number): void {
    const puff = this.puffs[this.ring.claim()]!;
    const seed = this.emitted++;
    const scatter = (unitHash(seed) - 0.5) * 2 * profile.scatterShare;
    const speed = profile.driftBackTiles / profile.lifetimeSeconds;
    puff.profile = profile;
    puff.elapsedSeconds = 0;
    puff.startY = GROUND_LIFT_TILES;
    puff.velocityX = (backX - backZ * scatter) * speed;
    puff.velocityZ = (backZ + backX * scatter) * speed;
    puff.mesh.position.set(x, GROUND_LIFT_TILES, z);
    puff.mesh.scaling.setAll(profile.startDiameterTiles);
    puff.mesh.material = this.materials.unlit(profile.color);
    puff.mesh.visibility = profile.peakVisibility;
    puff.mesh.setEnabled(true);
  }

  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const puff of this.puffs) {
      const profile = puff.profile;
      if (profile === null) continue;
      puff.elapsedSeconds += deltaSeconds;
      const progress = puff.elapsedSeconds / profile.lifetimeSeconds;
      if (progress >= 1) {
        puff.profile = null;
        puff.mesh.setEnabled(false);
        continue;
      }
      puff.mesh.position.x += puff.velocityX * deltaSeconds;
      puff.mesh.position.z += puff.velocityZ * deltaSeconds;
      puff.mesh.position.y = puff.startY + profile.riseTiles * progress;
      puff.mesh.scaling.setAll(
        profile.startDiameterTiles + (profile.endDiameterTiles - profile.startDiameterTiles) * progress,
      );
      puff.mesh.visibility = profile.peakVisibility * (1 - progress);
    }
  }

  public dispose(): void {
    for (const puff of this.puffs) puff.mesh.dispose();
    this.puffs.length = 0;
  }
}
