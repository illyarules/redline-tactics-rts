import { UNIT_CONFIG } from '../config/units';
import type {
  EntityStatus,
  ReadonlyBuilding,
  ReadonlyEntity,
  ReadonlyUnit,
} from '../core/entities';
import { resolveBuildingStats, resolveUnitStats } from '../core/factionStats';
import { restoreFogState, type CellVisibility, type FogState } from '../core/fog';
import type { BuildingTypeId, EntityId, UnitTypeId } from '../core/ids';
import type { MapGrid } from '../core/map';
import type { Seat } from '../core/pvp';
import type { BattleViewState } from '../game/battleViewState';

export interface OnlineQueueView {
  readonly id: string;
  readonly type: UnitTypeId;
  readonly progress: number;
}

export interface OnlineEntityView {
  readonly id: string;
  readonly owner: Seat;
  readonly kind: 'unit' | 'building';
  readonly type: UnitTypeId | BuildingTypeId;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly status?: EntityStatus;
  readonly facingRadians?: number;
  readonly entrenchment?: ReadonlyUnit['entrenchment'];
  readonly constructionProgress?: number;
  readonly queue?: readonly OnlineQueueView[];
}

export interface OnlineFieldView {
  readonly id: string;
  readonly remaining: number;
}

export interface OnlineBattleSnapshot {
  readonly seat: Seat;
  readonly entities: readonly OnlineEntityView[];
  readonly fog: readonly (readonly CellVisibility[])[];
  readonly fields: readonly OnlineFieldView[];
}

export interface OnlineBattleProjection {
  readonly state: BattleViewState;
  readonly fog: FogState;
}

/** Converts a filtered server snapshot into the shared renderer boundary without adding authority. */
export class OnlineBattleViewAdapter {
  private readonly fieldFractions: Map<string, number>;

  public constructor(private readonly grid: MapGrid) {
    this.fieldFractions = new Map(grid.resourceFields.map((field) => [field.id, 1]));
  }

  public project(
    snapshot: OnlineBattleSnapshot,
    selectedIds: readonly EntityId[],
  ): OnlineBattleProjection {
    for (const field of snapshot.fields) {
      const config = this.grid.resourceFields.find((candidate) => candidate.id === field.id);
      if (config !== undefined) this.fieldFractions.set(field.id, field.remaining / config.credits);
    }
    const entities = snapshot.entities.map((entity) => this.entity(entity));
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return {
      state: {
        entities,
        selectedIds,
        fieldFractions: this.fieldFractions,
        isVisible: () => true,
        positionOfVisibleTarget: (id) => byId.get(id)?.position ?? null,
      },
      fog: restoreFogState({
        gridId: this.grid.id,
        widthTiles: this.grid.widthTiles,
        heightTiles: this.grid.heightTiles,
        updateElapsedSeconds: 0,
        players: [{
          player: snapshot.seat,
          cells: snapshot.fog.flatMap((row) => row.map(visibilityCode)),
        }],
      }, this.grid),
    };
  }

  private entity(entity: OnlineEntityView): ReadonlyEntity {
    const id = entity.id as EntityId;
    const position = { x: entity.x, y: entity.y };
    if (entity.kind === 'unit') {
      const type = entity.type as UnitTypeId;
      return {
        id,
        owner: entity.owner,
        faction: 'meridian',
        kind: 'unit',
        type,
        position,
        health: entity.health,
        order: null,
        status: entity.status ?? 'idle',
        stats: resolveUnitStats(type, 'meridian'),
        facingRadians: entity.facingRadians ?? 0,
        attackCooldownRemainingSeconds: 0,
        carriedCredits: 0,
        entrenchment: entity.entrenchment ?? 'mobile',
        entrenchElapsedSeconds: 0,
      } satisfies ReadonlyUnit;
    }

    const type = entity.type as BuildingTypeId;
    const stats = resolveBuildingStats(type, 'meridian');
    return {
      id,
      owner: entity.owner,
      faction: 'meridian',
      kind: 'building',
      type,
      position,
      health: entity.health,
      order: null,
      status: entity.status ?? 'idle',
      stats,
      topLeft: {
        tx: Math.round(entity.x / this.grid.tileSizePixels - stats.footprint.width / 2),
        ty: Math.round(entity.y / this.grid.tileSizePixels - stats.footprint.height / 2),
      },
      footprint: stats.footprint,
      constructionProgress: entity.constructionProgress ?? 1,
      productionQueue: (entity.queue ?? []).map((entry) => ({
        id: entry.id,
        unitType: entry.type,
        elapsedSeconds: entry.progress,
        paidCost: UNIT_CONFIG[entry.type].cost,
      })),
    } satisfies ReadonlyBuilding;
  }
}

function visibilityCode(visibility: CellVisibility): number {
  if (visibility === 'visible') return 2;
  if (visibility === 'explored') return 1;
  return 0;
}
