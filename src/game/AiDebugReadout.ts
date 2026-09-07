import type { AiState } from '../core/ai';
import { AI_CONFIG } from '../config/ai';
import { BUILDING_CONFIG } from '../config/buildings';

/** Small development-only status readout; it has no controls and never mutates match state. */
export class AiDebugReadout {
  private readonly root = document.createElement('div');

  public constructor(container: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed', right: '18px', top: '62px', zIndex: '10', pointerEvents: 'none',
      padding: '6px 8px', border: '1px solid #3f5968', borderRadius: '3px', background: '#0b151be8',
      color: '#b9ceda', font: '10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '.04em', textAlign: 'right',
    });
    container.append(this.root);
  }

  public update(ai: AiState): void {
    const transition = ai.lastTransition === null ? '—' : `${ai.lastTransition.from} → ${ai.lastTransition.to}`;
    const next = AI_CONFIG.buildOrder[ai.buildOrderIndex];
    this.root.style.whiteSpace = 'pre-line';
    this.root.textContent = `AI ${ai.state.toUpperCase()}\nNEXT ${ai.decisionRemainingSeconds.toFixed(1)}s\nBUILD ${next === undefined ? 'base complete' : BUILDING_CONFIG[next].name}\nLAST ${transition}`;
  }

  public dispose(): void { this.root.remove(); }
}
