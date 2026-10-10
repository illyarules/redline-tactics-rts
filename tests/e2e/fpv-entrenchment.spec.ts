import { expect, test } from '@playwright/test';
import { fpvEntrenchmentScenario } from './fixtures/scenarios';
import { startMatch } from './helpers/match';
import { clearSnapshot, seedSnapshot } from './helpers/storage';

test('FPV operators visibly deploy and can pack up again', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, fpvEntrenchmentScenario());
  await startMatch(page);

  const selection = page.getByTestId('selection-panel');
  const action = page.getByTestId('entrench-fpv-operators');
  await expect(selection).toContainText('must entrench to attack');
  await expect(action).toContainText('ENTRENCH');

  await page.keyboard.press('E');
  await expect(action).toContainText('ENTRENCHING');
  await expect(action).toContainText('PACK UP', { timeout: 5_000 });
  await expect(selection).toContainText('entrenched');

  await action.click();
  await expect(action).toContainText('ENTRENCH');
  await expect(selection).toContainText('must entrench to attack');
});
