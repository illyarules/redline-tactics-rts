import type { Vec2 } from '../core/geometry';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { SQUAD_CASUALTY_CONFIG, SQUAD_CONFIG, SQUAD_DRONE_CONFIG, SQUAD_RECOIL_CONFIG, SQUAD_ROLES } from '../config/squad';
import type { SquadRoleId, VehicleDustProfile } from '../config/types';
import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicleEffects';
import { healthFraction, isAlive, type ReadonlyEntity, type ReadonlyUnit } from '../core/entities';
import { clamp } from '../core/geometry';
import type { EntityId } from '../core/ids';
import { shouldShowHealthBar } from './healthBar';
import type { MaterialLibrary } from './materials';
import type { ModelLibrary } from './models/library';
import type { ModelSpec } from './models/kit';
import { loadFpvOperatorParts, loadInfantryParts } from './models/infantry';
import { createSoldierKit, disposeFpvSquadParts, disposeInfantrySquad, instantiateSoldier, type SoldierInstance, type SoldierKit } from './models/soldier';
import { SquadRoster, visibleMemberCount } from './models/squadCasualties';
import { nextShooterIndex, recoilDurationSeconds, recoilKick } from './models/squadFire';
import { variedSquadFormationSlots } from './models/squadFormation';
import { TurretRig } from './models/turretRig';
import { idlePose, walkPose } from './models/walkCycle';
import { healthTone } from './palette';
import type { SceneSpace } from './sceneSpace';
import { VehicleDustView } from './VehicleDustView';
import { DustClock, SpeedSmoother, attackTargetIdOf, displacementSpeed, headingToPoint } from './vehicleEffectsState';
import { isVehicleEffectType } from './combatEffectEvents';

/**
 * Draws every entity the world holds, and nothing else.
 *
 * This view is a mirror: each frame it creates a display for a new entity id, moves and re-reads the
 * ones it already has, and disposes the ones the world no longer holds. It reads core state and
 * decides nothing — no damage, no costs, no prerequisites.
 *
 * Every entity but Infantry and FPV Operators is a clone of its role's prototype model plus a health
 * bar that turns to face the camera. Those two are squads instead: one shared root carries cloned
 * soldier rigs (`models/soldier.ts`) — four riflemen, or three operators — whose legs and arms this
 * view swings every frame from the entity's `status`, entirely as view-layer state — `src/core`
 * never sees a walk cycle. The visible members are presentation only: how many stand is a function
 * of the entity's health (`models/squadCasualties.ts`), and a squad is still one entity with one
 * health pool, selection, order and footprint. Every mesh carries the owning entity's id, so a click
 * on any soldier resolves back to core state.
 */

/** Health bar size in tiles, and how far above the model it floats. */
const BAR_HEIGHT = 0.1;
const BAR_MIN_WIDTH = 0.7;
const BAR_MAX_WIDTH = 2;
const BAR_GAP = 0.3;
const BAR_BACKING = 0x141b18;
/** Drawn after the field, so a bar is never lost behind the model in front of it. */
const OVERLAY_RENDERING_GROUP = 1;

const DEAD_VISIBILITY = 0.35;
/** Distinct from both a finished building (1) and a dead entity ({@link DEAD_VISIBILITY}). */
const CONSTRUCTING_VISIBILITY = 0.6;
/** Never fully flat, so even a freshly placed site reads as something standing there. */
const MIN_CONSTRUCTION_SCALE = 0.15;

interface Bar {
  readonly node: TransformNode;
  readonly fill: Mesh;
  readonly rest: Mesh;
}

interface DisplayBase {
  readonly root: TransformNode;
  readonly bar: TransformNode;
  readonly barFill: Mesh;
  readonly barRest: Mesh;
  readonly barWidth: number;
  /** How tall the model stands, in tiles. Markers and labels sit above it. */
  readonly modelHeight: number;
  /** Every mesh a click may land on, and every mesh the dead-visibility fade applies to. */
  readonly pickableMeshes: readonly Mesh[];
}

/** Cosmetic state of one vehicle: dust cadence, motion tracking and, if its model has one, a turret. */
interface VehicleFx {
  readonly dust: VehicleDustProfile;
  readonly dustClock: DustClock;
  readonly speed: SpeedSmoother;
  readonly turret: TurretRig | null;
  lastX: number;
  lastZ: number;
  tracked: boolean;
}

