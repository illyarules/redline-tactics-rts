const STRATEGIC_HORIZON = new URL(
  '../assets/audio/menu/Strategic Horizon.mp3',
  import.meta.url,
).href;
const FORGE_PROTOCOL = new URL(
  '../assets/audio/menu/Forge Protocol.mp3',
  import.meta.url,
).href;
const TACTICAL_PULSE = new URL(
  '../assets/audio/menu/Tactical Pulse.mp3',
  import.meta.url,
).href;

/** Browser audio assets, grouped by the part of the game that owns their playback. */
export const AUDIO_CONFIG = {
  mainMenuMusic: {
    tracks: [STRATEGIC_HORIZON, FORGE_PROTOCOL, TACTICAL_PULSE] as readonly string[],
  },
  matchMusic: {
    // Add imported match track URLs here. Playback already randomizes this list.
    tracks: [] as readonly string[],
  },
  soundEffects: {} as Readonly<Record<string, string>>,
  settings: {
    storageKey: 'mini-command:audio-settings',
    defaultVolumePercent: 30,
    defaultSoundEnabled: true,
  },
} as const;
