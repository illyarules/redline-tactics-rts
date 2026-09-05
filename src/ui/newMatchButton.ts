/**
 * The New Match control: lets the player abandon the local saved match and start over.
 *
 * Plain HTML over the canvas, like the other overlay pieces, so `ui/` stays free of Babylon — but
 * unlike the display-only `ControlsOverlay`, this one must receive pointer input, so it does not
 * disable `pointer-events`. It only reports the click; deciding what a "new match" means (clearing
 * the saved snapshot, reloading the page) is a `game/`-layer decision the caller supplies.
 */

export class NewMatchButton {
  private readonly root: HTMLButtonElement;
  private readonly onClick: () => void;

  public constructor(container: HTMLElement, onClick: () => void) {
    this.onClick = onClick;

    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.textContent = 'New Match';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '58px',
      right: '24px',
      padding: '6px 12px',
      background: 'rgba(16, 29, 38, 0.85)',
      border: '1px solid rgba(159, 210, 255, 0.35)',
      borderRadius: '4px',
      color: 'rgba(220, 230, 245, 0.85)',
      font: '11px/1.2 system-ui, sans-serif',
      letterSpacing: '0.04em',
      cursor: 'pointer',
      zIndex: '10',
    });

    this.root.addEventListener('click', this.onClick);
    container.append(this.root);
  }

  public destroy(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}
