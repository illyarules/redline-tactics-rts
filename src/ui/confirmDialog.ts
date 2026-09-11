/**
 * A reusable full-screen confirmation layer, styled like the pause menu and match-result overlay.
 * Built once with fixed copy and actions, then toggled with `show()`/`hide()` — the same pattern
 * every other overlay in `ui/` uses, so callers never rebuild it per click.
 */
export interface ConfirmDialogAction {
  readonly label: string;
  readonly testId: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
}

export class ConfirmDialog {
  private readonly root: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    testId: string,
    heading: string,
    message: string,
    actions: readonly ConfirmDialogAction[],
    zIndex = 52,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.testid = testId;
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none', placeItems: 'center', zIndex: String(zIndex),
      background: 'rgba(3, 9, 13, 0.78)', backdropFilter: 'blur(3px)',
    });

    const panel = document.createElement('section');
    Object.assign(panel.style, {
      width: 'min(360px, calc(100vw - 48px))', padding: '28px', display: 'grid', gap: '14px',
      textAlign: 'center', color: '#e9f8ff',
      background: 'linear-gradient(180deg, rgba(19, 39, 51, 0.98), rgba(8, 18, 25, 0.98))',
      border: '1px solid rgba(134, 214, 255, 0.42)', borderRadius: '6px',
      boxShadow: '0 18px 55px rgba(0,0,0,.5)',
    });

    const headingEl = document.createElement('h2');
    headingEl.textContent = heading;
    Object.assign(headingEl.style, { margin: '0', color: '#e9f8ff', font: '600 22px/1.25 system-ui,sans-serif' });

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    Object.assign(messageEl.style, { margin: '0', color: '#b8cad5', font: '14px/1.5 system-ui,sans-serif' });

    const actionsEl = document.createElement('div');
    Object.assign(actionsEl.style, { display: 'grid', gap: '10px' });
    for (const action of actions) {
      actionsEl.append(this.button(action));
    }

    panel.append(headingEl, messageEl, actionsEl);
    this.root.append(panel);
    container.append(this.root);
  }

  public show(): void {
    this.root.style.display = 'grid';
  }

  public hide(): void {
    this.root.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.root.style.display !== 'none';
  }

  public destroy(): void {
    this.root.remove();
  }

  private button(action: ConfirmDialogAction): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.dataset.testid = action.testId;
    Object.assign(button.style, {
      padding: '11px 16px',
      border: `1px solid ${action.primary === true ? '#9ee6ff' : 'rgba(143, 213, 248, 0.38)'}`,
      borderRadius: '4px',
      background: action.primary === true ? 'linear-gradient(180deg, #2d91bd, #176181)' : '#163545',
      color: '#f2fbff', cursor: 'pointer', font: '600 12px/1 system-ui,sans-serif',
      letterSpacing: '.06em', textTransform: 'uppercase',
    });
    button.addEventListener('click', action.onClick);
    return button;
  }
}
