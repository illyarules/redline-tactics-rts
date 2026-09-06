/**
 * Build actions for a selected Worker: one button per buildable role, disabled with a reason when
 * its prerequisites are unmet or it is unaffordable right now. Confirming a placement and spending
 * Credits both happen elsewhere — this panel only exposes the choice.
 *
 * Plain HTML over the canvas, like the rest of the HUD, so `ui/` stays free of Babylon. Unlike the
 * read-only panels, this one takes clicks, so `pointer-events` stays on.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import type { Economy } from '../core/economy';
import type { ReadonlyEntity } from '../core/entities';
import { BUILDING_TYPE_IDS, type BuildingTypeId } from '../core/ids';
import { checkPrerequisites } from '../core/prerequisites';
import type { World } from '../core/world';

const BUILDABLE_TYPES: readonly BuildingTypeId[] = BUILDING_TYPE_IDS.filter(
  (type) => BUILDING_CONFIG[type].buildable,
);

export class BuildMenu {
  private readonly root: HTMLElement;
  private readonly buttons: ReadonlyMap<BuildingTypeId, HTMLButtonElement>;

  public constructor(container: HTMLElement, onSelect: (buildingType: BuildingTypeId) => void) {
    this.root = document.createElement('div');
    this.root.dataset.testid = 'build-menu';
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '235px',
      bottom: '96px',
      display: 'none',
      gap: '6px',
      zIndex: '10',
    });

    const buttons = new Map<BuildingTypeId, HTMLButtonElement>();
    for (const type of BUILDABLE_TYPES) {
      const button = document.createElement('button');
      button.textContent = BUILDING_CONFIG[type].name;
      button.dataset.testid = `build-${type}`;
      Object.assign(button.style, {
        font: '11px/1.3 system-ui, sans-serif',
        padding: '6px 10px',
        borderRadius: '4px',
        border: '1px solid rgba(159, 210, 255, 0.28)',
        background: 'rgba(10, 17, 12, 0.7)',
        color: '#dce6f5',
        cursor: 'pointer',
      });
      button.addEventListener('click', () => onSelect(type));
      this.root.append(button);
      buttons.set(type, button);
    }
    this.buttons = buttons;

    container.append(this.root);
  }

  /**
   * Shows build actions for a lone selected friendly Worker, disabling each one the owner cannot
   * currently afford or has not unlocked yet, with a reason in its tooltip. Hides for any other
   * selection.
   */
  public update(entities: readonly ReadonlyEntity[], world: World, economy: Economy): void {
    const worker = entities.length === 1 ? entities[0] : undefined;
    if (worker === undefined || worker.kind !== 'unit' || worker.type !== 'worker') {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'flex';

    for (const [type, button] of this.buttons) {
      const config = BUILDING_CONFIG[type];
      const prerequisite = checkPrerequisites(world, worker.owner, type);
      const afford = economy.canAfford(worker.owner, config.cost);
      button.disabled = !prerequisite.allowed || !afford;
      button.title = !prerequisite.allowed
        ? `Requires ${prerequisite.missing.map((missing) => BUILDING_CONFIG[missing].name).join(', ')}`
        : !afford
          ? `Needs ${config.cost} Credits`
          : `Build ${config.name} — ${config.cost} Credits`;
    }
  }

  public destroy(): void {
    this.root.remove();
  }
}
