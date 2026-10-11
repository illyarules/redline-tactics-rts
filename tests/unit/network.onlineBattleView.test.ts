import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { cellVisibility, type CellVisibility } from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { OnlineBattleViewAdapter, type OnlineBattleSnapshot } from '../../src/network/onlineBattleView';

const grid = createMapGrid(MAP_CONFIG);

function fog(value: CellVisibility): CellVisibility[][] {
  return Array.from({ length: grid.heightTiles }, () =>
    Array.from({ length: grid.widthTiles }, () => value));
}

function snapshot(fields: OnlineBattleSnapshot['fields']): OnlineBattleSnapshot {
  return {
    seat: 'player',
    fog: fog('visible'),
    fields,
    entities: [
      {
        id: 'worker-public-id', owner: 'player', kind: 'unit', type: 'worker',
        x: 405, y: 975, health: 150, maxHealth: 150,
        status: 'moving', facingRadians: 1.25, entrenchment: 'mobile',
      },
      {
        id: 'hq-public-id', owner: 'player', kind: 'building', type: 'hq',
        x: 165, y: 945, health: 1500, maxHealth: 1500,
        status: 'producing', constructionProgress: 1,
        queue: [{ id: 'queue-1', type: 'worker', progress: 2 }],
      },
    ],
  };
}

describe('OnlineBattleViewAdapter', () => {
  it('hydrates filtered network entities for the shared presentation', () => {
    const adapter = new OnlineBattleViewAdapter(grid);
    const projection = adapter.project(snapshot([{ id: 'west-home', remaining: 3750 }]), ['worker-public-id']);
    const worker = projection.state.entities.find((entity) => entity.id === 'worker-public-id');
    const hq = projection.state.entities.find((entity) => entity.id === 'hq-public-id');

    expect(worker).toMatchObject({
      kind: 'unit', faction: 'meridian', status: 'moving', facingRadians: 1.25,
    });
    expect(hq).toMatchObject({
      kind: 'building', faction: 'meridian', topLeft: { tx: 4, ty: 30 },
    });
    expect(hq?.kind === 'building' ? hq.productionQueue[0] : undefined).toMatchObject({
      id: 'queue-1', unitType: 'worker', elapsedSeconds: 2,
    });
    expect(projection.state.selectedIds).toEqual(['worker-public-id']);
    expect(projection.state.fieldFractions.get('west-home')).toBe(0.75);
    expect(cellVisibility(projection.fog, 'player', 20, 20)).toBe('visible');
  });

  it('retains the last observed resource amount when a field leaves vision', () => {
    const adapter = new OnlineBattleViewAdapter(grid);
    adapter.project(snapshot([{ id: 'west-home', remaining: 2500 }]), []);

    const hidden = adapter.project(snapshot([]), []);

    expect(hidden.state.fieldFractions.get('west-home')).toBe(0.5);
  });
});
