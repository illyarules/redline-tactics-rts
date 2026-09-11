import { expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';
import { startMatch } from './helpers/match';

test('pauses, resumes, and quits to the title screen through the confirm dialog', async ({ page }) => {
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

  // Quitting mid-match is a confirmation, not an immediate exit.
  await page.getByTestId('pause-return-title').click();
  const quitConfirm = page.getByTestId('quit-confirm');
  await expect(quitConfirm).toBeVisible();
  await expect(pauseMenu).toBeHidden();
  await expect(page.getByTestId('title-screen')).not.toBeAttached();

  await page.getByTestId('quit-confirm-save').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  // The canvas is hidden, not removed, once the match is disposed — the title screen is what's live.
  await expect(page.getByTestId('game-canvas')).toBeHidden();
});
