/**
 * The game title, shown above the battlefield.
 *
 * It lives in the HTML layer rather than in the scene because camera zoom scales everything the
 * camera draws, including objects pinned with a zero scroll factor. The text to show is passed in,
 * so `ui/` stays independent of `game/`.
 */

export class TitleBanner {
  private readonly root: HTMLElement;

  public constructor(container: HTMLElement, text: string) {
    this.root = document.createElement('div');
    this.root.textContent = text;
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '24px',
      left: '24px',
      
      color: 'rgba(158, 210, 255, 0.7)',
      font: '600 15px/1.2 system-ui, sans-serif',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      textShadow: '0 1px 4px rgba(6, 10, 6, 0.9)',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '10',
    });

    container.append(this.root);
  }

  public destroy(): void {
    this.root.remove();
  }
}
