/**
 * The shared visual vocabulary every model in the scene is built from.
 *
 * There is one drawing per role and one palette per side, so the two factions cannot drift apart:
 * a blue tank and an orange one are the same geometry with a different palette substituted. Nothing
 * here decides a rule.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { PlayerId } from '../core/ids';

/** The colour planes a faction's models are built from. */
export interface OwnerPalette {
  /** Darkest plane: base plates, hull sides, recessed blocks. */
  readonly shell: number;
  /** The main plane, and the colour a faction is recognised by. */
  readonly body: number;
  /** Lit upper plane: turrets, cabs, roof blocks. */
  readonly light: number;
  /** Faction accent: stripes, lamps, lit panels. Used sparingly. */
  readonly accent: number;
  /** Ground pads and selection tint: one saturated mid tone that reads from very few pixels. */
  readonly banner: number;
}

/**
 * The player is blue and the AI orange, at matching brightness so neither side reads as stronger.
 *
 * The planes are spaced widely in value on purpose: a unit is often less than a tile across on
 * screen, and neighbouring planes that differ only in hue turn into one blob at that size.
 */
export const OWNER_PALETTES: Readonly<Record<PlayerId, OwnerPalette>> = {
  player: { shell: 0x1b325a, body: 0x3266b4, light: 0x6fb0ef, accent: 0xbde4ff, banner: 0x4a94ec },
  ai: { shell: 0x5d2f0c, body: 0xc4711d, light: 0xef9a3f, accent: 0xffd79a, banner: 0xf08c2c },
  ai2: { shell: 0x5d2f0c, body: 0xc4711d, light: 0xef9a3f, accent: 0xffd79a, banner: 0xf08c2c },
};

/** Neutral tones shared by both factions, so machinery never competes with the faction colour. */
export const NEUTRAL_TONES = {
  metal: 0x66727d,
  metalDark: 0x36404a,
  /** Bright machinery — barrels, tubes, rails — has to read against dark ground, not sink into it. */
  metalLight: 0xa3aeba,
  glass: 0x101d1a,
  /** Cool indicator light used by neutral resource machinery. */
  crystal: 0x5fdcee,
} as const;

/** Compact neutral gas extraction equipment placed at the centre of each resource field. */
export const GAS_FIELD_TONES = {
  soil: 0x252820,
  soilEdge: 0x34382c,
  concrete: 0x777873,
  concreteEdge: 0x555852,
  platform: 0x3b4245,
  column: 0xaeb8ba,
  columnShade: 0x6f7b7e,
  pipe: 0xd39a27,
  frame: 0x844632,
  lamp: 0x81d8c8,
} as const;

/** The battlefield's own tones: a dark, subdued green that lets the factions be the only loud thing. */
export const FIELD_TONES = {
  /** Base colour of the grass, before the per-tile variation the ground texture paints. */
  ground: 0x626c46,
  groundLight: 0x7c8155,
  groundDark: 0x48543b,
  /** The apron outside the playable grid: the same field, further away and in shade. */
  surround: 0x626c46,
  /** The line along the map edge, so the limit of the battlefield is visible. */
  border: 0x8fb08a,
  forestFloor: 0x3f5134,
  treeTrunk: 0x4a3826,
  treeDark: 0x27432f,
  treeLight: 0x426244,
  road: 0x96865f,
  roadEdge: 0x655f43,
  mountainGround: 0x53584e,
  mountainDark: 0x474a45,
  mountainLight: 0x77786b,
  sky: 0x0b1020,
} as const;

/** Feedback marks. Cool for a selection, warmer for anything aggressive. */
export const MARKER_TONES = {
  selection: 0xdff6ff,
  move: 0xa9e8ff,
  attackMove: 0xffc06a,
  attack: 0xff8f6a,
} as const;

/** Health bar fill, from empty to full. */
export const HEALTH_TONES = [0xd9614c, 0xe2c44f, 0x6fdc8c] as const;

export function color3(hex: number): Color3 {
  return new Color3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

/** Health bar colour for a 0-1 health fraction. */
export function healthTone(fraction: number): number {
  const index = fraction > 0.6 ? 2 : fraction > 0.3 ? 1 : 0;
  return HEALTH_TONES[index] ?? HEALTH_TONES[2];
}
