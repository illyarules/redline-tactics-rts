/** Contextual, HTML production controls. Rules and queue mutation remain in `core/production.ts`. */
import { PRODUCTION_CONFIG } from '../config/production';
import { ECONOMY_CONFIG } from '../config/economy';
import type { Economy } from '../core/economy';
import type { ReadonlyEntity } from '../core/entities';
import { resolveUnitStats } from '../core/factionStats';
import type { PlayerId, UnitTypeId } from '../core/ids';
import { checkProductionRequest, type CancelProductionResult, type ProductionCheck } from '../core/production';
import { isCompleted } from '../core/prerequisites';
import { BUILDING_CONFIG } from '../config/buildings';
import type { World } from '../core/world';

export class ProductionMenu {
  private readonly root: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly queue: HTMLElement;
  private readonly queueSummary: HTMLElement;
  private readonly message: HTMLElement;
  private readonly actionButtons = new Map<UnitTypeId, HTMLButtonElement>();
  private readonly queueRows: QueueRow[] = [];
  private shownUnitTypes: readonly UnitTypeId[] = [];
  private lastMessage = '';
  private shownBuildingId: string | null = null;

  public constructor(
    container: HTMLElement,
    private readonly onQueue: (unitType: UnitTypeId) => ProductionCheck,
    private readonly onCancel: (queueIndex: number) => CancelProductionResult,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.testid = 'production-menu';
    Object.assign(this.root.style, panelStyle, { left: '435px', bottom: '38px', display: 'none' });
    this.heading = document.createElement('div');
    Object.assign(this.heading.style, { color: '#9fd2ff', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' });
    this.actions = document.createElement('div');
    Object.assign(this.actions.style, { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' });
    this.queue = document.createElement('div');
    Object.assign(this.queue.style, { marginTop: '6px', color: '#bfcddd' });
    this.queueSummary = document.createElement('div');
    this.queue.append(this.queueSummary);
    this.message = document.createElement('div');
    Object.assign(this.message.style, { minHeight: '15px', marginTop: '4px', color: '#e2874f' });
    this.root.append(this.heading, this.actions, this.queue, this.message);
    container.append(this.root);
  }

  // eslint-disable-next-line complexity -- The menu renders distinct producer, queue, and affordability states together.
  public update(entities: readonly ReadonlyEntity[], world: World, economy: Economy, player: PlayerId): void {
    const building = entities.length === 1 && entities[0]?.kind === 'building' ? entities[0] : undefined;
    if (building === undefined || building.owner !== player || !isCompleted(building) || building.stats.produces.length === 0) {
      if (this.root.style.display !== 'none') this.root.style.display = 'none';
      this.lastMessage = '';
      setText(this.message, '');
      return;
    }

    const actionsChanged = this.shownBuildingId !== building.id
      || !sameUnitTypes(this.shownUnitTypes, building.stats.produces);
    if (actionsChanged) {
      this.shownBuildingId = building.id;
      this.shownUnitTypes = [...building.stats.produces];
      this.lastMessage = '';
      this.rebuildActions(building.stats.produces);
    }
    if (this.root.style.display !== 'block') this.root.style.display = 'block';
    setText(this.heading, `${building.stats.name} production`);
    for (const unitType of building.stats.produces) {
      const stats = resolveUnitStats(unitType, building.faction);
      const check = checkProductionRequest(world, economy, player, building.id, unitType);
      const button = this.actionButtons.get(unitType);
      if (button === undefined) continue;
      const text = `${stats.name} · ${stats.cost}`;
      setText(button, text);
      const cost = String(stats.cost);
      if (button.dataset.cost !== cost) button.dataset.cost = cost;
      const disabled = !check.allowed;
      if (button.disabled !== disabled) button.disabled = disabled;
      const title = check.allowed
        ? `Queue ${stats.name} (${stats.buildTimeSeconds}s)`
        : requestMessage(check, stats.cost, stats.requires);
      if (button.title !== title) button.title = title;
    }

    const count = building.productionQueue.length;
    const powerPaused = building.stats.requiresPower && !world.buildings(player).some(
      (candidate) => candidate.type === 'powerPlant' && isCompleted(candidate),
    );
    setText(this.queueSummary, powerPaused
      ? `Paused — no power · ${count}/${PRODUCTION_CONFIG.queueCapacity}`
      : `Queue ${count}/${PRODUCTION_CONFIG.queueCapacity}`);
    const summaryColor = powerPaused ? '#e2874f' : '#9fb0c9';
    if (this.queueSummary.style.color !== summaryColor) this.queueSummary.style.color = summaryColor;
    this.resizeQueueRows(count);
    building.productionQueue.forEach((item, index) => {
      const stats = resolveUnitStats(item.unitType, building.faction);
      const row = this.queueRows[index]!;
      const progress = index === 0 ? Math.min(100, Math.floor((item.elapsedSeconds / stats.buildTimeSeconds) * 100)) : 0;
      setText(row.label, `${index + 1}. ${stats.name}${index === 0 ? ` ${progress}%` : ''}`);
      const cancelTitle = `Refund ${Math.round(item.paidCost * ECONOMY_CONFIG.cancelRefundFraction)} Credits`;
      if (row.cancel.title !== cancelTitle) row.cancel.title = cancelTitle;
    });

    let message = this.lastMessage;
    if (message.length === 0 && count >= PRODUCTION_CONFIG.queueCapacity) message = 'Queue full';
    else if (message.length === 0) {
      const unaffordable = building.stats.produces
        .map((unitType) => resolveUnitStats(unitType, building.faction))
        .find((stats) => !economy.canAfford(player, stats.cost));
      message = unaffordable === undefined ? '' : `Needs ${unaffordable.cost} Credits`;
    }
    setText(this.message, message);
  }

  public destroy(): void {
    this.root.remove();
  }

  private showRequestResult(result: ProductionCheck, cost: number, requires: readonly import('../core/ids').BuildingTypeId[] = []): void {
    this.lastMessage = result.allowed ? '' : requestMessage(result, cost, requires);
    setText(this.message, this.lastMessage);
  }

  private showCancelResult(result: CancelProductionResult): void {
    this.lastMessage = result.cancelled ? `Cancelled — refunded ${result.refunded} Credits` : 'Cannot cancel that queue item';
    setText(this.message, this.lastMessage);
  }

  private rebuildActions(unitTypes: readonly UnitTypeId[]): void {
    this.actions.replaceChildren();
    this.actionButtons.clear();
    for (const unitType of unitTypes) {
      const button = document.createElement('button');
      button.dataset.testid = `produce-${unitType}`;
      Object.assign(button.style, buttonStyle);
      button.addEventListener('click', () => {
        const cost = Number(button.dataset.cost ?? 0);
        this.showRequestResult(this.onQueue(unitType), cost, resolveUnitStats(unitType, 'meridian').requires);
      });
      this.actionButtons.set(unitType, button);
      this.actions.append(button);
    }
  }

  private resizeQueueRows(count: number): void {
    while (this.queueRows.length < count) {
      const row = this.createQueueRow(this.queueRows.length);
      this.queueRows.push(row);
      this.queue.append(row.root);
    }
    while (this.queueRows.length > count) {
      this.queueRows.pop()!.root.remove();
    }
  }

  private createQueueRow(index: number): QueueRow {
    const root = document.createElement('div');
    Object.assign(root.style, { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' });
    const label = document.createElement('span');
    Object.assign(label.style, { flex: '0 0 100px', fontVariantNumeric: 'tabular-nums' });
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, { ...buttonStyle, padding: '2px 5px', fontSize: '10px' });
    const row: QueueRow = { root, label, cancel };
    cancel.addEventListener('click', () => this.showCancelResult(this.onCancel(index)));
    root.append(label, cancel);
    return row;
  }
}

interface QueueRow {
  readonly root: HTMLElement;
  readonly label: HTMLElement;
  readonly cancel: HTMLButtonElement;
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function sameUnitTypes(left: readonly UnitTypeId[], right: readonly UnitTypeId[]): boolean {
  return left.length === right.length && left.every((unitType, index) => unitType === right[index]);
}

function requestMessage(check: ProductionCheck, cost: number, requires: readonly import('../core/ids').BuildingTypeId[] = []): string {
  switch (check.reason) {
    case 'queue-full': return 'Queue full';
    case 'insufficient-credits': return `Needs ${cost} Credits`;
    case 'incomplete-building': return 'Building is not complete';
    case 'unsupported-unit': return 'This building cannot produce that unit';
    case 'missing-prerequisite': return `Requires ${requires.map((type) => BUILDING_CONFIG[type].name).join(', ')}`;
    case 'not-owner': return 'That building is not yours';
    default: return 'Production is unavailable';
  }
}

const panelStyle: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  minWidth: '205px',
  padding: '9px 14px',
  background: 'rgba(10, 17, 12, 0.7)',
  border: '1px solid rgba(159, 210, 255, 0.28)',
  borderRadius: '4px',
  color: '#dce6f5',
  font: '11px/1.45 system-ui, sans-serif',
  userSelect: 'none',
  zIndex: '10',
};

const buttonStyle: Partial<CSSStyleDeclaration> = {
  font: '11px/1.3 system-ui, sans-serif',
  padding: '4px 7px',
  borderRadius: '4px',
  border: '1px solid rgba(159, 210, 255, 0.28)',
  background: 'rgba(10, 17, 12, 0.7)',
  color: '#dce6f5',
  cursor: 'pointer',
};
