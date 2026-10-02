/** Visual-only development switches selected through the current URL. */
export interface DebugOptions {
  /** Draw the whole battlefield without changing authoritative fog-of-war rules. */
  readonly noFog: boolean;
}

export function readDebugOptions(search: string, isDevelopment: boolean): DebugOptions {
  const params = new URLSearchParams(search);
  return {
    noFog: isDevelopment && params.get('debug') === 'no-fog',
  };
}
