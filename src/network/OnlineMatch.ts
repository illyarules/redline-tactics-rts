import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Scene } from '@babylonjs/core/scene';
import { BUILDING_CONFIG } from '../config/buildings';
import { MAP_CONFIG } from '../config/map';
import { UNIT_CONFIG } from '../config/units';
import type { BuildingTypeId, UnitTypeId } from '../core/ids';
import type { PvpCommand, Seat } from '../core/pvp';
import './onlineMatch.css';

const STORAGE = 'redline-online-seat';
const VERSION = 1;
const SERVER_URL = import.meta.env.VITE_MULTIPLAYER_URL ?? 'ws://localhost:8787/ws';
const BUILDABLE_TYPES = (Object.keys(BUILDING_CONFIG) as BuildingTypeId[]).filter((type) => BUILDING_CONFIG[type].buildable);

interface QueueView { readonly id: string; readonly type: UnitTypeId; readonly progress: number }
interface EntityView {
  readonly id: string;
  readonly owner: Seat;
  readonly kind: 'unit' | 'building';
  readonly type: UnitTypeId | BuildingTypeId;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly status?: string;
  readonly entrenchment?: string;
  readonly constructionProgress?: number;
  readonly queue?: readonly QueueView[];
}
interface Snapshot {
  readonly type: 'snapshot';
  readonly matchId: string;
  readonly snapshotSeq: number;
  readonly tick: number;
  readonly seat: Seat;
  readonly credits: number;
  readonly entities: readonly EntityView[];
  readonly fog: readonly (readonly string[])[];
  readonly result: { readonly winner: Seat | null; readonly reason: string } | null;
}
interface LobbySeat { readonly seat: Seat; readonly occupied: boolean; readonly connected: boolean; readonly ready: boolean }

export class OnlineMatch {
  private readonly root = element('div', 'online-match');
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly meshes = new Map<string, AbstractMesh>();
  private readonly selectionRings = new Map<string, AbstractMesh>();
  private readonly selected = new Set<string>();
  private readonly fogTexture: DynamicTexture;
  private readonly modalLayer = element('div', 'online-modal-layer');
  private readonly modalCard = element('section', 'online-card');
  private readonly modalStatus = element('p', 'online-status');
  private readonly gameUi = element('div', 'online-game-ui');
  private readonly commandTitle = element('strong');
  private readonly connectionLine = element('span');
  private readonly clock = element('div', 'online-match-clock');
  private readonly selectionName = element('div', 'online-selection-name');
  private readonly selectionDetail = element('div', 'online-selection-detail');
  private readonly healthFill = element('div', 'online-health-fill');
  private readonly credits = element('strong');
  private readonly actionTitle = element('div', 'online-action-title');
  private readonly actionGrid = element('div', 'online-action-grid');
  private readonly queue = element('div', 'online-queue');
  private readonly minimap = document.createElement('canvas');
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
  private buildType: (PvpCommand & { type: 'Build' }) | null = null;
  private attackMoveArmed = false;
  private toastTimer: number | null = null;
  private readonly pressed = new Set<string>();
  private readonly heartbeat = window.setInterval(() => {
    if (this.credential) this.send({ type: 'ping', protocolVersion: VERSION });
  }, 5000);

  public constructor(
    engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    container: HTMLElement,
    private readonly onExit: () => void,
    inviteFromUrl?: { roomId: string; invite: string },
  ) {
    this.scene = this.createScene(engine);
    this.camera = this.createCamera();
    this.fogTexture = this.createBattlefield();
    this.createUi();
    container.append(this.root);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);

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

  public render(): void {
    this.updateCamera();
    this.scene.render();
  }

  public dispose(): void {
    this.disposed = true;
    window.clearInterval(this.heartbeat);
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.socket?.close();
    this.camera.detachControl();
    this.scene.dispose();
    this.root.remove();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
  }

