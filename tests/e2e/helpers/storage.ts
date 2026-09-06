/**
 * Seeds the one local match snapshot the game itself reads/writes (`game/matchPersistence.ts`,
 * `config/persistence.ts`), so a test's fixture reaches the app through its ordinary
 * `loadSnapshot()` / `restoreWorld()` path — no special URL, query parameter, or dev-only mode.
 */
import type { Page } from '@playwright/test';
import { PERSISTENCE_CONFIG } from '../../../src/config/persistence';
import type { WorldSnapshot } from '../../../src/core/snapshot';

/** The exact key `game/matchPersistence.ts` saves and loads. */
export const SNAPSHOT_STORAGE_KEY = PERSISTENCE_CONFIG.storageKey;

let onceMarkerSequence = 0;

/**
 * An init script re-runs on every later navigation for the life of the page — including a reload —
 * so a plain, unconditional seed or clear would silently overwrite whatever the app itself saved (via
 * `pagehide`) by the time a reload-based test re-reads it. Guarding with a one-time `sessionStorage`
 * marker stops that: once one of these has run for this page, later navigations on the same page
 * leave storage alone, which is exactly what the persistence test needs across its intentional reload.
 */
function nextOnceMarker(): string {
  return `e2e-storage-once:${onceMarkerSequence++}`;
}

/** Writes `snapshot` before the app's own scripts run on the next navigation only. */
export async function seedSnapshot(page: Page, snapshot: WorldSnapshot): Promise<void> {
  await page.addInitScript(
    ([storageKey, snapshotJson, marker]) => {
      if (window.sessionStorage.getItem(marker) !== null) {
        return;
      }
      window.sessionStorage.setItem(marker, '1');
      window.localStorage.removeItem(storageKey);
      window.localStorage.setItem(storageKey, snapshotJson);
    },
    [SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot), nextOnceMarker()] as const,
  );
}

/** Clears any match saved on a previous test before the next navigation only — Playwright already
 * isolates storage between tests' browser contexts, but this makes the precondition explicit for
 * tests that open a clean title screen rather than seeding a scenario. */
export async function clearSnapshot(page: Page): Promise<void> {
  await page.addInitScript(
    ([storageKey, marker]) => {
      if (window.sessionStorage.getItem(marker) !== null) {
        return;
      }
      window.sessionStorage.setItem(marker, '1');
      window.localStorage.removeItem(storageKey);
    },
    [SNAPSHOT_STORAGE_KEY, nextOnceMarker()] as const,
  );
}

/** Reads and parses the persisted match snapshot. Throws if nothing has been saved yet. */
export async function readSnapshot(page: Page): Promise<WorldSnapshot> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SNAPSHOT_STORAGE_KEY);
  if (raw === null) {
    throw new Error('No match snapshot is saved yet.');
  }
  return JSON.parse(raw) as WorldSnapshot;
}
