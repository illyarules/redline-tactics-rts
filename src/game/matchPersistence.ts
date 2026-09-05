/**
 * Reads and writes the one local match snapshot this browser keeps, in `localStorage`.
 *
 * This is the boundary between the pure `core/snapshot.ts` shapes and the browser: every function
 * here swallows storage and parsing failures instead of letting them reach the render loop — a
 * missing, corrupt, or blocked save must never crash the game, only fall back to a fresh match.
 */
import { PERSISTENCE_CONFIG } from '../config/persistence';
import { isValidSnapshotShape, type WorldSnapshot } from '../core/snapshot';

/** The saved snapshot, or `null` when there isn't one or it fails even the cheap shape check. */
export function loadSnapshot(): WorldSnapshot | null {
  try {
    const raw = localStorage.getItem(PERSISTENCE_CONFIG.storageKey);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isValidSnapshotShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: WorldSnapshot): void {
  try {
    localStorage.setItem(PERSISTENCE_CONFIG.storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Mini Command: failed to save the local match snapshot.', error);
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(PERSISTENCE_CONFIG.storageKey);
  } catch (error) {
    console.warn('Mini Command: failed to clear the local match snapshot.', error);
  }
}