  private createScene(engine: Engine): Scene {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.025, 0.055, 0.068, 1);
    new HemisphericLight('online-light', new Vector3(0, 1, 0), scene).intensity = 1.08;
    return scene;
  }

  private createCamera(): ArcRotateCamera {
    const camera = new ArcRotateCamera('online-camera', -Math.PI / 2, 0.72, 38, new Vector3(32, 0, 32), this.scene);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 72;
    camera.lowerBetaLimit = 0.42;
    camera.upperBetaLimit = 1.08;
    camera.wheelPrecision = 18;
    camera.panningSensibility = 220;
    camera.attachControl(this.canvas, true);
    return camera;
  }

  private createBattlefield(): DynamicTexture {
    const ground = MeshBuilder.CreateGround('online-ground', { width: 64, height: 64 }, this.scene);
    ground.position.set(32, 0, 32);
    ground.metadata = { ground: true };
    const groundMaterial = new StandardMaterial('online-ground-material', this.scene);
    groundMaterial.diffuseColor = new Color3(0.16, 0.27, 0.21);
    groundMaterial.specularColor = new Color3(0.03, 0.04, 0.03);
    ground.material = groundMaterial;

    for (const region of MAP_CONFIG.regions) {
      const height = region.terrain === 'rock' ? 0.9 : 0.06;
      const terrain = MeshBuilder.CreateBox(
        `terrain-${region.area.tx}-${region.area.ty}`,
        { width: region.area.width, depth: region.area.height, height },
        this.scene,
      );
      terrain.position.set(region.area.tx + region.area.width / 2, height / 2, region.area.ty + region.area.height / 2);
      terrain.isPickable = false;
      const material = new StandardMaterial(`terrain-material-${region.area.tx}-${region.area.ty}`, this.scene);
      material.diffuseColor = region.terrain === 'rock' ? new Color3(0.25, 0.28, 0.28) : new Color3(0.105, 0.22, 0.15);
      material.specularColor = Color3.Black();
      terrain.material = material;
    }

    for (const field of MAP_CONFIG.resourceFields) {
      const marker = MeshBuilder.CreateCylinder(`field-${field.id}`, { diameter: field.radiusTiles * 2, height: 0.12, tessellation: 24 }, this.scene);
      marker.position.set(field.center.tx + 0.5, 0.1, field.center.ty + 0.5);
      marker.isPickable = false;
      const material = new StandardMaterial(`field-material-${field.id}`, this.scene);
      material.diffuseColor = new Color3(0.72, 0.54, 0.15);
      material.emissiveColor = new Color3(0.12, 0.08, 0.01);
      material.alpha = 0.72;
      marker.material = material;
    }

    const fogTexture = new DynamicTexture('online-fog-texture', { width: 64, height: 64 }, this.scene, false);
    const fog = MeshBuilder.CreateGround('online-fog', { width: 64, height: 64 }, this.scene);
    fog.position.set(32, 0.14, 32);
    fog.isPickable = false;
    const fogMaterial = new StandardMaterial('online-fog-material', this.scene);
    fogMaterial.diffuseTexture = fogTexture;
    fogMaterial.diffuseTexture.hasAlpha = true;
    fogMaterial.useAlphaFromDiffuseTexture = true;
    fogMaterial.disableLighting = true;
    fog.material = fogMaterial;
    return fogTexture;
  }

  private createUi(): void {
    this.root.dataset.testid = 'multiplayer-screen';
    this.root.dataset.connection = 'offline';
    this.modalLayer.append(this.modalCard);
    this.root.append(this.modalLayer);
    this.createGameUi();
    this.gameUi.hidden = true;
    this.root.append(this.gameUi, this.toast);
    this.createConfirmation();
    this.root.append(this.confirm);
  }

  private createGameUi(): void {
    const topbar = element('div', 'online-topbar');
    const command = element('div', 'online-command-status');
    this.commandTitle.textContent = 'ONLINE COMMAND';
    this.connectionLine.innerHTML = '<i class="online-connection-dot"></i>Connecting';
    command.append(this.commandTitle, this.connectionLine);
    this.clock.innerHTML = '15:00<small>MATCH TIME</small>';
    const topActions = element('div', 'online-top-actions');
    topActions.append(
      this.makeButton('Controls', () => this.toggleHelp(), 'secondary compact'),
      this.makeButton('Surrender', () => this.showSurrenderConfirmation(), 'danger compact', 'multiplayer-surrender'),
    );
    topbar.append(command, this.clock, topActions);

    const bottom = element('div', 'online-bottom-hud');
    const selection = element('section', 'online-hud-panel online-selection-panel');
    this.selectionName.textContent = 'No selection';
    this.selectionDetail.textContent = 'Select a friendly unit or structure';
    const health = element('div', 'online-health-track');
    health.append(this.healthFill);
    const resource = element('div', 'online-resource');
    this.credits.textContent = '900';
    resource.append(this.credits, textElement('span', 'Credits'));
    selection.append(this.selectionName, this.selectionDetail, health, resource);

    const actions = element('section', 'online-hud-panel');
    this.actionTitle.textContent = 'Tactical commands';
    actions.append(this.actionTitle, this.actionGrid, this.queue);
    const minimapPanel = element('section', 'online-hud-panel online-minimap-panel');
    this.minimap.width = 160;
    this.minimap.height = 160;
    this.minimap.className = 'online-minimap';
    this.minimap.setAttribute('aria-label', 'Tactical minimap');
    this.minimap.addEventListener('click', this.onMinimapClick);
    minimapPanel.append(this.minimap);
    bottom.append(selection, actions, minimapPanel);

    const hint = element('div', 'online-hint');
    hint.innerHTML = '<kbd>WASD</kbd> camera &nbsp; <kbd>Wheel</kbd> zoom &nbsp; <kbd>Right click</kbd> order &nbsp; <kbd>Q</kbd> attack-move';
    this.createHelp();
    this.gameUi.append(topbar, bottom, hint, this.help);
  }

  private createHelp(): void {
    this.help.hidden = true;
    this.help.innerHTML = `<h2>Battle controls</h2><dl>
      <dt>Left click</dt><dd>Select a friendly unit or structure</dd>
      <dt>Shift + click</dt><dd>Add a unit to the selection</dd>
      <dt>Right click</dt><dd>Move, attack, gather, or resume construction</dd>
      <dt>Q</dt><dd>Arm attack-move, then right-click the ground</dd>
      <dt>WASD / arrows</dt><dd>Pan the tactical camera</dd>
      <dt>Mouse wheel</dt><dd>Zoom in or out</dd>
      <dt>Escape</dt><dd>Cancel building or attack-move mode</dd>
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
    this.selected.clear();
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
      this.connectionLine.innerHTML = '<i class="online-connection-dot"></i>Connected';
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
    this.connectionLine.innerHTML = '<i class="online-connection-dot"></i>Reconnecting…';
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
    this.camera.alpha = this.seat === 'player' ? -Math.PI / 2 : Math.PI / 2;
    this.camera.setTarget(new Vector3(this.seat === 'player' ? 10 : 54, 0, 32));
    this.camera.radius = 25;
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
    this.commandTitle.textContent = `${this.sideName(this.seat)} COMMAND`;
    this.connectionLine.innerHTML = `<i class="online-connection-dot"></i>Playing as ${this.sideName(this.seat).toLowerCase()} · Connected`;
    this.updateHud();
  }

  private showResult(): void {
    if (!this.snapshot?.result) return;
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
    this.credits.textContent = Math.floor(this.snapshot.credits).toLocaleString();
    this.clock.innerHTML = `${formatTime(this.snapshot.tick)}<small>MATCH TIME</small>`;
    this.updateSelectionPanel();
    this.updateActions();
    this.drawMinimap();
  }

  private updateSelectionPanel(): void {
    const entities = this.selectedEntities();
    if (entities.length === 0) {
      this.selectionName.textContent = 'No selection';
      this.selectionDetail.textContent = 'Select a friendly unit or structure';
      this.healthFill.style.width = '0';
      return;
    }
    if (entities.length > 1) {
      this.selectionName.textContent = `${entities.length} units selected`;
      this.selectionDetail.textContent = 'Right-click the battlefield to issue a group order';
      const fraction = entities.reduce((total, entity) => total + entity.health / entity.maxHealth, 0) / entities.length;
      this.setHealth(fraction);
      return;
    }
    const entity = entities[0]!;
    this.selectionName.textContent = entityName(entity);
    const health = `${Math.ceil(entity.health)} / ${entity.maxHealth} integrity`;
    const progress = entity.status === 'constructing' ? ` · ${Math.floor((entity.constructionProgress ?? 0) * 100)}% built` : '';
    const deployed = entity.entrenchment && entity.entrenchment !== 'mobile' ? ` · ${entity.entrenchment}` : '';
    this.selectionDetail.textContent = `${health}${progress}${deployed}`;
    this.setHealth(entity.health / entity.maxHealth);
  }

  // eslint-disable-next-line complexity -- Context actions intentionally branch by the selected entity role.
  private updateActions(): void {
    this.actionGrid.replaceChildren();
    this.queue.replaceChildren();
    const entities = this.selectedEntities();
    if (entities.length === 0) {
      this.actionTitle.textContent = 'Tactical commands';
      this.actionGrid.append(textElement('div', 'Select a Worker to construct a base, a production building to train units, or combat units to attack.', 'online-action-empty'));
      return;
    }
    const single = entities.length === 1 ? entities[0] : undefined;
    if (single?.kind === 'unit' && single.type === 'worker') {
      this.actionTitle.textContent = 'Construction';
      for (const type of BUILDABLE_TYPES) {
        const config = BUILDING_CONFIG[type];
        const button = this.makeActionButton(config.name, `${config.cost} Credits · ${config.buildTimeSeconds}s`, () => this.armBuild(single.id, type));
        button.disabled = this.snapshot!.credits < config.cost;
        this.actionGrid.append(button);
      }
      return;
    }
    if (single?.kind === 'building') {
      this.showProductionActions(single);
      return;
    }
    if (entities.every((entity) => entity.kind === 'unit')) {
      this.actionTitle.textContent = 'Unit orders';
      this.actionGrid.append(this.makeActionButton('Attack-move', 'Q · engage enemies en route', () => this.armAttackMove()));
      const fpv = entities.filter((entity) => entity.type === 'fpvOperators');
      if (fpv.length > 0) {
        const entrenched = fpv.every((entity) => entity.entrenchment === 'entrenched');
        this.actionGrid.append(this.makeActionButton(
          entrenched ? 'Pack up' : 'Entrench',
          entrenched ? 'Return to mobile formation' : 'Deploy to enable attacks',
          () => this.command({ type: 'SetEntrenchment', unitIds: fpv.map((entity) => entity.id), entrenched: !entrenched }),
        ));
      }
      return;
    }
    this.actionTitle.textContent = 'Mixed selection';
    this.actionGrid.append(textElement('div', 'Select units or one structure to show available commands.', 'online-action-empty'));
  }

  private showProductionActions(building: EntityView): void {
    const type = building.type as BuildingTypeId;
    const config = BUILDING_CONFIG[type];
    this.actionTitle.textContent = `${config.name} production`;
    if (building.status === 'constructing') {
      this.actionGrid.append(textElement('div', 'Construction must finish before this structure can operate.', 'online-action-empty'));
      return;
    }
    if (config.produces.length === 0) {
      this.actionGrid.append(textElement('div', 'This structure supports your base and has no production queue.', 'online-action-empty'));
      return;
    }
    for (const unitType of config.produces) {
      const unit = UNIT_CONFIG[unitType];
      const button = this.makeActionButton(unit.name, `${unit.cost} Credits · ${unit.buildTimeSeconds}s`, () => {
        this.command({ type: 'Produce', buildingId: building.id, unitType });
      });
      button.disabled = this.snapshot!.credits < unit.cost;
      this.actionGrid.append(button);
    }
    for (const item of building.queue ?? []) {
      const unit = UNIT_CONFIG[item.type];
      const row = textElement('button', `${unit.name} · ${Math.min(100, Math.floor(item.progress / unit.buildTimeSeconds * 100))}%`, 'online-queue-item') as HTMLButtonElement;
      row.type = 'button';
      row.title = `Cancel ${unit.name}`;
      row.addEventListener('click', () => this.command({ type: 'CancelProduction', buildingId: building.id, queueEntryId: item.id }));
      this.queue.append(row);
    }
  }

  private armBuild(workerId: string, buildingType: BuildingTypeId): void {
    this.attackMoveArmed = false;
    this.buildType = { type: 'Build', workerId, buildingType, topLeft: { tx: 0, ty: 0 } };
    this.notify(`Place ${BUILDING_CONFIG[buildingType].name} on visible clear ground. Escape cancels.`, 'success', 5000);
  }

  private armAttackMove(): void {
    this.buildType = null;
    this.attackMoveArmed = true;
    this.notify('Attack-move armed. Right-click the destination. Escape cancels.', 'success', 5000);
  }

  private syncView(): void {
    if (!this.snapshot) return;
    const visible = new Set<string>();
    for (const entity of this.snapshot.entities) {
      visible.add(entity.id);
      let mesh = this.meshes.get(entity.id);
      if (!mesh) {
        mesh = this.createEntityMesh(entity);
        this.meshes.set(entity.id, mesh);
      }
      mesh.position.set(entity.x / 30, entity.kind === 'building' ? buildingHeight(entity.type as BuildingTypeId) / 2 : unitHeight(entity.type as UnitTypeId) / 2, entity.y / 30);
      const material = mesh.material as StandardMaterial;
      const health = entity.health / entity.maxHealth;
      material.alpha = 0.58 + health * 0.42;
      material.emissiveColor = this.selected.has(entity.id) ? new Color3(0.18, 0.22, 0.05) : Color3.Black();
      this.syncSelectionRing(entity, mesh);
    }
    for (const [id, mesh] of this.meshes) {
      if (visible.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
      this.selectionRings.get(id)?.dispose();
      this.selectionRings.delete(id);
      this.selected.delete(id);
    }
    this.drawFog();
    this.updateHud();
  }

  private createEntityMesh(entity: EntityView): AbstractMesh {
    let mesh: AbstractMesh;
    if (entity.kind === 'building') {
      const config = BUILDING_CONFIG[entity.type as BuildingTypeId];
      mesh = MeshBuilder.CreateBox(entity.id, {
        width: config.footprint.width * 0.86,
        depth: config.footprint.height * 0.86,
        height: buildingHeight(config.id),
      }, this.scene);
    } else if (entity.type === 'tank') {
      mesh = MeshBuilder.CreateBox(entity.id, { width: 1.05, depth: 1.35, height: 0.62 }, this.scene);
    } else {
      const config = UNIT_CONFIG[entity.type as UnitTypeId];
      mesh = MeshBuilder.CreateCylinder(entity.id, { diameter: config.bodySizeTiles, height: unitHeight(config.id), tessellation: 10 }, this.scene);
    }
    const material = new StandardMaterial(`entity-${entity.id}`, this.scene);
    material.diffuseColor = entity.owner === this.seat ? new Color3(0.20, 0.67, 0.91) : new Color3(0.91, 0.32, 0.20);
    material.specularColor = new Color3(0.1, 0.12, 0.13);
    mesh.material = material;
    mesh.metadata = { entityId: entity.id };
    return mesh;
  }

  private syncSelectionRing(entity: EntityView, mesh: AbstractMesh): void {
    const selected = this.selected.has(entity.id);
    let ring = this.selectionRings.get(entity.id);
    if (!selected) {
      if (ring) { ring.dispose(); this.selectionRings.delete(entity.id); }
      return;
    }
    if (!ring) {
      const diameter = entity.kind === 'building'
        ? Math.max(BUILDING_CONFIG[entity.type as BuildingTypeId].footprint.width, BUILDING_CONFIG[entity.type as BuildingTypeId].footprint.height) * 1.05
        : UNIT_CONFIG[entity.type as UnitTypeId].bodySizeTiles * 1.5;
      ring = MeshBuilder.CreateTorus(`selection-${entity.id}`, { diameter, thickness: 0.06, tessellation: 24 }, this.scene);
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      const material = new StandardMaterial(`selection-material-${entity.id}`, this.scene);
      material.emissiveColor = new Color3(0.72, 0.82, 0.18);
      material.disableLighting = true;
      ring.material = material;
      this.selectionRings.set(entity.id, ring);
    }
    ring.position.set(mesh.position.x, 0.12, mesh.position.z);
  }

  private drawFog(): void {
    if (!this.snapshot) return;
    const context = this.fogTexture.getContext();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const visibility = this.snapshot.fog[y]?.[x];
      context.fillStyle = visibility === 'visible' ? 'rgba(0,0,0,0)' : visibility === 'explored' ? 'rgba(0,0,0,.48)' : 'rgba(0,0,0,.96)';
      context.fillRect(x, y, 1, 1);
    }
    this.fogTexture.update();
  }

  // eslint-disable-next-line complexity -- The minimap paints fog and entities in one small canvas pass.
  private drawMinimap(): void {
    if (!this.snapshot) return;
    const context = this.minimap.getContext('2d');
    if (!context) return;
    context.fillStyle = '#03080b';
    context.fillRect(0, 0, 160, 160);
    const cell = 160 / 64;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const visibility = this.snapshot.fog[y]?.[x];
      if (visibility === 'hidden') continue;
      context.fillStyle = visibility === 'visible' ? '#253d35' : '#111f1d';
      context.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
    }
    for (const entity of this.snapshot.entities) {
      context.fillStyle = entity.owner === this.seat ? '#63ccff' : '#ff745c';
      const size = entity.kind === 'building' ? 5 : 3;
      context.fillRect(entity.x / 30 / 64 * 160 - size / 2, entity.y / 30 / 64 * 160 - size / 2, size, size);
    }
    const target = this.camera.target;
    context.strokeStyle = '#f2f6c3';
    context.lineWidth = 1;
    context.strokeRect(target.x / 64 * 160 - 12, target.z / 64 * 160 - 9, 24, 18);
  }

  // eslint-disable-next-line complexity -- Picking combines selection and construction placement.
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.snapshot || this.snapshot.result || !this.modalLayer.hidden) return;
    const picked = this.scene.pick(event.offsetX, event.offsetY);
    const id = picked?.pickedMesh?.metadata?.entityId as string | undefined;
    if (this.buildType && picked?.pickedPoint) {
      const tx = Math.floor(picked.pickedPoint.x);
      const ty = Math.floor(picked.pickedPoint.z);
      this.command({ ...this.buildType, topLeft: { tx, ty } });
      this.buildType = null;
      return;
    }
    if (!event.shiftKey) this.selected.clear();
    if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner === this.seat)) {
      if (event.shiftKey && this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.syncView();
  };

  // eslint-disable-next-line complexity -- Context orders distinguish visible targets and terrain.
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (!this.snapshot || this.snapshot.result || !this.selected.size || !this.modalLayer.hidden) return;
    const picked = this.scene.pick(event.offsetX, event.offsetY);
    const id = picked?.pickedMesh?.metadata?.entityId as string | undefined;
    const units = this.selectedEntities().filter((entity) => entity.kind === 'unit');
    if (!units.length) return;
    if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner !== this.seat)) {
      this.command({ type: 'Attack', unitIds: units.map((unit) => unit.id), targetId: id });
    } else if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner === this.seat && entity.status === 'constructing')) {
      const worker = units.find((unit) => unit.type === 'worker');
      if (worker) this.command({ type: 'ResumeConstruction', workerId: worker.id, buildingId: id });
    } else if (picked?.pickedPoint) this.issueGroundOrder(units, picked.pickedPoint.x, picked.pickedPoint.z, event.altKey);
  };

  private issueGroundOrder(units: readonly EntityView[], x: number, z: number, altKey: boolean): void {
    const destination = { x: x * 30, y: z * 30 };
    const workers = units.filter((unit) => unit.type === 'worker');
    const field = MAP_CONFIG.resourceFields.find((candidate) => Math.hypot(candidate.center.tx - x, candidate.center.ty - z) <= candidate.radiusTiles);
    if (field && workers.length) this.command({ type: 'Gather', unitIds: workers.map((unit) => unit.id), fieldId: field.id });
    else {
      this.command({
        type: this.attackMoveArmed || altKey ? 'AttackMove' : 'Move',
        unitIds: units.map((unit) => unit.id),
        destination,
      });
    }
    this.attackMoveArmed = false;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditable(event.target)) return;
    this.pressed.add(event.code);
    if (event.code === 'KeyQ' && !this.gameUi.hidden) {
      event.preventDefault();
      this.armAttackMove();
    } else if (event.code === 'Escape') {
      this.buildType = null;
      this.attackMoveArmed = false;
      this.help.hidden = true;
      this.confirm.hidden = true;
      this.notify('Command mode cancelled.', '', 1000);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => { this.pressed.delete(event.code); };

  // eslint-disable-next-line complexity -- Four independent directional keys compose camera motion.
  private updateCamera(): void {
    if (this.gameUi.hidden) return;
    let dx = 0;
    let dz = 0;
    if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) dz -= 0.32;
    if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) dz += 0.32;
    if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) dx -= 0.32;
    if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) dx += 0.32;
    if (dx === 0 && dz === 0) return;
    const target = this.camera.target;
    this.camera.setTarget(new Vector3(clamp(target.x + dx, 0, 64), 0, clamp(target.z + dz, 0, 64)));
  }

  private readonly onMinimapClick = (event: MouseEvent): void => {
    const bounds = this.minimap.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 64;
    const z = (event.clientY - bounds.top) / bounds.height * 64;
    this.camera.setTarget(new Vector3(clamp(x, 0, 64), 0, clamp(z, 0, 64)));
  };

  private selectedEntities(): EntityView[] {
    if (!this.snapshot) return [];
    return [...this.selected]
      .map((id) => this.snapshot!.entities.find((entity) => entity.id === id))
      .filter((entity): entity is EntityView => entity !== undefined && entity.owner === this.seat);
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

  private makeActionButton(label: string, detail: string, action: () => void): HTMLButtonElement {
    const button = this.makeButton(label, action, 'secondary');
    button.append(textElement('small', detail));
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

  private setHealth(fraction: number): void {
    this.healthFill.style.width = `${Math.round(clamp(fraction, 0, 1) * 100)}%`;
    this.healthFill.style.background = fraction > 0.6 ? '#62d793' : fraction > 0.3 ? '#dfbf57' : '#db6e59';
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

function buildingHeight(type: BuildingTypeId): number {
  if (type === 'hq') return 2.2;
  if (type === 'powerPlant') return 1.65;
  if (type === 'factory') return 1.55;
  return 1.35;
}

function unitHeight(type: UnitTypeId): number { return type === 'tank' ? 0.62 : type === 'worker' ? 0.62 : 0.82; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
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
