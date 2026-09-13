import type { AudioManager, AudioSettings } from '../audio/AudioManager';

/** Audio controls shown through the in-match pause menu. */
export class AudioSettingsPanel {
  private readonly root: HTMLFieldSetElement;
  private readonly volume: HTMLInputElement;
  private readonly volumeValue: HTMLOutputElement;
  private readonly toggle: HTMLButtonElement;
  private readonly unsubscribe: () => void;

  public constructor(audio: AudioManager, testIdPrefix: string) {
    this.root = document.createElement('fieldset');
    this.root.dataset.testid = `${testIdPrefix}-audio-settings`;
    Object.assign(this.root.style, {
      margin: '10px 0 4px', padding: '14px', display: 'grid', gap: '10px',
      border: '1px solid rgba(134, 214, 255, 0.28)', borderRadius: '4px', textAlign: 'left',
    });
    const legend = document.createElement('legend');
    legend.textContent = 'Audio';
    Object.assign(legend.style, {
      padding: '0 7px', color: '#83d6ff', font: '600 11px/1 system-ui,sans-serif',
      letterSpacing: '.12em', textTransform: 'uppercase',
    });

    const label = document.createElement('label');
    const labelText = document.createElement('span');
    labelText.textContent = 'Master volume';
    this.volumeValue = document.createElement('output');
    Object.assign(label.style, { display: 'flex', justifyContent: 'space-between', color: '#cbe6f3', font: '12px/1 system-ui,sans-serif' });
    label.append(labelText, this.volumeValue);

    this.volume = document.createElement('input');
    this.volume.type = 'range';
    this.volume.min = '0';
    this.volume.max = '100';
    this.volume.step = '1';
    this.volume.dataset.testid = `${testIdPrefix}-master-volume`;
    this.volume.className = 'settings-control';
    this.volume.setAttribute('aria-label', 'Master volume');
    this.volume.addEventListener('input', () => audio.setVolume(this.volume.valueAsNumber));

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.dataset.testid = `${testIdPrefix}-sound-toggle`;
    this.toggle.className = 'settings-control';
    Object.assign(this.toggle.style, {
      padding: '9px 12px', border: '1px solid rgba(143, 213, 248, 0.38)', borderRadius: '4px',
      background: '#163545', color: '#e3f5ff', cursor: 'pointer',
      font: '600 11px/1 system-ui,sans-serif', letterSpacing: '.06em', textTransform: 'uppercase',
    });
    this.toggle.addEventListener('click', () => audio.setSoundEnabled(!audio.getSettings().soundEnabled));

    this.root.append(legend, label, this.volume, this.toggle);
    this.unsubscribe = audio.subscribe((settings) => this.render(settings));
  }

  public element(): HTMLFieldSetElement { return this.root; }

  public focusPrimaryControl(): void { this.volume.focus(); }

  public destroy(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private render(settings: AudioSettings): void {
    this.volume.value = String(settings.volumePercent);
    this.volumeValue.value = `${settings.volumePercent}%`;
    this.volumeValue.textContent = `${settings.volumePercent}%`;
    this.toggle.textContent = settings.soundEnabled ? 'Sound: Enabled' : 'Sound: Muted';
    this.toggle.setAttribute('aria-pressed', String(settings.soundEnabled));
  }
}
