import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId } from '../../core/ids';
import type { MaterialLibrary } from '../materials';
import { NEUTRAL_TONES, OWNER_PALETTES } from '../palette';
import { buildModel, type ModelSpec } from './kit';
import { SQUAD_SIZE, type SquadSlot } from './squadFormation';

/**
 * One original low-poly soldier, built from the same box-and-cylinder kit every other model uses,
 * but split into the parts a walk cycle actually needs to move: two legs that swing at the hip and
 * one rifle arm that swings at the shoulder. Everything else — helmet, torso, collar, the far
 * shoulder — is static geometry merged into a single "torso" piece, the same way a Tank or a Worker
 * is one piece, because none of it needs to move independently to read as walking.
 *
 * `EntitiesView` clones these prototypes three times per Infantry entity — once per soldier —
 * and positions the clones with `squadFormationSlots`. The legs are neutral-coloured and shared by
 * both factions; the torso and rifle arm carry the owner's palette, like every other unit.
 */

/** Where the hip pivot sits above the ground, and how tall the whole standing figure is. */
const HIP_HEIGHT_TILES = 0.18;
const STAND_HEIGHT_TILES = 0.77;
/** Half the stance width: each leg's pivot sits this far to either side of the soldier's centre. */
const HIP_OFFSET_TILES = 0.05;
/** The rifle-arm pivot, relative to the torso's own origin. Only one arm is drawn; it carries the rifle. */
const SHOULDER_OFFSET: Vector3 = new Vector3(0.12, 0.53, 0);

export interface SoldierPartPrototypes {
  /** Static: helmet, head, collar, both shoulder pads, hips, belt. Owner-coloured. */
  readonly torso: ModelSpec;
  /** The leg at the left hip (negative x). The procedural soldier uses one leg mesh for both. */
  readonly legLeft: ModelSpec;
  readonly legRight: ModelSpec;
  /** The one visible arm, carrying the rifle. Owner-coloured. */
  readonly rifleArm: ModelSpec;
  readonly standHeightTiles: number;
  readonly hipHeightTiles: number;
  readonly hipOffsetTiles: number;
  readonly shoulderOffset: Vector3;
}

/** The Blender FPV squad: one prototype set per formation slot, plus the drone resting beside it. */
export interface FpvSquadParts {
  /** In formation-slot order: lead, rear left, rear right. */
  readonly soldiers: readonly SoldierPartPrototypes[];
  /** Origin at the drone's centre on the ground. */
  readonly drone: ModelSpec;
}

/** Where the squad's drone rests, in the entity root's space (tiles): just ahead of the lead operator. */
export const DRONE_SLOT: SquadSlot = { rightTiles: 0.24, forwardTiles: 0.55 };

export interface SoldierKit {
  /** Prototypes for one faction's soldier. Built the first time that faction fields Infantry. */
  partsFor(owner: PlayerId, role?: 'infantry' | 'fpvOperators'): SoldierPartPrototypes;
  /**
   * Swaps Infantry (not FPV operators) to prototypes loaded from the Blender model. Until this is
   * called, and if loading fails, the procedural soldier is used.
   */
  useModel(parts: ReadonlyMap<PlayerId, SoldierPartPrototypes>): void;
  /** Swaps FPV operators to the three Blender specialists and their drone. Same fallback rules. */
  useFpvModel(parts: ReadonlyMap<PlayerId, FpvSquadParts>): void;
  /** One prototype set per formation slot: the same set three times unless a model supplies three. */
  squadPartsFor(owner: PlayerId, role: 'infantry' | 'fpvOperators'): readonly SoldierPartPrototypes[];
  /** The drone prop for FPV operators, or `null` while the procedural fallback is in use. */
  droneFor(owner: PlayerId): ModelSpec | null;
  dispose(): void;
}

export function disposeSoldierParts(parts: SoldierPartPrototypes): void {
  for (const part of [parts.torso, parts.rifleArm, parts.legLeft, parts.legRight]) part.mesh.dispose();
}

export function disposeFpvSquadParts(squad: FpvSquadParts): void {
  for (const parts of squad.soldiers) disposeSoldierParts(parts);
  squad.drone.mesh.dispose();
}

