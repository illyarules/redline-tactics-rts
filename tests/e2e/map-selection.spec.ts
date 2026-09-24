import { expect, test } from '@playwright/test';
import { clearSnapshot, readSnapshot } from './helpers/storage';
import { saveAndResume, selectMapAndStart } from './helpers/match';

test('selects Trident Basin and resumes both AI participants on the saved map', async ({ page }) => {
  await clearSnapshot(page);
  await page.goto('/');
  await page.getByTestId('title-new-game').click();

  const picker = page.getByTestId('map-selection');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('map-option-open-field')).toContainText('OPEN FIELD');
  await expect(page.getByTestId('map-option-trident-basin')).toContainText('TRIDENT BASIN');
  await expect(page.getByTestId('map-option-trident-basin')).toContainText('1 VS 2');

  await selectMapAndStart(page, 'trident-basin');
  await expect(page.getByTestId('tactical-hud')).toContainText('TRIDENT BASIN');

  await saveAndResume(page);
  await expect(page.getByTestId('map-selection')).toHaveCount(0);
  await expect(page.getByTestId('tactical-hud')).toContainText('TRIDENT BASIN');
  const snapshot = await readSnapshot(page);
  expect(snapshot.mapId).toBe('trident-basin');
  expect(snapshot.secondaryAi).not.toBeNull();
  expect(snapshot.credits.ai).toBeDefined();
  expect(snapshot.credits.ai2).toBeDefined();
  expect(snapshot.entities.filter((entity) => entity.owner === 'ai' && entity.type === 'hq')).toHaveLength(1);
  expect(snapshot.entities.filter((entity) => entity.owner === 'ai2' && entity.type === 'hq')).toHaveLength(1);
});
