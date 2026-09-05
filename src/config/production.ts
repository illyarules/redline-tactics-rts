/** Production is deliberately small: all producers share one visible queue limit and spawn search. */
import type { ProductionConfig } from './types';

export const PRODUCTION_CONFIG: ProductionConfig = {
  queueCapacity: 3,
  spawnSearchRadiusTiles: 6,
};
