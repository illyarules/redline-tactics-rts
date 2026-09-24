import type { AudioManager, AudioSettings } from '../audio/AudioManager';

const AUDIO_ENABLED_ICON = new URL('../assets/audio/ui/audio-enabled.png', import.meta.url).href;
const AUDIO_MUTED_ICON = new URL('../assets/audio/ui/audio-muted.png', import.meta.url).href;

/** Compact global mute control shared by menu and live-match overlays. */
export class QuickAudioToggle {
  private readonly root: HTMLButtonElement;
  private readonly icon: HTMLImageElement;
  private readonly unsubscribe: () => void;

  public constructor(container: HTMLElement, audio: AudioManager, context: 'mode' | 'match') {
    this.root = document.createElement('button');
    this.root.type = 'button';
    this.root.className = 'settings-control quick-audio-toggle';
    this.root.dataset.testid = `${context}-quick-audio-toggle`;
    this.root.dataset.quickAudioToggle = 'true';
    Object.assign(this.root.style, {
      position: 'fixed', top: context === 'mode' ? '28px' : '68px', right: '24px',
      width: '64px', height: '64px', padding: '3px', border: '0', borderRadius: '10px',
      background: 'transparent', cursor: 'pointer', zIndex: '30', touchAction: 'manipulation',
      transition: 'filter 120ms ease, transform 120ms ease',
    });
    this.icon = document.createElement('img');
    this.icon.alt = '';
    this.icon.dataset.testid = `${context}-quick-audio-icon`;
    Object.assign(this.icon.style, {
      display: 'block', width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none',
    });
    this.root.append(this.icon);
    this.root.addEventListener('click', () => audio.setSoundEnabled(!audio.getSettings().soundEnabled));
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());
    this.root.addEventListener('keydown', (event) => event.stopPropagation());
    container.append(this.root);
    this.unsubscribe = audio.subscribe((settings) => this.render(settings));
  }

  public destroy(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private render(settings: AudioSettings): void {
    const action = settings.soundEnabled ? 'Mute audio' : 'Unmute audio';
    this.root.setAttribute('aria-label', action);
    this.root.title = action;
    this.root.setAttribute('aria-pressed', String(!settings.soundEnabled));
    this.icon.src = settings.soundEnabled ? AUDIO_ENABLED_ICON : AUDIO_MUTED_ICON;
  }
}
