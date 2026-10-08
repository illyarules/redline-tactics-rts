import { ENTRENCHMENT_CONFIG } from '../config/entrenchment';
import type { ReadonlyEntity } from '../core/entities';

export class EntrenchMenu {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');

  public constructor(container: HTMLElement, onEntrench: () => void) {
    this.root.dataset.testid = 'entrench-menu';
    Object.assign(this.root.style, { position: 'fixed', left: '435px', bottom: '96px', zIndex: '10', display: 'none' });
    this.button.type = 'button';
    this.button.dataset.testid = 'entrench-fpv-operators';
    Object.assign(this.button.style, {
      font: '600 11px/1.3 system-ui, sans-serif', padding: '7px 10px', borderRadius: '4px',
      border: '1px solid rgba(159, 210, 255, 0.38)', background: 'rgba(10, 17, 22, 0.86)',
      color: '#dce6f5', cursor: 'pointer', letterSpacing: '.04em',
    });
    this.button.addEventListener('click', onEntrench);
    this.root.append(this.button);
    container.append(this.root);
  }

  public update(entities: readonly ReadonlyEntity[]): void {
    const unit = entities.length === 1 && entities[0]?.kind === 'unit' && entities[0].type === 'fpvOperators'
      ? entities[0]
      : null;
    if (unit === null || unit.owner !== 'player') {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.button.disabled = unit.entrenchment !== 'mobile';
    if (unit.entrenchment === 'entrenched') {
      this.button.textContent = 'ENTRENCHED';
      this.button.title = 'Moving removes the entrenched armor and weapon';
    } else if (unit.entrenchment === 'entrenching') {
      const progress = Math.floor(unit.entrenchElapsedSeconds / ENTRENCHMENT_CONFIG.durationSeconds * 100);
      this.button.textContent = `ENTRENCHING ${progress}%`;
      this.button.title = 'The unit cannot attack until entrenchment completes';
    } else {
      this.button.textContent = `ENTRENCH · ${ENTRENCHMENT_CONFIG.durationSeconds}s`;
      this.button.title = 'Deploy FPV equipment and defensive cover';
    }
  }

  public destroy(): void { this.root.remove(); }
}