interface ModelDisplay extends DisplayBase {
  readonly kind: 'model';
  readonly model: ModelSpec;
  readonly vehicle: VehicleFx | null;
}

interface SquadAnimationState {
  /** Per-member phases allow slightly different continuous stride tempos. */
  readonly walkPhaseRadians: number[];
  /** Per-member idle clocks keep breathing and weapon sway out of lockstep. */
  readonly idleElapsedSeconds: number[];
}

interface SquadDisplay extends DisplayBase {
  readonly kind: 'squad';
  readonly role: SquadRoleId;
  readonly soldiers: readonly SoldierInstance[];
  /** Which members stand, are mid-fall or are gone. Derived from the entity's health each frame. */
  readonly roster: SquadRoster;
  /** Seconds since each soldier last fired; infinite while its rifle is at rest. Cosmetic only. */
  readonly recoilElapsed: number[];
  /** The soldier who took the last shot, so the next shot is taken by the next one standing. */
  lastShooter: number | null;
  /** The squad's drone prop, when its model is loaded. FPV Operators only. */
  readonly drone: Mesh | null;
  readonly animation: SquadAnimationState;
  readonly entrenchmentCover: readonly Mesh[];
}

type EntityDisplay = ModelDisplay | SquadDisplay;
type EntityVisibility = (entity: ReadonlyEntity) => boolean;

const ALWAYS_VISIBLE: EntityVisibility = () => true;
const NO_TARGET_POSITION = (): Vec2 | null => null;
const VEHICLE_FX = VEHICLE_EFFECTS_CONFIG;

function isInfantryRole(entity: ReadonlyEntity): entity is ReadonlyUnit & { type: 'infantry' | 'fpvOperators' } {
  return entity.kind === 'unit' && (entity.type === 'infantry' || entity.type === 'fpvOperators');
}

