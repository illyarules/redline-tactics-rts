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
import { VehicleDestructionView } from './VehicleDestructionView';
import type { CombatDeathEffectEvent, CombatEffectEvent, CombatHitEffectEvent } from './combatEffectEvents';
import type { MaterialLibrary } from './materials';
import type { SceneSpace } from './sceneSpace';

interface ProjectileSlot {
  readonly body: Mesh;
  readonly glow: Mesh;
  readonly flame: Mesh;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly direction: Vector3;
  readonly curveSide: Vector3;
  readonly rotation: Quaternion;
  elapsedSeconds: number;
  durationSeconds: number;
  /** Peak of a rocket's lofted flight, in scene units; zero for straight shots. */
  arcHeight: number;
  smokeElapsedSeconds: number;
  /** Time still to wait before this tracer leaves the barrel, for bursts. */
  delaySeconds: number;
  /** Extra tracers of a burst: drawn, but they do not carry the hit's target flash. */
  cosmetic: boolean;
  event: CombatHitEffectEvent | null;
}

/** One puff of rocket smoke: it swells, rises and fades. */
interface SmokeSlot {
  readonly mesh: Mesh;
  elapsedSeconds: number;
  durationSeconds: number;
  startDiameter: number;
  endDiameter: number;
  riseTiles: number;
  peakVisibility: number;
}

