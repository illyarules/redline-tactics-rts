/**
 * The first screen a player sees. It deliberately exposes one action only: an existing save is
 * resumed by Start Game, while a fresh session continues to mode selection.
 */
const OPEN_FIELD_RENDER = new URL('../../assets/concepts/open-field-map-render-v2.png', import.meta.url).href;
const UNSUPPORTED_DEVICE_MESSAGE =
  'Mobile devices are not supported yet. Please open Redline Tactics on a desktop computer.';
const REPOSITORY_URL = 'https://github.com/illyarules/redline-tactics-rts';
const EXTERNAL_LINKS = [
  { label: 'GitHub', url: REPOSITORY_URL },
  { label: 'Report a bug', url: `${REPOSITORY_URL}/issues/new` },
  { label: 'Feedback', url: `${REPOSITORY_URL}/issues/new?title=Feedback%3A%20` },
] as const;

interface TitleScreenOptions {
  readonly gameStartSupported?: boolean;
  readonly version?: string;
  readonly buildId?: string;
}

export class TitleScreen {
  private readonly root: HTMLDivElement;

  public constructor(
    container: HTMLElement,
    title: string,
    description: string,
    onStart: () => void,
    options: TitleScreenOptions = {},
  ) {
    const { gameStartSupported = true, version = 'dev', buildId = 'dev' } = options;
    this.root = document.createElement('div');
    this.root.dataset.testid = 'title-screen';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column', zIndex: '60',
      overflow: 'auto', padding: '24px', boxSizing: 'border-box',
      backgroundImage: `linear-gradient(rgba(4, 11, 15, 0.38), rgba(4, 11, 15, 0.78)), url("${OPEN_FIELD_RENDER}")`,
      backgroundPosition: 'center', backgroundSize: 'cover', color: '#e7f5ff',
    });

    const main = document.createElement('main');
    Object.assign(main.style, {
      flex: '1 0 auto', display: 'grid', placeItems: 'center', width: '100%', padding: '24px 0',
      boxSizing: 'border-box',
    });
    const panel = document.createElement('section');
    Object.assign(panel.style, {
      width: 'min(560px, calc(100vw - 48px))', padding: '44px 38px', textAlign: 'center',
      boxSizing: 'border-box',
      background: 'linear-gradient(180deg, rgba(9, 22, 30, 0.9), rgba(6, 13, 19, 0.94))',
      border: '1px solid rgba(130, 214, 255, 0.45)', borderRadius: '8px',
      boxShadow: '0 18px 70px rgba(0, 0, 0, 0.55)',
    });
    panel.innerHTML = `<div style="font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.22em;color:#83d6ff">TACTICAL COMMAND</div>
      <h1 style="margin:10px 0 8px;font:700 clamp(38px,7vw,58px)/1 system-ui,sans-serif;letter-spacing:-.045em">${title}</h1>
      <p style="margin:0 0 28px;color:#b8cad5;font:15px/1.5 system-ui,sans-serif">${description}</p>`;
    if (!gameStartSupported) panel.append(this.unsupportedDeviceWarning());
    panel.append(this.startButton(onStart, gameStartSupported));
    main.append(panel);
    this.root.append(main, this.metadataFooter(version, buildId));
    container.append(this.root);
  }

  public destroy(): void { this.root.remove(); }

  private startButton(onStart: () => void, gameStartSupported: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Start Game';
    button.dataset.testid = 'title-start-game';
    button.disabled = !gameStartSupported;
    button.setAttribute('aria-disabled', String(!gameStartSupported));
    if (!gameStartSupported) button.setAttribute('aria-describedby', 'unsupported-device-warning');
    Object.assign(button.style, {
      width: '100%', padding: '15px 22px', border: '1px solid #9ee6ff', borderRadius: '4px',
      background: 'linear-gradient(180deg, #2d91bd, #176181)', color: '#f2fbff',
      cursor: gameStartSupported ? 'pointer' : 'not-allowed', opacity: gameStartSupported ? '1' : '.52',
      font: '600 14px/1 system-ui,sans-serif', letterSpacing: '.12em', textTransform: 'uppercase',
      boxShadow: gameStartSupported ? '0 0 24px rgba(65, 199, 255, 0.28)' : 'none',
    });
    if (gameStartSupported) button.addEventListener('click', onStart);
    return button;
  }

  private unsupportedDeviceWarning(): HTMLParagraphElement {
    const warning = document.createElement('p');
    warning.id = 'unsupported-device-warning';
    warning.dataset.testid = 'unsupported-device-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = UNSUPPORTED_DEVICE_MESSAGE;
    Object.assign(warning.style, {
      margin: '0 0 16px', padding: '11px 14px', border: '1px solid rgba(255, 190, 88, .58)',
      borderRadius: '4px', background: 'rgba(75, 47, 12, .58)', color: '#ffe0a3',
      font: '600 13px/1.45 system-ui,sans-serif', textAlign: 'left',
    });
    return warning;
  }

  private metadataFooter(version: string, buildId: string): HTMLElement {
    const footer = document.createElement('footer');
    footer.dataset.testid = 'title-metadata-footer';
    Object.assign(footer.style, {
      flex: '0 0 auto', width: '100%', display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px 28px', color: '#91a6b3',
      font: '500 10px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      letterSpacing: '.08em', textTransform: 'uppercase', textShadow: '0 1px 4px #000',
    });

    const build = document.createElement('span');
    build.dataset.testid = 'title-build-metadata';
    build.textContent = `v${version} · build ${buildId}`;

    const links = document.createElement('nav');
    links.setAttribute('aria-label', 'Redline Tactics links');
    Object.assign(links.style, { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' });
    links.append(this.externalLink('Developed by @illyarules', 'https://github.com/illyarules'));
    for (const link of EXTERNAL_LINKS) links.append(this.externalLink(link.label, link.url));
    footer.append(build, links);
    return footer;
  }

  private externalLink(label: string, url: string): HTMLAnchorElement {
    const link = document.createElement('a');
    link.textContent = label;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    Object.assign(link.style, { color: '#b8cfdb', textDecorationColor: '#5d7b8a', textUnderlineOffset: '3px' });
    return link;
  }
}
