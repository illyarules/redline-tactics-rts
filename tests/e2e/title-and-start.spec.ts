import { expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';
import { selectMapAndStart } from './helpers/match';

test('shows only New Game with no saved match, and starts a match', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  const titleScreen = page.getByTestId('title-screen');
  const newGameButton = page.getByTestId('title-new-game');
  await expect(titleScreen).toBeVisible();
  await expect(newGameButton).toBeVisible();
  await expect(page.getByTestId('title-resume')).toHaveCount(0);

  await newGameButton.click();
  await expect(page.getByTestId('map-selection')).toBeVisible();
  await selectMapAndStart(page);

  await expect(titleScreen).not.toBeAttached();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
});
