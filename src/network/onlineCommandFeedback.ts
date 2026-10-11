import type { ReadonlyEntity } from '../core/entities';
import type { EntityId } from '../core/ids';
import { attackMoveOrder, attackOrder, moveOrder, type Order } from '../core/orders';
import type { PvpCommand } from '../core/pvp';
import type { BattleViewState } from '../game/battleViewState';

export type OnlineCommandState = 'pending' | 'confirmed' | 'rejected';

export interface OnlineCommandFeedbackView {
  readonly state: OnlineCommandState;
  readonly message: string;
}

interface TrackedCommand {
  readonly seq: number;
  readonly command: PvpCommand;
  state: OnlineCommandState;
  appliedTick: number | null;
  message: string;
  markerActive: boolean;
}

/** Tracks transient client feedback without applying gameplay state or changing server authority. */
export class OnlineCommandFeedback {
  private readonly commands = new Map<number, TrackedCommand>();
  private latestSeq: number | null = null;

  public submit(seq: number, command: PvpCommand): void {
    for (const [trackedSeq, tracked] of this.commands) {
      if (tracked.state !== 'pending' && !tracked.markerActive) this.commands.delete(trackedSeq);
    }
    this.commands.set(seq, {
      seq,
      command,
      state: 'pending',
      appliedTick: null,
      message: `${commandLabel(command)} pending…`,
      markerActive: true,
    });
    this.latestSeq = seq;
  }

  public acknowledge(seq: number, ok: boolean, appliedTick: number | null): boolean {
    const tracked = this.commands.get(seq);
    if (tracked === undefined || tracked.state !== 'pending') return false;
    tracked.state = ok ? 'confirmed' : 'rejected';
    tracked.appliedTick = ok ? appliedTick : null;
    if (!ok) tracked.markerActive = false;
    tracked.message = ok ? `${commandLabel(tracked.command)} confirmed` : `${commandLabel(tracked.command)} rejected: command is no longer valid`;
    return true;
  }

  public reject(seq: number, reason: string): boolean {
    const tracked = this.commands.get(seq);
    if (tracked === undefined || tracked.state !== 'pending') return false;
    tracked.state = 'rejected';
    tracked.markerActive = false;
    tracked.message = `${commandLabel(tracked.command)} rejected: ${rejectionReason(reason)}`;
    return true;
  }

  public applySnapshot(tick: number): void {
    for (const tracked of this.commands.values()) {
      if (tracked.state === 'confirmed' && tracked.appliedTick !== null && tick >= tracked.appliedTick) {
        tracked.markerActive = false;
      }
    }
  }

  public feedback(): OnlineCommandFeedbackView | null {
    if (this.latestSeq === null) return null;
    const tracked = this.commands.get(this.latestSeq);
    return tracked === undefined ? null : { state: tracked.state, message: tracked.message };
  }

  public markerOrders(): ReadonlyMap<EntityId, Order> {
    const markers = new Map<EntityId, Order>();
    for (const tracked of this.commands.values()) {
      if (!tracked.markerActive) continue;
      for (const [id, order] of markerOrdersFor(tracked.command)) markers.set(id, order);
    }
    return markers;
  }

  public clear(): void {
    this.commands.clear();
    this.latestSeq = null;
  }
}

/** Adds local marker-only orders to renderer data; every other entity field stays authoritative. */
export function withOnlineCommandMarkers(
  state: BattleViewState,
  markerOrders: ReadonlyMap<EntityId, Order>,
): BattleViewState {
  if (markerOrders.size === 0) return state;
  const entities = state.entities.map((entity): ReadonlyEntity => {
    const order = markerOrders.get(entity.id);
    return order === undefined || entity.kind !== 'unit' ? entity : { ...entity, order };
  });
  return { ...state, entities };
}

function markerOrdersFor(command: PvpCommand): ReadonlyMap<EntityId, Order> {
  if (command.type === 'Move' || command.type === 'AttackMove') {
    const order = command.type === 'Move' ? moveOrder(command.destination) : attackMoveOrder(command.destination);
    return new Map(command.unitIds.map((id) => [id, order]));
  }
  if (command.type === 'Attack') {
    return new Map(command.unitIds.map((id) => [id, attackOrder(command.targetId)]));
  }
  return new Map();
}

function commandLabel(command: PvpCommand): string {
  switch (command.type) {
    case 'AttackMove': return 'Attack-move';
    case 'SetEntrenchment': return command.entrenched ? 'Entrenchment' : 'Pack up';
    case 'CancelProduction': return 'Queue cancellation';
    case 'ResumeConstruction': return 'Construction resume';
    default: return command.type;
  }
}

function rejectionReason(reason: string): string {
  switch (reason) {
    case 'sequence-gap': return 'command stream is out of sync';
    case 'old-sequence': return 'stale command';
    case 'rate-limited': return 'too many commands';
    case 'invalid-action': return 'action is unavailable';
    default: return 'server rejected the command';
  }
}