interface MuzzleSlot {
  readonly mesh: Mesh;
  readonly rotation: Quaternion;
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
  private readonly smoke: SmokeSlot[];
  private readonly projectilePool = new BoundedEffectPool(CONFIG.projectilePoolCapacity);
  private readonly muzzlePool = new BoundedEffectPool(CONFIG.muzzlePoolCapacity);
  private readonly impactPool = new BoundedEffectPool(CONFIG.impactPoolCapacity);
  private readonly targetFlashPool = new BoundedEffectPool(CONFIG.targetFlashPoolCapacity);
  private readonly deathPool = new BoundedEffectPool(CONFIG.deathPoolCapacity);
  private readonly smokePool = new BoundedEffectPool(CONFIG.smokePoolCapacity);
  private readonly scratchTangent = Vector3.Zero();
  private readonly vehicleDestruction: VehicleDestructionView;

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
    this.smoke = this.createSmoke();
    this.vehicleDestruction = new VehicleDestructionView(scene, space, materials);
  }

  /**
   * Starts only render-safe events created from a successful core hit. `muzzle` is where the
   * shooter's barrel actually ends, when its model has one; otherwise shots start at the unit.
   */
  public play(event: CombatEffectEvent, muzzle: Vector3 | null = null): void {
    if (event.kind === 'combat-death') {
      this.startDeath(event);
      return;
    }
    this.startShot(event, muzzle);
  }

  /** Called only from active match frames: paused matches deliberately do not advance effects. */
  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
    this.updateMuzzles(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateImpacts(deltaSeconds);
    this.updateTargetFlashes(deltaSeconds);
    this.updateDeaths(deltaSeconds);
    this.updateSmoke(deltaSeconds);
    this.vehicleDestruction.update(deltaSeconds);
  }

  /** Disposes every preallocated mesh, including inactive ones, before the scene is discarded. */
  public dispose(): void {
    this.disposeSlots(this.projectiles, (slot) => [slot.body, slot.glow, slot.flame]);
    this.disposeSlots(this.muzzles, (slot) => [slot.mesh]);
    this.disposeSlots(this.impacts, (slot) => [slot.flash, slot.ring, ...slot.debris]);
    this.disposeSlots(this.targetFlashes, (slot) => [slot.mesh]);
    this.disposeSlots(this.deaths, (slot) => [slot.mesh]);
    this.disposeSlots(this.smoke, (slot) => [slot.mesh]);
    this.vehicleDestruction.dispose();
    this.projectilePool.clear();
    this.muzzlePool.clear();
    this.impactPool.clear();
    this.targetFlashPool.clear();
    this.deathPool.clear();
    this.smokePool.clear();
  }

  private startShot(event: CombatHitEffectEvent, muzzle: Vector3 | null): void {
    const weapon = CONFIG.weapons[event.weapon];
    const origin = this.shotOrigin(event, weapon, muzzle);
    this.startMuzzle(event, weapon, origin);
    // One confirmed hit may be drawn as a short burst: the first tracer carries the hit, the rest
    // are staggered, slightly scattered tracers that only add to how heavy the fire looks.
    const count = weapon.burst?.count ?? 1;
    for (let shot = 0; shot < count; shot++) this.launchProjectile(event, weapon, origin, shot);
  }

  private launchProjectile(
    event: CombatHitEffectEvent, weapon: CombatEffectWeaponConfig, origin: Vector3, shot: number,
  ): void {
    const index = this.projectilePool.acquire();
    if (index === null) return;

    const slot = this.projectiles[index]!;
    slot.elapsedSeconds = 0;
    slot.durationSeconds = weapon.projectileDurationSeconds;
    slot.delaySeconds = shot * (weapon.burst?.intervalSeconds ?? 0);
    slot.cosmetic = shot > 0;
    slot.event = event;
    slot.from.copyFrom(origin);
    slot.to.copyFrom(this.point(event.to, weapon.projectileHeightTiles));
    slot.to.subtractToRef(slot.from, slot.direction);
    if (slot.direction.lengthSquared() < 1e-6) {
      slot.direction.copyFromFloats(0, 0, 1);
    } else {
      slot.direction.normalize();
    }
    Vector3.CrossToRef(slot.direction, UP, slot.curveSide);
    if (slot.curveSide.lengthSquared() < 1e-6) {
      slot.curveSide.copyFromFloats(1, 0, 0);
    } else {
      slot.curveSide.normalize();
    }
    if ((event.from.x * 17 + event.from.y * 31 + event.to.x * 13 + event.to.y * 7) % 2 < 1) {
      slot.curveSide.scaleInPlace(-1);
    }
    if (shot > 0 && weapon.burst !== undefined) {
      // Alternate sides, widening with each tracer, so the burst fans out around the aim point.
      const side = shot % 2 === 1 ? 1 : -1;
      slot.to.addInPlace(slot.curveSide.scale(side * Math.ceil(shot / 2) * weapon.burst.spreadTiles));
      slot.to.subtractToRef(slot.from, slot.direction).normalize();
    }
    Quaternion.FromUnitVectorsToRef(UP, slot.direction, slot.rotation);
    const rocket = event.weapon === 'rocket';
    slot.arcHeight = rocket
      ? Math.min(CONFIG.rocket.maxArcHeightTiles, Vector3.Distance(slot.from, slot.to) * CONFIG.rocket.arcHeightShare)
      : 0;
    slot.smokeElapsedSeconds = 0;
    this.placeProjectile(slot, weapon, 0);
    if (rocket) this.startLaunchSmoke(slot);
    // A delayed tracer stays hidden until its turn comes.
    slot.body.setEnabled(slot.delaySeconds <= 0);
    slot.glow.setEnabled(rocket);
    slot.flame.setEnabled(rocket);
  }

  /** Where a shot leaves: the barrel when the model has one, else the unit, nudged out to the tubes for rockets. */
  private shotOrigin(event: CombatHitEffectEvent, weapon: CombatEffectWeaponConfig, muzzle: Vector3 | null): Vector3 {
    const origin = muzzle?.clone() ?? this.point(event.from, weapon.projectileHeightTiles);
    if (event.weapon !== 'rocket' || muzzle !== null) return origin;
    const toward = this.point(event.to, weapon.projectileHeightTiles).subtractInPlace(origin);
    toward.y = 0;
    if (toward.lengthSquared() > 1e-6) origin.addInPlace(toward.normalize().scaleInPlace(CONFIG.rocket.launchOffsetTiles));
    return origin;
  }

  private startMuzzle(event: CombatHitEffectEvent, weapon: CombatEffectWeaponConfig, muzzle: Vector3): void {
    const index = this.muzzlePool.acquire();
    if (index === null) return;
    const mesh = this.muzzles[index]!.mesh;
    const from = muzzle.clone();
    const to = this.point(event.to, weapon.projectileHeightTiles);
    to.subtractToRef(from, to);
    if (to.lengthSquared() > 1e-6) to.normalize();
    const lengthMultiplier = weapon.muzzleLengthMultiplier ?? 1;
    from.addInPlace(to.scale(weapon.muzzleDiameterTiles * lengthMultiplier * CONFIG.visual.muzzleOffsetDiameterFraction));
    mesh.position.copyFrom(from);
    if (lengthMultiplier === 1) {
      mesh.scaling.setAll(weapon.muzzleDiameterTiles);
    } else {
      // A directional burst: the sphere is stretched along its local Y, which is turned to the line of fire.
      mesh.scaling.set(weapon.muzzleDiameterTiles, weapon.muzzleDiameterTiles * lengthMultiplier, weapon.muzzleDiameterTiles);
      Quaternion.FromUnitVectorsToRef(UP, to.lengthSquared() > 1e-6 ? to : Vector3.Forward(), this.muzzles[index]!.rotation);
      mesh.rotationQuaternion = this.muzzles[index]!.rotation;
    }
    mesh.material = this.materials.unlit(weapon.projectileColor, CONFIG.visual.muzzleAlpha);
    mesh.visibility = 1;
    mesh.setEnabled(true);
    const slot = this.muzzles[index]!;
    slot.elapsedSeconds = 0;
    slot.durationSeconds = weapon.muzzleDurationSeconds;
  }

  private placeProjectile(slot: ProjectileSlot, weapon: CombatEffectWeaponConfig, progress: number): void {
    if (slot.event?.weapon === 'rocket') {
      this.placeRocket(slot, weapon, progress);
      return;
    }
    Vector3.LerpToRef(slot.from, slot.to, progress, slot.body.position);
    if (slot.event?.weapon === 'fpvOperators') {
      const arc = Math.sin(Math.PI * progress);
      const weave = Math.sin(Math.PI * 2 * progress);
      slot.body.position.addInPlace(slot.curveSide.scale(arc * 0.65 + weave * 0.16));
      slot.body.position.y += arc * 0.42;

      const tangent = slot.to.subtract(slot.from).addInPlace(slot.curveSide.scale(
        Math.PI * 0.65 * Math.cos(Math.PI * progress) +
        Math.PI * 2 * 0.16 * Math.cos(Math.PI * 2 * progress),
      ));
      tangent.y += Math.PI * 0.42 * Math.cos(Math.PI * progress);
      tangent.normalize();
      Quaternion.FromUnitVectorsToRef(UP, tangent, slot.rotation);
    }
    slot.body.rotationQuaternion = slot.rotation;
    slot.body.scaling.set(weapon.projectileWidthTiles, weapon.projectileLengthTiles, weapon.projectileWidthTiles);
    slot.body.material = this.materials.unlit(weapon.projectileColor, CONFIG.visual.projectileAlpha);
    slot.body.visibility = 1 - progress * CONFIG.visual.projectileArrivalFade;
  }

  /** A lofted missile: a pale body along its flight path, a flickering flame cone and a hot glow at the tail. */
  private placeRocket(slot: ProjectileSlot, weapon: CombatEffectWeaponConfig, progress: number): void {
    const tangent = this.scratchTangent;
    Vector3.LerpToRef(slot.from, slot.to, progress, slot.body.position);
    slot.body.position.y += Math.sin(Math.PI * progress) * slot.arcHeight;
    slot.to.subtractToRef(slot.from, tangent);
    tangent.y += Math.PI * slot.arcHeight * Math.cos(Math.PI * progress);
    tangent.normalize();
    Quaternion.FromUnitVectorsToRef(UP, tangent, slot.rotation);

    const width = weapon.projectileWidthTiles;
    const length = weapon.projectileLengthTiles;
    slot.body.rotationQuaternion = slot.rotation;
    slot.body.scaling.set(width, length, width);
    slot.body.material = this.materials.unlit(weapon.projectileColor, 1);
    slot.body.visibility = 1;

    // The exhaust shimmers with flight time rather than randomness, so replays look the same.
    const flicker = 0.85 + 0.3 * Math.abs(Math.sin(progress * 90));
    const flameLength = CONFIG.rocket.flameLengthTiles * flicker;
    slot.glow.position.copyFrom(slot.body.position).subtractInPlace(tangent.scale(length * 0.5));
    slot.glow.scaling.setAll(width * 1.6);
    slot.glow.material = this.materials.unlit(CONFIG.rocket.glowColor, 1);
    slot.glow.visibility = 1;

    slot.flame.position.copyFrom(slot.body.position).subtractInPlace(tangent.scale(length * 0.5 + flameLength * 0.5));
    slot.flame.rotationQuaternion = slot.rotation;
    slot.flame.scaling.set(width * 1.1, flameLength, width * 1.1);
    slot.flame.material = this.materials.unlit(weapon.trailColor, CONFIG.visual.trailAlpha);
    slot.flame.visibility = 1;
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (let index = 0; index < this.projectiles.length; index++) {
      const slot = this.projectiles[index]!;
      if (slot.event === null) continue;
      if (slot.delaySeconds > 0) {
        slot.delaySeconds -= deltaSeconds;
        if (slot.delaySeconds > 0) continue;
        slot.delaySeconds = 0;
        slot.body.setEnabled(true);
        this.startMuzzle(slot.event, CONFIG.weapons[slot.event.weapon], slot.from);
      }
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, slot.durationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      this.placeProjectile(slot, CONFIG.weapons[slot.event.weapon], slot.elapsedSeconds / slot.durationSeconds);
      if (slot.event.weapon === 'rocket') this.emitRocketTrail(slot, deltaSeconds);
      if (!lifetime.expired) continue;
      const event = slot.event;
      const cosmetic = slot.cosmetic;
      this.disable(slot.body, slot.glow, slot.flame);
      slot.event = null;
      this.projectilePool.release(index);
      this.startImpact(event, cosmetic);
      if (event.weapon === 'rocket') this.startImpactSmoke(event);
    }
  }

  private startImpact(event: CombatHitEffectEvent, cosmetic = false): void {
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

    if (!event.targetDestroyed && !cosmetic) this.startTargetFlash(event);
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
    if (event.vehicle !== undefined) {
      this.vehicleDestruction.start(event);
      return;
    }
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

  /** A thin plume left along the flight path, from the missile's tail. */
  private emitRocketTrail(slot: ProjectileSlot, deltaSeconds: number): void {
    const rocket = CONFIG.rocket;
    slot.smokeElapsedSeconds += deltaSeconds;
    // At most three puffs a frame, so a long frame cannot spend the whole pool at once.
    for (let emitted = 0; slot.smokeElapsedSeconds >= rocket.smokeIntervalSeconds && emitted < 3; emitted++) {
      slot.smokeElapsedSeconds -= rocket.smokeIntervalSeconds;
      this.spawnSmoke(
        slot.glow.position, rocket.smokeStartDiameterTiles, rocket.smokeEndDiameterTiles,
        rocket.smokeLifetimeSeconds, rocket.smokeRiseTiles, rocket.smokeColor,
      );
    }
    if (slot.smokeElapsedSeconds > rocket.smokeIntervalSeconds) slot.smokeElapsedSeconds = 0;
  }

  /** Back-blast: a cluster of puffs billowing behind the tubes. */
  private startLaunchSmoke(slot: ProjectileSlot): void {
    const rocket = CONFIG.rocket;
    for (let puff = 0; puff < rocket.launchSmokeCount; puff++) {
      const back = (puff + 1) * 0.1;
      const side = (puff % 2 === 0 ? 1 : -1) * 0.05 * puff;
      this.scratchTangent.copyFromFloats(
        slot.from.x - slot.direction.x * back - slot.direction.z * side,
        slot.from.y - 0.05 * puff,
        slot.from.z - slot.direction.z * back + slot.direction.x * side,
      );
      this.spawnSmoke(
        this.scratchTangent, rocket.launchSmokeDiameterTiles, rocket.launchSmokeEndDiameterTiles,
        rocket.smokeLifetimeSeconds + puff * 0.1, rocket.smokeRiseTiles, rocket.smokeColor,
      );
    }
  }

  /** Dark smoke climbing from the point of impact. */
  private startImpactSmoke(event: CombatHitEffectEvent): void {
    const rocket = CONFIG.rocket;
    const at = this.point(event.to, CONFIG.visual.impactGroundHeightTiles);
    for (let puff = 0; puff < rocket.impactSmokeCount; puff++) {
      const angle = puff * (Math.PI * 2 / rocket.impactSmokeCount) + 0.6;
      this.scratchTangent.copyFromFloats(at.x + Math.cos(angle) * 0.18, at.y, at.z + Math.sin(angle) * 0.18);
      this.spawnSmoke(
        this.scratchTangent, rocket.impactSmokeDiameterTiles, rocket.impactSmokeEndDiameterTiles,
        rocket.impactSmokeLifetimeSeconds + puff * 0.12, rocket.impactSmokeRiseTiles, rocket.smokeDarkColor,
      );
    }
  }

  private spawnSmoke(
    at: Vector3, startDiameter: number, endDiameter: number, lifetime: number, riseTiles: number, color: number,
  ): void {
    const index = this.smokePool.acquire();
    if (index === null) return;
    const slot = this.smoke[index]!;
    slot.elapsedSeconds = 0;
    slot.durationSeconds = lifetime;
    slot.startDiameter = startDiameter;
    slot.endDiameter = endDiameter;
    slot.riseTiles = riseTiles;
    slot.peakVisibility = CONFIG.rocket.smokePeakVisibility;
    slot.mesh.position.copyFrom(at);
    slot.mesh.scaling.setAll(startDiameter);
    slot.mesh.material = this.materials.unlit(color, 1);
    slot.mesh.visibility = slot.peakVisibility;
    slot.mesh.setEnabled(true);
  }

  private updateSmoke(deltaSeconds: number): void {
    for (let index = 0; index < this.smoke.length; index++) {
      const slot = this.smoke[index]!;
      if (!slot.mesh.isEnabled()) continue;
      const lifetime = advanceEffectLifetime(slot.elapsedSeconds, slot.durationSeconds, deltaSeconds);
      slot.elapsedSeconds = lifetime.elapsedSeconds;
      const progress = slot.elapsedSeconds / slot.durationSeconds;
      slot.mesh.scaling.setAll(slot.startDiameter + (slot.endDiameter - slot.startDiameter) * progress);
      slot.mesh.position.y += slot.riseTiles * deltaSeconds / slot.durationSeconds;
      slot.mesh.visibility = slot.peakVisibility * (1 - progress) * (1 - progress);
      if (!lifetime.expired) continue;
      slot.mesh.setEnabled(false);
      this.smokePool.release(index);
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
      const head = this.effectMesh(CreateSphere(`combat:rocketGlow:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene));
      const flame = this.effectMesh(CreateCylinder(`combat:rocketFlame:${index}`, {
        // A cone whose wide end sits at the missile's tail and whose point trails behind.
        height: 1, diameterTop: 1, diameterBottom: 0, tessellation: CONFIG.lowPolySides,
      }, this.scene));
      return {
        body, glow: head, flame,
        from: Vector3.Zero(), to: Vector3.Zero(), direction: Vector3.Forward(), curveSide: Vector3.Right(),
        rotation: Quaternion.Identity(),
        elapsedSeconds: 0, durationSeconds: 1, arcHeight: 0, smokeElapsedSeconds: 0, delaySeconds: 0, cosmetic: false, event: null,
      };
    });
  }

  private createMuzzles(): MuzzleSlot[] {
    return Array.from({ length: CONFIG.muzzlePoolCapacity }, (_, index) => ({
      mesh: this.effectMesh(CreateSphere(`combat:muzzle:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene)),
      rotation: Quaternion.Identity(),
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

  private createSmoke(): SmokeSlot[] {
    return Array.from({ length: CONFIG.smokePoolCapacity }, (_, index) => ({
      mesh: this.effectMesh(CreateSphere(`combat:smoke:${index}`, {
        diameter: 1, segments: CONFIG.lowPolySides,
      }, this.scene)),
      elapsedSeconds: 0, durationSeconds: 1, startDiameter: 1, endDiameter: 1, riseTiles: 0, peakVisibility: 1,
    }));
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
