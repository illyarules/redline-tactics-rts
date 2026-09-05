/**
 * When an entity shows its health bar.
 *
 * A bar over every entity all the time is noise, and a bar that only ever appears once something
 * is hurt hides the health of the thing the player just clicked. So: always for the selection,
 * and always for anything damaged.
 *
 * Pure and renderer-free, so the rule can be tested without starting the game.
 */

/** `healthFraction` is the entity's health as a 0-1 share of its maximum. */
export function shouldShowHealthBar(healthFraction: number, selected: boolean): boolean {
  return selected || healthFraction < 1;
}