export function createSoldierKit(scene: Scene, materials: MaterialLibrary): SoldierKit {
  const torsos = new Map<string, ModelSpec>();
  const rifleArms = new Map<string, ModelSpec>();
  let leg: ModelSpec | null = null;
  let modelParts: ReadonlyMap<PlayerId, SoldierPartPrototypes> | null = null;
  let fpvParts: ReadonlyMap<PlayerId, FpvSquadParts> | null = null;

  return {
    useModel(parts) {
      modelParts = parts;
    },

    useFpvModel(parts) {
      fpvParts = parts;
    },

    squadPartsFor(owner, role) {
      const loaded = role === 'fpvOperators' ? fpvParts?.get(owner)?.soldiers : undefined;
      return loaded ?? Array.from({ length: SQUAD_SIZE }, () => this.partsFor(owner, role));
    },

    droneFor(owner) {
      return fpvParts?.get(owner)?.drone ?? null;
    },

    partsFor(owner, role = 'infantry') {
      const loaded = role === 'infantry' ? modelParts?.get(owner) : fpvParts?.get(owner)?.soldiers[0];
      if (loaded !== undefined) return loaded;
      const key = `${owner}:${role}`;
      let torso = torsos.get(key);
      if (torso === undefined) {
        torso = buildTorso(scene, materials, owner, role);
        torsos.set(key, torso);
      }
      let rifleArm = rifleArms.get(key);
      if (rifleArm === undefined) {
        rifleArm = buildRifleArm(scene, materials, owner, role);
        rifleArms.set(key, rifleArm);
      }
      if (leg === null) {
        leg = buildLeg(scene, materials);
      }
      return {
        torso,
        legLeft: leg,
        legRight: leg,
        rifleArm,
        standHeightTiles: STAND_HEIGHT_TILES,
        hipHeightTiles: HIP_HEIGHT_TILES,
        hipOffsetTiles: HIP_OFFSET_TILES,
        shoulderOffset: SHOULDER_OFFSET,
      };
    },

    dispose() {
      for (const model of torsos.values()) model.mesh.dispose();
      for (const model of rifleArms.values()) model.mesh.dispose();
      leg?.mesh.dispose();
      for (const parts of modelParts?.values() ?? []) disposeSoldierParts(parts);
      for (const squad of fpvParts?.values() ?? []) disposeFpvSquadParts(squad);
      modelParts = null;
      fpvParts = null;
      torsos.clear();
      rifleArms.clear();
      leg = null;
    },
  };
}

function buildTorso(scene: Scene, materials: MaterialLibrary, owner: PlayerId, role: 'infantry' | 'fpvOperators'): ModelSpec {
  const palette = OWNER_PALETTES[owner];
  return buildModel(scene, materials, `soldier:torso:${owner}:${role}`, (b) => {
    b.box({ size: [0.16, 0.14, 0.14], at: [0, 0.25, 0] }, palette.shell)
      .box({ size: [0.18, 0.03, 0.15], at: [0, 0.315, 0] }, palette.accent)
      .box({ size: [0.19, 0.22, 0.15], at: [0, 0.44, 0] }, palette.body)
      .box({ size: [0.14, 0.12, 0.07], at: [0, 0.53, -0.09] }, palette.shell)
      .box({ size: [0.24, 0.055, 0.16], at: [0, 0.555, 0] }, palette.body)
      .box({ size: [0.11, 0.1, 0.11], at: [0, 0.63, 0] }, palette.light)
      .box({ size: [0.09, 0.045, 0.03], at: [0, 0.615, 0.06] }, NEUTRAL_TONES.glass)
      .cylinder({ height: 0.12, diameter: 0.17, diameterTop: 0.12, sides: 6, at: [0, 0.71, 0] }, palette.body);
    if (role === 'fpvOperators') {
      // A short field cloak and radio pack distinguish the operators without changing the infantry silhouette.
      b.box({ size: [0.22, 0.32, 0.035], at: [0, 0.39, -0.105], turn: [-0.12, 0, 0] }, palette.shell)
        .box({ size: [0.14, 0.16, 0.08], at: [0, 0.5, -0.14] }, NEUTRAL_TONES.metalDark)
        .cylinder({ height: 0.22, diameter: 0.018, sides: 6, at: [0.05, 0.67, -0.14] }, palette.accent, 'glowing');
    }
  });
}

