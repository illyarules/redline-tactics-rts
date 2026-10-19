import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { VEHICLE_EFFECTS_CONFIG, isValidVehicleEffectsConfig } from '../config/vehicleEffects';
import type { CombatDeathEffectEvent } from './combatEffectEvents';
import type { MaterialLibrary } from './materials';
import type { SceneSpace } from './sceneSpace';
import {
  RecyclingRing, destructionDurationSeconds, destructionScale, stageProgress, unitHash,
} from './vehicleEffectsState';

/** Glow layers draw over everything, like the other combat flashes; smoke, fire and rubble sit in the world. */
const GLOW_RENDERING_GROUP = 2;
const GROUND_LIFT_TILES = 0.05;
/** Where the blast is centred above the ground, as a share of the effect scale. */
const BLAST_HEIGHT_TILES = 0.3;

const CONFIG = VEHICLE_EFFECTS_CONFIG.destruction;
const TOTAL_SECONDS = destructionDurationSeconds(CONFIG);

interface Fragment {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
  readonly spin: Vector3;
}

interface Particle {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
}

interface DestructionSlot {
  readonly root: TransformNode;
  readonly flash: Mesh;
  readonly wave: Mesh;
  readonly sparks: readonly Particle[];
  readonly fragments: readonly Fragment[];
  readonly fire: readonly Particle[];
  readonly smoke: readonly Particle[];
  readonly origin: Vector3;
  active: boolean;
  elapsedSeconds: number;
  scale: number;
}

/**
 * Layered vehicle explosion: flash, ground shockwave, sparks, fragments, a fire burst and rising
 * smoke. Every mesh is preallocated in a fixed ring of slots, so repeated kills reuse the oldest
 * slot instead of allocating. It advances only from `update`, so pausing freezes every stage.
 */
export class VehicleDestructionView {
  private readonly slots: DestructionSlot[];
  private readonly ring = new RecyclingRing(CONFIG.poolCapacity);
  private started = 0;
  private readonly sources: Mesh[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly materials: MaterialLibrary,
  ) {
    if (!isValidVehicleEffectsConfig(VEHICLE_EFFECTS_CONFIG)) {
      throw new Error('Vehicle effects configuration is invalid.');
    }
    const ball = this.source(CreateIcoSphere('vehicle:destruction:ball', { radius: 0.5, subdivisions: 1, flat: true }, scene));
    const chunk = this.source(CreateBox('vehicle:destruction:chunk', { size: 1 }, scene));
    const ring = this.source(CreateTorus('vehicle:destruction:wave', {
      diameter: 1, thickness: CONFIG.shockwave.thicknessTiles, tessellation: 16,
    }, scene));
    this.slots = Array.from({ length: CONFIG.poolCapacity }, (_, index) => this.createSlot(index, ball, chunk, ring));
    for (const source of this.sources) source.dispose();
    this.sources.length = 0;
  }

