import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId, UnitTypeId } from '../../core/ids';
import type { MaterialLibrary } from '../materials';
import { NEUTRAL_TONES, OWNER_PALETTES, type OwnerPalette } from '../palette';
import { QUARTER_TURN, buildModel, type ModelBuilder, type ModelSpec } from './kit';

/**
 * Three of the four unit silhouettes, as original low-poly geometry: the Worker a compact tractor
 * with an engine hood, a semi-enclosed cab and a short front scoop, the Tank a low hull between two
 * tracks with a barrel out front, the Rocket a long chassis carrying three raised tubes. Infantry is
 * not among them — it renders as a three-soldier squad built by `models/soldier.ts` instead of a
 * single merged model, so it needs limbs that move independently rather than one static mesh.
 *
 * Measurements are in tiles and roughly fill the `bodySizeTiles` the unit's config gives it, so what
 * is drawn is the same size as the circle `core/selection.ts` picks with. Models face `+z`, which is
 * north on screen; facing towards a destination arrives with movement.
 */

type UnitParts = (builder: ModelBuilder, palette: OwnerPalette) => void;

/** A wheel: a short cylinder laid on its side so its disc faces along `x`. */
function wheel(builder: ModelBuilder, x: number, z: number, diameter: number): void {
  builder.cylinder(
    { height: diameter * 0.4, diameter, sides: 10, at: [x, diameter / 2, z], turn: [0, 0, QUARTER_TURN] },
    NEUTRAL_TONES.metalDark,
  );
}

const WORKER: UnitParts = (b, palette) => {
  // Low chassis frame, a stepped engine hood over the front axle, and a semi-enclosed cab behind it.
  b.box({ size: [0.46, 0.16, 0.62], at: [0, 0.18, -0.03] }, palette.body)
    .box({ size: [0.32, 0.16, 0.3], at: [0, 0.32, 0.2] }, NEUTRAL_TONES.metalDark)
    .box({ size: [0.26, 0.06, 0.26], at: [0, 0.41, 0.18] }, palette.light)
    .box({ size: [0.34, 0.26, 0.26], at: [0, 0.42, -0.18] }, palette.light)
    .box({ size: [0.28, 0.14, 0.04], at: [0, 0.46, -0.05] }, NEUTRAL_TONES.glass)
    .cylinder(
      { height: 0.22, diameter: 0.045, sides: 8, at: [0.13, 0.5, -0.28] },
      NEUTRAL_TONES.metalDark,
    );
  // A short front loader arm and scoop, so a Worker reads as a utility vehicle even standing still.
  for (const x of [-0.13, 0.13]) {
    b.box({ size: [0.05, 0.05, 0.22], at: [x, 0.16, 0.38] }, NEUTRAL_TONES.metal);
  }
  b.box({ size: [0.4, 0.16, 0.08], at: [0, 0.16, 0.53] }, palette.shell)
    .box({ size: [0.4, 0.04, 0.03], at: [0, 0.25, 0.56] }, NEUTRAL_TONES.metalLight);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.22, 0.2]) {
      wheel(b, x, z, 0.24);
    }
  }
};

const TANK: UnitParts = (b, palette) => {
  for (const x of [-0.33, 0.33]) {
    for (const z of [-0.32, -0.1, 0.12, 0.34]) {
      b.box({size: [0.27, 0.035, 0.06], at: [x, 0.31, z]}, NEUTRAL_TONES.metalLight);
    }
    b.box({ size: [0.24, 0.24, 0.95], at: [x, 0.12, 0] }, NEUTRAL_TONES.metalDark).box(
      { size: [0.26, 0.06, 0.98], at: [x, 0.27, 0] },
      NEUTRAL_TONES.metal,
    );
  }
  b.box({ size: [0.6, 0.26, 0.85], at: [0, 0.28, 0] }, palette.body)
    .box({ size: [0.58, 0.1, 0.24], at: [0, 0.36, 0.4], turn: [0.35, 0, 0] }, palette.shell)
    .box({ size: [0.34, 0.04, 0.07], at: [0, 0.42, -0.34] }, palette.accent)
    .cylinder({ height: 0.22, diameter: 0.46, sides: 8, at: [0, 0.52, -0.05] }, palette.light)
    .cylinder({ height: 0.06, diameter: 0.2, at: [0, 0.66, -0.14] }, NEUTRAL_TONES.metal)
    .cylinder(
      { height: 0.62, diameter: 0.09, at: [0, 0.54, 0.42], turn: [QUARTER_TURN, 0, 0] },
      NEUTRAL_TONES.metalLight,
    )
    .cylinder(
      { height: 0.1, diameter: 0.14, at: [0, 0.54, 0.75], turn: [QUARTER_TURN, 0, 0] },
      NEUTRAL_TONES.metalDark,
    );
};

