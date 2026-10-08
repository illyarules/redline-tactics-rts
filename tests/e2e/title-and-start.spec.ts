import { expect, test } from '@playwright/test';
import { clearSnapshot, readSnapshot } from './helpers/storage';
import { selectMapAndStart } from './helpers/match';

test('starts through mode and map selection with multiplayer disabled', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  const titleScreen = page.getByTestId('title-screen');
  const startGameButton = page.getByTestId('title-start-game');
  await expect(titleScreen).toBeVisible();
  await expect(startGameButton).toBeVisible();
  await expect(page.getByTestId('title-quick-audio-toggle')).toHaveCount(0);
  await startGameButton.click();
  await expect(page.getByTestId('game-mode-selection')).toBeVisible();
  await expect(page.getByTestId('game-mode-single')).toBeEnabled();
  await expect(page.getByTestId('game-mode-multiplayer')).toBeDisabled();
  await expect(page.getByTestId('mode-quick-audio-toggle')).toHaveAttribute('aria-label', 'Mute audio');
  await page.getByTestId('game-mode-single').click();
  await expect(page.getByTestId('map-selection')).toBeVisible();
  await selectMapAndStart(page);

  await expect(titleScreen).not.toBeAttached();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
  await expect(page.getByTestId('ai-debug-readout')).toContainText('CREDITS AI 900');

  await page.reload();
  const snapshot = await readSnapshot(page);
  expect(
    snapshot.entities
      .filter((entity) => entity.kind === 'unit' && entity.owner === 'player')
      .map((entity) => entity.type),
  ).toEqual(['worker']);
  expect(
    snapshot.entities
      .filter((entity) => entity.kind === 'unit' && entity.owner === 'ai')
      .map((entity) => entity.type),
  ).toEqual(['worker']);
});
