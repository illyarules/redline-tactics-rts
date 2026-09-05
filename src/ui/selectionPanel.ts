/**
 * The selection readout: what is selected, and how healthy it is.
 *
 * Plain HTML over the canvas, like the controls card, so `ui/` stays free of Babylon and the text
 * stays crisp at every zoom. Display only — `pointer-events` stays off so clicks reach the map.
 * The full contextual HUD arrives in a later task.
 */
import { healthFraction, type ReadonlyEntity } from '../core/entities';

const HEALTH_COLORS = ['#d9614c', '#e2c44f', '#6fdc8c'] as const;

export class SelectionPanel {
  private readonly root: HTMLElement;
  private readonly nameLine: HTMLElement;
  private readonly healthLine: HTMLElement;
  private readonly detailLine: HTMLElement;

  public constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '235px',
      bottom: '38px',
      minWidth: '185px',
      padding: '9px 14px',
      background: 'rgba(10, 17, 12, 0.7)',
      border: '1px solid rgba(159, 210, 255, 0.28)',
      borderRadius: '4px',
      color: '#dce6f5',
      font: '11px/1.45 system-ui, sans-serif',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '10',
      display: 'none',
    });

    this.nameLine = document.createElement('div');
    Object.assign(this.nameLine.style, {
      color: '#9fd2ff',
      fontWeight: '600',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontSize: '10px',
    });

    this.healthLine = document.createElement('div');
    this.detailLine = document.createElement('div');
    Object.assign(this.detailLine.style, { color: '#9fb0c9' });

    this.root.append(this.nameLine, this.healthLine, this.detailLine);
    container.append(this.root);
  }

  /** Shows the entity's name, health and current activity, or hides the panel when nothing is selected. */
  public update(entities: readonly ReadonlyEntity[]): void {
    const entity = entities[0] ?? null;
    if (entity === null) {
      this.nameLine.textContent = 'No selection';
      this.healthLine.textContent = 'Select a friendly unit or structure';
      this.detailLine.textContent = '';
      this.root.style.display = 'block';
      return;
    }

    if (entities.length > 1) {
      this.nameLine.textContent = `${entities.length} units selected`;
      this.healthLine.textContent = 'Group move ready';
      this.healthLine.style.color = '#9fd2ff';
      this.detailLine.textContent = 'Right-click passable ground to move';
      this.root.style.display = 'block';
      return;
    }

    const health = Math.ceil(entity.health);
    this.nameLine.textContent = entity.stats.name;
    this.healthLine.textContent = `Health ${health} / ${entity.stats.maxHealth}`;
    this.healthLine.style.color = healthColor(healthFraction(entity));
    this.detailLine.textContent = entity.status === 'idle' ? 'Idle' : entity.status;
    this.root.style.display = 'block';
  }

  public destroy(): void {
    this.root.remove();
  }
}

function healthColor(fraction: number): string {
  const index = fraction > 0.6 ? 2 : fraction > 0.3 ? 1 : 0;
  return HEALTH_COLORS[index] ?? HEALTH_COLORS[2];
}
