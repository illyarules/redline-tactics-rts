import { expect, test } from '@playwright/test';
import { distance } from '../../src/core/geometry';
import { movementScenario, SCREEN } from './fixtures/scenarios';
import { pollSnapshot, startMatch } from './helpers/match';
import { clearSnapshot, seedSnapshot } from './helpers/storage';

/** Two tiles at the map's 30px tile size — comfortably more than formation-slot spacing. */
const MOVED_THRESHOLD_WORLD_PX = 60;

test('drag-selects a group and moves it into formation', async ({ page }) => {
  await clearSnapshot(page);
  const scenario = movementScenario();
  await seedSnapshot(page, scenario);
  await startMatch(page);

  const originalSpawns = scenario.entities.filter((entity) => entity.kind === 'unit').map((entity) => entity.position);
  expect(originalSpawns).toHaveLength(3);

  await page.mouse.move(SCREEN.groupDragFrom.x, SCREEN.groupDragFrom.y);
  await page.mouse.down();
  await page.mouse.move(SCREEN.groupDragTo.x, SCREEN.groupDragTo.y, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByTestId('selection-panel')).toContainText('3 units selected');

  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y, { button: 'right' });

  const movedUnits = await pollSnapshot(page, (snapshot) => {
    const units = snapshot.entities.filter((entity) => entity.kind === 'unit' && entity.owner === 'player');
    if (units.length !== 3) {
      return undefined;
    }
    const allMovedAway = units.every((unit) =>
      originalSpawns.every((spawn) => distance(unit.position, spawn) > MOVED_THRESHOLD_WORLD_PX),
    );
    return allMovedAway ? units : undefined;
  });

  const uniquePositions = new Set(
    movedUnits.map((unit) => `${Math.round(unit.position.x)},${Math.round(unit.position.y)}`),
  );
  expect(uniquePositions.size).toBe(3);
});
