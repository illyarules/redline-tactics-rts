import type { World } from '../core/world';
import type { MapGrid } from '../core/map';
import type { Rect } from '../core/geometry';
import { ECONOMY_CONFIG } from '../config/economy';
import type { Economy } from '../core/economy';
import type { PlayerId } from '../core/ids';
import { cellVisibility, isEntityVisibleToPlayer, type FogState } from '../core/fog';
import { isPowerAvailable } from '../core/power';
import { formatMatchCountdown } from '../core/matchLifecycle';

/** Read-only tactical overview; command simulation lives in `BuildMenu` and `PlacementController`. */
export class TacticalHud {
  private readonly root = document.createElement('div');
  private readonly map = document.createElement('canvas');
  private readonly creditsValue: HTMLElement;
  private readonly powerLine: HTMLElement;
  private readonly timer: HTMLElement;
  public constructor(container: HTMLElement) {
    this.root.className = 'tactical-hud';
    this.root.dataset.testid = 'tactical-hud';
    this.root.innerHTML = `<div class="credits"><span>CREDITS</span><strong>${ECONOMY_CONFIG.startingCredits.toLocaleString()}</strong><small class="power"></small></div>
      <div class="commands" aria-label="Commands unavailable in this preview"><button disabled title="Right-click ground to move a selected unit">↗<small>MOVE</small></button><button disabled title="Combat is not available yet">◎<small>ATTACK</small></button><button disabled title="Select a Worker to build">⌂<small>BUILD</small></button></div>
      <div class="match-timer" data-testid="match-timer">${formatMatchCountdown(0)}</div>
      <div class="sector">OPEN FIELD <span>TACTICAL PREVIEW</span></div>`;
    this.creditsValue = this.root.querySelector('.credits strong') as HTMLElement;
    this.powerLine = this.root.querySelector('.credits .power') as HTMLElement;
    this.timer = this.root.querySelector('.match-timer') as HTMLElement;
    this.map.width = 180; this.map.height = 180;
    this.map.setAttribute('aria-label', 'Minimap: factions, resource fields and camera footprint');
    this.map.className = 'minimap';
    this.root.append(this.map); container.append(this.root);
  }
  public updateTimer(elapsedActiveSeconds: number): void {
    this.timer.textContent = formatMatchCountdown(elapsedActiveSeconds);
  }
  public update(
    world: World,
    grid: MapGrid,
    view: Rect,
    economy: Economy,
    fog: FogState,
    player: PlayerId,
  ): void {
    this.creditsValue.textContent = Math.floor(economy.balance(player)).toLocaleString();
    const powered = isPowerAvailable(world, player);
    this.powerLine.textContent = powered ? 'POWER ONLINE' : 'NO POWER';
    this.powerLine.style.color = powered ? '#9fb0c9' : '#e2874f';
    const ctx = this.map.getContext('2d');
    if (!ctx) return;
    const sx = 180 / grid.bounds.width;
    const sy = 180 / grid.bounds.height;
    const tileWidth = 180 / grid.widthTiles;
    const tileHeight = 180 / grid.heightTiles;
    ctx.fillStyle = '#080d0d';
    ctx.fillRect(0, 0, 180, 180);
    for (let ty = 0; ty < grid.heightTiles; ty++) {
      for (let tx = 0; tx < grid.widthTiles; tx++) {
        const visibility = cellVisibility(fog, player, tx, ty);
        if (visibility === 'hidden') continue;
        ctx.fillStyle = visibility === 'visible' ? '#26382f' : '#16221f';
        ctx.fillRect(tx * tileWidth, ty * tileHeight, tileWidth, tileHeight);
      }
    }
    for (const field of grid.resourceFields) for (const tile of field.tiles) {
      const visibility = cellVisibility(fog, player, tile.tx, tile.ty);
      if (visibility === 'hidden') continue;
      const p = grid.tileCenter(tile.tx, tile.ty);
      ctx.fillStyle = visibility === 'visible' ? '#65d5df' : '#2e696b';
      ctx.fillRect(p.x * sx, p.y * sy, 2, 2);
    }
    for (const entity of world.entities()) {
      if (!isEntityVisibleToPlayer(fog, player, entity)) continue;
      ctx.fillStyle = entity.owner === 'player' ? '#73b5fa' : '#eb9953';
      const size = entity.kind === 'building' ? 7 : 3;
      ctx.fillRect(entity.position.x * sx - size / 2, entity.position.y * sy - size / 2, size, size);
    }
    ctx.strokeStyle = '#d4e5df'; ctx.lineWidth = 1;
    ctx.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy);
  }
  public destroy(): void { this.root.remove(); }
}
