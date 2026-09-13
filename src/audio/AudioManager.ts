import { AUDIO_CONFIG } from '../config/audio';
import { selectRandomTrack } from './audioPlaylist';

export interface AudioSettings {
  readonly volumePercent: number;
  readonly soundEnabled: boolean;
}

type AudioMode = 'menu' | 'match' | 'none';
type SettingsListener = (settings: AudioSettings) => void;

/** Owns music lifecycle, global volume, mute state, and short-lived sound-effect players. */
export class AudioManager {
  private readonly menuPlayer = new Audio();
  private readonly matchPlayer = new Audio();
  private readonly soundEffectPlayers = new Set<HTMLAudioElement>();
  private readonly listeners = new Set<SettingsListener>();
  private readonly onInteraction = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('[data-quick-audio-toggle]') !== null) return;
    this.resumeDesiredMusic();
  };
  private settings = this.loadSettings();
  private mode: AudioMode = 'none';
  private previousMenuTrack: string | null = null;
  private previousMatchTrack: string | null = null;

  public constructor() {
    this.menuPlayer.loop = true;
    this.matchPlayer.addEventListener('ended', () => this.playNextMatchTrack());
    window.addEventListener('pointerdown', this.onInteraction, true);
    window.addEventListener('keydown', this.onInteraction, true);
    this.applySettings();
  }

  public enterMainMenu(): void {
    this.stopPlayer(this.matchPlayer);
    this.mode = 'menu';
    const track = selectRandomTrack(AUDIO_CONFIG.mainMenuMusic.tracks, this.previousMenuTrack);
    if (track === null) {
      this.stopPlayer(this.menuPlayer);
      return;
    }
    this.previousMenuTrack = track;
    this.startTrack(this.menuPlayer, track, true);
  }

  public enterMatch(): void {
    this.stopPlayer(this.menuPlayer);
    this.stopPlayer(this.matchPlayer);
    this.mode = 'match';
    this.previousMatchTrack = null;
    this.playNextMatchTrack();
  }

  public stopAllMusic(): void {
    this.mode = 'none';
    this.stopPlayer(this.menuPlayer);
    this.stopPlayer(this.matchPlayer);
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setVolume(volumePercent: number): void {
    this.settings = {
      ...this.settings,
      volumePercent: Math.max(0, Math.min(100, Math.round(volumePercent))),
    };
    this.settingsChanged();
  }

  public setSoundEnabled(soundEnabled: boolean): void {
    this.settings = { ...this.settings, soundEnabled };
    this.settingsChanged();
    if (soundEnabled) this.resumeDesiredMusic();
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  /** Plays a registered effect through the same master volume and mute controls as music. */
  public playSoundEffect(effectId: keyof typeof AUDIO_CONFIG.soundEffects): void {
    const source = AUDIO_CONFIG.soundEffects[effectId];
    if (source === undefined || !this.settings.soundEnabled) return;
    const player = new Audio(source);
    this.soundEffectPlayers.add(player);
    player.addEventListener('ended', () => this.soundEffectPlayers.delete(player), { once: true });
    player.volume = this.effectiveVolume();
    void player.play().catch(() => this.soundEffectPlayers.delete(player));
  }

  private playNextMatchTrack(): void {
    if (this.mode !== 'match') return;
    const track = selectRandomTrack(AUDIO_CONFIG.matchMusic.tracks, this.previousMatchTrack);
    if (track === null) {
      this.stopPlayer(this.matchPlayer);
      return;
    }
    this.previousMatchTrack = track;
    this.startTrack(this.matchPlayer, track, true);
  }

  private startTrack(player: HTMLAudioElement, source: string, restart: boolean): void {
    if (player.src !== source) player.src = source;
    if (restart) player.currentTime = 0;
    if (!this.settings.soundEnabled) return;
    void player.play().catch(() => {
      // Browsers may block playback until the next pointer or keyboard interaction.
    });
  }

  private resumeDesiredMusic(): void {
    if (!this.settings.soundEnabled) return;
    if (this.mode === 'menu' && this.menuPlayer.src !== '') {
      void this.menuPlayer.play().catch(() => undefined);
    } else if (this.mode === 'match') {
      if (this.matchPlayer.src === '') this.playNextMatchTrack();
      else void this.matchPlayer.play().catch(() => undefined);
    }
  }

  private stopPlayer(player: HTMLAudioElement): void {
    player.pause();
    player.currentTime = 0;
    player.removeAttribute('src');
    player.load();
  }

  private effectiveVolume(): number {
    return this.settings.soundEnabled ? this.settings.volumePercent / 100 : 0;
  }

  private settingsChanged(): void {
    this.applySettings();
    this.saveSettings();
    const snapshot = this.getSettings();
    for (const listener of this.listeners) listener(snapshot);
  }

  private applySettings(): void {
    const volume = this.effectiveVolume();
    this.menuPlayer.volume = volume;
    this.matchPlayer.volume = volume;
    for (const player of this.soundEffectPlayers) player.volume = volume;
  }

  private loadSettings(): AudioSettings {
    const defaults: AudioSettings = {
      volumePercent: AUDIO_CONFIG.settings.defaultVolumePercent,
      soundEnabled: AUDIO_CONFIG.settings.defaultSoundEnabled,
    };
    try {
      const stored = JSON.parse(localStorage.getItem(AUDIO_CONFIG.settings.storageKey) ?? 'null') as Partial<AudioSettings> | null;
      if (stored === null) return defaults;
      return {
        volumePercent: typeof stored.volumePercent === 'number'
          ? Math.max(0, Math.min(100, Math.round(stored.volumePercent)))
          : defaults.volumePercent,
        soundEnabled: typeof stored.soundEnabled === 'boolean'
          ? stored.soundEnabled
          : defaults.soundEnabled,
      };
    } catch {
      return defaults;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(AUDIO_CONFIG.settings.storageKey, JSON.stringify(this.settings));
    } catch {
      // Audio settings remain active for this session if browser storage is unavailable.
    }
  }
}
