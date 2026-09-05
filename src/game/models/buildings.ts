import type { Scene } from '@babylonjs/core/scene';
import type { BuildingTypeId, PlayerId } from '../../core/ids';
import type { MaterialLibrary } from '../materials';
import { NEUTRAL_TONES, OWNER_PALETTES, type OwnerPalette } from '../palette';
import { buildModel, type ModelBuilder, type ModelSpec } from './kit';

/**
 * The five building silhouettes, as original low-poly geometry.
 *
 * They share one vocabulary — a walled base plate, body walls in the faction colour, a darker roof,
 * neutral machinery and one small accent — so a base reads as one side's, and differ in outline so a
 * glance tells the roles apart: the HQ has a hall, a stepped tower, a technical wing, a ramp and a
 * dish; the Barracks a ridged hall with a porch; the Factory a wide hall with two stacks and a
 * vehicle door; the Power Plant a reactor drum between cooling pipes; the Depot a hopper over a
 * delivery bay.
 *
 * Two things follow from the camera and are worth stating once:
 *
 * - A roof is never one flat plane. From a tilted camera a roof is most of what a player sees, so it
 *   is a dark overhanging cap with a lighter deck inset in it and a seam across that: three tones
 *   where one would read as a slab.
 * - Fronts face `-z`, which is south, which is towards the camera. Doors, ramps and vehicle bays are
 *   only worth drawing on the side that is actually visible.
 *
 * Every measurement is in tiles, and each model is drawn to sit inside the footprint its config
 * gives it.
 */

/** Kept inside the footprint by this much per side, so two adjacent buildings never merge visually. */
const MARGIN_TILES = 0.1;

type BuildingParts = (builder: ModelBuilder, palette: OwnerPalette) => void;

/** Half-width of a footprint side, less the margin. */
function half(footprintTiles: number): number {
  return footprintTiles / 2 - MARGIN_TILES;
}

const HQ: BuildingParts = (b, palette) => {
  const edge = half(4);
  // Sloping roof shoulders, structural braces and a broad faction pennant.
  for (const x of [-1.52, 0.42]) {
    b.box({size: [0.42, 0.12, 2.15], at: [x, 1.4, 0.1], turn: [0, 0, x < 0 ? 0.3 : -0.3]}, palette.body);
  }
  for (const x of [-1.55, 0.45]) {
    b.box({size: [0.17, 0.92, 0.18], at: [x, 0.68, -1.12]}, NEUTRAL_TONES.metal);
  }
  b.box({size: [0.7, 0.07, 0.8], at: [-1.05, 2.04, 0.45]}, palette.light)
    .box({size: [0.13, 0.075, 0.55], at: [-1.05, 2.08, 0.45]}, palette.accent)
    .cylinder({height: 1.0, diameter: 0.055, at: [0.25, 1.9, 0.7]}, NEUTRAL_TONES.metalLight)
    .box({size: [0.55, 0.32, 0.045], at: [0.52, 2.2, 0.7]}, palette.banner);
  b.box({ size: [edge * 2, 0.18, edge * 2], at: [0, 0.09, 0] }, palette.shell)
    // Main hall, with the stepped tower that gives the HQ its outline from any angle.
    .box({ size: [2.3, 1.0, 2.3], at: [-0.55, 0.68, 0.1] }, palette.body)
    .box({ size: [2.46, 0.1, 2.46], at: [-0.55, 1.23, 0.1] }, palette.shell)
    .box({ size: [1.95, 0.06, 1.95], at: [-0.55, 1.31, 0.1] }, palette.light)
    .box({ size: [2.0, 0.08, 0.09], at: [-0.55, 1.35, 0.1] }, palette.shell)
    .box({ size: [2.32, 0.1, 0.04], at: [-0.55, 0.95, -1.07] }, palette.accent, 'glowing')
    .box({ size: [1.0, 0.6, 1.0], at: [-1.05, 1.6, 0.45] }, palette.body)
    .box({ size: [1.12, 0.1, 1.12], at: [-1.05, 1.95, 0.45] }, palette.shell)
    // Entrance porch and the ramp down to the field.
    .box({ size: [1.1, 0.5, 0.5], at: [-0.55, 0.43, -1.35] }, palette.shell)
    .box({ size: [0.7, 0.42, 0.06], at: [-0.55, 0.39, -1.62] }, NEUTRAL_TONES.glass)
    .box(
      { size: [1.0, 0.07, 0.75], at: [-0.55, 0.15, -1.85], turn: [-0.18, 0, 0] },
      NEUTRAL_TONES.metal,
    )
    // Side technical wing.
    .box({ size: [1.2, 0.65, 2.0], at: [1.15, 0.5, 0] }, palette.shell)
    .box({ size: [1.3, 0.1, 2.1], at: [1.15, 0.87, 0] }, NEUTRAL_TONES.metalDark)
    .cylinder({ height: 0.32, diameter: 0.24, at: [1.15, 1.06, -0.7] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.32, diameter: 0.24, at: [1.15, 1.06, 0] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.32, diameter: 0.24, at: [1.15, 1.06, 0.7] }, NEUTRAL_TONES.metal)
    // Antenna and dish, tipped towards the viewer so it reads as a dish and not as a disc.
    .cylinder({ height: 1.5, diameter: 0.09, at: [1.5, 1.65, -1.35] }, NEUTRAL_TONES.metalLight)
    .cylinder(
      {
        height: 0.34,
        diameter: 0.08,
        diameterTop: 0.52,
        sides: 10,
        at: [1.5, 2.5, -1.35],
        turn: [-0.55, 0, 0],
      },
      NEUTRAL_TONES.metal,
    )
    .cylinder({ height: 0.1, diameter: 0.18, at: [-1.5, 1.35, -1.0] }, palette.accent, 'glowing');
};

