import { expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';
import { startMatch } from './helpers/match';

test('pauses, resumes, and returns to the title screen', async ({ page }) => {
  await clearSnapshot(page);
  await startMatch(page);

  const pauseMenu = page.getByTestId('pause-menu');
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await expect(page.getByTestId('pause-new-match')).toBeVisible();
  await expect(page.getByTestId('pause-return-title')).toBeVisible();

  await page.getByTestId('pause-resume').click();
  await expect(pauseMenu).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();

  await page.getByTestId('pause-return-title').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  // The canvas is hidden, not removed, once the match is disposed — the title screen is what's live.
  await expect(page.getByTestId('game-canvas')).toBeHidden();
});
