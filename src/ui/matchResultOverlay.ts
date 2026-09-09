import type { MatchLifecycleState, MatchResult } from '../core/matchLifecycle';

/** Full-screen terminal layer shown over the frozen battlefield. */
export class MatchResultOverlay {
  private readonly root: HTMLDivElement;
  private readonly heading: HTMLHeadingElement;
  private readonly stats: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    onPlayAgain: () => void,
    onQuitToTitle: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.testid = 'match-result-overlay';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none', placeItems: 'center', zIndex: '55',
      pointerEvents: 'auto', background: 'rgba(3, 9, 13, 0.72)', backdropFilter: 'blur(3px)',
    });

    const panel = document.createElement('section');
    Object.assign(panel.style, {
      width: 'min(390px, calc(100vw - 48px))', padding: '34px', display: 'grid', gap: '18px',
      textAlign: 'center', color: '#e9f8ff',
      background: 'linear-gradient(180deg, rgba(19, 39, 51, 0.98), rgba(8, 18, 25, 0.98))',
      border: '1px solid rgba(134, 214, 255, 0.42)', borderRadius: '8px',
      boxShadow: '0 18px 65px rgba(0,0,0,.58)',
    });

    const eyebrow = document.createElement('div');
    eyebrow.textContent = 'BATTLE REPORT';
    Object.assign(eyebrow.style, {
      color: '#83d6ff', font: '600 11px/1 system-ui,sans-serif', letterSpacing: '.22em',
    });

    this.heading = document.createElement('h2');
    Object.assign(this.heading.style, {
      margin: '-4px 0 0', font: '700 44px/1 system-ui,sans-serif', letterSpacing: '-.035em',
    });

    this.stats = document.createElement('div');
    Object.assign(this.stats.style, {
      display: 'grid', gap: '9px', padding: '16px 18px', textAlign: 'left',
      background: 'rgba(3, 12, 18, .55)', border: '1px solid rgba(143, 213, 248, .18)',
      borderRadius: '5px', color: '#bed3df', font: '14px/1.35 system-ui,sans-serif',
    });

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' });
    actions.append(
      this.button('Play Again', onPlayAgain, 'match-result-play-again', true),
      this.button('Quit to Title', onQuitToTitle, 'match-result-quit', false),
    );
    panel.append(eyebrow, this.heading, this.stats, actions);
    this.root.append(panel);
    container.append(this.root);
  }

  public show(state: MatchLifecycleState): void {
    if (state.result === null) return;
    this.heading.textContent = state.result === 'victory' ? 'Victory' : state.result === 'defeat' ? 'Defeat' : 'Draw';
    this.heading.dataset.testid = resultTestId(state.result);
    this.heading.style.color = state.result === 'victory' ? '#9ee6ff' : state.result === 'defeat' ? '#ffad9e' : '#e7c881';
    this.stats.replaceChildren(
      this.statRow('Active time', formatElapsed(state.elapsedActiveSeconds)),
      this.statRow('Units produced', String(state.unitsProduced.player)),
      this.statRow('Units lost', String(state.unitsLost.player)),
      this.statRow('Enemy produced / lost', `${state.unitsProduced.ai} / ${state.unitsLost.ai}`),
    );
    this.root.style.display = 'grid';
  }

  public destroy(): void { this.root.remove(); }

  private statRow(label: string, value: string): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', gap: '24px' });
    const name = document.createElement('span');
    name.textContent = label;
    const number = document.createElement('strong');
    number.textContent = value;
    number.style.color = '#eefaff';
    row.append(name, number);
    return row;
  }

  private button(
    label: string,
    onClick: () => void,
    testId: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = testId;
    Object.assign(button.style, {
      padding: '12px 14px', border: `1px solid ${primary ? '#9ee6ff' : 'rgba(143, 213, 248, .38)'}`,
      borderRadius: '4px', background: primary ? 'linear-gradient(180deg, #2d91bd, #176181)' : '#163545',
      color: '#f2fbff', cursor: 'pointer', font: '600 12px/1 system-ui,sans-serif',
      letterSpacing: '.06em', textTransform: 'uppercase',
    });
    button.addEventListener('click', onClick);
    return button;
  }
}

function resultTestId(result: Exclude<MatchResult, null>): string {
  return result === 'victory'
    ? 'match-result-victory'
    : result === 'defeat'
      ? 'match-result-defeat'
      : 'match-result-draw';
}

function formatElapsed(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