const BARRACKS: BuildingParts = (b, palette) => {
  const edge = half(3);
  b.box({ size: [edge * 2, 0.14, edge * 2], at: [0, 0.07, 0] }, palette.shell)
    .box({ size: [2.2, 0.8, 1.9], at: [0, 0.54, 0.25] }, palette.body)
    .box({ size: [2.36, 0.1, 2.02], at: [0, 0.99, 0.25] }, palette.shell)
    .box({ size: [1.95, 0.06, 1.6], at: [0, 1.07, 0.25] }, palette.light)
    // A ridge along the hall: the Barracks' tell from above.
    .box({ size: [0.75, 0.2, 1.95], at: [0, 1.14, 0.25] }, palette.body)
    .box({ size: [2.22, 0.1, 0.04], at: [0, 0.82, -0.72] }, palette.accent, 'glowing')
    // Entrance porch.
    .box({ size: [1.1, 0.55, 0.6], at: [0, 0.42, -1.0] }, palette.shell)
    .box({ size: [1.25, 0.08, 0.72], at: [0, 0.73, -1.0] }, NEUTRAL_TONES.metalDark)
    .box({ size: [0.65, 0.4, 0.06], at: [0, 0.35, -1.33] }, NEUTRAL_TONES.glass)
    .cylinder({ height: 0.36, diameter: 0.22, at: [-0.75, 1.2, 1.05] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.36, diameter: 0.22, at: [0.75, 1.2, 1.05] }, NEUTRAL_TONES.metal);
};

const FACTORY: BuildingParts = (b, palette) => {
  const edge = half(4);
  b.box({ size: [edge * 2, 0.16, edge * 2], at: [0, 0.08, 0] }, palette.shell)
    .box({ size: [3.2, 1.0, 2.4], at: [0, 0.66, 0.4] }, palette.body)
    .box({ size: [3.36, 0.12, 2.56], at: [0, 1.22, 0.4] }, palette.shell)
    .box({ size: [2.9, 0.06, 2.1], at: [0, 1.31, 0.4] }, palette.light)
    .box({ size: [2.95, 0.08, 0.09], at: [0, 1.35, 0.4] }, palette.shell)
    // Overhead crane rail.
    .box({ size: [0.18, 0.16, 2.5], at: [0.9, 1.38, 0.4] }, NEUTRAL_TONES.metalLight)
    // Two stacks of unequal height, which is what tells the Factory from the Barracks at a glance.
    .cylinder({ height: 1.2, diameter: 0.42, at: [-1.3, 1.7, 1.3] }, NEUTRAL_TONES.metalDark)
    .cylinder({ height: 0.1, diameter: 0.48, at: [-1.3, 2.33, 1.3] }, palette.accent, 'glowing')
    .cylinder({ height: 0.9, diameter: 0.34, at: [-0.7, 1.55, 1.3] }, NEUTRAL_TONES.metalDark)
    .cylinder({ height: 0.1, diameter: 0.4, at: [-0.7, 2.03, 1.3] }, palette.accent, 'glowing')
    // Vehicle door and the apron it opens onto.
    .box({ size: [1.8, 0.85, 0.12], at: [0, 0.58, -0.81] }, NEUTRAL_TONES.metalDark)
    .box({ size: [1.5, 0.65, 0.06], at: [0, 0.52, -0.9] }, palette.accent, 'glowing')
    .box({ size: [1.9, 0.06, 0.9], at: [0, 0.19, -1.5] }, NEUTRAL_TONES.metal);
};

