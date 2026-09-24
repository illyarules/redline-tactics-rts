/**
 * Covers the match exit/resume lifecycle end to end: the live-match quit confirmation (Save and
 * Quit / Quit Without Saving / Cancel) and the title screen's single Start Game action, backed
 * by the same local snapshot every other persistence test reads and writes.
 */
import { expect, test } from '@playwright/test';
import { persistenceScenario } from './fixtures/scenarios';
import { selectMapAndStart, startMatch } from './helpers/match';
import { clearSnapshot, readSnapshot, seedSnapshot, SNAPSHOT_STORAGE_KEY } from './helpers/storage';

test('Cancel leaves the live match active and untouched', async ({ page }) => {
  await clearSnapshot(page);
  await startMatch(page);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await expect(page.getByTestId('quit-confirm')).toBeVisible();

  await page.getByTestId('quit-confirm-cancel').click();
  await expect(page.getByTestId('quit-confirm')).toBeHidden();
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await expect(page.getByTestId('title-screen')).not.toBeAttached();

  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-menu')).toBeHidden();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
});

test('Save and Quit returns to the start page and Start Game resumes the save', async ({ page }) => {
  await clearSnapshot(page);
  await startMatch(page);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-save').click();

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('game-canvas')).toBeHidden();
  await expect(page.getByTestId('title-start-game')).toBeVisible();
  const saved = await readSnapshot(page);
  expect(saved.entities.length).toBeGreaterThan(0);

  await page.getByTestId('title-start-game').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('game-mode-selection')).toHaveCount(0);
});

test('Quit Without Saving returns to the start page and removes the save', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await startMatch(page);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-discard').click();

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-start-game')).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();
});

test('Resume Game restores the saved match', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await page.goto('/');

  await expect(page.getByTestId('title-start-game')).toBeVisible();
  await page.getByTestId('title-start-game').click();

  await expect(page.getByTestId('game-canvas')).toBeVisible();
  // `persistenceScenario` pre-selects its one friendly Infantry, so a genuine restore shows it
  // immediately — a fresh default match would select the HQ instead.
  await expect(page.getByTestId('selection-panel')).toContainText('Infantry');
});

test('Start Game with a save resumes immediately without opening mode selection', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await page.goto('/');

  await page.getByTestId('title-start-game').click();
  await expect(page.getByTestId('game-mode-selection')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('selection-panel')).toContainText('Infantry');
});

test('With no saved match Start Game opens mode selection', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-start-game')).toBeVisible();

  await page.getByTestId('title-start-game').click();
  await expect(page.getByTestId('game-mode-selection')).toBeVisible();
  await page.getByTestId('game-mode-single').click();
  await selectMapAndStart(page);
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
});
