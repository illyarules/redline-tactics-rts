import type { AudioManager } from '../audio/AudioManager';
import { QuickAudioToggle } from './quickAudioToggle';

const OPEN_FIELD_RENDER = new URL('../../assets/concepts/open-field-map-render.png', import.meta.url).href;

/** Single-player entry point with the future multiplayer mode visible but intentionally disabled. */
export class GameModeScreen {
  private readonly root = document.createElement('div');
  private readonly quickAudioToggle: QuickAudioToggle;

  public constructor(container: HTMLElement, audio: AudioManager, onSingleGame: () => void) {
    this.root.dataset.testid = 'game-mode-selection';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '60',
      backgroundImage: `linear-gradient(rgba(4, 11, 15, 0.38), rgba(4, 11, 15, 0.78)), url("${OPEN_FIELD_RENDER}")`,
      backgroundPosition: 'center', backgroundSize: 'cover', color: '#e7f5ff',
    });

    const panel = document.createElement('section');
    Object.assign(panel.style, {
      width: 'min(560px, calc(100vw - 48px))', padding: '42px 38px', textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(9, 22, 30, 0.94), rgba(6, 13, 19, 0.97))',
      border: '1px solid rgba(130, 214, 255, 0.5)', borderRadius: '8px',
      boxShadow: '0 18px 70px rgba(0, 0, 0, 0.58)',
    });
    panel.innerHTML = `<div style="font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.22em;color:#83d6ff">TACTICAL COMMAND</div>
      <h1 style="margin:10px 0 12px;font:700 clamp(38px,7vw,58px)/1 system-ui,sans-serif;letter-spacing:-.045em">Redline Tactics</h1>
      <p style="margin:0 0 28px;color:#d4e2e9;font:18px/1.4 system-ui,sans-serif">Choose a game mode.</p>`;
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'grid', gap: '14px' });
    actions.append(
      this.modeButton('Single Game', 'game-mode-single', false, onSingleGame),
      this.modeButton('🔒  Multiplayer', 'game-mode-multiplayer', true),
    );
    panel.append(actions);
    this.root.append(panel);
    container.append(this.root);
    this.quickAudioToggle = new QuickAudioToggle(this.root, audio, 'mode');
  }

  public destroy(): void {
    this.quickAudioToggle.destroy();
    this.root.remove();
  }

  private modeButton(
    label: string,
    testId: string,
    disabled: boolean,
    onClick?: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = testId;
    button.disabled = disabled;
    Object.assign(button.style, {
      width: '100%', padding: '16px 22px', borderRadius: '4px',
      border: `1px solid ${disabled ? 'rgba(118, 154, 178, .55)' : '#9ee6ff'}`,
      background: disabled ? 'linear-gradient(180deg,#1c3545,#102532)' : 'linear-gradient(180deg,#2d9dcc,#176b91)',
      color: disabled ? '#8299a9' : '#f2fbff', cursor: disabled ? 'not-allowed' : 'pointer',
      font: '600 15px/1 system-ui,sans-serif', letterSpacing: '.12em', textTransform: 'uppercase',
      boxShadow: disabled ? 'none' : '0 0 24px rgba(65, 199, 255, 0.28)', opacity: disabled ? '.78' : '1',
    });
    if (onClick !== undefined) button.addEventListener('click', onClick);
    return button;
  }
}
