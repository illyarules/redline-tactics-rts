import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { MAP_CONFIG } from '../config/map';
import type { PvpCommand, Seat } from '../core/pvp';

const STORAGE = 'redline-online-seat';
const VERSION = 1;
const SERVER_URL = import.meta.env.VITE_MULTIPLAYER_URL ?? 'ws://localhost:8787/ws';
type EntityView = { id: string; owner: Seat; kind: 'unit' | 'building'; type: string; x: number; y: number; health: number; maxHealth: number; status?: string; constructionProgress?: number; queue?: { id: string; type: string; progress: number }[] };
type Snapshot = { type: 'snapshot'; matchId: string; snapshotSeq: number; tick: number; seat: Seat; credits: number; entities: EntityView[]; fog: string[][]; result: { winner: Seat | null; reason: string } | null };

export class OnlineMatch {
  private readonly root = document.createElement('div');
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly meshes = new Map<string, AbstractMesh>();
  private readonly selected = new Set<string>();
  private readonly fogTexture: DynamicTexture;
  private readonly status = document.createElement('p');
  private readonly controls = document.createElement('div');
  private readonly actions = document.createElement('div');
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private invite: string | null = null;
  private credential: string | null = null;
  private seat: Seat | null = null;
  private matchId: string | null = null;
  private epoch = 0;
  private seq = 0;
  private reconnectDelay = 500;
  private readonly heartbeat = window.setInterval(() => { if (this.credential) this.send({ type: 'ping', protocolVersion: VERSION }); }, 5000);
  private disposed = false;
  private snapshot: Snapshot | null = null;
  private buildType: PvpCommand & { type: 'Build' } | null = null;
  private attackMoveArmed = false;