export class EntitiesView {
  private readonly displays = new Map<EntityId, EntityDisplay>();
  private readonly meshOwners = new Map<number, EntityId>();
  private readonly soldierKit: SoldierKit;
  private readonly dust: VehicleDustView;
  private readonly muzzleScratch = new Vector3();
  private disposed = false;
  private fpvModelRequested = false;

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly models: ModelLibrary,
    private readonly materials: MaterialLibrary,
    /** Called for each new model so the scene can make it cast a shadow. */
    private readonly onMeshCreated: (mesh: Mesh) => void,
  ) {
    this.soldierKit = createSoldierKit(scene, materials);
    this.dust = new VehicleDustView(scene, materials);
    void loadInfantryParts(scene).then(parts => {
      if (this.disposed) {
        for (const squad of parts.values()) disposeInfantrySquad(squad);
        return;
      }
      this.soldierKit.useModel(parts);
      this.resetInfantryDisplays();
    }).catch(error => {
      console.warn('Infantry model unavailable; using procedural fallback.', error);
    });
  }

  /** Loads the Blender FPV squad the first time one is fielded, then rebuilds the squads that used the fallback. */
  private loadFpvModel(): void {
    this.fpvModelRequested = true;
    void loadFpvOperatorParts(this.scene).then(parts => {
      if (this.disposed) {
        for (const set of parts.values()) disposeFpvSquadParts(set);
        return;
      }
      this.soldierKit.useFpvModel(parts);
      this.resetInfantryDisplays();
    }).catch(error => {
      console.warn('FPV operator model unavailable; using procedural fallback.', error);
    });
  }

  /**
   * Brings the display in line with the world. Safe to call every frame.
   *
   * `selectedId` is display state, not world state: it decides whether an entity shows its health
   * bar, and nothing else. The selection itself lives in `core/selection.ts`. `deltaSeconds` drives
   * nothing but the Infantry walk cycle, which is likewise display state.
   */
  public sync(
    entities: readonly ReadonlyEntity[],
    selectedIds: readonly EntityId[] = [],
    deltaSeconds = 0,
    isVisible: EntityVisibility = ALWAYS_VISIBLE,
    targetPosition: (id: EntityId) => Vec2 | null = NO_TARGET_POSITION,
  ): void {
    const selected = new Set(selectedIds);
    const present = new Set<EntityId>();

    for (const entity of entities) {
      present.add(entity.id);
      const display = this.displayFor(entity);
      this.update(display, entity, selected.has(entity.id), deltaSeconds, isVisible(entity), targetPosition);
    }

    for (const [id, display] of this.displays) {
      if (!present.has(id)) {
        for (const mesh of display.pickableMeshes) {
          this.meshOwners.delete(mesh.uniqueId);
        }
        display.root.dispose(false, false);
        this.displays.delete(id);
      }
    }
  }

  /** The entity a picked mesh belongs to, or `null` when the mesh is not an entity's. */
  public entityIdOfMesh(mesh: { uniqueId: number } | null): EntityId | null {
    return mesh === null ? null : (this.meshOwners.get(mesh.uniqueId) ?? null);
  }

  /** Where a marker above `id` should sit, in scene units above the ground. */
  public modelHeightOf(id: EntityId): number {
    return this.displays.get(id)?.modelHeight ?? 0;
  }

  /**
   * A shooter fires: kicks its recoil and returns where the shot leaves it (reused scratch vector,
   * copy before keeping) — the barrel of a turreted vehicle, the rifle of the next soldier standing
   * in an Infantry squad, or the drone of an FPV squad. `null` when the shooter is not on screen or
   * has no such origin, so callers fall back to its position.
   */
  public fireWeapon(attackerId: string, target: Vec2): Vector3 | null {
    const display = this.displays.get(attackerId as EntityId);
    if (display === undefined || !display.root.isEnabled()) return null;
    if (display.kind === 'squad') return this.fireSquad(display);
    const turret = display.vehicle?.turret;
    if (!turret) return null;
    const muzzle = turret.muzzlePointToRef(display.root.rotation.y, this.muzzleScratch);
    turret.noteShot(target, VEHICLE_FX.shotAimHoldSeconds);
    return muzzle;
  }

  /**
   * Infantry: the next standing soldier (never a casualty) shoulders a recoil and the shot starts at
   * their actual muzzle. FPV Operators: no rifle and no recoil, so the shot starts at the drone, or
   * at the lead operator's equipment while the drone model is unavailable.
   */
  private fireSquad(display: SquadDisplay): Vector3 | null {
    if (display.role === 'fpvOperators') {
      const origin = display.drone ?? display.soldiers[0]?.root;
      if (origin === undefined) return null;
      origin.computeWorldMatrix(true);
      this.muzzleScratch.copyFrom(origin.getAbsolutePosition());
      this.muzzleScratch.y += display.drone === null ? display.modelHeight * 0.55 : SQUAD_DRONE_CONFIG.launchHeightTiles;
      return this.muzzleScratch;
    }
    const index = nextShooterIndex(display.lastShooter, display.roster.visibleCount);
    const soldier = index === null ? undefined : display.soldiers[index];
    if (index === null || soldier === undefined) return null;
    display.lastShooter = index;
    display.recoilElapsed[index] = 0;
    soldier.muzzle.computeWorldMatrix(true);
    return this.muzzleScratch.copyFrom(soldier.muzzle.getAbsolutePosition());
  }

  /** Advances the dust puffs. Called with the effect clock, which a paused match never ticks. */
  public updateDust(deltaSeconds: number): void {
    this.dust.update(deltaSeconds);
  }

  public dispose(): void {
    this.disposed = true;
    this.dust.dispose();
    for (const display of this.displays.values()) {
      display.root.dispose(false, false);
    }
    this.displays.clear();
    this.meshOwners.clear();
    this.soldierKit.dispose();
  }

  /** Drops every Infantry squad display so the next `sync` rebuilds it from the loaded model. */
  private resetInfantryDisplays(): void {
    for (const [id, display] of this.displays) {
      if (display.kind !== 'squad' || display.soldiers.length === 0) continue;
      for (const mesh of display.pickableMeshes) this.meshOwners.delete(mesh.uniqueId);
      display.root.dispose(false, false);
      this.displays.delete(id);
    }
  }

  private create(entity: ReadonlyEntity): EntityDisplay {
    const root = new TransformNode(`entity:${entity.id}`, this.scene);

    if (isInfantryRole(entity)) {
      if (entity.type === 'fpvOperators' && !this.fpvModelRequested) this.loadFpvModel();
      const role = entity.type;
      const slots = variedSquadFormationSlots(SQUAD_ROLES[role], entity.id);
      const squadParts = this.soldierKit.squadPartsFor(entity.owner, role);
      const parts = squadParts[0] ?? this.soldierKit.partsFor(entity.owner, role);
      const soldiers = slots.map((slot, index) =>
        instantiateSoldier(this.scene, squadParts[index] ?? parts, root, slot, `entity:${entity.id}:soldier${index}`),
      );
      const entrenchmentCover = role === 'fpvOperators' ? this.createEntrenchmentCover(root, entity.id) : [];
      const drone = role === 'fpvOperators' ? this.createDrone(root, entity) : null;
      const pickableMeshes = [...soldiers.flatMap((soldier) => soldier.meshes), ...entrenchmentCover, ...(drone === null ? [] : [drone])];
      const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
      const overheadTiles = parts.standHeightTiles + SQUAD_ROLES[role].overheadLiftTiles;
      const bar = this.createBar(entity.id, root, overheadTiles);
      this.registerPickable(pickableMeshes, entity.id);

      // A squad created already hurt (a restored save, or an online snapshot) starts with only its
      // surviving members; nobody falls just because the display was built late.
      return {
        kind: 'squad',
        role,
        root,
        soldiers,
        roster: new SquadRoster(slots.length, visibleMembers(entity, slots.length)),
        recoilElapsed: slots.map(() => Infinity),
        lastShooter: null,
        drone,
        bar: bar.node,
        barFill: bar.fill,
        barRest: bar.rest,
        barWidth,
        modelHeight: overheadTiles,
        pickableMeshes,
        animation: {
          walkPhaseRadians: SQUAD_ROLES[role].memberMotion.map(profile => profile.stridePhaseRadians),
          idleElapsedSeconds: SQUAD_ROLES[role].memberMotion.map(profile => profile.idleOffsetSeconds),
        },
        entrenchmentCover,
      };
    }

    const model = this.models.modelFor(entity);
    const mesh = model.mesh.clone(`entity:${entity.id}:model`, root);
    mesh.setEnabled(true);
    const pickableMeshes = [mesh, ...mesh.getChildMeshes()].filter(
      (part): part is Mesh => part instanceof Mesh && part.getTotalVertices() > 0,
    );
    for (const part of pickableMeshes) part.isPickable = true;
    this.registerPickable(pickableMeshes, entity.id);
    const vehicle = this.createVehicleFx(entity, mesh);

    const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
    const bar = this.createBar(entity.id, root, model.height);

    return {
      kind: 'model',
      model,
      root,
      bar: bar.node,
      barFill: bar.fill,
      barRest: bar.rest,
      barWidth,
      modelHeight: model.height,
      pickableMeshes,
      vehicle,
    };
  }

  private createVehicleFx(entity: ReadonlyEntity, model: Mesh): VehicleFx | null {
    if (entity.kind !== 'unit' || !isVehicleEffectType(entity.type)) return null;
    const turretProfile = entity.type === 'tank' || entity.type === 'combatBuggy'
      ? VEHICLE_FX.turrets[entity.type]
      : null;
    return {
      dust: VEHICLE_FX.dust.profiles[entity.type],
      dustClock: new DustClock(),
      speed: new SpeedSmoother(),
      turret: turretProfile === null ? null : TurretRig.find(model, turretProfile),
      lastX: 0,
      lastZ: 0,
      tracked: false,
    };
  }

  /** Replace a loading fallback once its imported prototype is ready. */
  private displayFor(entity: ReadonlyEntity): EntityDisplay {
    let display = this.displays.get(entity.id);
    if (display?.kind === 'model' && display.model !== this.models.modelFor(entity)) {
      for (const mesh of display.pickableMeshes) this.meshOwners.delete(mesh.uniqueId);
      display.root.dispose(false, false);
      display = undefined;
    }
    if (display === undefined) {
      display = this.create(entity);
      this.displays.set(entity.id, display);
    }
    return display;
  }

  private registerPickable(meshes: readonly Mesh[], id: EntityId): void {
    for (const mesh of meshes) {
      this.meshOwners.set(mesh.uniqueId, id);
      this.onMeshCreated(mesh);
    }
  }

  /** The squad's drone resting on the ground, when the Blender model is loaded. */
  private createDrone(root: TransformNode, entity: ReadonlyUnit): Mesh | null {
    const prototype = this.soldierKit.droneFor(entity.owner);
    if (prototype === null) return null;
    const drone = prototype.mesh.clone(`entity:${entity.id}:drone`, root);
    drone.setEnabled(true);
    drone.isPickable = true;
    drone.position.set(SQUAD_DRONE_CONFIG.slot.rightTiles, 0, SQUAD_DRONE_CONFIG.slot.forwardTiles);
    return drone;
  }

  private createEntrenchmentCover(root: TransformNode, id: EntityId): readonly Mesh[] {
    const soil = this.materials.surface(0x6b5132);
    const mound = CreateTorus(`entity:${id}:earthMound`, {
      diameter: 1.5, thickness: 0.21, tessellation: 24,
    }, this.scene);
    mound.parent = root;
    mound.position.y = 0.055;
    mound.scaling.z = 0.94;
    mound.material = soil;
    const pit = CreateCylinder(`entity:${id}:firingPit`, { height: 0.025, diameter: 1.26, tessellation: 24 }, this.scene);
    pit.parent = root;
    pit.position.y = 0.014;
    pit.scaling.z = 0.94;
    pit.material = this.materials.surface(0x30281d);
    const front = CreateBox(`entity:${id}:raisedEarth`, { width: 1.0, height: 0.16, depth: 0.16 }, this.scene);
    front.parent = root;
    front.position.set(0, 0.09, 0.7);
    front.material = soil;
    const cover = [mound, pit, front];
    for (const mesh of cover) {
      mesh.isPickable = true;
      mesh.setEnabled(false);
    }
    return cover;
  }

  private createBar(id: EntityId, root: TransformNode, modelHeight: number): Bar {
    const node = new TransformNode(`entity:${id}:bar`, this.scene);
    node.parent = root;
    node.position = new Vector3(0, modelHeight + BAR_GAP, 0);
    node.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    // Two quads side by side rather than one over the other: coplanar overlapping quads fight for
    // depth, and a bar that flickers is worse than no bar at all.
    const fill = this.createBarQuad(`entity:${id}:barFill`, node);
    const rest = this.createBarQuad(`entity:${id}:barRest`, node);
    rest.material = this.materials.unlit(BAR_BACKING);

    return { node, fill, rest };
  }

  private createBarQuad(name: string, parent: TransformNode): Mesh {
    const quad = CreatePlane(name, { width: 1, height: BAR_HEIGHT }, this.scene);
    quad.parent = parent;
    quad.isPickable = false;
    quad.renderingGroupId = OVERLAY_RENDERING_GROUP;
    return quad;
  }

  // eslint-disable-next-line complexity -- Per-entity presentation combines independent animation and visibility states.
  private update(
    display: EntityDisplay,
    entity: ReadonlyEntity,
    selected: boolean,
    deltaSeconds: number,
    visible: boolean,
    targetPosition: (id: EntityId) => Vec2 | null,
  ): void {
    // Written in place rather than reassigned: this runs for every entity, every frame.
    display.root.position.set(
      this.space.sceneX(entity.position.x),
      0,
      this.space.sceneZ(entity.position.y),
    );
    if (entity.kind === 'unit') {
      // Unit model local +Z is core north, so this yaw directly maps the core heading to Babylon.
      display.root.rotation.y = entity.facingRadians;
    }

    if (display.kind === 'model' && display.vehicle !== null && entity.kind === 'unit') {
      this.updateVehicleFx(display.vehicle, display.root, entity, deltaSeconds, visible, targetPosition);
    }

    // A squad's casualties follow its health even out of sight, so a squad that comes back into
    // view already shows the right members instead of replaying a fall it was never seen taking.
    if (display.kind === 'squad') this.updateRoster(display, entity, visible);

    // Disabled roots are neither drawn nor picked, but stay allocated so an enemy can reappear
    // without recreating model geometry or changing its stable mesh-to-entity mapping.
    display.root.setEnabled(visible);
    if (!visible) {
      display.bar.setEnabled(false);
      return;
    }

    const alive = isAlive(entity);
    const constructing = entity.kind === 'building' && entity.status === 'constructing';
    const visibility = !alive ? DEAD_VISIBILITY : constructing ? CONSTRUCTING_VISIBILITY : 1;
    for (const mesh of display.pickableMeshes) {
      mesh.visibility = visibility;
    }
    // A building under construction rises out of the ground as it completes, rather than standing
    // at full height (and looking finished) the instant its site is placed.
    display.root.scaling.y = constructing
      ? Math.max(entity.constructionProgress, MIN_CONSTRUCTION_SCALE)
      : 1;

    if (display.kind === 'squad' && entity.kind === 'unit') {
      const deployed = entity.type === 'fpvOperators' && entity.entrenchment !== 'mobile';
      for (const cover of display.entrenchmentCover) cover.setEnabled(deployed);
      this.updateSquadAnimation(display, entity, deltaSeconds, visibility, deployed);
    }

    const fraction = clamp(healthFraction(entity), 0, 1);
    const show = shouldShowHealthBar(fraction, selected) && alive;
    display.bar.setEnabled(show);
    if (!show) {
      return;
    }

    const filled = display.barWidth * fraction;
    display.barFill.scaling.x = Math.max(filled, 1e-4);
    display.barFill.position.x = (filled - display.barWidth) / 2;
    display.barFill.material = this.materials.unlit(healthTone(fraction));

    const rest = display.barWidth - filled;
    display.barRest.setEnabled(rest > 1e-3);
    display.barRest.scaling.x = Math.max(rest, 1e-4);
    display.barRest.position.x = display.barWidth / 2 - rest / 2;
  }

  /**
   * Dust, turret aim and recoil for one vehicle. Motion is judged from how far the model actually
   * moved, so it works the same for local state and interpolated online snapshots. A vehicle in
   * fog still tracks its position (so reappearing is not read as a jump) but emits and aims nothing.
   */
  private updateVehicleFx(
    fx: VehicleFx,
    root: TransformNode,
    entity: ReadonlyUnit,
    deltaSeconds: number,
    visible: boolean,
    targetPosition: (id: EntityId) => Vec2 | null,
  ): void {
    const x = root.position.x;
    const z = root.position.z;
    const speed = fx.tracked
      ? fx.speed.update(
        displacementSpeed(x - fx.lastX, z - fx.lastZ, deltaSeconds, VEHICLE_FX.dust.maxFrameDisplacementTiles),
        deltaSeconds,
        VEHICLE_FX.dust.speedWindowSeconds,
      )
      : 0;
    // A zero-length frame carries no motion information, so the last real position is kept.
    if (deltaSeconds > 0 || !fx.tracked) {
      fx.lastX = x;
      fx.lastZ = z;
      fx.tracked = true;
    }
    if (!visible || !isAlive(entity)) return;

    fx.turret?.update(entity.facingRadians, this.aimHeading(fx.turret, entity, targetPosition), deltaSeconds);

    const emits = fx.dustClock.advance(
      deltaSeconds,
      speed >= fx.dust.minSpeedTilesPerSecond,
      fx.dust.intervalSeconds,
      VEHICLE_FX.dust.maxEmitsPerFrame,
    );
    if (emits > 0) this.emitDust(fx.dust, x, z, entity.facingRadians, emits);
  }

  /** Where the turret should point: the order's visible target, else the last shot's, else nowhere. */
  private aimHeading(
    turret: TurretRig,
    entity: ReadonlyUnit,
    targetPosition: (id: EntityId) => Vec2 | null,
  ): number | null {
    const targetId = attackTargetIdOf(entity.order);
    const aim = (targetId === null ? null : targetPosition(targetId)) ?? turret.heldShotAim;
    return aim === null ? null : headingToPoint(entity.position, aim);
  }

  /** Puffs from both rear contact points, drifting back along the line the vehicle just drove. */
  private emitDust(profile: VehicleDustProfile, x: number, z: number, facing: number, count: number): void {
    const forwardX = Math.sin(facing);
    const forwardZ = Math.cos(facing);
    for (const side of [-1, 1]) {
      const px = x - forwardX * profile.rearOffsetTiles + forwardZ * profile.halfTrackTiles * side;
      const pz = z - forwardZ * profile.rearOffsetTiles - forwardX * profile.halfTrackTiles * side;
      for (let emit = 0; emit < count; emit++) this.dust.emit(profile, px, pz, -forwardX, -forwardZ);
    }
  }

  /** Moves the roster to the member count the entity's health calls for. */
  private updateRoster(display: SquadDisplay, entity: ReadonlyEntity, visible: boolean): void {
    const count = visibleMembers(entity, display.roster.size);
    if (count !== display.roster.visibleCount || !visible) display.roster.setVisibleCount(count, visible);
  }

  /**
   * Drives the walk cycle from the entity's own `status`: legs and the rifle arm swing while
   * `moving`, and freeze — rather than snap to rest — the instant it stops, so idle sway picks up
   * from wherever the stride left off. Also tips over and fades casualties, and kicks the rifle of
   * a soldier who just fired. Members who are gone are switched off and not animated at all.
   */
  private updateSquadAnimation(
    display: SquadDisplay,
    entity: ReadonlyUnit,
    deltaSeconds: number,
    baseVisibility: number,
    deployed: boolean,
  ): void {
    const moving = entity.status === 'moving';
    display.roster.advance(deltaSeconds, SQUAD_CASUALTY_CONFIG.fallSeconds);
    const sink = deployed ? SQUAD_ROLES[display.role].deployedSinkTiles : 0;
    const recoilEnd = recoilDurationSeconds(SQUAD_RECOIL_CONFIG);

    display.soldiers.forEach((soldier, index) => {
      const shown = display.roster.isShown(index);
      soldier.root.setEnabled(shown);
      if (!shown) return;

      const casualty = display.roster.poseOf(index, SQUAD_CASUALTY_CONFIG);
      soldier.root.rotation.x = -casualty.tiltRadians;
      soldier.root.position.y = -casualty.dropTiles;
      for (const mesh of soldier.meshes) mesh.visibility = baseVisibility * casualty.visibility;
      // A falling soldier keeps the pose it fell in rather than walking on.
      if (display.roster.phaseOf(index) !== 'standing') return;

      const motion = SQUAD_ROLES[display.role].memberMotion[index];
      if (motion === undefined) return;
      if (moving) {
        const roleTempo = entity.type === 'fpvOperators' ? 0.82 : 1;
        display.animation.walkPhaseRadians[index] =
          ((display.animation.walkPhaseRadians[index] ?? 0) + deltaSeconds * SQUAD_CONFIG.walkCyclesPerSecond *
            roleTempo * motion.strideTempoMultiplier * Math.PI * 2) % (Math.PI * 2);
      }
      display.animation.idleElapsedSeconds[index] =
        (display.animation.idleElapsedSeconds[index] ?? 0) + deltaSeconds * motion.idleTempoMultiplier;
      const pose = moving
        ? walkPose(display.animation.walkPhaseRadians[index] ?? 0, SQUAD_CONFIG)
        : idlePose(display.animation.idleElapsedSeconds[index] ?? 0, SQUAD_CONFIG);
      const positionPhase = moving
        ? (display.animation.walkPhaseRadians[index] ?? 0)
        : (display.animation.idleElapsedSeconds[index] ?? 0) * SQUAD_CONFIG.idleCyclesPerSecond * Math.PI * 2;
      const driftScale = moving ? 1 : 0.35;
      soldier.root.position.x = soldier.slot.rightTiles + Math.sin(positionPhase + index * 0.7) *
        motion.lateralDriftTiles * driftScale;
      soldier.root.position.z = soldier.slot.forwardTiles + Math.cos(positionPhase * 0.73 + index) *
        motion.forwardDriftTiles * driftScale;
      const elapsed = (display.recoilElapsed[index] ?? Infinity) + deltaSeconds;
      display.recoilElapsed[index] = elapsed >= recoilEnd ? Infinity : elapsed;
      const kick = recoilKick(elapsed, SQUAD_RECOIL_CONFIG);
      soldier.legLeftPivot.rotation.x = pose.legLeftRadians * motion.legSwingMultiplier;
      soldier.legRightPivot.rotation.x = pose.legRightRadians * motion.legSwingMultiplier;
      // Negative rotation about x raises the muzzle; the kick also nudges the upper body back.
      soldier.armPivot.rotation.x = pose.armRadians * motion.armSwingMultiplier - kick * SQUAD_RECOIL_CONFIG.armKickRadians;
      soldier.bob.position.y = pose.bobTiles * motion.bobMultiplier - sink;
      soldier.bob.position.z = -kick * SQUAD_RECOIL_CONFIG.bodyKickTiles;
    });
  }

  /** How wide the entity is on the ground, in tiles: its footprint, or the body its config gives it. */
  private displayWidth(entity: ReadonlyEntity): number {
    return entity.kind === 'building' ? entity.footprint.width : entity.stats.bodySizeTiles;
  }
}

/** Members of a squad that should stand at the entity's current health. */
function visibleMembers(entity: ReadonlyEntity, squadSize: number): number {
  return visibleMemberCount(clamp(healthFraction(entity), 0, 1), squadSize);
}
