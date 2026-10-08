export interface BuildMetadata {
  readonly version: string;
  readonly buildId: string;
}

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

/** Metadata injected by Vite from package.json and the current deployment or Git commit. */
export const BUILD_METADATA: BuildMetadata = {
  version: __APP_VERSION__,
  buildId: __BUILD_ID__,
};
