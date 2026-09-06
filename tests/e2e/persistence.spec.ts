import { expect, test } from '@playwright/test';
import { distance } from '../../src/core/geometry';
import { persistenceScenario, SCREEN } from './fixtures/scenarios';
import { saveAndResume, startMatch } from './helpers/match';
import { clearSnapshot, readSnapshot, seedSnapshot } from './helpers/storage';

const MOVED_THRESHOLD_WORLD_PX = 60; // two tiles at the map's 30px tile size

test('restores the last saved position after a reload, not the original spawn', async ({ page }) => {
  await clearSnapshot(page);
  const scenario = persistenceScenario();
  await seedSnapshot(page, scenario);
  await startMatch(page);

  const originalUnit = scenario.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'player');
  expect(originalUnit).toBeDefined();
  const originalPosition = originalUnit!.position;

  // Restored from the snapshot's own `selection`, so no click is needed to select it first.
  const selectionPanel = page.getByTestId('selection-panel');
  await expect(selectionPanel).toContainText('Infantry');

  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y, { button: 'right' });

  // The order completing is directly observable through the real selection panel: it names the
  // unit's live status, which reads "Moving" until it arrives.
  await expect(selectionPanel).toContainText('Idle', { timeout: 15_000 });

  // A real navigation fires `pagehide`, which the match saves on — no arbitrary wait for the
  // periodic autosave interval to elapse is needed.
  await saveAndResume(page);

  const restored = await readSnapshot(page);
  // Restoring assigns every entity a fresh id, so the lone friendly unit is matched by role instead.
  const restoredUnit = restored.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'player');
  expect(restoredUnit).toBeDefined();
  expect(distance(restoredUnit!.position, originalPosition)).toBeGreaterThan(MOVED_THRESHOLD_WORLD_PX);
});
