import type { Vec2 } from '../core/geometry';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { SQUAD_CONFIG } from '../config/squad';
import type { VehicleDustProfile } from '../config/types';
import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicleEffects';
import { healthFraction, isAlive, type ReadonlyEntity, type ReadonlyUnit } from '../core/entities';
import { clamp } from '../core/geometry';
import type { EntityId } from '../core/ids';
import { shouldShowHealthBar } from './healthBar';
import type { MaterialLibrary } from './materials';
import type { ModelLibrary } from './models/library';
import type { ModelSpec } from './models/kit';
import { loadFpvOperatorParts, loadInfantryParts } from './models/infantry';
import { DRONE_SLOT, createSoldierKit, disposeFpvSquadParts, disposeSoldierParts, instantiateSoldier, type SoldierInstance, type SoldierKit } from './models/soldier';
import { squadFormationSlots } from './models/squadFormation';
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
 * Every entity but Infantry is a clone of its role's prototype model plus a health bar that turns to
 * face the camera. Infantry is a three-soldier squad instead: one shared root carries three cloned
 * soldier rigs (`models/soldier.ts`) whose legs and rifle arm this view swings every frame from the
 * entity's `status`, entirely as view-layer state — `src/core` never sees a walk cycle. Every mesh
 * carries the owning entity's id, so a click on any soldier resolves back to core state.
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
  /** Only advances while the entity is moving; frozen — not reset — the instant it stops. */
  walkPhaseRadians: number;
  /** Always advances, so idle sway keeps breathing however long the squad has been standing still. */
  elapsedSeconds: number;
}

interface SquadDisplay extends DisplayBase {
  readonly kind: 'squad';
  readonly soldiers: readonly SoldierInstance[];
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
        for (const set of parts.values()) disposeSoldierParts(set);
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
   * A shooter's barrel fires: kicks its recoil, holds its turret on `target` for a moment, and
   * returns where the shell leaves the barrel (reused scratch vector, copy before keeping). `null`
   * when the shooter has no articulated turret on screen, so callers fall back to its position.
   */
  public fireWeapon(attackerId: string, target: Vec2): Vector3 | null {
    const display = this.displays.get(attackerId as EntityId);
    const turret = display?.kind === 'model' ? display.vehicle?.turret : null;
    if (display === undefined || !turret || !display.root.isEnabled()) return null;
    const muzzle = turret.muzzlePointToRef(display.root.rotation.y, this.muzzleScratch);
    turret.noteShot(target, VEHICLE_FX.shotAimHoldSeconds);
    return muzzle;
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
      const squadParts = this.soldierKit.squadPartsFor(entity.owner, entity.type);
      const parts = squadParts[0] ?? this.soldierKit.partsFor(entity.owner, entity.type);
      const soldiers = squadFormationSlots(SQUAD_CONFIG.formation).map((slot, index) =>
        instantiateSoldier(this.scene, squadParts[index] ?? parts, root, slot, `entity:${entity.id}:soldier${index}`),
      );
      const entrenchmentCover = entity.type === 'fpvOperators' ? this.createEntrenchmentCover(root, entity.id) : [];
      const drone = entity.type === 'fpvOperators' ? this.createDrone(root, entity) : [];
      const pickableMeshes = [...soldiers.flatMap((soldier) => soldier.meshes), ...entrenchmentCover, ...drone];
      const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
      const bar = this.createBar(entity.id, root, parts.standHeightTiles);
      this.registerPickable(pickableMeshes, entity.id);

      return {
        kind: 'squad',
        root,
        soldiers,
        bar: bar.node,
        barFill: bar.fill,
        barRest: bar.rest,
        barWidth,
        modelHeight: parts.standHeightTiles,
        pickableMeshes,
        animation: { walkPhaseRadians: 0, elapsedSeconds: 0 },
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
  private createDrone(root: TransformNode, entity: ReadonlyUnit): readonly Mesh[] {
    const prototype = this.soldierKit.droneFor(entity.owner);
    if (prototype === null) return [];
    const drone = prototype.mesh.clone(`entity:${entity.id}:drone`, root);
    drone.setEnabled(true);
    drone.isPickable = true;
    drone.position.set(DRONE_SLOT.rightTiles, 0, DRONE_SLOT.forwardTiles);
    return [drone];
  }

  private createEntrenchmentCover(root: TransformNode, id: EntityId): readonly Mesh[] {
    const soil = this.materials.surface(0x6b5132);
    const mound = CreateTorus(`entity:${id}:earthMound`, {
      diameter: 1.28, thickness: 0.21, tessellation: 24,
    }, this.scene);
    mound.parent = root;
    mound.position.y = 0.055;
    mound.scaling.z = 0.82;
    mound.material = soil;
    const pit = CreateCylinder(`entity:${id}:firingPit`, { height: 0.025, diameter: 1.04, tessellation: 24 }, this.scene);
    pit.parent = root;
    pit.position.y = 0.014;
    pit.scaling.z = 0.82;
    pit.material = this.materials.surface(0x30281d);
    const front = CreateBox(`entity:${id}:raisedEarth`, { width: 0.92, height: 0.16, depth: 0.18 }, this.scene);
    front.parent = root;
    front.position.set(0, 0.09, 0.43);
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
      this.updateSquadAnimation(display, entity, deltaSeconds);
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

  /**
   * Drives the walk cycle from the entity's own `status`: legs and the rifle arm swing while
   * `moving`, and freeze — rather than snap to rest — the instant it stops, so idle sway picks up
   * from wherever the stride left off.
   */
  private updateSquadAnimation(display: SquadDisplay, entity: ReadonlyUnit, deltaSeconds: number): void {
    const moving = entity.status === 'moving';
    if (moving) {
      display.animation.walkPhaseRadians =
        (display.animation.walkPhaseRadians +
          deltaSeconds * SQUAD_CONFIG.walkCyclesPerSecond * (entity.type === 'fpvOperators' ? 0.82 : 1) * Math.PI * 2) %
        (Math.PI * 2);
    }
    display.animation.elapsedSeconds += deltaSeconds;

    display.soldiers.forEach((soldier, index) => {
      const phaseOffset = index * SQUAD_CONFIG.soldierPhaseOffsetRadians;
      const pose = moving
        ? walkPose(display.animation.walkPhaseRadians + phaseOffset, SQUAD_CONFIG)
        : idlePose(display.animation.elapsedSeconds + phaseOffset, SQUAD_CONFIG);
      soldier.legLeftPivot.rotation.x = pose.legLeftRadians;
      soldier.legRightPivot.rotation.x = pose.legRightRadians;
      soldier.armPivot.rotation.x = pose.armRadians;
      soldier.bob.position.y = pose.bobTiles + (entity.type === 'fpvOperators' && entity.entrenchment !== 'mobile' ? -0.14 : 0);
    });
  }

  /** How wide the entity is on the ground, in tiles: its footprint, or the body its config gives it. */
  private displayWidth(entity: ReadonlyEntity): number {
    return entity.kind === 'building' ? entity.footprint.width : entity.stats.bodySizeTiles;
  }
}
