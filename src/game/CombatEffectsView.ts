/**
 * Bounded, low-poly weapon feedback for confirmed combat hits.  It owns only Babylon meshes and
 * elapsed cosmetic time; all legal-target and damage decisions remain in `core/`.
 */
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { COMBAT_EFFECTS_CONFIG, isValidCombatEffectsConfig } from '../config/combatEffects';
import type { AttackerTypeId, CombatEffectWeaponConfig } from '../config/types';
import { BoundedEffectPool, advanceEffectLifetime } from './combatEffectsState';
import type { CombatDeathEffectEvent, CombatEffectEvent, CombatHitEffectEvent } from './combatEffectEvents';
import type { MaterialLibrary } from './materials';
import type { SceneSpace } from './sceneSpace';

interface ProjectileSlot {
  readonly body: Mesh;
  readonly rocketHead: Mesh;
  readonly trail: Mesh;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly direction: Vector3;
  readonly rotation: Quaternion;
  elapsedSeconds: number;
  durationSeconds: number;
  event: CombatHitEffectEvent | null;
}

interface MuzzleSlot {
  readonly mesh: Mesh;
  elapsedSeconds: number;
  durationSeconds: number;
}

interface ImpactSlot {
  readonly flash: Mesh;
  readonly ring: Mesh;
  readonly debris: readonly Mesh[];
  elapsedSeconds: number;
  durationSeconds: number;
  weapon: AttackerTypeId | null;
  readonly debrisDirections: readonly Vector3[];
}

interface TargetFlashSlot {
  readonly mesh: Mesh;
  elapsedSeconds: number;
  targetToken: string | null;
}

interface DeathSlot {
  readonly mesh: Mesh;
  elapsedSeconds: number;
}

const CONFIG = COMBAT_EFFECTS_CONFIG;
const UP = Vector3.Up();
const EFFECT_RENDERING_GROUP = 2;

