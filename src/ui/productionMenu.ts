/** Contextual, HTML production controls. Rules and queue mutation remain in `core/production.ts`. */
import { PRODUCTION_CONFIG } from '../config/production';
import { ECONOMY_CONFIG } from '../config/economy';
import type { Economy } from '../core/economy';
import type { ReadonlyEntity } from '../core/entities';
import { resolveUnitStats } from '../core/factionStats';
import type { PlayerId, UnitTypeId } from '../core/ids';
import { checkProductionRequest, type CancelProductionResult, type ProductionCheck } from '../core/production';
import { isCompleted } from '../core/prerequisites';
import type { World } from '../core/world';

export class ProductionMenu {
  private readonly root: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly queue: HTMLElement;
  private readonly message: HTMLElement;
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
    this.message = document.createElement('div');
    Object.assign(this.message.style, { minHeight: '15px', marginTop: '4px', color: '#e2874f' });
    this.root.append(this.heading, this.actions, this.queue, this.message);
    container.append(this.root);
  }

  public update(entities: readonly ReadonlyEntity[], world: World, economy: Economy, player: PlayerId): void {
    const building = entities.length === 1 && entities[0]?.kind === 'building' ? entities[0] : undefined;
    if (building === undefined || building.owner !== player || !isCompleted(building) || building.stats.produces.length === 0) {
      this.root.style.display = 'none';
      this.shownBuildingId = null;
      return;
    }
    if (this.shownBuildingId !== building.id) {
      this.shownBuildingId = building.id;
      this.lastMessage = '';
    }
    this.root.style.display = 'block';
    this.heading.textContent = `${building.stats.name} production`;
    this.actions.replaceChildren();
    for (const unitType of building.stats.produces) {
      const stats = resolveUnitStats(unitType, building.faction);
      const check = checkProductionRequest(world, economy, player, building.id, unitType);
      const button = document.createElement('button');
      button.textContent = `${stats.name} · ${stats.cost}`;
      button.dataset.testid = `produce-${unitType}`;
      Object.assign(button.style, buttonStyle);
      button.disabled = !check.allowed;
      button.title = check.allowed
        ? `Queue ${stats.name} (${stats.buildTimeSeconds}s)`
        : requestMessage(check, stats.cost);
      button.addEventListener('click', () => this.showRequestResult(this.onQueue(unitType), stats.cost));
      this.actions.append(button);
    }

    this.queue.replaceChildren();
    const count = building.productionQueue.length;
    const powerPaused = building.stats.requiresPower && !world.buildings(player).some(
      (candidate) => candidate.type === 'powerPlant' && isCompleted(candidate),
    );
    const summary = document.createElement('div');
    summary.textContent = powerPaused
      ? `Paused — no power · ${count}/${PRODUCTION_CONFIG.queueCapacity}`
      : `Queue ${count}/${PRODUCTION_CONFIG.queueCapacity}`;
    summary.style.color = powerPaused ? '#e2874f' : '#9fb0c9';
    this.queue.append(summary);
    building.productionQueue.forEach((item, index) => {
      const stats = resolveUnitStats(item.unitType, building.faction);
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' });
      const label = document.createElement('span');
      const progress = index === 0 ? Math.min(100, Math.floor((item.elapsedSeconds / stats.buildTimeSeconds) * 100)) : 0;
      label.textContent = `${index + 1}. ${stats.name}${index === 0 ? ` ${progress}%` : ''}`;
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      Object.assign(cancel.style, { ...buttonStyle, padding: '2px 5px', fontSize: '10px' });
      cancel.title = `Refund ${Math.round(item.paidCost * ECONOMY_CONFIG.cancelRefundFraction)} Credits`;
      cancel.addEventListener('click', () => this.showCancelResult(this.onCancel(index)));
      row.append(label, cancel);
      this.queue.append(row);
    });

    if (this.lastMessage.length > 0) this.message.textContent = this.lastMessage;
    else if (count >= PRODUCTION_CONFIG.queueCapacity) this.message.textContent = 'Queue full';
    else {
      const unaffordable = building.stats.produces
        .map((unitType) => resolveUnitStats(unitType, building.faction))
        .find((stats) => !economy.canAfford(player, stats.cost));
      this.message.textContent = unaffordable === undefined ? '' : `Needs ${unaffordable.cost} Credits`;
    }
  }

  public destroy(): void {
    this.root.remove();
  }

  private showRequestResult(result: ProductionCheck, cost: number): void {
    this.lastMessage = result.allowed ? '' : requestMessage(result, cost);
  }

  private showCancelResult(result: CancelProductionResult): void {
    this.lastMessage = result.cancelled ? `Cancelled — refunded ${result.refunded} Credits` : 'Cannot cancel that queue item';
  }
}

function requestMessage(check: ProductionCheck, cost: number): string {
  switch (check.reason) {
    case 'queue-full': return 'Queue full';
    case 'insufficient-credits': return `Needs ${cost} Credits`;
    case 'incomplete-building': return 'Building is not complete';
    case 'unsupported-unit': return 'This building cannot produce that unit';
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
