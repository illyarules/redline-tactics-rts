import type { AudioManager } from '../audio/AudioManager';
import { SettingsMenu } from './settingsMenu';

/** Full-screen pause layer. Only this layer exposes New Match during gameplay. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly mainPanel: HTMLElement;
  private readonly settingsMenu: SettingsMenu;
  private readonly settingsButton: HTMLButtonElement;

  public constructor(
    container: HTMLElement,
    onResume: () => void,
    onNewMatch: () => void,
    onReturnToTitle: () => void,
    audio: AudioManager,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.testid = 'pause-menu';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none', placeItems: 'center', zIndex: '50',
      background: 'rgba(3, 9, 13, 0.7)', backdropFilter: 'blur(3px)',
    });
    this.mainPanel = document.createElement('section');
    Object.assign(this.mainPanel.style, {
      minWidth: '250px', padding: '28px', display: 'grid', gap: '10px', textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(19, 39, 51, 0.98), rgba(8, 18, 25, 0.98))',
      border: '1px solid rgba(134, 214, 255, 0.42)', borderRadius: '6px', boxShadow: '0 18px 55px rgba(0,0,0,.5)',
    });
    const heading = document.createElement('h2');
    heading.textContent = 'Paused';
    Object.assign(heading.style, { margin: '0 0 8px', color: '#e9f8ff', font: '600 27px/1 system-ui,sans-serif' });
    this.settingsButton = this.button('Settings', () => this.openSettings(), 'pause-settings');
    this.mainPanel.append(
      heading,
      this.button('Resume', onResume, 'pause-resume'),
      this.button('New Match', onNewMatch, 'pause-new-match'),
      this.settingsButton,
      this.button('Quit to Main Menu', onReturnToTitle, 'pause-return-title'),
    );
    this.root.append(this.mainPanel);
    this.settingsMenu = new SettingsMenu(
      this.root,
      audio,
      'pause',
      () => {
        this.mainPanel.style.display = 'grid';
        this.settingsButton.focus();
      },
      'Back',
    );
    container.append(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'grid' : 'none';
  }

  public handleEscape(): boolean { return this.settingsMenu.handleEscape(); }

  public destroy(): void {
    this.settingsMenu.destroy();
    this.root.remove();
  }

  private openSettings(): void {
    this.mainPanel.style.display = 'none';
    this.settingsMenu.open();
  }

  private button(label: string, onClick: () => void, testId: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.dataset.testid = testId;
    Object.assign(button.style, {
      padding: '11px 16px', border: '1px solid rgba(143, 213, 248, 0.38)', borderRadius: '4px',
      background: '#163545', color: '#e3f5ff', cursor: 'pointer', font: '600 12px/1 system-ui,sans-serif',
      letterSpacing: '.06em', textTransform: 'uppercase',
    });
    button.addEventListener('click', onClick);
    return button;
  }
}
