import { expect, test } from '@playwright/test';
import { persistenceScenario, SCREEN } from './fixtures/scenarios';
import { saveAndResume, startMatch } from './helpers/match';
import { clearSnapshot, readSnapshot, seedSnapshot } from './helpers/storage';

test('A does not arm Attack-Move', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, persistenceScenario());
  await startMatch(page);

  await page.keyboard.press('A');
  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y);
  await saveAndResume(page);
  const snapshot = await readSnapshot(page);
  expect(snapshot.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'player')?.order).toBeNull();
});

test('Q arms Attack-Move for the next ground click', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, persistenceScenario());
  await startMatch(page);

  await page.keyboard.press('Q');
  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y);
  await saveAndResume(page);
  const snapshot = await readSnapshot(page);
  expect(snapshot.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'player')?.order?.kind)
    .toBe('AttackMove');
});

test('shows the current keyboard shortcuts in the controls hint', async ({ page }) => {
  await clearSnapshot(page);
  await startMatch(page);

  const hint = page.getByTestId('controls-hint');
  await expect(hint).toContainText('W A S D / ↑ ← ↓ → pan');
  await expect(hint).toContainText('+ / − zoom');
  await expect(hint).toContainText('Q attack-move');
});
