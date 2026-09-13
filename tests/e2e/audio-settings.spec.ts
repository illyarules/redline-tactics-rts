import { expect, test, type Locator, type Page } from '@playwright/test';
import { AUDIO_CONFIG } from '../../src/config/audio';
import { clearSnapshot } from './helpers/storage';

interface AudioProbeSnapshot {
  readonly instanceCount: number;
  readonly playCalls: readonly { readonly player: number; readonly currentTime: number }[];
  readonly sources: readonly string[];
  readonly volumes: readonly number[];
  readonly currentTimes: readonly number[];
}

async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    const players: HTMLAudioElement[] = [];
    const playCalls: { player: number; currentTime: number }[] = [];
    window.Audio = function Audio(source?: string): HTMLAudioElement {
      const player = new NativeAudio(source);
      const playerIndex = players.push(player) - 1;
      player.play = () => {
        playCalls.push({ player: playerIndex, currentTime: player.currentTime });
        return Promise.resolve();
      };
      return player;
    } as unknown as typeof Audio;
    Object.defineProperty(window, '__audioProbe', { configurable: true, value: { players, playCalls } });
  });
}

async function audioProbe(page: Page): Promise<AudioProbeSnapshot> {
  return page.evaluate(() => {
    const probe = (window as unknown as {
      __audioProbe: { players: HTMLAudioElement[]; playCalls: { player: number; currentTime: number }[] };
    }).__audioProbe;
    return {
      instanceCount: probe.players.length,
      playCalls: [...probe.playCalls],
      sources: probe.players.map((player) => player.src),
      volumes: probe.players.map((player) => player.volume),
      currentTimes: probe.players.map((player) => player.currentTime),
    };
  });
}

async function openPauseAudio(page: Page): Promise<void> {
  await page.getByTestId('pause-settings').click();
  await page.getByTestId('pause-settings-audio').click();
}

async function seedAudioSettings(page: Page, volumePercent: number, soundEnabled: boolean): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [AUDIO_CONFIG.settings.storageKey, JSON.stringify({ volumePercent, soundEnabled })] as const,
  );
}

async function expectQuickToggle(toggle: Locator, action: 'Mute audio' | 'Unmute audio'): Promise<void> {
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', action);
  await expect(toggle).toHaveAttribute('title', action);
}

test('menu quick toggle persists and preserves playback position', async ({ page }) => {
  await installAudioProbe(page);
  await clearSnapshot(page);
  await page.goto('/');

  const quickToggle = page.getByTestId('title-quick-audio-toggle');
  const icon = page.getByTestId('title-quick-audio-icon');
  await expectQuickToggle(quickToggle, 'Unmute audio');
  const mutedIcon = await icon.getAttribute('src');

  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute('aria-label', 'Mute audio');
  await expect(icon).not.toHaveAttribute('src', mutedIcon ?? '');
  expect((await audioProbe(page)).volumes).toEqual([0.3, 0.3]);
  await page.evaluate(() => {
    const probe = (window as unknown as { __audioProbe: { players: HTMLAudioElement[] } }).__audioProbe;
    probe.players[0]!.currentTime = 18;
  });
  const beforeToggle = await audioProbe(page);

  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute('aria-label', 'Unmute audio');
  expect((await audioProbe(page)).volumes).toEqual([0, 0]);

  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute('aria-label', 'Mute audio');
  const afterToggle = await audioProbe(page);
  expect(afterToggle.volumes).toEqual([0.3, 0.3]);
  expect(afterToggle.instanceCount).toBe(beforeToggle.instanceCount);
  expect(afterToggle.currentTimes).toEqual(beforeToggle.currentTimes);
  expect(afterToggle.playCalls.slice(beforeToggle.playCalls.length)).toEqual([{ player: 0, currentTime: 18 }]);

  await page.getByTestId('title-new-game').click();
  await page.keyboard.press('Escape');
  await openPauseAudio(page);
  await page.getByTestId('pause-master-volume').fill('67');
  await page.getByTestId('pause-sound-toggle').click();
  await expect(page.getByTestId('pause-sound-toggle')).toHaveText('Sound: Muted');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-discard').click();
  await expect(page.getByTestId('title-quick-audio-toggle')).toHaveAttribute('aria-label', 'Unmute audio');

  await page.reload();
  await expect(page.getByTestId('title-quick-audio-toggle')).toHaveAttribute('aria-label', 'Unmute audio');
  await expect(page.getByTestId('title-settings')).not.toBeAttached();
});

test('saved mute is applied before startup playback', async ({ page }) => {
  await installAudioProbe(page);
  await seedAudioSettings(page, 54, false);
  await clearSnapshot(page);
  await page.goto('/');

  await expect(page.getByTestId('title-quick-audio-toggle')).toHaveAttribute('aria-label', 'Unmute audio');
  expect((await audioProbe(page)).playCalls).toEqual([]);
  expect((await audioProbe(page)).volumes).toEqual([0, 0]);
  await page.getByTestId('title-new-game').click();
  await page.keyboard.press('Escape');
  await openPauseAudio(page);
  await expect(page.getByTestId('pause-master-volume')).toHaveValue('54');
});

test('match screen omits the quick toggle while pause settings keep the match intact', async ({ page }) => {
  await installAudioProbe(page);
  await clearSnapshot(page);
  await page.goto('/');
  const firstMenuSource = (await audioProbe(page)).sources[0];
  expect(firstMenuSource).toMatch(/(?:Strategic%20Horizon|Forge%20Protocol|Tactical%20Pulse).*\.mp3/);
  await page.getByTestId('title-new-game').click();

  await expect(page.getByTestId('match-quick-audio-toggle')).not.toBeAttached();
  await expect(page.getByTestId('title-quick-audio-toggle')).not.toBeAttached();
  const beforeToggle = await audioProbe(page);
  expect(beforeToggle.sources).toEqual(['', '']);
  await page.keyboard.press('Escape');
  await openPauseAudio(page);
  await page.getByTestId('pause-sound-toggle').click();
  await expect(page.getByTestId('pause-sound-toggle')).toHaveText('Sound: Enabled');
  await expect(page.getByTestId('pause-master-volume')).toHaveValue('30');
  const afterToggle = await audioProbe(page);
  expect(afterToggle.instanceCount).toBe(beforeToggle.instanceCount);
  expect(afterToggle.currentTimes).toEqual(beforeToggle.currentTimes);
  await expect(page.getByTestId('title-screen')).not.toBeAttached();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-discard').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  const returnedMenuSource = (await audioProbe(page)).sources[0];
  expect(returnedMenuSource).toMatch(/(?:Strategic%20Horizon|Forge%20Protocol|Tactical%20Pulse).*\.mp3/);
  expect(returnedMenuSource).not.toBe(firstMenuSource);
});