const POWER_PLANT: BuildingParts = (b, palette) => {
  const edge = half(3);
  b.box({ size: [edge * 2, 0.14, edge * 2], at: [0, 0.07, 0] }, palette.shell)
    .cylinder({ height: 1.05, diameter: 1.5, sides: 10, at: [0, 0.66, 0.1] }, palette.body)
    .cylinder({ height: 0.12, diameter: 1.6, sides: 10, at: [0, 1.24, 0.1] }, palette.light)
    // The lit band is the Power Plant's tell: nothing else in the set glows all the way round.
    .cylinder({ height: 0.14, diameter: 1.58, sides: 10, at: [0, 0.85, 0.1] }, palette.accent, 'glowing')
    .cylinder({ height: 0.9, diameter: 0.36, at: [-1.0, 0.58, -0.85] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.08, diameter: 0.44, at: [-1.0, 1.06, -0.85] }, NEUTRAL_TONES.metalDark)
    .cylinder({ height: 0.9, diameter: 0.36, at: [1.0, 0.58, -0.85] }, NEUTRAL_TONES.metal)
    .cylinder({ height: 0.08, diameter: 0.44, at: [1.0, 1.06, -0.85] }, NEUTRAL_TONES.metalDark)
    .box({ size: [2.2, 0.14, 0.16], at: [0, 0.25, -1.2] }, NEUTRAL_TONES.metalDark);
};

const RESOURCE_DEPOT: BuildingParts = (b, palette) => {
  const edge = half(3);
  b.box({ size: [edge * 2, 0.14, edge * 2], at: [0, 0.07, 0] }, palette.shell)
    // Hopper at the back, open delivery bay facing the field.
    .cylinder(
      { height: 0.95, diameter: 0.75, diameterTop: 1.4, sides: 8, at: [0, 0.72, 0.6] },
      palette.body,
    )
    .cylinder({ height: 0.1, diameter: 1.5, sides: 8, at: [0, 1.24, 0.6] }, palette.light)
    .box({ size: [0.5, 0.5, 0.7], at: [0, 0.55, 0.05] }, NEUTRAL_TONES.metalDark)
    .box({ size: [2.4, 0.45, 1.3], at: [0, 0.36, -0.55] }, palette.shell)
    .cylinder(
      { height: 0.5, diameter: 0.36, diameterTop: 0, sides: 5, at: [0, 0.83, -0.7] },
      NEUTRAL_TONES.crystal,
      'glowing',
    )
    .box({ size: [2.42, 0.08, 0.06], at: [0, 0.62, -1.32] }, palette.accent, 'glowing');
};

const BUILDING_PARTS: Readonly<Record<BuildingTypeId, BuildingParts>> = {
  hq: HQ,
  barracks: BARRACKS,
  factory: FACTORY,
  powerPlant: POWER_PLANT,
  resourceDepot: RESOURCE_DEPOT,
};

/** Builds the prototype model for one building role in one faction's colours. */
export function buildBuildingModel(
  scene: Scene,
  materials: MaterialLibrary,
  type: BuildingTypeId,
  owner: PlayerId,
): ModelSpec {
  return buildModel(scene, materials, `building:${type}:${owner}`, (builder) => {
    BUILDING_PARTS[type](builder, OWNER_PALETTES[owner]);
  });
}
