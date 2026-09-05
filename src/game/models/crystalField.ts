/**
 * Deterministic layout for one resource field's crystal deposit: a shallow mineral bed, faceted
 * shards in two colour bands, a few loose rocks and a few broken fragments around the base.
 *
 * Pure geometry, keyed only by tile coordinates and a salt — no Babylon import, no randomness beyond
 * the hash below, so the same map config always grows the same deposit and the layout can be tested
 * without a scene. `MapView` is the only caller; it turns this data into a merged mesh.
 */
import type { CrystalFieldConfig } from '../../config/types';
import type { TileCoord } from '../../core/geometry';

export interface OreBedPatch {
  readonly tx: number;
  readonly ty: number;
  readonly rotationRadians: number;
}

export interface RockPebble {
  readonly tx: number;
  readonly ty: number;
  readonly offsetXTiles: number;
  readonly offsetZTiles: number;
  readonly diameterTiles: number;
  readonly heightTiles: number;
  readonly rotationRadians: number;
}

export interface CrystalShard {
  readonly tx: number;
  readonly ty: number;
  readonly offsetXTiles: number;
  readonly offsetZTiles: number;
  readonly heightTiles: number;
  readonly lowerDiameterTiles: number;
  readonly upperDiameterTiles: number;
  /** Diameter of the very top face. Near zero reads as a point; larger reads as a broken-off prism. */
  readonly capDiameterTiles: number;
  /** Faceted, never round: always in the 5-7 range. */
  readonly sides: number;
  readonly tiltXRadians: number;
  readonly tiltZRadians: number;
  readonly rotationRadians: number;
}

export interface CrystalFragment {
  readonly tx: number;
  readonly ty: number;
  readonly offsetXTiles: number;
  readonly offsetZTiles: number;
  readonly lengthTiles: number;
  readonly tiltXRadians: number;
  readonly tiltZRadians: number;
  readonly rotationRadians: number;
}

export interface CrystalFieldLayout {
  readonly orePatches: readonly OreBedPatch[];
  readonly glowPools: readonly OreBedPatch[];
  readonly rocks: readonly RockPebble[];
  readonly shards: readonly CrystalShard[];
  readonly fragments: readonly CrystalFragment[];
}

/** Deterministic value in [0, 1) so a field always grows the same deposit. */
function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x2545f491, 0x27d4eb2f) ^ Math.imul(y + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(salt + 0x165667b1, 0x1b873593);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** One deposit per tile, spaced `config.tileStride` apart along the field's own tile list. */
export function generateCrystalFieldLayout(
  tiles: readonly TileCoord[],
  config: CrystalFieldConfig,
): CrystalFieldLayout {
  const orePatches: OreBedPatch[] = [];
  const glowPools: OreBedPatch[] = [];
  const rocks: RockPebble[] = [];
  const shards: CrystalShard[] = [];
  const fragments: CrystalFragment[] = [];

  for (const [index, tile] of tiles.entries()) {
    if (index % config.tileStride !== 0) continue;
    const { tx, ty } = tile;

    orePatches.push({ tx, ty, rotationRadians: hash01(tx, ty, 1) * Math.PI * 2 });
    glowPools.push({ tx, ty, rotationRadians: hash01(tx, ty, 2) * Math.PI * 2 });

    const jitterRight = (hash01(tx, ty, 10) - 0.5) * config.jitterTiles * 2;
    const jitterForward = (hash01(tx, ty, 11) - 0.5) * config.jitterTiles * 2;
    const heightScale = hash01(tx, ty, 12);
    const heightTiles = lerp(config.shardHeightTiles.min, config.shardHeightTiles.max, heightScale);
    const lowerDiameterTiles = lerp(
      config.shardDiameterTiles.min,
      config.shardDiameterTiles.max,
      hash01(tx, ty, 13),
    );
    // A prismatic shard's mid band is narrower than its base, and a few break off flat-topped
    // instead of coming to a point, so the cluster never reads as the same cone repeated.
    // Keep a long prismatic body rather than tapering from ground to a needle. The pointed apex is
    // added separately by the view, which gives a gemstone silhouette at the game's camera height.
    const upperDiameterTiles = lowerDiameterTiles * lerp(0.65, 0.85, hash01(tx, ty, 14));
    const capDiameterTiles = hash01(tx, ty, 15) < 0.3 ? upperDiameterTiles * 0.4 : 0;
    const sides = 5 + Math.floor(hash01(tx, ty, 16) * 3);

    shards.push({
      tx,
      ty,
      offsetXTiles: jitterRight,
      offsetZTiles: jitterForward,
      heightTiles,
      lowerDiameterTiles,
      upperDiameterTiles,
      capDiameterTiles,
      sides,
      tiltXRadians: (hash01(tx, ty, 17) - 0.5) * config.maxTiltRadians,
      tiltZRadians: (hash01(tx, ty, 18) - 0.5) * config.maxTiltRadians,
      rotationRadians: hash01(tx, ty, 19) * Math.PI * 2,
    });

    if (hash01(tx, ty, 20) < config.rockChance) {
      rocks.push({
        tx,
        ty,
        offsetXTiles: (hash01(tx, ty, 21) - 0.5) * config.jitterTiles * 2.4,
        offsetZTiles: (hash01(tx, ty, 22) - 0.5) * config.jitterTiles * 2.4,
        diameterTiles: lerp(0.2, 0.4, hash01(tx, ty, 23)),
        heightTiles: lerp(0.08, 0.16, hash01(tx, ty, 24)),
        rotationRadians: hash01(tx, ty, 25) * Math.PI * 2,
      });
    }

    if (hash01(tx, ty, 30) < config.fragmentChance) {
      fragments.push({
        tx,
        ty,
        offsetXTiles: (hash01(tx, ty, 31) - 0.5) * config.jitterTiles * 2.6,
        offsetZTiles: (hash01(tx, ty, 32) - 0.5) * config.jitterTiles * 2.6,
        lengthTiles: lerp(0.16, 0.34, hash01(tx, ty, 33)),
        tiltXRadians: lerp(Math.PI * 0.3, Math.PI * 0.5, hash01(tx, ty, 34)),
        tiltZRadians: (hash01(tx, ty, 35) - 0.5) * config.maxTiltRadians * 2,
        rotationRadians: hash01(tx, ty, 36) * Math.PI * 2,
      });
    }
  }

  return { orePatches, glowPools, rocks, shards, fragments };
}
