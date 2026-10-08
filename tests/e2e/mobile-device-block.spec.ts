import { devices, expect, test } from '@playwright/test';
import { clearSnapshot } from './helpers/storage';

test.use({ ...devices['Pixel 7'] });

test('blocks the game entry flow on mobile devices', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');

  const startButton = page.getByTestId('title-start-game');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-metadata-footer')).toBeVisible();
  await expect(page.getByTestId('unsupported-device-warning')).toContainText(
    'Mobile devices are not supported yet',
  );
  await expect(startButton).toBeDisabled();
  await expect(startButton).toHaveAttribute('aria-describedby', 'unsupported-device-warning');

  // The navigation guard remains effective even if the DOM-level disabled state is bypassed.
  await startButton.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  await expect(page.getByTestId('game-mode-selection')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toBeHidden();
  await expect(page.getByTestId('title-quick-audio-toggle')).toHaveCount(0);
});
