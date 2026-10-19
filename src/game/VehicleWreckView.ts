import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicleEffects';
import type { VehicleEffectTypeId } from '../config/types';
import type { PlayerId } from '../core/ids';
import type { VehicleDeathDescriptor } from './combatEffectEvents';
import type { ModelSpec } from './models/kit';
import type { SceneSpace } from './sceneSpace';
import { RecyclingRing, unitHash, wreckExpired, wreckVisibility } from './vehicleEffectsState';

const CONFIG = VEHICLE_EFFECTS_CONFIG.wreck;

interface WreckSlot {
  holder: TransformNode | null;
  meshes: readonly Mesh[];
  elapsedSeconds: number;
}

/**
 * Scorched, temporary stand-in for a destroyed vehicle. A wreck is a clone of the role's prototype
 * with darkened copies of its materials; it is not pickable, never enters the world or a save, and
 * lives in a small ring, so the oldest is removed when a new one needs the slot. It ages only from
 * `update`, so a paused match keeps it exactly as it is.
 */
export class VehicleWreckView {
  private readonly slots: WreckSlot[] = Array.from({ length: CONFIG.capacity }, () => ({
    holder: null, meshes: [], elapsedSeconds: 0,
  }));
  private readonly ring = new RecyclingRing(CONFIG.capacity);
  private readonly scorched = new Map<Material, Material>();
  private spawned = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly modelFor: (type: VehicleEffectTypeId, owner: PlayerId) => ModelSpec,
  ) {}

  public spawn(at: { readonly x: number; readonly y: number }, vehicle: VehicleDeathDescriptor): void {
    const slot = this.slots[this.ring.claim()]!;
    this.release(slot);
    const seed = this.spawned++;
    const holder = new TransformNode(`vehicle:wreck:${seed}`, this.scene);
    holder.position.set(this.space.sceneX(at.x), 0, this.space.sceneZ(at.y));
    holder.rotation.set(
      (unitHash(seed) - 0.5) * 2 * CONFIG.tiltRadians,
      vehicle.facingRadians,
      (unitHash(seed + 41) - 0.5) * 2 * CONFIG.tiltRadians,
    );

    const mesh = this.modelFor(vehicle.unitType, vehicle.owner).mesh.clone(`vehicle:wreck:${seed}:model`, holder);
    mesh.setEnabled(true);
    const meshes = [mesh, ...mesh.getChildMeshes()].filter((part): part is Mesh => part.getTotalVertices() > 0);
    for (const part of meshes) {
      part.isPickable = false;
      part.receiveShadows = true;
      if (part.material !== null) part.material = this.scorch(part.material);
    }
    const turret = mesh.getDescendants(false).find((node) => node.name.endsWith('TurretPivot'));
    if (turret !== undefined) (turret as TransformNode).rotation.y = (unitHash(seed + 7) - 0.5) * 2 * CONFIG.turretTwistRadians;

    slot.holder = holder;
    slot.meshes = meshes;
    slot.elapsedSeconds = 0;
  }

  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const slot of this.slots) {
      if (slot.holder === null) continue;
      slot.elapsedSeconds += deltaSeconds;
      if (wreckExpired(slot.elapsedSeconds, CONFIG)) {
        this.release(slot);
        continue;
      }
      const visibility = wreckVisibility(slot.elapsedSeconds, CONFIG);
      for (const mesh of slot.meshes) mesh.visibility = visibility;
    }
  }

  public dispose(): void {
    for (const slot of this.slots) this.release(slot);
    for (const [source, copy] of this.scorched) if (copy !== source) copy.dispose();
    this.scorched.clear();
  }

  /** Removes the clone but never the shared prototype geometry or materials it borrowed. */
  private release(slot: WreckSlot): void {
    slot.holder?.dispose(false, false);
    slot.holder = null;
    slot.meshes = [];
  }

  /** One darkened copy per source material, shared by every wreck. */
  private scorch(source: Material): Material {
    const cached = this.scorched.get(source);
    if (cached !== undefined) return cached;
    const copy = source.clone(`${source.name}:scorched`) ?? source;
    if (copy instanceof PBRMaterial) {
      copy.albedoColor = copy.albedoColor.scale(CONFIG.scorchFactor);
      copy.emissiveColor = copy.emissiveColor.scale(0);
    } else if (copy instanceof StandardMaterial) {
      copy.diffuseColor = copy.diffuseColor.scale(CONFIG.scorchFactor);
      copy.emissiveColor = copy.emissiveColor.scale(0);
    }
    this.scorched.set(source, copy);
    return copy;
  }
}
