import { expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';

test('shows the title screen and starts a match', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  const titleScreen = page.getByTestId('title-screen');
  const startButton = page.getByTestId('start-match');
  await expect(titleScreen).toBeVisible();
  await expect(startButton).toBeVisible();

  await startButton.click();

  await expect(titleScreen).not.toBeAttached();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('tactical-hud')).toBeVisible();
});
