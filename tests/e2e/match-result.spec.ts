import { expect, test } from '@playwright/test';
import { SCREEN, timeoutScenario, victoryScenario } from './fixtures/scenarios';
import { startMatch } from './helpers/match';
import { readSnapshot, seedSnapshot, SNAPSHOT_STORAGE_KEY } from './helpers/storage';

test('wins through real attack controls, restores terminal, and plays again cleanly', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await seedSnapshot(page, victoryScenario());
  await startMatch(page);

  await expect(page.getByTestId('match-timer')).toHaveText('15:00');
  await expect(page.getByTestId('selection-panel')).toContainText('Rocket');
  await expect.poll(async () => {
    await page.mouse.click(SCREEN.victoryEnemyHq.x, SCREEN.victoryEnemyHq.y, { button: 'right' });
    return page.getByTestId('match-result-overlay').isVisible();
  }).toBe(true);

  await expect(page.getByTestId('match-result-overlay')).toBeVisible();
  await expect(page.getByTestId('match-result-victory')).toHaveText('Victory');
  const terminal = await readSnapshot(page);
  const terminalJson = JSON.stringify(terminal);
  const terminalTimer = await page.getByTestId('match-timer').textContent();
  expect(terminal.lifecycle.result).toBe('victory');
  expect(terminal.entities.some((entity) => entity.kind === 'building' && entity.owner === 'ai' && entity.type === 'hq')).toBe(false);

  // Terminal keyboard/map input cannot open Pause or replace the one consistent terminal save.
  await page.keyboard.press('Escape');
  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y, { button: 'right' });
  await page.waitForTimeout(1_100);
  await expect(page.getByTestId('pause-menu')).toBeHidden();
  await expect(page.getByTestId('match-timer')).toHaveText(terminalTimer ?? '');
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBe(terminalJson);

  // A terminal snapshot opens frozen with its report instead of silently becoming a live match.
  await page.reload();
  await page.getByTestId('title-resume').click();
  await expect(page.getByTestId('match-result-victory')).toBeVisible();

  await page.getByTestId('match-result-play-again').click();
  await expect(page.getByTestId('match-result-overlay')).toBeHidden();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
  await expect(page.getByTestId('match-timer')).toHaveText('15:00');
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();

  // Escape opens Pause again, proving this is a live fresh scene rather than the frozen old one.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('pause-new-match').click();
  await expect(page.getByTestId('pause-menu')).toBeHidden();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();

  // Reuse the terminal save produced above to cover terminal Quit without another combat wait.
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-return-title').click();
  await expect(page.getByTestId('quit-confirm')).toBeVisible();
  await page.getByTestId('quit-confirm-discard').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SNAPSHOT_STORAGE_KEY, terminalJson] as const,
  );
  await page.reload();
  await page.getByTestId('title-resume').click();
  await expect(page.getByTestId('match-result-victory')).toBeVisible();
  await page.getByTestId('match-result-quit').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_STORAGE_KEY)).toBeNull();

  // Starting again from title creates one clean live scene after all prior disposal paths.
  await page.getByTestId('title-new-game').click();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
  await expect(page.getByTestId('match-result-overlay')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('reaches Draw at the active-time limit and persists the frozen timer', async ({ page }) => {
  await seedSnapshot(page, timeoutScenario());
  await startMatch(page);

  await expect(page.getByTestId('match-result-draw')).toHaveText('Draw');
  await expect(page.getByTestId('match-timer')).toHaveText('00:00');
  const terminal = await readSnapshot(page);
  expect(terminal.lifecycle.elapsedActiveSeconds).toBe(900);
  expect(terminal.lifecycle.result).toBe('draw');

  await page.waitForTimeout(1_100);
  await expect(page.getByTestId('match-timer')).toHaveText('00:00');
});
