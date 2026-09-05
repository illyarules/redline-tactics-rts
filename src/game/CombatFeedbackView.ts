/** Small, disposable shot/impact/death cues driven by core attack events. */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../core/geometry';
import type { MaterialLibrary } from './materials';
import { MARKER_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

interface Shot {
  readonly mesh: Mesh;
  readonly from: Vector3;
  readonly to: Vector3;
  elapsed: number;
}

interface TimedMark {
  readonly mesh: Mesh;
  elapsed: number;
  readonly duration: number;
}

const SHOT_DURATION_SECONDS = 0.12;
const IMPACT_DURATION_SECONDS = 0.18;
const DEATH_DURATION_SECONDS = 0.55;
const EFFECT_HEIGHT = 0.48;

export class CombatFeedbackView {
  private readonly shots: Shot[] = [];
  private readonly impacts: TimedMark[] = [];
  private readonly deaths: TimedMark[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly materials: MaterialLibrary,
  ) {}

  /** A bright tracer plus an immediate impact flash makes a hit readable even at a glance. */
  public hit(from: Vec2, to: Vec2): void {
    const mesh = CreateSphere('combat:shot', { diameter: 0.13, segments: 8 }, this.scene);
    mesh.material = this.materials.unlit(MARKER_TONES.attack, 0.95);
    mesh.isPickable = false;
    const start = this.point(from, EFFECT_HEIGHT);
    const end = this.point(to, EFFECT_HEIGHT);
    mesh.position.copyFrom(start);
    this.shots.push({ mesh, from: start, to: end, elapsed: 0 });

    const impact = CreateSphere('combat:impact', { diameter: 0.26, segments: 8 }, this.scene);
    impact.material = this.materials.unlit(0xffdf8a, 0.85);
    impact.isPickable = false;
    impact.position.copyFrom(end);
    this.impacts.push({ mesh: impact, elapsed: 0, duration: IMPACT_DURATION_SECONDS });
  }

  /** An expanding warm ring survives entity removal long enough to read as a loss. */
  public death(at: Vec2): void {
    const mesh = CreateTorus('combat:death', { diameter: 0.8, thickness: 0.07, tessellation: 20 }, this.scene);
    mesh.material = this.materials.unlit(0xff765c, 0.9);
    mesh.isPickable = false;
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copyFrom(this.point(at, 0.08));
    this.deaths.push({ mesh, elapsed: 0, duration: DEATH_DURATION_SECONDS });
  }

  public update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
    this.updateShots(deltaSeconds);
    this.updateMarks(this.impacts, deltaSeconds, 0.8);
    this.updateMarks(this.deaths, deltaSeconds, 1.8);
  }

  public dispose(): void {
    for (const shot of this.shots) shot.mesh.dispose();
    for (const mark of this.impacts) mark.mesh.dispose();
    for (const mark of this.deaths) mark.mesh.dispose();
    this.shots.length = 0;
    this.impacts.length = 0;
    this.deaths.length = 0;
  }

  private updateShots(deltaSeconds: number): void {
    for (let index = this.shots.length - 1; index >= 0; index--) {
      const shot = this.shots[index]!;
      shot.elapsed += deltaSeconds;
      const progress = Math.min(1, shot.elapsed / SHOT_DURATION_SECONDS);
      shot.mesh.position.copyFrom(Vector3.Lerp(shot.from, shot.to, progress));
      shot.mesh.visibility = 1 - progress * 0.25;
      if (progress >= 1) {
        shot.mesh.dispose();
        this.shots.splice(index, 1);
      }
    }
  }

  private updateMarks(marks: TimedMark[], deltaSeconds: number, growth: number): void {
    for (let index = marks.length - 1; index >= 0; index--) {
      const mark = marks[index]!;
      mark.elapsed += deltaSeconds;
      const progress = Math.min(1, mark.elapsed / mark.duration);
      const scale = 1 + progress * growth;
      mark.mesh.scaling.set(scale, scale, scale);
      mark.mesh.visibility = 1 - progress;
      if (progress >= 1) {
        mark.mesh.dispose();
        marks.splice(index, 1);
      }
    }
  }

  private point(position: Vec2, height: number): Vector3 {
    return new Vector3(this.space.sceneX(position.x), height, this.space.sceneZ(position.y));
  }
}