export class CombatEffectsView {
  private readonly projectiles: ProjectileSlot[];
  private readonly muzzles: MuzzleSlot[];
  private readonly impacts: ImpactSlot[];
  private readonly targetFlashes: TargetFlashSlot[];
  private readonly deaths: DeathSlot[];
  private readonly projectilePool = new BoundedEffectPool(CONFIG.projectilePoolCapacity);
  private readonly muzzlePool = new BoundedEffectPool(CONFIG.muzzlePoolCapacity);
  private readonly impactPool = new BoundedEffectPool(CONFIG.impactPoolCapacity);
  private readonly targetFlashPool = new BoundedEffectPool(CONFIG.targetFlashPoolCapacity);
  private readonly deathPool = new BoundedEffectPool(CONFIG.deathPoolCapacity);

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly materials: MaterialLibrary,
  ) {
    if (!isValidCombatEffectsConfig(CONFIG)) {
      throw new Error('Combat effects configuration is invalid.');
    }
    this.projectiles = this.createProjectiles();
    this.muzzles = this.createMuzzles();
    this.impacts = this.createImpacts();
    this.targetFlashes = this.createTargetFlashes();
    this.deaths = this.createDeaths();
  }

  /** Starts only render-safe events created from a successful core hit. */
  public play(event: CombatEffectEvent): void {
    if (event.kind === 'combat-death') {
      this.startDeath(event);
      return;
    }
    this.startShot(event);
  }

  /** Called only from active match frames: paused matches deliberately do not advance effects. */
  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
    this.updateMuzzles(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateImpacts(deltaSeconds);
    this.updateTargetFlashes(deltaSeconds);
    this.updateDeaths(deltaSeconds);
  }

  /** Disposes every preallocated mesh, including inactive ones, before the scene is discarded. */
  public dispose(): void {
    this.disposeSlots(this.projectiles, (slot) => [slot.body, slot.rocketHead, slot.trail]);
    this.disposeSlots(this.muzzles, (slot) => [slot.mesh]);
    this.disposeSlots(this.impacts, (slot) => [slot.flash, slot.ring, ...slot.debris]);
    this.disposeSlots(this.targetFlashes, (slot) => [slot.mesh]);
    this.disposeSlots(this.deaths, (slot) => [slot.mesh]);
    this.projectilePool.clear();
    this.muzzlePool.clear();
    this.impactPool.clear();
    this.targetFlashPool.clear();
    this.deathPool.clear();
  }

  private startShot(event: CombatHitEffectEvent): void {
    const weapon = CONFIG.weapons[event.weapon];
    this.startMuzzle(event, weapon);
    const index = this.projectilePool.acquire();
    if (index === null) return;

    const slot = this.projectiles[index]!;
    slot.elapsedSeconds = 0;
    slot.durationSeconds = weapon.projectileDurationSeconds;
    slot.event = event;
    slot.from.copyFrom(this.point(event.from, weapon.projectileHeightTiles));
    slot.to.copyFrom(this.point(event.to, weapon.projectileHeightTiles));
    slot.to.subtractToRef(slot.from, slot.direction);
    if (slot.direction.lengthSquared() < 1e-6) {
      slot.direction.copyFromFloats(0, 0, 1);
    } else {
      slot.direction.normalize();
    }
    Quaternion.FromUnitVectorsToRef(UP, slot.direction, slot.rotation);
    this.placeProjectile(slot, weapon, 0);
    slot.body.setEnabled(event.weapon !== 'rocket');
    slot.rocketHead.setEnabled(event.weapon === 'rocket');
    slot.trail.setEnabled(event.weapon === 'rocket');
  }

  private startMuzzle(event: CombatHitEffectEvent, weapon: CombatEffectWeaponConfig): void {
    const index = this.muzzlePool.acquire();
    if (index === null) return;
    const mesh = this.muzzles[index]!.mesh;
    const from = this.point(event.from, weapon.projectileHeightTiles);
    const to = this.point(event.to, weapon.projectileHeightTiles);
    to.subtractToRef(from, to);
    if (to.lengthSquared() > 1e-6) to.normalize();
    from.addInPlace(to.scale(weapon.muzzleDiameterTiles * CONFIG.visual.muzzleOffsetDiameterFraction));
    mesh.position.copyFrom(from);
    mesh.scaling.setAll(weapon.muzzleDiameterTiles);
    mesh.material = this.materials.unlit(weapon.projectileColor, CONFIG.visual.muzzleAlpha);
    mesh.visibility = 1;
    mesh.setEnabled(true);
    const slot = this.muzzles[index]!;
    slot.elapsedSeconds = 0;
    slot.durationSeconds = weapon.muzzleDurationSeconds;
  }

  private placeProjectile(slot: ProjectileSlot, weapon: CombatEffectWeaponConfig, progress: number): void {
    Vector3.LerpToRef(slot.from, slot.to, progress, slot.body.position);
    slot.body.rotationQuaternion = slot.rotation;
    slot.body.scaling.set(weapon.projectileWidthTiles, weapon.projectileLengthTiles, weapon.projectileWidthTiles);
    slot.body.material = this.materials.unlit(weapon.projectileColor, CONFIG.visual.projectileAlpha);
    slot.body.visibility = 1 - progress * CONFIG.visual.projectileArrivalFade;

    slot.rocketHead.position.copyFrom(slot.body.position);
    slot.rocketHead.scaling.setAll(weapon.projectileWidthTiles * CONFIG.visual.rocketHeadDiameterMultiplier);
    slot.rocketHead.material = this.materials.unlit(weapon.projectileColor, 1);
    slot.rocketHead.visibility = 1;

    slot.trail.position.copyFrom(slot.body.position).addInPlaceFromFloats(
      -slot.direction.x * weapon.projectileLengthTiles * CONFIG.visual.rocketTrailOffsetLengthMultiplier,
      -slot.direction.y * weapon.projectileLengthTiles * CONFIG.visual.rocketTrailOffsetLengthMultiplier,
      -slot.direction.z * weapon.projectileLengthTiles * CONFIG.visual.rocketTrailOffsetLengthMultiplier,
    );
    slot.trail.rotationQuaternion = slot.rotation;
    slot.trail.scaling.set(
      weapon.projectileWidthTiles * CONFIG.visual.rocketTrailWidthMultiplier,
      weapon.projectileLengthTiles * CONFIG.visual.rocketTrailLengthMultiplier,
      weapon.projectileWidthTiles * CONFIG.visual.rocketTrailWidthMultiplier,
    );
    slot.trail.material = this.materials.unlit(weapon.trailColor, CONFIG.visual.trailAlpha);
    slot.trail.visibility = 1 - progress * CONFIG.visual.rocketTrailArrivalFade;
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (let index = 0; index < this.projectiles.length; index++) {
      const slot = this.projectiles[index]!;
      if (slot.event === null) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, slot.durationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      this.placeProjectile(slot, CONFIG.weapons[slot.event.weapon], slot.elapsedSeconds / slot.durationSeconds);
      if (!lifetime.expired) continue;
      const event = slot.event;
      this.disable(slot.body, slot.rocketHead, slot.trail);
      slot.event = null;
      this.projectilePool.release(index);
      this.startImpact(event);
    }
  }

  private startImpact(event: CombatHitEffectEvent): void {
    const index = this.impactPool.acquire();
    if (index === null) return;
    const weapon = CONFIG.weapons[event.weapon];
    const slot = this.impacts[index]!;
    const position = this.point(event.to, CONFIG.visual.impactGroundHeightTiles);
    slot.elapsedSeconds = 0;
    slot.durationSeconds = weapon.impactDurationSeconds;
    slot.weapon = event.weapon;
    slot.flash.position.copyFrom(position);
    slot.flash.scaling.setAll(weapon.impactDiameterTiles);
    slot.flash.material = this.materials.unlit(
      event.targetKind === 'building' ? CONFIG.visual.metallicImpactColor : weapon.impactColor,
      CONFIG.visual.impactFlashAlpha,
    );
    slot.flash.visibility = 1;
    slot.flash.setEnabled(true);

    slot.ring.position.copyFrom(position);
    slot.ring.scaling.setAll(Math.max(weapon.ringDiameterTiles, 1e-4));
    slot.ring.material = this.materials.unlit(weapon.trailColor, CONFIG.visual.ringAlpha);
    slot.ring.visibility = CONFIG.visual.ringVisibility;
    slot.ring.setEnabled(weapon.ringDiameterTiles > 0);

    for (let debrisIndex = 0; debrisIndex < slot.debris.length; debrisIndex++) {
      const debris = slot.debris[debrisIndex]!;
      debris.position.copyFrom(position);
      debris.scaling.setAll(weapon.debrisDiameterTiles);
      debris.material = this.materials.unlit(
        event.targetKind === 'building' ? CONFIG.visual.metallicImpactColor : weapon.trailColor,
        CONFIG.visual.debrisAlpha,
      );
      debris.visibility = CONFIG.visual.debrisVisibility;
      debris.setEnabled(true);
    }

    if (!event.targetDestroyed) this.startTargetFlash(event);
  }

  private startTargetFlash(event: CombatHitEffectEvent): void {
    const index = this.targetFlashPool.acquire();
    if (index === null) return;
    const slot = this.targetFlashes[index]!;
    const configured = event.targetKind === 'building'
      ? CONFIG.buildingFlashDiameterTiles
      : CONFIG.unitFlashDiameterTiles;
    slot.elapsedSeconds = 0;
    slot.targetToken = event.targetToken;
    slot.mesh.position.copyFrom(this.point(event.to, event.targetKind === 'building'
      ? CONFIG.visual.buildingFlashHeightTiles
      : CONFIG.visual.unitFlashHeightTiles));
    slot.mesh.scaling.setAll(Math.max(configured, event.targetSizeTiles) * CONFIG.visual.targetFlashDiameterMultiplier);
    slot.mesh.material = this.materials.unlit(
      event.targetKind === 'building' ? CONFIG.visual.metallicImpactColor : CONFIG.visual.targetFlashColor,
      CONFIG.visual.targetFlashAlpha,
    );
    slot.mesh.visibility = CONFIG.visual.targetFlashVisibility;
    slot.mesh.setEnabled(true);
  }

  private startDeath(event: CombatDeathEffectEvent): void {
    this.clearTargetFlashes(event.targetToken);
    const index = this.deathPool.acquire();
    if (index === null) return;
    const slot = this.deaths[index]!;
    slot.elapsedSeconds = 0;
    slot.mesh.position.copyFrom(this.point(event.at, CONFIG.visual.deathHeightTiles));
    slot.mesh.scaling.setAll(1);
    slot.mesh.visibility = CONFIG.visual.deathVisibility;
    slot.mesh.setEnabled(true);
  }

  private updateMuzzles(deltaSeconds: number): void {
    for (let index = 0; index < this.muzzles.length; index++) {
      const slot = this.muzzles[index]!;
      if (!slot.mesh.isEnabled()) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, slot.durationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      slot.mesh.visibility = 1 - slot.elapsedSeconds / slot.durationSeconds;
      if (!lifetime.expired) continue;
      slot.mesh.setEnabled(false);
      this.muzzlePool.release(index);
    }
  }

  private updateImpacts(deltaSeconds: number): void {
    for (let index = 0; index < this.impacts.length; index++) {
      const slot = this.impacts[index]!;
      if (!slot.flash.isEnabled()) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, slot.durationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      const progress = slot.elapsedSeconds / slot.durationSeconds;
      const weapon = slot.weapon === null ? CONFIG.weapons.infantry : CONFIG.weapons[slot.weapon];
      slot.flash.scaling.setAll(weapon.impactDiameterTiles * (1 + progress * CONFIG.visual.impactGrowthAtEnd));
      slot.flash.visibility = 1 - progress;
      slot.ring.scaling.setAll(Math.max(weapon.ringDiameterTiles, 1e-4) * (1 + progress * CONFIG.visual.ringGrowthAtEnd));
      slot.ring.visibility = (1 - progress) * CONFIG.visual.ringVisibility;
      for (let debrisIndex = 0; debrisIndex < slot.debris.length; debrisIndex++) {
        const debris = slot.debris[debrisIndex]!;
        const direction = slot.debrisDirections[debrisIndex]!;
        debris.position.addInPlaceFromFloats(
          direction.x * weapon.debrisTravelTiles * deltaSeconds / slot.durationSeconds,
          direction.y * weapon.debrisTravelTiles * deltaSeconds / slot.durationSeconds,
          direction.z * weapon.debrisTravelTiles * deltaSeconds / slot.durationSeconds,
        );
        debris.visibility = 1 - progress;
      }
      if (!lifetime.expired) continue;
      this.disable(slot.flash, slot.ring, ...slot.debris);
      slot.weapon = null;
      this.impactPool.release(index);
    }
  }

  private updateTargetFlashes(deltaSeconds: number): void {
    for (let index = 0; index < this.targetFlashes.length; index++) {
      const slot = this.targetFlashes[index]!;
      if (!slot.mesh.isEnabled()) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, CONFIG.targetFlashDurationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      slot.mesh.visibility = CONFIG.visual.targetFlashVisibility * (1 - slot.elapsedSeconds / CONFIG.targetFlashDurationSeconds);
      if (!lifetime.expired) continue;
      slot.mesh.setEnabled(false);
      slot.targetToken = null;
      this.targetFlashPool.release(index);
    }
  }

  private updateDeaths(deltaSeconds: number): void {
    for (let index = 0; index < this.deaths.length; index++) {
      const slot = this.deaths[index]!;
      if (!slot.mesh.isEnabled()) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, CONFIG.deathDurationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      const progress = slot.elapsedSeconds / CONFIG.deathDurationSeconds;
      slot.mesh.scaling.setAll(1 + progress * CONFIG.visual.deathGrowthAtEnd);
      slot.mesh.visibility = CONFIG.visual.deathVisibility * (1 - progress);
      if (!lifetime.expired) continue;
      slot.mesh.setEnabled(false);
      this.deathPool.release(index);
    }
  }

  private createProjectiles(): ProjectileSlot[] {
    return Array.from({ length: CONFIG.projectilePoolCapacity }, (_, index) => {
      const body = this.effectMesh(CreateCylinder(`combat:projectile:${index}`, {
        height: 1, diameter: 1, tessellation: CONFIG.lowPolySides,
      }, this.scene));
      const head = this.effectMesh(CreateSphere(`combat:rocketHead:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene));
      const trail = this.effectMesh(CreateCylinder(`combat:rocketTrail:${index}`, {
        height: 1, diameter: 1, tessellation: CONFIG.lowPolySides,
      }, this.scene));
      return {
        body, rocketHead: head, trail,
        from: Vector3.Zero(), to: Vector3.Zero(), direction: Vector3.Forward(), rotation: Quaternion.Identity(),
        elapsedSeconds: 0, durationSeconds: 1, event: null,
      };
    });
  }

  private createMuzzles(): MuzzleSlot[] {
    return Array.from({ length: CONFIG.muzzlePoolCapacity }, (_, index) => ({
      mesh: this.effectMesh(CreateSphere(`combat:muzzle:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene)),
      elapsedSeconds: 0,
      durationSeconds: 1,
    }));
  }

  private createImpacts(): ImpactSlot[] {
    return Array.from({ length: CONFIG.impactPoolCapacity }, (_, index) => {
      const flash = this.effectMesh(CreateSphere(`combat:impact:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene));
      const ring = this.effectMesh(CreateTorus(`combat:impactRing:${index}`, {
        diameter: 1, thickness: CONFIG.visual.ringThicknessTiles, tessellation: CONFIG.lowPolySides * 2,
      }, this.scene));
      ring.rotation.x = Math.PI / 2;
      const debris = Array.from({ length: CONFIG.debrisPerImpact }, (_, debrisIndex) =>
        this.effectMesh(CreateSphere(`combat:debris:${index}:${debrisIndex}`, {
          diameter: 1, segments: CONFIG.lowPolySides,
        }, this.scene)),
      );
      const debrisDirections = debris.map((_, debrisIndex) => {
        const angle = (index * CONFIG.visual.debrisAngleSeedPerSlot +
          debrisIndex * (Math.PI * 2 / CONFIG.debrisPerImpact));
        return new Vector3(
          Math.cos(angle),
          CONFIG.visual.debrisVerticalBase + debrisIndex * CONFIG.visual.debrisVerticalStep,
          Math.sin(angle),
        );
      });
      return { flash, ring, debris, elapsedSeconds: 0, durationSeconds: 1, weapon: null, debrisDirections };
    });
  }

  private createTargetFlashes(): TargetFlashSlot[] {
    return Array.from({ length: CONFIG.targetFlashPoolCapacity }, (_, index) => ({
      mesh: this.effectMesh(CreateSphere(`combat:targetFlash:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene)),
      elapsedSeconds: 0,
      targetToken: null,
    }));
  }

  private createDeaths(): DeathSlot[] {
    return Array.from({ length: CONFIG.deathPoolCapacity }, (_, index) => {
      const mesh = this.effectMesh(CreateTorus(`combat:death:${index}`, {
        diameter: CONFIG.visual.deathDiameterTiles,
        thickness: CONFIG.visual.deathThicknessTiles,
        tessellation: CONFIG.lowPolySides * 2,
      }, this.scene));
      mesh.rotation.x = Math.PI / 2;
      mesh.material = this.materials.unlit(CONFIG.visual.deathColor, CONFIG.visual.deathVisibility);
      return { mesh, elapsedSeconds: 0 };
    });
  }

  private effectMesh(mesh: Mesh): Mesh {
    mesh.isPickable = false;
    mesh.renderingGroupId = EFFECT_RENDERING_GROUP;
    mesh.setEnabled(false);
    return mesh;
  }

  private point(point: { readonly x: number; readonly y: number }, height: number): Vector3 {
    return this.space.point(point, height);
  }

  private disable(...meshes: readonly Mesh[]): void {
    for (const mesh of meshes) mesh.setEnabled(false);
  }

  /** A death event invalidates any earlier unit/building tint instead of leaving a ghost flash. */
  private clearTargetFlashes(targetToken: string): void {
    for (let index = 0; index < this.targetFlashes.length; index++) {
      const slot = this.targetFlashes[index]!;
      if (slot.targetToken !== targetToken || !slot.mesh.isEnabled()) continue;
      slot.mesh.setEnabled(false);
      slot.targetToken = null;
      this.targetFlashPool.release(index);
    }
  }

  private disposeSlots<T>(slots: readonly T[], meshes: (slot: T) => readonly Mesh[]): void {
    for (const slot of slots) for (const mesh of meshes(slot)) mesh.dispose();
  }
}
