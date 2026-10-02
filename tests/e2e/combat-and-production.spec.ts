import { expect, test } from '@playwright/test';
import { buildProductionScenario, combatScenario, productionMenuScenario, SCREEN } from './fixtures/scenarios';
import { pollSnapshot, saveAndResume, startMatch } from './helpers/match';
import { clearSnapshot, readSnapshot, seedSnapshot } from './helpers/storage';
import type { BuildingSnapshot } from '../../src/core/snapshot';

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
  const produceWorker = page.getByTestId('produce-worker');
  await expect(produceWorker).toBeEnabled();
  await produceWorker.click();
  await expect(productionMenu).toContainText('Queue 1/3');
  await expect(productionMenu).not.toContainText('Queue 2/3');
});

test('a Worker resumes an interrupted construction site without paying again', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, buildProductionScenario());
  await startMatch(page);

  await page.getByTestId('build-barracks').click();
  await page.mouse.click(SCREEN.clearBuildSite.x, SCREEN.clearBuildSite.y);
  const started = await pollSnapshot(page, (snapshot) => {
    const site = snapshot.entities.find((entity): entity is BuildingSnapshot =>
      entity.kind === 'building' && entity.owner === 'player' && entity.type === 'barracks');
    return site !== undefined && site.constructionProgress > 0
      ? { progress: site.constructionProgress, credits: snapshot.credits.player }
      : undefined;
  });

  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y, { button: 'right' });
  await page.waitForTimeout(500);
  await saveAndResume(page);
  const interrupted = await readSnapshot(page);
  const pausedSite = interrupted.entities.find((entity): entity is BuildingSnapshot =>
    entity.kind === 'building' && entity.owner === 'player' && entity.type === 'barracks');
  expect(pausedSite?.constructionProgress).toBeGreaterThanOrEqual(started.progress);

  await page.mouse.click(SCREEN.clearBuildSite.x, SCREEN.clearBuildSite.y, { button: 'right' });
  const resumedProgress = await pollSnapshot(page, (snapshot) => {
    const site = snapshot.entities.find((entity): entity is BuildingSnapshot =>
      entity.kind === 'building' && entity.owner === 'player' && entity.type === 'barracks');
    return site !== undefined && site.constructionProgress > (pausedSite?.constructionProgress ?? 1)
      ? site.constructionProgress
      : undefined;
  }, { timeoutMs: 30_000 });

  expect(resumedProgress).toBeGreaterThan(pausedSite?.constructionProgress ?? 1);
  expect((await readSnapshot(page)).credits.player).toBe(started.credits);
});

test('production controls retain identity while their state changes and cancel normally', async ({ page }) => {
  await clearSnapshot(page);
  await seedSnapshot(page, productionMenuScenario());
  await startMatch(page);

  const productionMenu = page.getByTestId('production-menu');
  const produceWorker = page.getByTestId('produce-worker');
  await expect(productionMenu).toBeVisible();
  await expect(produceWorker).toBeEnabled();
  const originalProduceWorker = await produceWorker.elementHandle();
  if (originalProduceWorker === null) throw new Error('Worker production button was not attached.');
  await produceWorker.evaluate(() => new Promise<void>((resolve) => {
    let framesRemaining = 4;
    const onFrame = (): void => {
      framesRemaining -= 1;
      if (framesRemaining === 0) resolve();
      else requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }));
  const currentProduceWorker = await produceWorker.elementHandle();
  if (currentProduceWorker === null) throw new Error('Worker production button became detached.');
  expect(await originalProduceWorker.evaluate(
    (button, current) => button === current,
    currentProduceWorker,
  )).toBe(true);

  await produceWorker.click();
  const firstCancel = productionMenu.getByRole('button', { name: 'Cancel' }).first();
  const originalFirstCancel = await firstCancel.elementHandle();
  if (originalFirstCancel === null) throw new Error('Production cancel button was not attached.');

  await produceWorker.click();
  await produceWorker.click();
  await expect(productionMenu).toContainText('Queue 3/3');
  await expect(produceWorker).toBeDisabled();
  await expect(produceWorker).toHaveAttribute('title', 'Queue full');
  expect(await originalProduceWorker.evaluate((button) => button.isConnected)).toBe(true);
  expect(await originalFirstCancel.evaluate((button) => button.isConnected)).toBe(true);

  await firstCancel.click();
  await expect(productionMenu).toContainText('Queue 2/3');
  await expect(produceWorker).toBeEnabled();
  await expect(produceWorker).toHaveAttribute('title', /Queue Worker/);
  expect(await originalFirstCancel.evaluate((button) => button.isConnected)).toBe(true);
  await expect(productionMenu).toContainText('Cancelled');

  await page.mouse.click(SCREEN.clearDestination.x, SCREEN.clearDestination.y);
  await expect(productionMenu).toBeHidden();
  await page.mouse.click(SCREEN.hq.x, SCREEN.hq.y);
  await expect(productionMenu).toBeVisible();
  await expect(productionMenu).not.toContainText('Cancelled');
});
