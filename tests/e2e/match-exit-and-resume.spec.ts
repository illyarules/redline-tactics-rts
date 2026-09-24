/**
 * Covers the match exit/resume lifecycle end to end: the live-match quit confirmation (Save and
 * Quit / Quit Without Saving / Cancel) and the title screen's Resume Game / New Game choice, backed
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

test('Save and Quit returns to the main menu and makes Resume Game available', async ({ page }) => {
  await clearSnapshot(page);
  await startMatch(page);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-save').click();

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('game-canvas')).toBeHidden();
  await expect(page.getByTestId('title-resume')).toBeVisible();
  await expect(page.getByTestId('title-new-game')).toBeVisible();
  const saved = await readSnapshot(page);
  expect(saved.entities.length).toBeGreaterThan(0);
});

test('Quit Without Saving returns to the main menu and removes Resume Game', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await startMatch(page);

  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await page.getByTestId('quit-confirm-discard').click();

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-resume')).toHaveCount(0);
  await expect(page.getByTestId('title-new-game')).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();
});

test('Resume Game restores the saved match', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await page.goto('/');

  await expect(page.getByTestId('title-resume')).toBeVisible();
  await page.getByTestId('title-resume').click();

  await expect(page.getByTestId('game-canvas')).toBeVisible();
  // `persistenceScenario` pre-selects its one friendly Infantry, so a genuine restore shows it
  // immediately — a fresh default match would select the HQ instead.
  await expect(page.getByTestId('selection-panel')).toContainText('Infantry');
});

test('New Game from a menu with a save requires confirmation before starting clean', async ({ page }) => {
  await seedSnapshot(page, persistenceScenario());
  await page.goto('/');

  await expect(page.getByTestId('title-resume')).toBeVisible();
  await page.getByTestId('title-new-game').click();

  const confirm = page.getByTestId('title-new-game-confirm');
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('game-canvas')).toBeHidden();

  // Cancelling the confirmation leaves the saved match untouched and resumable.
  await page.getByTestId('title-new-game-confirm-cancel').click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('title-resume')).toBeVisible();

  await page.getByTestId('title-new-game').click();
  await page.getByTestId('title-new-game-confirm-accept').click();
  await selectMapAndStart(page);

  await expect(page.getByTestId('title-screen')).not.toBeAttached();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
  // A fresh default match selects its HQ, not the seeded scenario's Infantry.
  await expect(page.getByTestId('selection-panel')).toContainText('HQ');
  await expect(page.getByTestId('selection-panel')).not.toContainText('Infantry');
});

test('With no saved match the title screen only offers New Game', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-new-game')).toBeVisible();
  await expect(page.getByTestId('title-resume')).toHaveCount(0);

  await page.getByTestId('title-new-game').click();
  // Nothing to lose, so New Game starts immediately with no confirmation dialog.
  await expect(page.getByTestId('title-new-game-confirm')).toHaveCount(0);
  await selectMapAndStart(page);
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
});
