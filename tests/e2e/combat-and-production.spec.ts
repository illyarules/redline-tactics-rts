import { expect, test } from '@playwright/test';
import { buildProductionScenario, combatScenario, SCREEN } from './fixtures/scenarios';
import { pollSnapshot, startMatch } from './helpers/match';
import { clearSnapshot, seedSnapshot } from './helpers/storage';

test('combat applies damage to the targeted enemy', async ({ page }) => {
  await clearSnapshot(page);
  const scenario = combatScenario();
  await seedSnapshot(page, scenario);
  await startMatch(page);

  const enemy = scenario.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'ai');
  expect(enemy).toBeDefined();
  const startingHealth = enemy!.health;

  // Restored from the snapshot's own `selection` — see `combatScenario` for why.
  await expect(page.getByTestId('selection-panel')).toContainText('Infantry');

  await pollSnapshot(page, (snapshot) => {
    const current = snapshot.entities.find((entity) => entity.kind === 'unit' && entity.owner === 'ai');
    const health = current?.health ?? 0;
    return health < startingHealth ? health : undefined;
  });
});

test('placing a building starts construction and queuing a unit shows in the queue', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, buildProductionScenario());
  await startMatch(page);

  // Restored from the snapshot's own `selection`, so the build menu is already showing.
  const selectionPanel = page.getByTestId('selection-panel');
  await expect(selectionPanel).toContainText('Worker');
  await expect(page.getByTestId('build-menu')).toBeVisible();

  await page.getByTestId('build-barracks').click();
  await page.mouse.move(SCREEN.clearBuildSite.x, SCREEN.clearBuildSite.y);
  await page.mouse.click(SCREEN.clearBuildSite.x, SCREEN.clearBuildSite.y);

  // Credits update on the tactical HUD within its own short refresh interval — a real, visible cue
  // that construction started and was paid for.
  await expect(page.getByTestId('tactical-hud')).toContainText('600');

  // Selecting the new construction site by clicking the same spot again confirms placement through
  // the real UI, without reading any world state directly.
  await page.mouse.click(SCREEN.clearBuildSite.x, SCREEN.clearBuildSite.y);
  await expect(selectionPanel).toContainText('Barracks');

  await page.mouse.click(SCREEN.hq.x, SCREEN.hq.y);
  await expect(selectionPanel).toContainText('HQ');

  const productionMenu = page.getByTestId('production-menu');
  await expect(productionMenu).toBeVisible();
  // `ProductionMenu` rebuilds its action buttons every simulation frame, so a normal locator click
  // (which waits for the element to be stable across two frames first) never settles here. A direct
  // DOM click dispatches the same click event a pointer click would, onto whichever button instance
  // currently exists, and is retried by `expect.poll` until one is enabled.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>('[data-testid="produce-worker"]');
        if (button === null || button.disabled) return false;
        button.click();
        return true;
      }),
    )
    .toBe(true);
  await expect(productionMenu).toContainText('Queue 1/3');
});