  /** Begins a destruction at the event's position, scaled by the destroyed vehicle's size. */
  public start(event: CombatDeathEffectEvent): void {
    if (event.vehicle === undefined) return;
    const slot = this.slots[this.ring.claim()]!;
    const seed = this.started++;
    slot.active = true;
    slot.elapsedSeconds = 0;
    slot.scale = destructionScale(event.vehicle.sizeTiles, CONFIG);
    slot.origin.copyFrom(this.space.point(event.at, 0));
    slot.root.setEnabled(true);
    this.arm(slot, seed);
    this.apply(slot);
  }

  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.elapsedSeconds += deltaSeconds;
      if (slot.elapsedSeconds >= TOTAL_SECONDS) {
        slot.active = false;
        slot.root.setEnabled(false);
        continue;
      }
      this.apply(slot);
    }
  }

  public dispose(): void {
    for (const slot of this.slots) slot.root.dispose(false, false);
    this.slots.length = 0;
  }

  /** Assigns this kill's deterministic directions and speeds, and the layers' materials. */
  private arm(slot: DestructionSlot, seed: number): void {
    const { sparks, fragments, fire, smoke, flash, shockwave } = CONFIG;
    slot.flash.material = this.materials.unlit(flash.color);
    slot.wave.material = this.materials.unlit(shockwave.color);
    slot.sparks.forEach((spark, index) => {
      const angle = (index / slot.sparks.length + unitHash(seed * 7 + index)) * Math.PI * 2;
      const lift = 0.9 + unitHash(seed * 11 + index) * 1.2;
      spark.velocity.set(Math.sin(angle), lift, Math.cos(angle)).scaleInPlace(sparks.speedTilesPerSecond * slot.scale * (0.6 + unitHash(index + seed) * 0.6));
      spark.mesh.material = this.materials.unlit(sparks.color);
    });
    slot.fragments.forEach((fragment, index) => {
      const angle = (index / slot.fragments.length + unitHash(seed * 5 + index) * 0.4) * Math.PI * 2;
      const lift = 1.6 + unitHash(seed * 13 + index) * 1.4;
      fragment.velocity.set(Math.sin(angle), lift, Math.cos(angle)).scaleInPlace(fragments.speedTilesPerSecond * slot.scale * (0.55 + unitHash(index * 3 + seed) * 0.5));
      fragment.spin.set(unitHash(seed + index * 2) - 0.5, unitHash(seed * 3 + index) - 0.5, unitHash(seed * 9 + index) - 0.5)
        .scaleInPlace(fragments.spinRadiansPerSecond * 2);
      fragment.mesh.material = this.materials.surface(fragments.color);
    });
    slot.fire.forEach((flame, index) => {
      const angle = (index / slot.fire.length + unitHash(seed + index * 17)) * Math.PI * 2;
      flame.velocity.set(Math.sin(angle), 0, Math.cos(angle)).scaleInPlace(fire.spreadTiles * slot.scale * (0.4 + unitHash(index + seed * 2) * 0.6));
      flame.mesh.material = this.materials.unlit(fire.colors[index % 2]!);
    });
    slot.smoke.forEach((puff, index) => {
      const angle = (index / slot.smoke.length + unitHash(seed * 19 + index) * 0.3) * Math.PI * 2;
      puff.velocity.set(Math.sin(angle), 0, Math.cos(angle)).scaleInPlace(smoke.driftTiles * slot.scale * (0.3 + unitHash(index * 5 + seed) * 0.7));
      puff.mesh.material = this.materials.unlit(smoke.color);
    });
  }

  // eslint-disable-next-line complexity -- One timeline places every layer of the explosion in turn.
  private apply(slot: DestructionSlot): void {
    const t = slot.elapsedSeconds;
    const s = slot.scale;
    const { flash, shockwave, sparks, fragments, fire, smoke } = CONFIG;
    const { x, z } = slot.origin;

    const flashP = stageProgress(t, 0, flash.durationSeconds);
    slot.flash.setEnabled(flashP < 1);
    slot.flash.position.set(x, BLAST_HEIGHT_TILES * s, z);
    slot.flash.scaling.setAll(flash.diameterTiles * s * (1 + flash.growth * flashP));
    slot.flash.visibility = 1 - flashP;

    const waveP = stageProgress(t, 0, shockwave.durationSeconds);
    slot.wave.setEnabled(waveP < 1);
    slot.wave.position.set(x, GROUND_LIFT_TILES, z);
    const waveDiameter = (shockwave.diameterTiles + (shockwave.endDiameterTiles - shockwave.diameterTiles) * (1 - (1 - waveP) * (1 - waveP))) * s;
    slot.wave.scaling.set(waveDiameter, 1, waveDiameter);
    slot.wave.visibility = shockwave.visibility * (1 - waveP);

    const sparkP = stageProgress(t, 0, sparks.durationSeconds);
    for (const spark of slot.sparks) {
      spark.mesh.setEnabled(sparkP < 1);
      this.ballistic(spark.mesh, slot.origin, spark.velocity, sparks.gravityTilesPerSecondSquared * s, t, BLAST_HEIGHT_TILES * s, sparks.diameterTiles * s / 2);
      spark.mesh.scaling.setAll(sparks.diameterTiles * s);
      spark.mesh.visibility = 1 - sparkP;
    }

    const fragP = stageProgress(t, 0, fragments.durationSeconds);
    const fadeP = stageProgress(fragP, 1 - fragments.fadeShare, fragments.fadeShare);
    for (const fragment of slot.fragments) {
      fragment.mesh.setEnabled(fragP < 1);
      const size = fragments.sizeTiles * s;
      const flight = this.ballistic(fragment.mesh, slot.origin, fragment.velocity, fragments.gravityTilesPerSecondSquared * s, t, BLAST_HEIGHT_TILES * s, size / 2);
      fragment.mesh.scaling.setAll(size);
      fragment.mesh.visibility = 1 - fadeP;
      // Tumbling is a function of airtime, so it stops when the fragment lands and only fades after.
      fragment.mesh.rotation.set(fragment.spin.x * flight, fragment.spin.y * flight, fragment.spin.z * flight);
    }

    const fireP = stageProgress(t, 0, fire.durationSeconds);
    for (const flame of slot.fire) {
      flame.mesh.setEnabled(fireP < 1);
      const swell = Math.sin(Math.PI * Math.min(1, fireP * 0.9 + 0.1));
      flame.mesh.position.set(
        x + flame.velocity.x * fireP,
        GROUND_LIFT_TILES + fire.riseTiles * s * fireP * (2 - fireP) * 0.5 + 0.12 * s,
        z + flame.velocity.z * fireP,
      );
      flame.mesh.scaling.setAll(fire.diameterTiles * s * (0.35 + swell * 0.65));
      flame.mesh.visibility = fire.peakVisibility * (1 - fireP * fireP);
    }

    const smokeP = stageProgress(t, smoke.startDelaySeconds, smoke.durationSeconds);
    const fadeIn = Math.min(1, smokeP / 0.12);
    for (const puff of slot.smoke) {
      const live = t >= smoke.startDelaySeconds && smokeP < 1;
      puff.mesh.setEnabled(live);
      if (!live) continue;
      puff.mesh.position.set(
        x + puff.velocity.x * smokeP,
        0.2 * s + smoke.riseTiles * s * smokeP * (2 - smokeP) * 0.5,
        z + puff.velocity.z * smokeP,
      );
      puff.mesh.scaling.setAll((smoke.startDiameterTiles + (smoke.endDiameterTiles - smoke.startDiameterTiles) * smokeP) * s);
      puff.mesh.visibility = smoke.peakVisibility * fadeIn * (1 - smokeP);
    }
  }

  /**
   * Writes `origin + velocity·t` with gravity, resting on the ground at `floorY` once it lands.
   * Returns the time spent in the air.
   */
  private ballistic(
    mesh: Mesh, origin: Vector3, velocity: Vector3, gravity: number, t: number, startY: number, floorY: number,
  ): number {
    const y = startY + velocity.y * t - 0.5 * gravity * t * t;
    const landed = y <= floorY && t > 0.05;
    // Horizontal travel stops at the first touchdown instead of sliding across the ground.
    const flightTime = landed ? this.landingTime(velocity.y, gravity, startY - floorY) : t;
    mesh.position.set(origin.x + velocity.x * flightTime, landed ? floorY : y, origin.z + velocity.z * flightTime);
    return flightTime;
  }

  private landingTime(vy: number, gravity: number, height: number): number {
    // Positive root of height + vy·t − g·t²/2 = 0.
    return (vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, height))) / gravity;
  }

  private createSlot(index: number, ball: Mesh, chunk: Mesh, ring: Mesh): DestructionSlot {
    const root = new TransformNode(`vehicle:destruction:${index}`, this.scene);
    root.setEnabled(false);
    const make = (source: Mesh, name: string, glow: boolean): Mesh => {
      const mesh = source.clone(`vehicle:destruction:${index}:${name}`);
      mesh.parent = root;
      mesh.isPickable = false;
      mesh.renderingGroupId = glow ? GLOW_RENDERING_GROUP : 0;
      mesh.setEnabled(false);
      return mesh;
    };
    const particles = (count: number, source: Mesh, name: string, glow: boolean): Particle[] =>
      Array.from({ length: count }, (_, i) => ({ mesh: make(source, `${name}${i}`, glow), velocity: Vector3.Zero() }));
    return {
      root,
      flash: make(ball, 'flash', true),
      wave: make(ring, 'wave', true),
      sparks: particles(CONFIG.sparkCount, ball, 'spark', true),
      fragments: Array.from({ length: CONFIG.fragmentCount }, (_, i) => ({
        mesh: make(chunk, `fragment${i}`, false), velocity: Vector3.Zero(), spin: Vector3.Zero(),
      })),
      fire: particles(CONFIG.fireCount, ball, 'fire', false),
      smoke: particles(CONFIG.smokeCount, ball, 'smoke', false),
      origin: Vector3.Zero(),
      active: false,
      elapsedSeconds: 0,
      scale: 1,
    };
  }

  private source(mesh: Mesh): Mesh {
    mesh.setEnabled(false);
    this.sources.push(mesh);
    return mesh;
  }
}
