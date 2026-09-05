import type { PersistenceConfig } from './types';

export const PERSISTENCE_CONFIG: PersistenceConfig = {
  storageKey: 'mini-command:match-snapshot',
  saveIntervalSeconds: 2,
};
