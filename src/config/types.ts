/**
 * Shapes of the balance data. Data only — no behavior lives in `config/`.
 *
 * Distances are expressed in map tiles and speeds in tiles per second so that balance data stays
 * independent of the rendered tile size. Times are seconds.
 */
import type { BuildingTypeId, FactionId, PlayerId, UnitTypeId } from '../core/ids';
import type { TileCoord, TileRect, TileSize } from '../core/geometry';

/** Minimal damage categories: mobile units are light or armored, buildings are structures. */
export type ArmorCategory = 'light' | 'armored' | 'structure';

/** Unit types that can shoot. Workers cannot. */
export type AttackerTypeId = Exclude<UnitTypeId, 'worker'>;

export interface AttackProfile {
  readonly damage: number;
  readonly cooldownSeconds: number;
  readonly rangeTiles: number;
}

export interface UnitConfig {
  readonly id: UnitTypeId;
  readonly name: string;
  readonly cost: number;
  readonly buildTimeSeconds: number;
  readonly maxHealth: number;
  readonly speedTilesPerSecond: number;
  readonly visionRangeTiles: number;
  /** Body diameter in tiles: both the size the unit is drawn at and its click target. */
  readonly bodySizeTiles: number;
  readonly armor: Exclude<ArmorCategory, 'structure'>;
  /** `null` for units that cannot attack. */
  readonly attack: AttackProfile | null;
}

export interface BuildingConfig {
  readonly id: BuildingTypeId;
  readonly name: string;
  /** Starting structures such as the HQ are not placeable by players. */
  readonly buildable: boolean;
  readonly cost: number;
  readonly buildTimeSeconds: number;
  readonly maxHealth: number;
  readonly footprint: TileSize;
  readonly visionRangeTiles: number;
  /** Units this building can queue. Empty for support structures. */
  readonly produces: readonly UnitTypeId[];
  /** Completed buildings that must exist before this one may be placed. */
  readonly requires: readonly BuildingTypeId[];
  /** Production needs power available (see the binary power rule). */
  readonly requiresPower: boolean;
  /** Workers may deposit gathered Credits here. */
  readonly acceptsDeliveries: boolean;
  readonly armor: Extract<ArmorCategory, 'structure'>;
}

/**
 * Faction flavor is expressed only as multipliers on unit stats, so both factions share every rule.
 * A multiplier of 1 means "no change".
 */
export interface FactionConfig {
  readonly id: FactionId;
  readonly name: string;
  readonly blurb: string;
  readonly modifiers: {
    readonly unitHealth: number;
    readonly unitCost: number;
    readonly unitBuildTime: number;
    readonly unitSpeed: number;
  };
}

/** One group of units a player starts the match with. */
export interface StartingUnitGroup {
  readonly type: UnitTypeId;
  readonly count: number;
}

/** How a skirmish begins, beyond what the map itself dictates. */
export interface MatchSetupConfig {
  /** Units each player receives near their rally point, spawned in this order. */
  readonly startingUnits: readonly StartingUnitGroup[];
  /** Faction per side, until the title screen offers a choice. */
  readonly factions: Readonly<Record<PlayerId, FactionId>>;
}

export interface EconomyConfig {
  readonly startingCredits: number;
  /** Share of the paid cost returned when construction or production is cancelled. */
  readonly cancelRefundFraction: number;
}

/** Damage multiplier applied per attacker type against each armor category. */
export type DamageTable = Readonly<Record<AttackerTypeId, Readonly<Record<ArmorCategory, number>>>>;

/**
 * Camera limits and speeds. Distances are screen pixels so panning feels the same at every zoom.
 *
 * `zoom` stays the scale it always was — the number of screen pixels one world pixel covers across
 * the middle of the view — so every balance-facing value below is unchanged by the move to a
 * perspective camera. The two angles describe the 3D rig `core/camera3d.ts` derives from that zoom.
 */
export interface CameraConfig {
  readonly startZoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Zoom multiplier applied by one wheel notch. */
  readonly zoomStepPerNotch: number;
  /** Wheel `deltaY` that counts as one notch. */
  readonly wheelNotchDelta: number;
  /** Screen pixels per second the view travels while panning. */
  readonly panSpeedPixelsPerSecond: number;
  /** How close to a screen edge the pointer must be to start an edge pan. */
  readonly edgePanMarginPixels: number;
  /**
   * How far the camera is tilted down from the horizon, in degrees. 90 would look straight down;
   * lower values show more of a building's sides and less of the ground behind it.
   */
  readonly pitchDegrees: number;
  /**
   * Vertical field of view, in degrees. Must stay below twice the pitch, or the top of the frustum
   * reaches the horizon and the visible ground becomes unbounded.
   */
  readonly fieldOfViewDegrees: number;
}

