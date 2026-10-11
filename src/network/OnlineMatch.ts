import type { Engine } from '@babylonjs/core/Engines/engine';
import { BUILDING_CONFIG } from '../config/buildings';
import { MAP_CONFIG } from '../config/map';
import { UNIT_CONFIG } from '../config/units';
import { PRODUCTION_CONFIG } from '../config/production';
import type { ReadonlyBuilding, ReadonlyEntity } from '../core/entities';
import { cellVisibility, type FogState } from '../core/fog';
import type { TileCoord, Vec2 } from '../core/geometry';
import type { BuildingTypeId, EntityId, UnitTypeId } from '../core/ids';
import { createMapGrid } from '../core/map';
import { checkBuildingPlacement } from '../core/placement';
import type { PvpCommand, Seat } from '../core/pvp';
import { inspectResourceField } from '../core/resourceFieldInspection';
import { BattlePresentation } from '../game/BattlePresentation';
import { PlacementController } from '../game/PlacementController';
import { SelectionController } from '../game/SelectionController';
import type { BattleViewState } from '../game/battleViewState';
import { BattleHud, type BattleHudAction, type BattleHudViewModel } from '../ui/BattleHud';
import {
  OnlineBattleViewAdapter,
  type OnlineBattleSnapshot,
  type OnlineEntityView as EntityView,
} from './onlineBattleView';
import './onlineMatch.css';

const STORAGE = 'redline-online-seat';
const VERSION = 1;
const SERVER_URL = import.meta.env.VITE_MULTIPLAYER_URL ?? 'ws://localhost:8787/ws';
const BUILDABLE_TYPES = (Object.keys(BUILDING_CONFIG) as BuildingTypeId[]).filter((type) => BUILDING_CONFIG[type].buildable);

interface Snapshot extends OnlineBattleSnapshot {
  readonly type: 'snapshot';
  readonly matchId: string;
  readonly snapshotSeq: number;
  readonly tick: number;
  readonly credits: number;
  readonly result: { readonly winner: Seat | null; readonly reason: string } | null;
}
interface LobbySeat { readonly seat: Seat; readonly occupied: boolean; readonly connected: boolean; readonly ready: boolean }

