/**
 * The controls hint: one compact line of the controls the game currently supports.
 *
 * Deliberately unobtrusive — the battlefield should be the loudest thing on screen — so each
 * control is reduced to a short label and the whole thing sits low-contrast in a corner. The full
 * wording stays in the data for the contextual HUD that arrives in a later task.
 *
 * This is plain HTML over the canvas, which keeps `ui/` free of Babylon. It is display only — it
 * never receives input, so `pointer-events` stays off and clicks reach the battlefield underneath.
 */

export interface ControlHint {
  /** The input, e.g. a key or a device gesture. */
  readonly input: string;
  readonly action: string;
  /** Two or three words for the compact hint line. */
  readonly short: string;
}

/** Grows as later tasks add controls. */
export const CONTROL_HINTS: readonly ControlHint[] = [
  { input: 'W A S D', action: 'Pan the camera', short: 'WASD pan' },
  { input: 'Pointer at screen edge', action: 'Pan the camera', short: 'edge pan' },
  { input: 'Mouse wheel', action: 'Zoom in and out', short: 'wheel zoom' },
  { input: 'Left-click', action: 'Select one of your units or buildings', short: 'click select' },
  { input: 'Right-click ground', action: 'Move the selected friendly unit', short: 'right-click move' },
  { input: 'Right-click a resource field', action: 'Send the selected Worker to gather it', short: 'right-click gather' },
  { input: 'Build menu button', action: 'Start placing that building (select a Worker)', short: 'build menu' },
  { input: 'Left-click ground', action: 'Clear the selection, or confirm a placement', short: 'click ground clears' },
  { input: 'Escape', action: 'Pause the match (or cancel an in-progress building placement)', short: 'esc pause' },
  { input: '`', action: 'Toggle entity debug labels', short: '` labels' },
];

const SEPARATOR = ' · ';

export class ControlsOverlay {
  private readonly root: HTMLElement;

  public constructor(container: HTMLElement, hints: readonly ControlHint[] = CONTROL_HINTS) {
    this.root = document.createElement('div');
    this.root.textContent = hints.map((hint) => hint.short).join(SEPARATOR);
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '24px',
      bottom: '12px',
      color: 'rgba(220, 230, 245, 0.55)',
      font: '11px/1.3 system-ui, sans-serif',
      letterSpacing: '0.02em',
      textShadow: '0 1px 3px rgba(6, 10, 6, 0.9)',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '10',
    });

    container.append(this.root);
  }

  public destroy(): void {
    this.root.remove();
  }
}
