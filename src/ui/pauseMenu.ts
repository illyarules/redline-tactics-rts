/** Full-screen pause layer. Only this layer exposes New Match during gameplay. */
export class PauseMenu {
  private readonly root: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    onResume: () => void,
    onNewMatch: () => void,
    onReturnToTitle: () => void,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none', placeItems: 'center', zIndex: '50',
      background: 'rgba(3, 9, 13, 0.7)', backdropFilter: 'blur(3px)',
    });
    const panel = document.createElement('section');
    Object.assign(panel.style, {
      minWidth: '250px', padding: '28px', display: 'grid', gap: '10px', textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(19, 39, 51, 0.98), rgba(8, 18, 25, 0.98))',
      border: '1px solid rgba(134, 214, 255, 0.42)', borderRadius: '6px', boxShadow: '0 18px 55px rgba(0,0,0,.5)',
    });
    const heading = document.createElement('h2');
    heading.textContent = 'Paused';
    Object.assign(heading.style, { margin: '0 0 8px', color: '#e9f8ff', font: '600 27px/1 system-ui,sans-serif' });
    panel.append(heading, this.button('Resume', onResume), this.button('New Match', onNewMatch), this.button('Return to Title', onReturnToTitle));
    this.root.append(panel);
    container.append(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'grid' : 'none';
  }

  public destroy(): void { this.root.remove(); }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    Object.assign(button.style, {
      padding: '11px 16px', border: '1px solid rgba(143, 213, 248, 0.38)', borderRadius: '4px',
      background: '#163545', color: '#e3f5ff', cursor: 'pointer', font: '600 12px/1 system-ui,sans-serif',
      letterSpacing: '.06em', textTransform: 'uppercase',
    });
    button.addEventListener('click', onClick);
    return button;
  }
}