function buildLeg(scene: Scene, materials: MaterialLibrary): ModelSpec {
  return buildModel(scene, materials, 'soldier:leg', (b) => {
    // Hangs from its pivot at local y=0 (the hip) down to the ground, so rotating the pivot swings
    // the whole leg like a pendulum hinged at the hip.
    b.box({ size: [0.09, 0.18, 0.16], at: [0, -0.09, 0] }, NEUTRAL_TONES.metalDark);
  });
}

function buildRifleArm(scene: Scene, materials: MaterialLibrary, owner: PlayerId, role: 'infantry' | 'fpvOperators'): ModelSpec {
  const palette = OWNER_PALETTES[owner];
  return buildModel(scene, materials, `soldier:rifleArm:${owner}:${role}`, (b) => {
    b.box({ size: [0.07, 0.22, 0.07], at: [0, -0.11, 0.02] }, palette.shell);
    if (role === 'fpvOperators') {
      b.box({ size: [0.18, 0.055, 0.12], at: [-0.04, -0.15, 0.12] }, NEUTRAL_TONES.metal)
        .box({ size: [0.1, 0.025, 0.07], at: [-0.04, -0.115, 0.12] }, palette.accent);
    } else {
      b.box({ size: [0.045, 0.045, 0.38], at: [0, -0.14, 0.16] }, NEUTRAL_TONES.metalDark);
    }
  });
}

export interface SoldierInstance {
  /** Positioned at the soldier's formation slot, parented to the entity's shared root. */
  readonly root: TransformNode;
  /** Vertical bob is applied here; the torso and rifle arm are its children. */
  readonly bob: TransformNode;
  readonly legLeftPivot: TransformNode;
  readonly legRightPivot: TransformNode;
  readonly armPivot: TransformNode;
  /** Every leaf mesh this soldier owns, for picking, shadows and the dead-visibility fade. */
  readonly meshes: readonly Mesh[];
}

/** Clones one soldier's parts into `parent`'s space at `slot`. Geometry and materials are shared. */
export function instantiateSoldier(
  scene: Scene,
  parts: SoldierPartPrototypes,
  parent: TransformNode,
  slot: SquadSlot,
  namePrefix: string,
): SoldierInstance {
  const root = new TransformNode(`${namePrefix}:root`, scene);
  root.parent = parent;
  root.position = new Vector3(slot.rightTiles, 0, slot.forwardTiles);

  const bob = new TransformNode(`${namePrefix}:bob`, scene);
  bob.parent = root;

  const torsoMesh = enableClone(parts.torso.mesh.clone(`${namePrefix}:torso`, bob));

  const armPivot = new TransformNode(`${namePrefix}:armPivot`, scene);
  armPivot.parent = bob;
  armPivot.position = parts.shoulderOffset.clone();
  const rifleArmMesh = enableClone(parts.rifleArm.mesh.clone(`${namePrefix}:rifleArm`, armPivot));

  const legLeftPivot = new TransformNode(`${namePrefix}:legLeftPivot`, scene);
  legLeftPivot.parent = root;
  legLeftPivot.position = new Vector3(-parts.hipOffsetTiles, parts.hipHeightTiles, 0);
  const legLeftMesh = enableClone(parts.legLeft.mesh.clone(`${namePrefix}:legLeft`, legLeftPivot));

  const legRightPivot = new TransformNode(`${namePrefix}:legRightPivot`, scene);
  legRightPivot.parent = root;
  legRightPivot.position = new Vector3(parts.hipOffsetTiles, parts.hipHeightTiles, 0);
  const legRightMesh = enableClone(parts.legRight.mesh.clone(`${namePrefix}:legRight`, legRightPivot));

  return {
    root,
    bob,
    legLeftPivot,
    legRightPivot,
    armPivot,
    meshes: [torsoMesh, rifleArmMesh, legLeftMesh, legRightMesh],
  };
}

function enableClone(mesh: Mesh): Mesh {
  mesh.setEnabled(true);
  mesh.isPickable = true;
  return mesh;
}