  constructor(engine: Engine, private readonly canvas: HTMLCanvasElement, container: HTMLElement, private readonly onExit: () => void, inviteFromUrl?: { roomId: string; invite: string }) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.03, 0.07, 0.09, 1);
    this.camera = new ArcRotateCamera('online-camera', -Math.PI / 2, 0.72, 38, new Vector3(32, 0, 32), this.scene);
    this.camera.lowerRadiusLimit = 12; this.camera.upperRadiusLimit = 100;
    this.camera.attachControl(canvas, true);
    new HemisphericLight('online-light', new Vector3(0, 1, 0), this.scene).intensity = 1.2;
    const ground = MeshBuilder.CreateGround('online-ground', { width: 64, height: 64 }, this.scene);
    ground.position.set(32, 0, 32);
    ground.metadata = { ground: true };
    const groundMaterial = new StandardMaterial('online-ground-material', this.scene);
    groundMaterial.diffuseColor = new Color3(0.19, 0.31, 0.25); ground.material = groundMaterial;
    for (const region of MAP_CONFIG.regions) {
      const tile = MeshBuilder.CreateBox('terrain', { width: region.area.width, depth: region.area.height, height: region.terrain === 'rock' ? 0.8 : 0.05 }, this.scene);
      tile.position.set(region.area.tx + region.area.width / 2, region.terrain === 'rock' ? 0.4 : 0.03, region.area.ty + region.area.height / 2);
      tile.isPickable = false;
      const material = new StandardMaterial('terrain-material', this.scene);
      material.diffuseColor = region.terrain === 'rock' ? new Color3(0.27, 0.3, 0.31) : new Color3(0.13, 0.25, 0.19);
      tile.material = material;
    }
    for (const field of MAP_CONFIG.resourceFields) {
      const marker = MeshBuilder.CreateCylinder(`field-${field.id}`, { diameter: field.radiusTiles * 2, height: 0.1 }, this.scene);
      marker.position.set(field.center.tx + 0.5, 0.1, field.center.ty + 0.5);
      marker.isPickable = false;
      const material = new StandardMaterial(`field-material-${field.id}`, this.scene);
      material.diffuseColor = new Color3(0.74, 0.57, 0.19); material.alpha = 0.65;
      marker.material = material;
    }
    this.fogTexture = new DynamicTexture('online-fog-texture', { width: 64, height: 64 }, this.scene, false);
    const fog = MeshBuilder.CreateGround('online-fog', { width: 64, height: 64 }, this.scene);
    fog.position.set(32, 0.12, 32); fog.isPickable = false;
    const fogMaterial = new StandardMaterial('online-fog-material', this.scene);
    fogMaterial.diffuseTexture = this.fogTexture; fogMaterial.diffuseTexture.hasAlpha = true;
    fogMaterial.useAlphaFromDiffuseTexture = true; fogMaterial.disableLighting = true;
    fog.material = fogMaterial;
    this.root.dataset.testid = 'multiplayer-screen';
    Object.assign(this.root.style, { position: 'fixed', inset: '0', zIndex: '65', pointerEvents: 'none', color: '#e7f5ff', font: '14px system-ui,sans-serif' });
    const panel = document.createElement('section');
    Object.assign(panel.style, { position: 'absolute', top: '18px', left: '18px', maxWidth: '340px', padding: '18px', background: 'rgba(6,17,23,.94)', border: '1px solid #76c8eb', borderRadius: '6px', pointerEvents: 'auto' });
    const heading = document.createElement('h2'); heading.textContent = 'Multiplayer · Open Field'; heading.style.margin = '0 0 8px';
    this.status.textContent = 'Connecting…';
    panel.append(heading, this.status, this.controls, this.actions);
    this.root.append(panel); container.append(this.root);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.button(this.controls, 'Return to title', () => { this.send({ type: 'leave', protocolVersion: VERSION }); sessionStorage.removeItem(STORAGE); this.onExit(); });
    const saved = sessionStorage.getItem(STORAGE);
    if (inviteFromUrl) this.open('join', inviteFromUrl);
    else if (saved) {
      try { const value = JSON.parse(saved) as {roomId: string; credential: string}; this.open('resume', value); }
      catch { this.showEntry(); }
    } else this.showEntry();
  }

  render(): void { this.scene.render(); }
  dispose(): void {
    this.disposed = true; window.clearInterval(this.heartbeat); this.socket?.close(); this.camera.detachControl(); this.scene.dispose(); this.root.remove();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown); this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private showEntry(): void {
    this.status.textContent = 'Create a private room or join with an invite link.';
    this.actions.replaceChildren();
    this.button(this.actions, 'Create room', () => this.open('create', {}));
    const input = document.createElement('input'); input.placeholder = 'Paste invite link'; input.style.width = '100%';
    this.actions.append(input);
    this.button(this.actions, 'Join room', () => {
      try { const url = new URL(input.value); const parts = new URLSearchParams(url.hash.slice(1)); const roomId = parts.get('room'); const invite = parts.get('invite'); if (!roomId || !invite) throw new Error(); this.open('join', { roomId, invite }); }
      catch { this.status.textContent = 'Enter a valid invite link.'; }
    });
  }

  private open(type: 'create' | 'join' | 'resume', data: object): void {
    this.socket?.close();
    this.status.textContent = 'Connecting…';
    const socket = new WebSocket(SERVER_URL); this.socket = socket;
    socket.addEventListener('open', () => { this.reconnectDelay = 500; this.send({ type, protocolVersion: VERSION, ...data }); });
    socket.addEventListener('message', (event) => this.receive(event.data as string));
    socket.addEventListener('close', () => {
      if (this.disposed || this.socket !== socket) return;
      this.status.textContent = 'Connection lost. Reconnecting…';
      if (this.roomId && this.credential) {
        const delay = this.reconnectDelay; this.reconnectDelay = Math.min(5000, delay * 2);
        window.setTimeout(() => { if (!this.disposed) this.open('resume', { roomId: this.roomId, credential: this.credential }); }, delay);
      } else this.showEntry();
    });
    socket.addEventListener('error', () => { this.status.textContent = 'Multiplayer server unavailable.'; });
  }

  // eslint-disable-next-line complexity -- Each wire message updates a separate screen state.
  private receive(raw: string): void {
    let message: Record<string, unknown>;
    try { message = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    if (message.type === 'session') {
      this.roomId = message.roomId as string; this.invite = message.invite as string; this.credential = message.credential as string;
      this.seat = message.seat as Seat; this.epoch = message.connectionEpoch as number; this.matchId = message.matchId as string | null; this.seq = message.lastSeq as number;
      this.camera.setTarget(new Vector3(this.seat === 'player' ? 10 : 54, 0, 32));
      this.camera.radius = 25;
      sessionStorage.setItem(STORAGE, JSON.stringify({ roomId: this.roomId, credential: this.credential }));
      history.replaceState(null, '', location.pathname + location.search);
    } else if (message.type === 'lobby') {
      this.matchId = message.matchId as string | null;
      const phase = message.phase as string;
      if (phase === 'running') { this.status.textContent = `Playing as ${this.seat === 'player' ? 'west' : 'east'} · ${this.snapshot?.credits ?? 900} Credits`; this.showGameActions(); }
      else if (phase === 'finished') { this.showResult(); }
      else { this.showLobby(message); }
    } else if (message.type === 'load') {
      this.send({ type: 'loaded', protocolVersion: VERSION });
    } else if (message.type === 'snapshot') {
      const snapshot = message as unknown as Snapshot;
      if (this.snapshot && snapshot.matchId === this.snapshot.matchId && snapshot.snapshotSeq <= this.snapshot.snapshotSeq) return;
      this.snapshot = snapshot; this.syncView();
      if (snapshot.result) this.showResult();
      else this.status.textContent = `Playing as ${snapshot.seat === 'player' ? 'west' : 'east'} · ${snapshot.credits} Credits · ${Math.floor(snapshot.tick / 20)}s`;
    } else if (message.type === 'rejected') {
      this.status.textContent = `Order rejected: ${String(message.reason)}`;
      if (message.reason === 'invalid-session') { sessionStorage.removeItem(STORAGE); this.credential = null; this.showEntry(); }
    } else if (message.type === 'ack' && message.ok === false) this.status.textContent = 'Order could not be applied.';
  }

  private showLobby(message: Record<string, unknown>): void {
    this.status.textContent = `Room ${this.roomId} · ${String(message.phase)}`;
    this.actions.dataset.mode = 'lobby'; this.actions.replaceChildren();
    const seats = message.seats as Array<{ seat: Seat; occupied: boolean; connected: boolean; ready: boolean }>;
    const lineup = document.createElement('p'); lineup.textContent = seats.map((state) => `${state.seat === 'player' ? 'West' : 'East'}: ${state.occupied ? state.connected ? state.ready ? 'ready' : 'connected' : 'disconnected' : 'open'}`).join(' · ');
    this.actions.append(lineup);
    if (this.roomId && this.invite) {
      const invite = `${location.origin}${location.pathname}#room=${encodeURIComponent(this.roomId)}&invite=${encodeURIComponent(this.invite)}`;
      const inviteField = document.createElement('input'); inviteField.value = invite; inviteField.readOnly = true; inviteField.setAttribute('aria-label', 'Invite link');
      Object.assign(inviteField.style, { display: 'block', width: '100%', boxSizing: 'border-box', marginBottom: '6px' });
      this.actions.append(inviteField);
      this.button(this.actions, 'Copy invite', () => { void navigator.clipboard.writeText(invite); });
    }
    if (message.phase === 'waiting') this.button(this.actions, 'Ready', () => this.send({ type: 'ready', ready: true, protocolVersion: VERSION }));
  }

  private showGameActions(): void {
    if (this.actions.dataset.mode === 'game') return;
    this.actions.dataset.mode = 'game'; this.actions.replaceChildren();
    const note = document.createElement('p'); note.textContent = 'Click units to select. Right-click ground to move, an enemy to attack, or a field to gather. Shift-click adds units.'; this.actions.append(note);
    for (const type of ['powerPlant', 'barracks', 'factory', 'resourceDepot', 'unmannedSystemsCenter'] as const) this.button(this.actions, `Build ${type}`, () => {
      const workerId = [...this.selected].find((id) => this.snapshot?.entities.find((entity) => entity.id === id && entity.type === 'worker' && entity.owner === this.seat));
      if (!workerId) { this.status.textContent = 'Select a Worker first.'; return; }
      this.buildType = { type: 'Build', workerId, buildingType: type, topLeft: { tx: 0, ty: 0 } };
      this.status.textContent = `Click the ground to place ${type}.`;
    });
    for (const type of ['worker', 'infantry', 'fpvOperators', 'tank', 'rocket'] as const) this.button(this.actions, `Produce ${type}`, () => {
      const buildingId = [...this.selected].find((id) => this.snapshot?.entities.find((entity) => entity.id === id && entity.kind === 'building' && entity.owner === this.seat));
      if (buildingId) this.command({ type: 'Produce', buildingId, unitType: type });
    });
    this.button(this.actions, 'Attack move', () => { this.buildType = null; this.attackMoveArmed = true; this.status.textContent = 'Right-click ground to attack-move.'; });
    this.button(this.actions, 'Cancel first queued unit', () => {
      const buildingId = [...this.selected].find((id) => this.snapshot?.entities.find((entity) => entity.id === id && entity.owner === this.seat && entity.queue?.length));
      const queueEntryId = this.snapshot?.entities.find((entity) => entity.id === buildingId)?.queue?.[0]?.id;
      if (buildingId && queueEntryId) this.command({ type: 'CancelProduction', buildingId, queueEntryId });
    });
    this.button(this.actions, 'Surrender', () => this.command({ type: 'Surrender' }));
  }

  private showResult(): void {
    if (!this.snapshot?.result) return;
    this.status.textContent = this.snapshot.result.winner === null ? `Draw · ${this.snapshot.result.reason}` : `${this.snapshot.result.winner === this.seat ? 'Victory' : 'Defeat'} · ${this.snapshot.result.reason}`;
    this.actions.dataset.mode = ''; this.actions.replaceChildren();
    this.button(this.actions, 'Rematch lobby', () => this.send({ type: 'rematch', protocolVersion: VERSION }));
  }

  // eslint-disable-next-line complexity -- Projection sync handles entity creation, update and disappearance.
  private syncView(): void {
    if (!this.snapshot) return;
    const visible = new Set<string>();
    for (const entity of this.snapshot.entities) {
      visible.add(entity.id);
      let mesh = this.meshes.get(entity.id);
      if (!mesh) {
        mesh = entity.kind === 'building' ? MeshBuilder.CreateBox(entity.id, { width: 2.5, depth: 2.5, height: 1.7 }, this.scene) : MeshBuilder.CreateCylinder(entity.id, { diameter: 0.75, height: 0.8 }, this.scene);
        const material = new StandardMaterial(`entity-${entity.id}`, this.scene);
        material.diffuseColor = entity.owner === 'player' ? new Color3(0.18, 0.7, 0.95) : new Color3(0.97, 0.35, 0.22);
        mesh.material = material; mesh.metadata = { entityId: entity.id }; this.meshes.set(entity.id, mesh);
      }
      mesh.position.set(entity.x / 30, entity.kind === 'building' ? 0.85 : 0.4, entity.y / 30);
      mesh.scaling.y = Math.max(0.2, entity.health / entity.maxHealth);
      (mesh.material as StandardMaterial).emissiveColor = this.selected.has(entity.id) ? new Color3(0.3, 0.3, 0.1) : Color3.Black();
    }
    for (const [id, mesh] of this.meshes) if (!visible.has(id)) { mesh.dispose(); this.meshes.delete(id); this.selected.delete(id); }
    const context = this.fogTexture.getContext();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { context.fillStyle = this.snapshot.fog[y]?.[x] === 'visible' ? 'rgba(0,0,0,0)' : this.snapshot.fog[y]?.[x] === 'explored' ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.94)'; context.fillRect(x, y, 1, 1); }
    this.fogTexture.update();
  }

  // eslint-disable-next-line complexity -- Picking combines selection and construction placement.
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.snapshot || this.snapshot.result) return;
    const picked = this.scene.pick(event.offsetX, event.offsetY);
    const id = picked?.pickedMesh?.metadata?.entityId as string | undefined;
    if (this.buildType && picked?.pickedPoint) {
      const tx = Math.floor(picked.pickedPoint.x); const ty = Math.floor(picked.pickedPoint.z);
      this.command({ ...this.buildType, topLeft: { tx, ty } }); this.buildType = null; return;
    }
    if (!event.shiftKey) this.selected.clear();
    if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner === this.seat)) this.selected.add(id);
    this.syncView();
  };
  // eslint-disable-next-line complexity -- Context orders distinguish visible targets and terrain.
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault(); if (!this.snapshot || this.snapshot.result || !this.selected.size) return;
    const picked = this.scene.pick(event.offsetX, event.offsetY);
    const id = picked?.pickedMesh?.metadata?.entityId as string | undefined;
    const units = [...this.selected].filter((candidate) => this.snapshot?.entities.some((entity) => entity.id === candidate && entity.kind === 'unit'));
    if (!units.length) return;
    if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner !== this.seat)) this.command({ type: 'Attack', unitIds: units, targetId: id });
    else if (id && this.snapshot.entities.some((entity) => entity.id === id && entity.owner === this.seat && entity.status === 'constructing')) {
      const workerId = units.find((unit) => this.snapshot?.entities.find((entity) => entity.id === unit)?.type === 'worker');
      if (workerId) this.command({ type: 'ResumeConstruction', workerId, buildingId: id });
    }
    else if (picked?.pickedPoint) {
      const destination = { x: picked.pickedPoint.x * 30, y: picked.pickedPoint.z * 30 };
      const field = MAP_CONFIG.resourceFields.find((candidate) => Math.hypot(candidate.center.tx - destination.x / 30, candidate.center.ty - destination.y / 30) <= candidate.radiusTiles);
      if (field && units.some((unit) => this.snapshot?.entities.find((entity) => entity.id === unit)?.type === 'worker')) this.command({ type: 'Gather', unitIds: units.filter((unit) => this.snapshot?.entities.find((entity) => entity.id === unit)?.type === 'worker'), fieldId: field.id });
      else this.command({ type: this.attackMoveArmed || event.getModifierState('Alt') ? 'AttackMove' : 'Move', unitIds: units, destination });
      this.attackMoveArmed = false;
    }
  };
  private command(command: PvpCommand): void { if (this.matchId) this.send({ type: 'command', protocolVersion: VERSION, matchId: this.matchId, connectionEpoch: this.epoch, seq: ++this.seq, command }); }
  private send(value: object): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value)); }
  private button(parent: HTMLElement, label: string, action: () => void): void {
    const button = document.createElement('button'); button.textContent = label; button.type = 'button';
    Object.assign(button.style, { margin: '3px', padding: '7px 10px', color: '#e7f5ff', background: '#1b5064', border: '1px solid #76c8eb', borderRadius: '4px', cursor: 'pointer' });
    button.addEventListener('click', action); parent.append(button);
  }
}
