import { expect, test } from '@playwright/test';
import { GRID, buildSnapshot, placeHomeHq, placeOpponentHq } from './fixtures/snapshots';
import { startMatch, saveAndResume } from './helpers/match';
import { seedSnapshot } from './helpers/storage';

test('shows a depleted field on click and after resuming a save', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const field = GRID.resourceFields.find((candidate) => candidate.homeFor === 'player');
  expect(field).toBeDefined();
  if (field === undefined) return;
  const scenario = buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian',
      position: grid.tileCenter(field.center.tx - 3, field.center.ty),
    });
    return [];
  });
  await seedSnapshot(page, {
    ...scenario,
    resourceFields: scenario.resourceFields.map((entry) =>
      entry.id === field.id ? { ...entry, remainingCredits: 0 } : entry,
    ),
  });
  await startMatch(page);

  // The home field is northeast of the HQ in the ordinary 1280×720 opening view.
  await page.mouse.click(850, 190);
  await expect(page.getByTestId('selection-panel')).toContainText('0 / 3000 Credits remaining');
  await expect(page.getByTestId('selection-panel')).toContainText('Depleted');
  await saveAndResume(page);
  await page.mouse.click(850, 190);
  await expect(page.getByTestId('selection-panel')).toContainText('0 / 3000 Credits remaining');
  await expect(page.getByTestId('selection-panel')).toContainText('Depleted');
});