/** Ground is walkable; rock and water are blocked, like map edges and building footprints. */
export type TerrainType = 'ground' | 'rock' | 'water';

/** Terrain that is painted over the default ground layer. */
export type BlockingTerrainType = Exclude<TerrainType, 'ground'>;

/** One rectangle of non-ground terrain. Regions are applied in declaration order. */
export interface TerrainRegionConfig {
  readonly terrain: BlockingTerrainType;
  readonly area: TileRect;
}

/** A neutral Credits deposit: a disc of tiles around `center` holding a finite amount. */
export interface ResourceFieldConfig {
  readonly id: string;
  readonly center: TileCoord;
  readonly radiusTiles: number;
  readonly credits: number;
  /** Contested fields sit near the middle and are reachable by both players. */
  readonly contested: boolean;
}

/** Where a player begins: a cleared base area, the HQ footprint inside it, and a rally point. */
export interface StartLocationConfig {
  readonly player: PlayerId;
  /** Kept free of blocking terrain so the starting base always fits. */
  readonly baseArea: TileRect;
  /** Top-left tile of the starting HQ footprint. */
  readonly hqTopLeft: TileCoord;
  readonly rallyPoint: TileCoord;
}

/** A named route across the middle of the map. Waypoints are ordered start-to-start. */
export interface MapLaneConfig {
  readonly id: string;
  readonly name: string;
  readonly waypoints: readonly TileCoord[];
}

/** The single fixed battlefield, as data: bounds, terrain, starts, fields and lanes. */
export interface MapConfig {
  readonly id: string;
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** Rendered size of one tile in world pixels. */
  readonly tileSizePixels: number;
  readonly regions: readonly TerrainRegionConfig[];
  readonly resourceFields: readonly ResourceFieldConfig[];
  readonly starts: readonly StartLocationConfig[];
  readonly lanes: readonly MapLaneConfig[];
}

/** Direct movement distances are expressed in map tiles. */
export interface MovementConfig {
  readonly arrivalToleranceTiles: number;
  /** Largest change in a mobile unit's heading per second, in radians. */
  readonly maxTurnRadiansPerSecond: number;
}

/** How far a blocked destination may be nudged to find a nearby reachable tile instead. */
export interface PathfindingConfig {
  readonly blockedDestinationSearchRadiusTiles: number;
}

/** Where and how often an unfinished match is saved to this browser's local storage. */
export interface PersistenceConfig {
  /** Key the one match snapshot is stored under in `localStorage`. */
  readonly storageKey: string;
  /** How often the periodic autosave runs while a match is open, besides the `pagehide` save. */
  readonly saveIntervalSeconds: number;
}

/** Square/grid destination-slot geometry for a multi-unit group Move order. */
export interface FormationConfig {
  /** Added to the widest selected unit's `bodySizeTiles` to space slots apart. */
  readonly slotGapTiles: number;
  /** How far a slot may be nudged to find a free, reachable tile nearby. */
  readonly nearbySlotSearchRadiusTiles: number;
  /** Selected units beyond this many (in selected order) receive no slot and are left untouched. */
  readonly maxGroupSize: number;
}

/** How moving units nudge apart locally so they do not stack on each other. */
export interface SeparationConfig {
  /** Added to both units' summed body radii to decide when they are too close. */
  readonly separationPaddingTiles: number;
  /** Caps how far one call may move a single unit, scaled by the frame's `deltaSeconds`. */
  readonly maxSeparationTilesPerSecond: number;
}

/** Rendering budgets for the browser MVP. Values favour a cool, quiet laptop over maximum fidelity. */
export interface RenderConfig {
  /** Caps physical canvas density on high-DPI screens. */
  readonly maxDevicePixelRatio: number;
  /** The simulation and renderer do not need to chase 120 Hz displays during the MVP. */
  readonly targetFramesPerSecond: number;
  /** Avoids a giant simulation jump when the tab resumes after a pause. */
  readonly maxDeltaSeconds: number;
  /** Expensive HTML/canvas HUD redraws run at this lower frequency. */
  readonly hudUpdateIntervalSeconds: number;
  /** Size of the one dynamic shadow map. */
  readonly shadowMapSize: number;
}
