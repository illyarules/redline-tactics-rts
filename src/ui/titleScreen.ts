/**
 * The first screen a player sees. It deliberately exposes one action only: an existing save is
 * resumed by Start Game, while a fresh session continues to mode selection.
 */
const OPEN_FIELD_RENDER = new URL('../../assets/concepts/open-field-map-render.png', import.meta.url).href;

export class TitleScreen {
  private readonly root: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    title: string,
    description: string,
    onStart: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.testid = 'title-screen';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '60',
      backgroundImage: `linear-gradient(rgba(4, 11, 15, 0.38), rgba(4, 11, 15, 0.78)), url("${OPEN_FIELD_RENDER}")`,
      backgroundPosition: 'center', backgroundSize: 'cover', color: '#e7f5ff',
    });

    const panel = document.createElement('section');
    Object.assign(panel.style, {
      width: 'min(560px, calc(100vw - 48px))', padding: '44px 38px', textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(9, 22, 30, 0.9), rgba(6, 13, 19, 0.94))',
      border: '1px solid rgba(130, 214, 255, 0.45)', borderRadius: '8px',
      boxShadow: '0 18px 70px rgba(0, 0, 0, 0.55)',
    });
    panel.innerHTML = `<div style="font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.22em;color:#83d6ff">TACTICAL COMMAND</div>
      <h1 style="margin:10px 0 8px;font:700 clamp(38px,7vw,58px)/1 system-ui,sans-serif;letter-spacing:-.045em">${title}</h1>
      <p style="margin:0 0 28px;color:#b8cad5;font:15px/1.5 system-ui,sans-serif">${description}</p>`;
    panel.append(this.startButton(onStart));
    this.root.append(panel);
    container.append(this.root);
  }

  public destroy(): void { this.root.remove(); }

  private startButton(onStart: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Start Game';
    button.dataset.testid = 'title-start-game';
    Object.assign(button.style, {
      width: '100%', padding: '15px 22px', border: '1px solid #9ee6ff', borderRadius: '4px',
      background: 'linear-gradient(180deg, #2d91bd, #176181)', color: '#f2fbff', cursor: 'pointer',
      font: '600 14px/1 system-ui,sans-serif', letterSpacing: '.12em', textTransform: 'uppercase',
      boxShadow: '0 0 24px rgba(65, 199, 255, 0.28)',
    });
    button.addEventListener('click', onStart);
    return button;
  }
}
