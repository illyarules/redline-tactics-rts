import { observeAiDefense, type AiDefenseContext } from '../core/aiDefense';
import { isCompleted } from '../core/prerequisites';
import { aiArmy, type AiMilitaryReadout } from '../core/aiMilitary';
import type { World } from '../core/world';
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

  public update(ai: AiState, world: World, military: AiMilitaryReadout, context: AiDefenseContext, latestAction: string): void {
    const defense = observeAiDefense(context);
    const recovery = AI_CONFIG.recoveryBuildOrder.find((type) => !world.buildings('ai').some((b) => b.type === type && isCompleted(b)));
    const status = defense.base === undefined ? 'base lost' : recovery ?? 'infrastructure complete';
    const transition = ai.lastTransition === null ? '—' : `${ai.lastTransition.from} → ${ai.lastTransition.to}`;
    const next = AI_CONFIG.buildOrder[ai.buildOrderIndex];
    this.root.style.whiteSpace = 'pre-line';
    this.root.textContent = `AI ${ai.state.toUpperCase()}\nNEXT ${ai.decisionRemainingSeconds.toFixed(1)}s\nBUILD ${next === undefined ? 'base complete' : BUILDING_CONFIG[next].name}\nCYCLE ${ai.productionCycleIndex + 1}: ${AI_CONFIG.productionCycle[ai.productionCycleIndex]}\nARMY ${aiArmy(world).length}/${AI_CONFIG.minimumAttackArmyUnits}\nBASE ${ai.lastKnownPlayerBasePosition === null ? 'unknown' : 'last seen'}\nMILITARY ${military.latestAction}\nDEFENSE ${defense.threats.length || 'base secure'}${ai.state === 'defend' ? ` · ${defense.defenders.length}/${AI_CONFIG.maximumDefenders}` : ''}\nRECOVERY ${status}\nRESPONSE ${latestAction}\nLAST ${transition}`;
  }

  public dispose(): void { this.root.remove(); }
}
