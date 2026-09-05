import type { World } from '../core/world';
import type { MapGrid } from '../core/map';
import type { Rect } from '../core/geometry';
import { ECONOMY_CONFIG } from '../config/economy';

/** Read-only tactical overview; no economy or command simulation lives here. */
export class TacticalHud {
  private readonly root = document.createElement('div');
  private readonly map = document.createElement('canvas');
  public constructor(container: HTMLElement) {
    this.root.className = 'tactical-hud';
    this.root.innerHTML = `<div class="credits"><span>CREDITS</span><strong>${ECONOMY_CONFIG.startingCredits.toLocaleString()}</strong><small>MERIDIAN / FORWARD BASE</small></div>
      <div class="commands" aria-label="Commands unavailable in this preview"><button disabled title="Right-click ground to move a selected unit">↗<small>MOVE</small></button><button disabled title="Combat is not available yet">◎<small>ATTACK</small></button><button disabled title="Production is not available yet">⌂<small>BUILD</small></button></div>
      <div class="sector">OPEN FIELD <span>TACTICAL PREVIEW</span></div>`;
    this.map.width = 180; this.map.height = 180;
    this.map.setAttribute('aria-label', 'Minimap: factions, resource fields and camera footprint');
    this.map.className = 'minimap';
    this.root.append(this.map); container.append(this.root);
  }
  public update(world: World, grid: MapGrid, view: Rect): void {
    const ctx = this.map.getContext('2d');
    if (!ctx) return;
    const sx = 180 / grid.bounds.width, sy = 180 / grid.bounds.height;
    ctx.fillStyle = '#26382f'; ctx.fillRect(0, 0, 180, 180);
    ctx.strokeStyle = '#34483d'; ctx.lineWidth = 1;
    for (let n = 0; n <= 180; n += 22.5) {
      ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 180);
      ctx.moveTo(0, n); ctx.lineTo(180, n); ctx.stroke();
    }
    ctx.fillStyle = '#65d5df';
    for (const field of grid.resourceFields) for (const tile of field.tiles) {
      const p = grid.tileCenter(tile.tx, tile.ty);
      ctx.fillRect(p.x * sx, p.y * sy, 2, 2);
    }
    for (const entity of world.entities()) {
      ctx.fillStyle = entity.owner === 'player' ? '#73b5fa' : '#eb9953';
      const size = entity.kind === 'building' ? 7 : 3;
      ctx.fillRect(entity.position.x * sx - size / 2, entity.position.y * sy - size / 2, size, size);
    }
    ctx.strokeStyle = '#d4e5df'; ctx.lineWidth = 1;
    ctx.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy);
  }
  public destroy(): void { this.root.remove(); }
}
