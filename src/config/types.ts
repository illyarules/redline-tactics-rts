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

/** Entity kinds a weapon may legally target. Buildings and units share the same damage rules. */
export type AttackTargetCategory = 'unit' | 'building';

/** Unit types that can shoot. Workers cannot. */
export type AttackerTypeId = Exclude<UnitTypeId, 'worker'>;

export interface AttackProfile {
  readonly damage: number;
  readonly cooldownSeconds: number;
  readonly rangeTiles: number;
  /** Target kinds this weapon is permitted to damage. */
  readonly targetCategories: readonly AttackTargetCategory[];
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

/** Rules that bound one live match independently of its opening setup. */
export interface MatchRulesConfig {
  readonly matchDurationSeconds: number;
}

export interface EconomyConfig {
  readonly startingCredits: number;
  /** Share of the paid cost returned when construction or production is cancelled. */
  readonly cancelRefundFraction: number;
}

/** Shared limits for every completed production building. */
export interface ProductionConfig {
  /** Maximum number of paid units a building can hold, including the one currently building. */
  readonly queueCapacity: number;
  /** How far from a producer's footprint a completed unit may look for a free spawn tile. */
  readonly spawnSearchRadiusTiles: number;
}

/** Damage multiplier applied per attacker type against each armor category. */
export type DamageTable = Readonly<Record<AttackerTypeId, Readonly<Record<ArmorCategory, number>>>>;

/** Core combat-behaviour cadence, separate from weapon damage/cooldown balance. */
export interface CombatBehaviorConfig {
  /** Idle and Attack-Move target searches are batched at this cadence, never every simulation frame. */
  readonly targetScanIntervalSeconds: number;
  /** Maximum range at which a combat unit notices a legal enemy in the current visible world. */
  readonly acquisitionRangeTiles: number;
}

/** The grid geometry and cadence used by the authoritative fog-of-war rules. */
export interface FogConfig {
  /** Visibility is recomputed at this simulation cadence, never once per rendered frame. */
  readonly updateIntervalSeconds: number;
  /** Circular tile-centre radius; terrain line-of-sight blocking is intentionally not modelled yet. */
  readonly radiusShape: 'circle';
}

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

/** Low-frequency, deterministic decision thresholds for the single skirmish AI. */
export type AiMilitaryUnitType = Extract<UnitTypeId, 'infantry' | 'tank' | 'rocket'>;

export interface AiConfig {
  readonly productionCycle: readonly AiMilitaryUnitType[];
  readonly targetArmyUnits: number;
  readonly commandArrivalRadiusTiles: number;
  readonly buildOrder: readonly BuildingTypeId[];
  readonly placementRadiusTiles: number;
  /** Simulation time between state evaluations; never tied to render frames or wall-clock time. */
  readonly decisionIntervalSeconds: number;
  /** Combat units required before a known player base can turn scouting into an attack state. */
  readonly minimumAttackArmyUnits: number;
  /** A force at or below this count is critically depleted while attacking. */
  readonly criticalArmyUnits: number;
  /** Player combat units this close to the AI HQ count as a threat to its base. */
  readonly baseThreatRadiusTiles: number;
  /** Maximum combat units redirected per defense decision. */
  readonly maximumDefenders: number;
  /** Eligible defenders must be within this distance of HQ; nearest first, then stable ID. */
  readonly defenderSelectionRadiusTiles: number;
  readonly defenderPriority: 'distanceThenId';
  /** Buildable infrastructure, in prerequisite-safe recovery priority order (never HQ). */
  readonly recoveryBuildOrder: readonly Exclude<BuildingTypeId, 'hq'>[];
  /** Completed structures that must remain standing for normal operation. */
  readonly essentialBuildingTypes: readonly BuildingTypeId[];
  /** Completed structures sufficient to leave the recovery state. */
  readonly minimumViableBuildingTypes: readonly BuildingTypeId[];
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

/**
 * Render-only combat feedback. These values deliberately describe no gameplay rule: core combat
 * still owns targeting, damage, cooldowns and death.
 */
export interface CombatEffectWeaponConfig {
  readonly projectileDurationSeconds: number;
  readonly projectileHeightTiles: number;
  readonly projectileLengthTiles: number;
  readonly projectileWidthTiles: number;
  readonly muzzleDurationSeconds: number;
  readonly muzzleDiameterTiles: number;
  readonly impactDurationSeconds: number;
  readonly impactDiameterTiles: number;
  readonly debrisDiameterTiles: number;
  readonly debrisTravelTiles: number;
  /** Zero disables the expanding impact ring for this weapon. */
  readonly ringDiameterTiles: number;
  readonly projectileColor: number;
  readonly trailColor: number;
  readonly impactColor: number;
}

export interface CombatEffectsConfig {
  /** Bounded pools prevent a crowded battle from creating an unbounded number of scene objects. */
  readonly projectilePoolCapacity: number;
  readonly muzzlePoolCapacity: number;
  readonly impactPoolCapacity: number;
  readonly targetFlashPoolCapacity: number;
  readonly deathPoolCapacity: number;
  readonly targetFlashDurationSeconds: number;
  readonly unitFlashDiameterTiles: number;
  readonly buildingFlashDiameterTiles: number;
  readonly deathDurationSeconds: number;
  readonly lowPolySides: number;
  readonly debrisPerImpact: number;
  /** Shared cosmetic opacity, growth and placement values for the low-poly effect kit. */
  readonly visual: {
    readonly metallicImpactColor: number;
    readonly targetFlashColor: number;
    readonly deathColor: number;
    readonly muzzleAlpha: number;
    readonly impactFlashAlpha: number;
    readonly projectileAlpha: number;
    readonly trailAlpha: number;
    readonly debrisAlpha: number;
    readonly debrisVisibility: number;
    readonly targetFlashAlpha: number;
    readonly muzzleOffsetDiameterFraction: number;
    readonly projectileArrivalFade: number;
    readonly rocketHeadDiameterMultiplier: number;
    readonly rocketTrailOffsetLengthMultiplier: number;
    readonly rocketTrailLengthMultiplier: number;
    readonly rocketTrailWidthMultiplier: number;
    readonly rocketTrailArrivalFade: number;
    readonly impactGroundHeightTiles: number;
    readonly impactGrowthAtEnd: number;
    readonly ringGrowthAtEnd: number;
    readonly ringVisibility: number;
    readonly ringAlpha: number;
    readonly ringThicknessTiles: number;
    readonly unitFlashHeightTiles: number;
    readonly buildingFlashHeightTiles: number;
    readonly targetFlashDiameterMultiplier: number;
    readonly targetFlashVisibility: number;
    readonly deathHeightTiles: number;
    readonly deathDiameterTiles: number;
    readonly deathThicknessTiles: number;
    readonly deathVisibility: number;
    readonly deathGrowthAtEnd: number;
    /** Deterministic debris variation avoids per-hit random allocation while keeping the burst organic. */
    readonly debrisAngleSeedPerSlot: number;
    readonly debrisVerticalBase: number;
    readonly debrisVerticalStep: number;
  };
  readonly weapons: Readonly<Record<AttackerTypeId, CombatEffectWeaponConfig>>;
}

/**
 * The compact triangular arrangement a three-soldier Infantry squad stands in around its entity's
 * position, in tiles and in the model's own local space (`+z` forward, `+x` right).
 */
export interface SquadFormationConfig {
  /** How far the lead soldier stands ahead of the entity's position. */
  readonly leadOffsetTiles: number;
  /** How far the two rear soldiers stand behind the entity's position. */
  readonly rearOffsetTiles: number;
  /** Half the distance between the two rear soldiers. */
  readonly rearSpreadTiles: number;
}

/**
 * Procedural walk-cycle tuning for the Infantry squad. Angles are radians, distances are tiles.
 * Purely a rendering concern: the simulation never sees these values.
 */
export interface SquadAnimationConfig {
  readonly formation: SquadFormationConfig;
  /** Full stride cycles per second while an Infantry entity is moving. */
  readonly walkCyclesPerSecond: number;
  readonly legSwingRadians: number;
  readonly armSwingRadians: number;
  readonly walkBobTiles: number;
  /** Radians of cycle phase each soldier is offset from the last, so steps never land in lockstep. */
  readonly soldierPhaseOffsetRadians: number;
  /** Breathing cycles per second while idle. */
  readonly idleCyclesPerSecond: number;
  readonly idleBobTiles: number;
  readonly idleSwayRadians: number;
}

/** Worker gather-loop timing and capacity. */
export interface GatherConfig {
  /** Credits a Worker carries per completed gather cycle, capped by what the field has left. */
  readonly workerCapacityCredits: number;
  /** Seconds spent standing at a field per gather cycle, regardless of the amount carried away. */
  readonly gatherSeconds: number;
}

/** Faceted low-poly crystal deposit tuning for a resource field. Distances are tiles. */
export interface CrystalFieldConfig {
  /** Every this-many-th field tile (in declaration order) grows one deposit cluster. */
  readonly tileStride: number;
  readonly oreBedDiameterTiles: number;
  readonly glowPoolDiameterTiles: number;
  readonly rockChance: number;
  readonly fragmentChance: number;
  readonly shardHeightTiles: { readonly min: number; readonly max: number };
  readonly shardDiameterTiles: { readonly min: number; readonly max: number };
  /** Share of a shard's height given to its darker lower band; the rest is the bright upper band. */
  readonly lowerBandShare: number;
  /** How far a shard, rock or fragment may drift from its tile centre. */
  readonly jitterTiles: number;
  /** Largest lean applied to a shard or fragment, in radians. */
  readonly maxTiltRadians: number;
}
