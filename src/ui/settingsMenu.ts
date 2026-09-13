import type { AudioManager } from '../audio/AudioManager';
import { AudioSettingsPanel } from './audioSettings';

type SettingsPage = 'settings' | 'audio';

/** Settings → Audio navigation used by the paused-match menu. */
export class SettingsMenu {
  private readonly root: HTMLElement;
  private readonly settingsPage: HTMLDivElement;
  private readonly audioPage: HTMLDivElement;
  private readonly audioButton: HTMLButtonElement;
  private readonly audioSettings: AudioSettingsPanel;
  private page: SettingsPage = 'settings';

  public constructor(
    container: HTMLElement,
    audio: AudioManager,
    testIdPrefix: string,
    private readonly onClose: () => void,
    closeLabel: string,
  ) {
    this.root = document.createElement('section');
    this.root.dataset.testid = `${testIdPrefix}-settings-menu`;
    Object.assign(this.root.style, {
      width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)',
      boxSizing: 'border-box', padding: '28px', display: 'none', gap: '14px', overflowY: 'auto',
      textAlign: 'center', background: 'linear-gradient(180deg, rgba(19, 39, 51, 0.98), rgba(8, 18, 25, 0.98))',
      border: '1px solid rgba(134, 214, 255, 0.42)', borderRadius: '6px',
      boxShadow: '0 18px 55px rgba(0,0,0,.5)', color: '#e9f8ff',
    });

    this.settingsPage = this.pageContainer();
    this.audioButton = this.button('Audio', `${testIdPrefix}-settings-audio`, () => this.showAudio());
    this.settingsPage.append(
      this.heading('Settings'),
      this.audioButton,
      this.button(closeLabel, `${testIdPrefix}-settings-back`, () => this.close()),
    );

    this.audioPage = this.pageContainer();
    this.audioSettings = new AudioSettingsPanel(audio, testIdPrefix);
    this.audioPage.append(
      this.heading('Audio'),
      this.audioSettings.element(),
      this.button('Back to Settings', `${testIdPrefix}-audio-back`, () => this.showSettings()),
    );
    this.audioPage.style.display = 'none';

    this.root.append(this.settingsPage, this.audioPage);
    container.append(this.root);
  }

  public open(): void {
    this.page = 'settings';
    this.renderPage();
    this.root.style.display = 'grid';
    this.audioButton.focus();
  }

  public close(): void {
    if (!this.isOpen()) return;
    this.root.style.display = 'none';
    this.onClose();
  }

  /** Returns true when Escape was consumed by settings navigation. */
  public handleEscape(): boolean {
    if (!this.isOpen()) return false;
    if (this.page === 'audio') this.showSettings();
    else this.close();
    return true;
  }

  public destroy(): void {
    this.audioSettings.destroy();
    this.root.remove();
  }

  private isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  private showAudio(): void {
    this.page = 'audio';
    this.renderPage();
    this.audioSettings.focusPrimaryControl();
  }

  private showSettings(): void {
    this.page = 'settings';
    this.renderPage();
    this.audioButton.focus();
  }

  private renderPage(): void {
    this.settingsPage.style.display = this.page === 'settings' ? 'grid' : 'none';
    this.audioPage.style.display = this.page === 'audio' ? 'grid' : 'none';
  }

  private pageContainer(): HTMLDivElement {
    const page = document.createElement('div');
    Object.assign(page.style, { display: 'grid', gap: '12px' });
    return page;
  }

  private heading(label: string): HTMLHeadingElement {
    const heading = document.createElement('h2');
    heading.textContent = label;
    Object.assign(heading.style, { margin: '0 0 8px', color: '#e9f8ff', font: '600 27px/1 system-ui,sans-serif' });
    return heading;
  }

  private button(label: string, testId: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = testId;
    button.className = 'settings-control';
    Object.assign(button.style, {
      padding: '11px 16px', border: '1px solid rgba(143, 213, 248, 0.38)', borderRadius: '4px',
      background: '#163545', color: '#e3f5ff', cursor: 'pointer', font: '600 12px/1 system-ui,sans-serif',
      letterSpacing: '.06em', textTransform: 'uppercase',
    });
    button.addEventListener('click', onClick);
    return button;
  }
}