export class OnlineMatch {
  private readonly root = element('div', 'online-match');
  private readonly grid = createMapGrid(MAP_CONFIG);
  private readonly presentation: BattlePresentation;
  private readonly battleView = new OnlineBattleViewAdapter(this.grid);
  private readonly selection: SelectionController;
  private readonly placement: PlacementController;
  private readonly modalLayer = element('div', 'online-modal-layer');
  private readonly modalCard = element('section', 'online-card');
  private readonly modalStatus = element('p', 'online-status');
  private readonly gameUi = element('div', 'online-game-ui');
  private readonly hud: BattleHud;
  private readonly toast = element('div', 'online-toast');
  private readonly help = element('section', 'online-help');
  private readonly confirm = element('div', 'online-confirm');
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private invite: string | null = null;
  private credential: string | null = null;
  private seat: Seat | null = null;
  private matchId: string | null = null;
  private epoch = 0;
  private seq = 0;
  private reconnectDelay = 500;
  private disposed = false;
  private snapshot: Snapshot | null = null;
  private battleState: BattleViewState | null = null;
  private battleFog: FogState | null = null;
  private toastTimer: number | null = null;
  private readonly heartbeat = window.setInterval(() => {
    if (this.credential) this.send({ type: 'ping', protocolVersion: VERSION });
  }, 5000);

  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    container: HTMLElement,
    private readonly onExit: () => void,
    inviteFromUrl?: { roomId: string; invite: string },
  ) {
    this.presentation = new BattlePresentation(engine, canvas, this.grid, null);
    this.presentation.cameraController.setEnabled(false);
    this.createUi();
    container.append(this.root);
    this.hud = new BattleHud(this.gameUi, {
      topActions: [
        hudAction('controls', 'Controls', '', () => this.toggleHelp()),
        hudAction('surrender', 'Surrender', '', () => this.showSurrenderConfirmation(), 'multiplayer-surrender'),
      ],
      onMinimapNavigate: ({ x, y }) => this.presentation.cameraController.focus({
        x: x * this.grid.bounds.width,
        y: y * this.grid.bounds.height,
      }),
      selectionTestId: 'multiplayer-selection',
    });
    this.selection = new SelectionController(
      this.presentation.scene,
      this.presentation.camera,
      canvas,
      this.presentation.space,
      {
        viewer: () => this.seat ?? 'player',
        get: (id) => this.battleEntity(id),
        entities: () => this.battleState?.entities ?? [],
        isAttackable: (entity) => this.seat !== null && entity.owner !== this.seat,
        visibleFieldAt: (point) => this.visibleFieldAt(point),
      },
      (mesh) => this.presentation.entityIdOfMesh(mesh),
      () => this.refreshSelectedView(),
      (ids, target) => this.issueGroundOrder(ids, target),
      (ids, targetId) => this.issueFriendlyTarget(ids, targetId),
      (ids, targetId) => this.issueAttack(ids, targetId),
      (ids, target) => this.issueAttackMove(ids, target),
      () => undefined,
    );
    this.placement = new PlacementController(
      this.presentation.scene,
      this.presentation.camera,
      canvas,
      this.presentation.space,
      this.grid,
      this.presentation.materials,
      (buildingType, topLeft) => this.isValidPlacement(buildingType, topLeft),
      (buildingType, topLeft, workerId) => this.command({ type: 'Build', workerId, buildingType, topLeft }),
    );
    this.setBattleInputEnabled(false);
    window.addEventListener('keydown', this.onKeyDown, true);

    const saved = sessionStorage.getItem(STORAGE);
    if (inviteFromUrl) this.open('join', inviteFromUrl);
    else if (saved) {
      try {
        const value = JSON.parse(saved) as { roomId: string; credential: string };
        this.open('resume', value);
      } catch {
        this.showEntry();
      }
    } else this.showEntry();
  }

  public render(deltaSeconds: number): void {
    if (!this.gameUi.hidden) this.presentation.cameraController.update(deltaSeconds);
    if (this.battleState) this.presentation.sync(this.battleState, deltaSeconds);
    this.placement.update();
    this.presentation.render();
  }

  public dispose(): void {
    this.disposed = true;
    window.clearInterval(this.heartbeat);
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.socket?.close();
    this.selection.dispose();
    this.placement.dispose();
    this.hud.destroy();
    this.presentation.dispose();
    this.root.remove();
    window.removeEventListener('keydown', this.onKeyDown, true);
  }

  private createUi(): void {
    this.root.dataset.testid = 'multiplayer-screen';
    this.root.dataset.connection = 'offline';
    this.modalLayer.append(this.modalCard);
    this.root.append(this.modalLayer);
    this.createHelp();
    this.gameUi.append(this.help);
    this.gameUi.hidden = true;
    this.root.append(this.gameUi, this.toast);
    this.createConfirmation();
    this.root.append(this.confirm);
  }

  private createHelp(): void {
    this.help.hidden = true;
    this.help.innerHTML = `<h2>Battle controls</h2><dl>
      <dt>Left click</dt><dd>Select a friendly unit or structure</dd>
      <dt>Shift + click</dt><dd>Add a unit to the selection</dd>
      <dt>Right click</dt><dd>Move, attack, gather, or resume construction</dd>
      <dt>Q</dt><dd>Arm attack-move, then left-click the ground</dd>
      <dt>WASD / arrows</dt><dd>Pan the tactical camera</dd>
      <dt>Mouse wheel</dt><dd>Zoom in or out</dd>
      <dt>Escape</dt><dd>Cancel a command mode or clear selection</dd>
    </dl>`;
  }

  private createConfirmation(): void {
    this.confirm.hidden = true;
    const card = element('section', 'online-confirm-card');
    card.innerHTML = '<h2>Surrender this match?</h2><p>Your opponent will win immediately. This cannot be undone.</p>';
    const actions = element('div', 'online-confirm-actions');
    actions.append(
      this.makeButton('Continue playing', () => { this.confirm.hidden = true; }, 'secondary'),
      this.makeButton('Surrender', () => {
        this.confirm.hidden = true;
        this.command({ type: 'Surrender' });
      }, 'danger'),
    );
    card.append(actions);
    this.confirm.append(card);
  }

  private showEntry(): void {
    this.snapshot = null;
    this.battleState = null;
    this.battleFog = null;
    this.selection.select(null);
    this.placement.cancel();
    this.presentation.cameraController.setEnabled(false);
    this.setBattleInputEnabled(false);
    this.modalLayer.hidden = false;
    this.gameUi.hidden = true;
    this.modalCard.replaceChildren();
    this.modalCard.append(this.cardHeading('PRIVATE MULTIPLAYER', 'Open Field · 1 versus 1', 'Create a private room, then send its invite link to your opponent.'));
    this.setModalStatus(this.socket === null ? 'The multiplayer server must be running to create or join a room.' : 'Choose how to enter the battle.');
    this.modalCard.append(this.modalStatus);

    const choices = element('div', 'online-entry-actions');
    const create = element('section', 'online-entry-option');
    create.innerHTML = '<h2>Create a room</h2><p>You will command the western base. The match begins after both players are ready.</p>';
    create.append(this.makeButton('Create private room', () => this.open('create', {}), '', 'multiplayer-create'));
    const join = element('section', 'online-entry-option');
    join.innerHTML = '<h2>Join a room</h2><p>Paste the invitation sent by the room creator.</p>';
    const input = document.createElement('input');
    input.className = 'online-input';
    input.placeholder = 'Paste invite link';
    input.setAttribute('aria-label', 'Invite link to join');
    const joinButton = this.makeButton('Join battle', () => this.joinFromInput(input), 'secondary', 'multiplayer-join');
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') joinButton.click(); });
    join.append(input, joinButton);
    choices.append(create, join);
    const footer = element('div', 'online-card-footer');
    footer.append(this.makeButton('Return to title', () => this.leaveToTitle(), 'secondary'));
    this.modalCard.append(choices, footer);
  }

  private joinFromInput(input: HTMLInputElement): void {
    try {
      const url = new URL(input.value);
      const parts = new URLSearchParams(url.hash.slice(1));
      const roomId = parts.get('room');
      const invite = parts.get('invite');
      if (!roomId || !invite) throw new Error('missing invitation fields');
      this.open('join', { roomId, invite });
    } catch {
      this.setModalStatus('That invitation link is not valid. Paste the complete link and try again.', 'error');
    }
  }

  private open(type: 'create' | 'join' | 'resume', data: object): void {
    this.socket?.close();
    this.root.dataset.connection = 'offline';
    this.setModalStatus(type === 'resume' ? 'Restoring your command seat…' : 'Contacting multiplayer server…');
    const socket = new WebSocket(SERVER_URL);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.reconnectDelay = 500;
      this.root.dataset.connection = 'online';
      this.updateHud();
      this.send({ type, protocolVersion: VERSION, ...data });
    });
    socket.addEventListener('message', (event) => this.receive(event.data as string));
    socket.addEventListener('close', () => this.handleDisconnect(socket));
    socket.addEventListener('error', () => {
      this.setModalStatus('The multiplayer server is unavailable. Check the server and try again.', 'error');
      this.notify('Connection to the multiplayer server failed.', 'error');
    });
  }

  private handleDisconnect(socket: WebSocket): void {
    if (this.disposed || this.socket !== socket) return;
    this.root.dataset.connection = 'offline';
    this.updateHud();
    if (this.roomId && this.credential) {
      this.notify('Connection lost. Rejoining your seat…', 'error', 5000);
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(5000, delay * 2);
      window.setTimeout(() => {
        if (!this.disposed) this.open('resume', { roomId: this.roomId, credential: this.credential });
      }, delay);
    } else this.showEntry();
  }

  private receive(raw: string): void {
    let message: Record<string, unknown>;
    try { message = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    if (message.type === 'session') this.receiveSession(message);
    else if (message.type === 'lobby') this.receiveLobby(message);
    else if (message.type === 'load') {
      this.showLoading();
      this.send({ type: 'loaded', protocolVersion: VERSION });
    } else if (message.type === 'snapshot') this.receiveSnapshot(message as unknown as Snapshot);
    else if (message.type === 'rejected') this.receiveRejection(message);
    else if (message.type === 'ack') {
      if (message.ok === false) this.notify('That order is not available right now.', 'error');
      else this.notify('Order confirmed.', 'success', 900);
    }
  }

  private receiveSession(message: Record<string, unknown>): void {
    this.roomId = message.roomId as string;
    this.invite = message.invite as string;
    this.credential = message.credential as string;
    this.seat = message.seat as Seat;
    this.epoch = message.connectionEpoch as number;
    this.matchId = message.matchId as string | null;
    this.seq = message.lastSeq as number;
    const start = this.grid.startFor(this.seat);
    if (start) this.presentation.cameraController.focus(this.grid.tileCenter(start.rallyPoint.tx, start.rallyPoint.ty));
    sessionStorage.setItem(STORAGE, JSON.stringify({ roomId: this.roomId, credential: this.credential }));
    history.replaceState(null, '', location.pathname + location.search);
  }

  private receiveLobby(message: Record<string, unknown>): void {
    this.matchId = message.matchId as string | null;
    const phase = String(message.phase);
    if (phase === 'running') this.showGame();
    else if (phase === 'finished') this.showResult();
    else this.showLobby(message);
  }

  private receiveSnapshot(snapshot: Snapshot): void {
    if (this.snapshot && snapshot.matchId === this.snapshot.matchId && snapshot.snapshotSeq <= this.snapshot.snapshotSeq) return;
    this.snapshot = snapshot;
    this.syncView();
    if (snapshot.result) this.showResult();
    else {
      this.showGame();
      this.updateHud();
    }
  }

  private receiveRejection(message: Record<string, unknown>): void {
    const reason = String(message.reason);
    if (reason === 'invalid-session') {
      sessionStorage.removeItem(STORAGE);
      this.credential = null;
      this.roomId = null;
      this.showEntry();
      this.setModalStatus('That room has expired. Create or join a new room.', 'error');
      return;
    }
    const explanation: Readonly<Record<string, string>> = {
      capacity: 'The multiplayer service is at capacity. Try again shortly.',
      'room-unavailable': 'That room is unavailable or already has two players.',
      'rate-limited': 'Too many orders were sent. Wait a moment and try again.',
      'sequence-gap': 'Your command stream is out of sync. Reconnecting…',
    };
    const text = explanation[reason] ?? 'The server rejected that action.';
    this.setModalStatus(text, 'error');
    this.notify(text, 'error');
  }

  // eslint-disable-next-line complexity -- Lobby rendering combines independent room and seat states.
  private showLobby(message: Record<string, unknown>): void {
    this.presentation.cameraController.setEnabled(false);
    this.setBattleInputEnabled(false);
    this.modalLayer.hidden = false;
    this.gameUi.hidden = true;
    this.modalCard.replaceChildren();
    const phase = String(message.phase);
    this.modalCard.append(this.cardHeading('PRIVATE ROOM', 'Prepare for battle', 'Open Field · Meridian mirror match · 15 minute limit'));
    this.setModalStatus(phase === 'loading' ? 'Both commanders are ready. Preparing the battlefield…' : 'The battle starts when both commanders are ready.');
    this.modalCard.append(this.modalStatus);
    const roomHead = element('div', 'online-room-head');
    roomHead.append(textElement('span', 'Room identifier'), textElement('strong', this.roomId?.toUpperCase() ?? '', 'online-room-code'));
    this.modalCard.append(roomHead);

    const seats = message.seats as LobbySeat[];
    const roster = element('div', 'online-roster');
    for (const state of seats) roster.append(this.seatCard(state));
    this.modalCard.append(roster);

    if (this.roomId && this.invite) {
      const invite = this.inviteUrl();
      const row = element('div', 'online-invite');
      const field = document.createElement('input');
      field.className = 'online-input';
      field.value = invite;
      field.readOnly = true;
      field.setAttribute('aria-label', 'Invite link');
      field.dataset.testid = 'multiplayer-invite-link';
      row.append(field, this.makeButton('Copy invite', () => void this.copyInvite(invite), 'secondary'));
      this.modalCard.append(row, textElement('p', 'The invitation admits one opponent. Your occupied seat has a separate resume credential.', 'online-lobby-note'));
    }

    const ownSeat = seats.find((state) => state.seat === this.seat);
    const footer = element('div', 'online-card-footer');
    footer.append(this.makeButton('Leave room', () => this.leaveToTitle(), 'secondary'));
    if (phase === 'waiting' && ownSeat) {
      footer.append(this.makeButton(
        ownSeat.ready ? 'Cancel ready' : 'Ready for battle',
        () => this.send({ type: 'ready', ready: !ownSeat.ready, protocolVersion: VERSION }),
        ownSeat.ready ? 'secondary' : 'ready',
        'multiplayer-ready',
      ));
    }
    this.modalCard.append(footer);
  }

  private showLoading(): void {
    this.presentation.cameraController.setEnabled(false);
    this.setBattleInputEnabled(false);
    this.modalLayer.hidden = false;
    this.gameUi.hidden = true;
    this.modalCard.replaceChildren(
      this.cardHeading('DEPLOYMENT', 'Preparing Open Field', 'Synchronizing the battlefield with both commanders.'),
    );
    this.setModalStatus('Loading tactical data…', 'success');
    this.modalCard.append(this.modalStatus);
  }

  private showGame(): void {
    this.modalLayer.hidden = true;
    this.gameUi.hidden = false;
    this.presentation.cameraController.setEnabled(true);
    this.setBattleInputEnabled(true);
    this.updateHud();
  }

  private showResult(): void {
    if (!this.snapshot?.result) return;
    this.presentation.cameraController.setEnabled(false);
    this.setBattleInputEnabled(false);
    this.modalLayer.hidden = false;
    this.gameUi.hidden = true;
    this.modalCard.replaceChildren();
    const won = this.snapshot.result.winner === this.seat;
    const draw = this.snapshot.result.winner === null;
    const title = draw ? 'Battle concluded' : won ? 'Victory' : 'Defeat';
    const reason = resultReason(this.snapshot.result.reason);
    this.modalCard.append(this.cardHeading('BATTLE REPORT', title, reason));
    this.setModalStatus(`${this.sideName(this.seat)} forces · ${formatTime(this.snapshot.tick)}`, won ? 'success' : draw ? '' : 'error');
    this.modalCard.append(this.modalStatus);
    const footer = element('div', 'online-card-footer');
    footer.append(
      this.makeButton('Return to title', () => this.leaveToTitle(), 'secondary'),
      this.makeButton('Rematch lobby', () => this.send({ type: 'rematch', protocolVersion: VERSION }), 'ready'),
    );
    this.modalCard.append(footer);
  }

  private seatCard(state: LobbySeat): HTMLElement {
    const card = element('article', 'online-seat-card');
    const status = !state.occupied ? 'open' : !state.connected ? 'disconnected' : state.ready ? 'ready' : 'connected';
    card.dataset.state = status;
    card.append(textElement('strong', `${state.seat === 'player' ? 'West' : 'East'} command`));
    card.append(textElement('span', `${state.seat === 'player' ? 'West' : 'East'}: ${status}`));
    if (state.seat === this.seat) card.append(textElement('span', 'Your seat', 'online-seat-you'));
    return card;
  }

  private updateHud(): void {
    if (!this.snapshot) return;
    this.hud.update(this.hudModel());
  }

  private selectionView(): BattleHudViewModel['selection'] {
    const entities = this.selectedEntities();
    if (entities.length === 0) {
      return { name: 'No selection', detail: 'Select a friendly unit or structure', healthFraction: 0 };
    }
    if (entities.length > 1) {
      const fraction = entities.reduce((total, entity) => total + entity.health / entity.maxHealth, 0) / entities.length;
      return { name: `${entities.length} units selected`, detail: 'Right-click the battlefield to issue a group order', healthFraction: fraction };
    }
    const entity = entities[0]!;
    const health = `${Math.ceil(entity.health)} / ${entity.maxHealth} integrity`;
    const progress = entity.status === 'constructing' ? ` · ${Math.floor((entity.constructionProgress ?? 0) * 100)}% built` : '';
    const deployed = entity.entrenchment && entity.entrenchment !== 'mobile' ? ` · ${entity.entrenchment}` : '';
    return { name: entityName(entity), detail: `${health}${progress}${deployed}`, healthFraction: entity.health / entity.maxHealth };
  }

  // eslint-disable-next-line complexity -- The view model exposes each contextual command without owning its rule.
  private hudModel(): BattleHudViewModel {
    const entities = this.selectedEntities();
    const base = {
      commandTitle: `${this.sideName(this.seat)} command`,
      status: this.root.dataset.connection === 'offline'
        ? 'Reconnecting…'
        : `Playing as ${this.sideName(this.seat).toLowerCase()} · Connected`,
      connected: this.root.dataset.connection !== 'offline',
      clock: formatTime(this.snapshot!.tick),
      clockLabel: 'Match time',
      selection: this.selectionView(),
      credits: this.snapshot!.credits,
      economyStatus: this.hasFriendlyCompleted('powerPlant') ? 'Power online' : 'No power',
      economyWarning: !this.hasFriendlyCompleted('powerPlant'),
      minimap: this.minimapView(),
      queue: [] as const,
    };
    if (entities.length === 0) {
      return { ...base, actionTitle: 'Tactical commands', actions: [], emptyMessage: 'Select a Worker to construct a base, a production building to train units, or combat units to attack.' };
    }
    const single = entities.length === 1 ? entities[0] : undefined;
    if (single?.kind === 'unit' && single.type === 'worker') {
      const actions = BUILDABLE_TYPES.map((type) => {
        const config = BUILDING_CONFIG[type];
        const missing = config.requires.filter((required) => !this.hasFriendlyCompleted(required));
        const disabledReason = missing.length > 0
          ? `Requires ${missing.map((required) => BUILDING_CONFIG[required].name).join(', ')}`
          : this.snapshot!.credits < config.cost ? `Needs ${config.cost} Credits` : undefined;
        return hudAction(type, config.name, `${config.cost} Credits · ${config.buildTimeSeconds}s`, () => this.armBuild(single.id, type), `build-${type}`, disabledReason !== undefined, disabledReason);
      });
      return { ...base, actionTitle: 'Construction', actionTestId: 'build-menu', actions };
    }
    if (single?.kind === 'building') {
      return this.productionHudModel(base, single);
    }
    if (entities.every((entity) => entity.kind === 'unit')) {
      const actions: BattleHudAction[] = [hudAction('attack-move', 'Attack-move', 'Q · engage enemies en route', () => this.armAttackMove())];
      const fpv = entities.filter((entity) => entity.type === 'fpvOperators');
      if (fpv.length > 0) {
        const entrenched = fpv.every((entity) => entity.entrenchment === 'entrenched');
        actions.push(hudAction('entrench',
          entrenched ? 'Pack up' : 'Entrench',
          entrenched ? 'Return to mobile formation' : 'Deploy to enable attacks',
          () => this.command({ type: 'SetEntrenchment', unitIds: fpv.map((entity) => entity.id), entrenched: !entrenched }),
          'entrench-fpv-operators'));
      }
      return { ...base, actionTitle: 'Unit orders', ...(fpv.length > 0 ? { actionTestId: 'entrench-menu' } : {}), actions };
    }
    return { ...base, actionTitle: 'Mixed selection', actions: [], emptyMessage: 'Select units or one structure to show available commands.' };
  }

  private productionHudModel(base: Omit<BattleHudViewModel, 'actionTitle' | 'actions'>, building: EntityView): BattleHudViewModel {
    const type = building.type as BuildingTypeId;
    const config = BUILDING_CONFIG[type];
    if (building.status === 'constructing') {
      return { ...base, actionTitle: `${config.name} production`, actions: [], emptyMessage: 'Construction must finish before this structure can operate.' };
    }
    if (config.produces.length === 0) {
      return { ...base, actionTitle: `${config.name} production`, actions: [], emptyMessage: 'This structure supports your base and has no production queue.' };
    }
    const actions = config.produces.map((unitType) => {
      const unit = UNIT_CONFIG[unitType];
      const missing = unit.requires.filter((required) => !this.hasFriendlyCompleted(required));
      const disabledReason = missing.length > 0
        ? `Requires ${missing.map((required) => BUILDING_CONFIG[required].name).join(', ')}`
        : (building.queue?.length ?? 0) >= PRODUCTION_CONFIG.queueCapacity ? 'Queue full'
          : this.snapshot!.credits < unit.cost ? `Needs ${unit.cost} Credits` : undefined;
      return hudAction(unitType, unit.name, `${unit.cost} Credits · ${unit.buildTimeSeconds}s`, () => this.command({ type: 'Produce', buildingId: building.id, unitType }), `produce-${unitType}`, disabledReason !== undefined, disabledReason);
    });
    const queue = (building.queue ?? []).map((item) => {
      const unit = UNIT_CONFIG[item.type];
      return { id: item.id, label: `${unit.name} · ${Math.min(100, Math.floor(item.progress / unit.buildTimeSeconds * 100))}%`, onCancel: () => this.command({ type: 'CancelProduction', buildingId: building.id, queueEntryId: item.id }) };
    });
    return { ...base, actionTitle: `${config.name} production`, actionTestId: 'production-menu', actions, queue };
  }

  private armBuild(workerId: string, buildingType: BuildingTypeId): void {
    this.selection.setAttackMoveArmed(false);
    this.placement.start(buildingType, workerId as EntityId);
    this.notify(`Place ${BUILDING_CONFIG[buildingType].name} on visible clear ground. Escape cancels.`, 'success', 5000);
  }

  private armAttackMove(): void {
    this.placement.cancel();
    this.selection.setAttackMoveArmed(true);
    if (this.selection.isAttackMoveArmed()) {
      this.notify('Attack-move armed. Left-click the destination. Escape cancels.', 'success', 5000);
    }
  }

  private syncView(): void {
    if (!this.snapshot) return;
    const projection = this.battleView.project(this.snapshot, this.selection.selectedIds());
    this.battleState = projection.state;
    this.battleFog = projection.fog;
    this.selection.refresh();
    this.refreshSelectedView();
    this.presentation.updateFog(projection.fog, this.snapshot.seat);
  }

  private refreshSelectedView(): void {
    if (!this.snapshot) return;
    const projection = this.battleView.project(this.snapshot, this.selection.selectedIds());
    this.battleState = projection.state;
    this.presentation.sync(projection.state);
    this.updateHud();
  }

  private minimapView(): BattleHudViewModel['minimap'] {
    return {
      width: this.grid.bounds.width,
      height: this.grid.bounds.height,
      cells: this.snapshot!.fog,
      fields: this.grid.resourceFields.map((field) => ({ position: this.grid.tileCenter(field.center.tx, field.center.ty), visible: this.snapshot!.fog[field.center.ty]?.[field.center.tx] !== 'hidden' })),
      entities: this.snapshot!.entities.map((entity) => ({ position: { x: entity.x, y: entity.y }, friendly: entity.owner === this.seat, building: entity.kind === 'building' })),
      viewport: this.presentation.cameraController.visibleBounds(),
    };
  }

  private issueGroundOrder(ids: readonly EntityId[], destination: Vec2): void {
    const units = this.unitViews(ids);
    if (units.length === 0) return;
    const workers = units.filter((unit) => unit.type === 'worker');
    const fieldId = this.visibleFieldAt(destination);
    if (fieldId !== null && workers.length > 0) {
      this.command({ type: 'Gather', unitIds: workers.map((unit) => unit.id as EntityId), fieldId });
    } else {
      this.command({ type: 'Move', unitIds: units.map((unit) => unit.id as EntityId), destination });
    }
  }

  private issueFriendlyTarget(ids: readonly EntityId[], targetId: EntityId): void {
    const target = this.snapshot?.entities.find((entity) => entity.id === targetId);
    const worker = this.unitViews(ids).find((unit) => unit.type === 'worker');
    if (target?.kind === 'building' && target.status === 'constructing' && worker !== undefined) {
      this.command({ type: 'ResumeConstruction', workerId: worker.id as EntityId, buildingId: targetId });
    }
  }

  private issueAttack(ids: readonly EntityId[], targetId: EntityId): void {
    const units = this.unitViews(ids);
    if (units.length > 0) this.command({ type: 'Attack', unitIds: units.map((unit) => unit.id as EntityId), targetId });
  }

  private issueAttackMove(ids: readonly EntityId[], destination: Vec2): void {
    const units = this.unitViews(ids);
    if (units.length > 0) this.command({ type: 'AttackMove', unitIds: units.map((unit) => unit.id as EntityId), destination });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditable(event.target)) return;
    if (event.code === 'KeyQ' && !this.gameUi.hidden) {
      event.preventDefault();
      this.armAttackMove();
    } else if (event.code === 'Escape') {
      if (!this.help.hidden) this.help.hidden = true;
      else if (!this.confirm.hidden) this.confirm.hidden = true;
      else if (this.selection.isAttackMoveArmed()) this.selection.setAttackMoveArmed(false);
      else if (this.placement.isActive()) this.placement.cancel();
      else this.selection.select(null);
      this.notify('Command mode cancelled.', '', 1000);
      event.preventDefault();
    }
  };


  private setBattleInputEnabled(enabled: boolean): void {
    this.selection.setEnabled(enabled);
    this.placement.setEnabled(enabled);
    if (!enabled) {
      this.selection.setAttackMoveArmed(false);
      this.placement.cancel();
    }
  }

  private battleEntity(id: EntityId): ReadonlyEntity | undefined {
    return this.battleState?.entities.find((entity) => entity.id === id);
  }

  private visibleFieldAt(point: Vec2): string | null {
    if (this.battleFog === null || this.seat === null) return null;
    return inspectResourceField(this.grid, this.battleFog, this.seat, point)?.id ?? null;
  }

  private isValidPlacement(buildingType: BuildingTypeId, topLeft: TileCoord): boolean {
    if (this.battleFog === null || this.seat === null) return false;
    const footprint = BUILDING_CONFIG[buildingType].footprint;
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        if (cellVisibility(this.battleFog, this.seat, topLeft.tx + dx, topLeft.ty + dy) !== 'visible') {
          return false;
        }
      }
    }
    const buildings = (): readonly ReadonlyBuilding[] => (this.battleState?.entities ?? [])
      .filter((entity): entity is ReadonlyBuilding => entity.kind === 'building');
    return checkBuildingPlacement({ buildings }, this.grid, buildingType, topLeft).valid;
  }

  private unitViews(ids: readonly EntityId[]): EntityView[] {
    if (!this.snapshot) return [];
    const selected = new Set<string>(ids);
    return this.snapshot.entities.filter((entity) =>
      selected.has(entity.id) && entity.owner === this.seat && entity.kind === 'unit',
    );
  }

  private selectedEntities(): EntityView[] {
    if (!this.snapshot) return [];
    return this.selection.selectedIds()
      .map((id) => this.snapshot!.entities.find((entity) => entity.id === id))
      .filter((entity): entity is EntityView => entity !== undefined && entity.owner === this.seat);
  }

  private hasFriendlyCompleted(type: BuildingTypeId): boolean {
    return this.snapshot?.entities.some((entity) =>
      entity.owner === this.seat && entity.kind === 'building' && entity.type === type && entity.status !== 'constructing',
    ) ?? false;
  }

  private command(command: PvpCommand): void {
    if (!this.matchId || this.socket?.readyState !== WebSocket.OPEN) {
      this.notify('Waiting for the server connection…', 'error');
      return;
    }
    this.send({ type: 'command', protocolVersion: VERSION, matchId: this.matchId, connectionEpoch: this.epoch, seq: ++this.seq, command });
  }

  private send(value: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value));
  }

  private leaveToTitle(): void {
    this.send({ type: 'leave', protocolVersion: VERSION });
    sessionStorage.removeItem(STORAGE);
    this.onExit();
  }

  private toggleHelp(): void { this.help.hidden = !this.help.hidden; }
  private showSurrenderConfirmation(): void { this.confirm.hidden = false; }

  private makeButton(label: string, action: () => void, variants = '', testId?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = `online-button ${variants.split(' ').filter(Boolean).map((variant) => `online-button--${variant}`).join(' ')}`;
    if (testId) button.dataset.testid = testId;
    button.addEventListener('click', action);
    return button;
  }


  private cardHeading(eyebrow: string, title: string, subtitle: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    fragment.append(textElement('div', eyebrow, 'online-eyebrow'), textElement('h1', title), textElement('p', subtitle, 'online-card-subtitle'));
    return fragment;
  }

  private setModalStatus(message: string, tone = ''): void {
    this.modalStatus.textContent = message;
    this.modalStatus.dataset.tone = tone;
  }

  private notify(message: string, tone = '', duration = 2600): void {
    this.toast.textContent = message;
    this.toast.dataset.tone = tone;
    this.toast.dataset.show = 'true';
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.dataset.show = 'false'; }, duration);
  }


  private inviteUrl(): string {
    return `${location.origin}${location.pathname}#room=${encodeURIComponent(this.roomId ?? '')}&invite=${encodeURIComponent(this.invite ?? '')}`;
  }

  private async copyInvite(invite: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(invite);
      this.setModalStatus('Invitation copied. Send it to your opponent.', 'success');
    } catch {
      this.setModalStatus('Copy failed. Select the invitation link and copy it manually.', 'error');
    }
  }

  private sideName(seat: Seat | null): string { return seat === 'ai' ? 'East' : 'West'; }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  return value;
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const value = element(tag, className);
  value.textContent = text;
  return value;
}

function formatTime(tick: number): string {
  const remaining = Math.max(0, 15 * 60 - Math.floor(tick / 20));
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}

function entityName(entity: EntityView): string {
  return entity.kind === 'unit'
    ? UNIT_CONFIG[entity.type as UnitTypeId].name
    : BUILDING_CONFIG[entity.type as BuildingTypeId].name;
}

function isEditable(target: EventTarget | null): boolean { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement; }
function resultReason(reason: string): string {
  switch (reason) {
    case 'elimination': return 'The opposing base was eliminated.';
    case 'surrender': return 'A commander surrendered the battlefield.';
    case 'disconnect': return 'A commander did not reconnect in time.';
    case 'timeout': return 'The fifteen-minute limit expired.';
    default: return 'The match was ended by the server.';
  }
}

function hudAction(
  id: string,
  label: string,
  detail: string,
  onTrigger: () => void,
  testId?: string,
  disabled = false,
  disabledReason?: string,
): BattleHudAction {
  return {
    id,
    label,
    detail,
    onTrigger,
    disabled,
    ...(testId === undefined ? {} : { testId }),
    ...(disabledReason === undefined ? {} : { disabledReason }),
  };
}
