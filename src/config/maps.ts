import openFieldThumbnail from '../../assets/concepts/open-field-minimap-reference.png';
import tridentThumbnail from '../../assets/concepts/trident-basin-minimap-reference.png';
import type { MapCatalogEntry } from './types';
import { MAP_CONFIG, TRIDENT_BASIN_CONFIG } from './map';

export const MAP_CATALOG: readonly MapCatalogEntry[] = [
  {
    config: MAP_CONFIG,
    description: 'A direct duel across a broad, readable central approach.',
    matchType: '1 VS 1',
    thumbnailUrl: openFieldThumbnail,
  },
  {
    config: TRIDENT_BASIN_CONFIG,
    description: 'Outmaneuver two allied enemy commanders across forests, ridges and rocky lanes.',
    matchType: '1 VS 2',
    thumbnailUrl: tridentThumbnail,
  },
];
