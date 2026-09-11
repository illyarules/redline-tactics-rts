/**
 * Drives the app through its ordinary title-screen-to-match flow, and polls the persisted snapshot
 * for world-state conditions the UI has no diagnostic for (an individual entity's exact position or
 * health). There is no test-only hook to read those live, so a poll attempt forces the game's own
 * `pagehide` autosave (via a real reload — the same thing closing a tab or reloading does for a real
 * player), reopens the match so the simulation keeps advancing, and re-reads storage.
 */
import { expect, type Page } from '@playwright/test';
import type { WorldSnapshot } from '../../../src/core/snapshot';
import { readSnapshot } from './storage';

/**
 * Opens the app's ordinary `/` route and starts a match through the real title screen: Resume Game
 * when a saved match makes the title screen offer one, New Game otherwise.
 */
export async function startMatch(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  const resumeButton = page.getByTestId('title-resume');
  if (await resumeButton.isVisible()) {
    await resumeButton.click();
  } else {
    await page.getByTestId('title-new-game').click();
  }
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
}

/** Forces the current match to save (a real reload triggers `pagehide`) and resumes it. */
export async function saveAndResume(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('title-resume').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
}

/**
 * Repeatedly forces a save and re-reads the persisted snapshot until `read` returns a defined value,
 * which it should once the condition it is checking becomes true. A short real-time wait paces each
 * attempt so the simulation has time to advance between reloads.
 */
export async function pollSnapshot<T>(
  page: Page,
  read: (snapshot: WorldSnapshot) => T | undefined,
  options: { readonly timeoutMs?: number; readonly intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    await page.waitForTimeout(intervalMs);
    await saveAndResume(page);
    const snapshot = await readSnapshot(page);
    const result = read(snapshot);
    if (result !== undefined) {
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the persisted snapshot to satisfy the condition.');
    }
  }
}