const ROCKET: UnitParts = (b, palette) => {
  b.box({ size: [0.46, 0.16, 0.86], at: [0, 0.21, 0] }, palette.body)
    .box({ size: [0.4, 0.26, 0.3], at: [0, 0.42, 0.26] }, palette.light)
    .box({ size: [0.34, 0.13, 0.05], at: [0, 0.45, 0.42] }, NEUTRAL_TONES.glass)
    .box({ size: [0.38, 0.12, 0.36], at: [0, 0.35, -0.22] }, palette.shell);
  b.box({size: [0.48, 0.08, 0.46], at: [0, 0.46, -0.22], turn: [-0.35, 0, 0]}, palette.body);
  // Three tubes raised towards the front: the one silhouette in the set that points upwards.
  for (const x of [-0.13, 0, 0.13]) {
    b.cylinder(
      { height: 0.5, diameter: 0.13, sides: 8, at: [x, 0.52, -0.24], turn: [QUARTER_TURN - 0.35, 0, 0] },
      NEUTRAL_TONES.metalDark,
    ).cylinder(
      { height: 0.05, diameter: 0.14, sides: 8, at: [x, 0.61, -0.02], turn: [QUARTER_TURN - 0.35, 0, 0] },
      NEUTRAL_TONES.metalLight,
    );
  }
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.3, 0, 0.3]) {
      wheel(b, x, z, 0.2);
    }
  }
};

const FPV_OPERATORS: UnitParts = (b, palette) => {
  // Two compact operators with distinct equipment: controller on the left, drone case on the right.
  for (const x of [-0.22, 0.22]) {
    b.box({ size: [0.16, 0.18, 0.14], at: [x, 0.2, 0] }, NEUTRAL_TONES.metalDark)
      .box({ size: [0.2, 0.24, 0.16], at: [x, 0.4, 0] }, palette.body)
      .cylinder({ height: 0.14, diameter: 0.17, sides: 8, at: [x, 0.62, 0] }, palette.light)
      .box({ size: [0.12, 0.04, 0.03], at: [x, 0.61, 0.09] }, NEUTRAL_TONES.glass);
  }
  b.box({ size: [0.22, 0.09, 0.14], at: [-0.22, 0.4, 0.17] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.22, diameter: 0.025, at: [-0.28, 0.56, 0.18] }, palette.accent, 'glowing')
    .cylinder({ height: 0.22, diameter: 0.025, at: [-0.16, 0.56, 0.18] }, palette.accent, 'glowing')
    .box({ size: [0.3, 0.24, 0.16], at: [0.22, 0.24, -0.18] }, palette.shell);
  // The small quadcopter is deliberately broad and flat so its role survives the RTS camera.
  b.box({ size: [0.16, 0.05, 0.16], at: [0, 0.52, -0.3] }, palette.body);
  for (const x of [-0.13, 0.13]) for (const z of [-0.43, -0.17]) {
    b.cylinder({ height: 0.025, diameter: 0.11, sides: 8, at: [x, 0.55, z] }, NEUTRAL_TONES.metalDark);
  }
};

/** Every unit role except Infantry, which is built by `models/soldier.ts` instead. */
export type MergedUnitTypeId = Exclude<UnitTypeId, 'infantry'>;

const UNIT_PARTS: Readonly<Record<MergedUnitTypeId, UnitParts>> = {
  worker: WORKER,
  fpvOperators: FPV_OPERATORS,
  tank: TANK,
  rocket: ROCKET,
};

/** Builds the prototype model for one unit role in one faction's colours. */
export function buildUnitModel(
  scene: Scene,
  materials: MaterialLibrary,
  type: MergedUnitTypeId,
  owner: PlayerId,
): ModelSpec {
  return buildModel(scene, materials, `unit:${type}:${owner}`, (builder) => {
    UNIT_PARTS[type](builder, OWNER_PALETTES[owner]);
  });
}
