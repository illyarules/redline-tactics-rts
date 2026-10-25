import type {
  SquadAnimationConfig,
  SquadCasualtyConfig,
  SquadDroneConfig,
  SquadRecoilConfig,
  SquadRoleConfig,
  SquadRoleId,
} from './types';

/** Tuned by eye against the normal RTS camera height, not measured from anything real. */
export const SQUAD_CONFIG: SquadAnimationConfig = {
  walkCyclesPerSecond: 2.4,
  legSwingRadians: 0.55,
  armSwingRadians: 0.3,
  walkBobTiles: 0.022,
  idleCyclesPerSecond: 0.35,
  idleBobTiles: 0.008,
  idleSwayRadians: 0.05,
};

/**
 * Compact toy-soldier squads, about 0.53 tiles tall (the soldiers' only size knob: the Blender model
 * is one unit tall and is scaled to `standHeightTiles`). Slots are listed lead first: the first slot is
 * the last member standing and the last slot is the first to fall, so a damaged squad always keeps
 * a coherent shape. Infantry is a two-rank fire team with a slight stagger, leaving gaps for the
 * rear soldiers' rifles to point through.
 */
export const SQUAD_ROLES: Readonly<Record<SquadRoleId, SquadRoleConfig>> = {
  infantry: {
    slots: [
      { rightTiles: -0.36, forwardTiles: 0.2 },
      { rightTiles: 0.2, forwardTiles: 0.26 },
      { rightTiles: -0.12, forwardTiles: -0.26 },
      { rightTiles: 0.4, forwardTiles: -0.2 },
    ],
    memberMotion: [
      { stridePhaseRadians: 0.15, strideTempoMultiplier: 0.93, legSwingMultiplier: 0.94, armSwingMultiplier: 1.05, bobMultiplier: 0.9, idleOffsetSeconds: 0.15, idleTempoMultiplier: 0.88, lateralDriftTiles: 0.018, forwardDriftTiles: 0.025 },
      { stridePhaseRadians: 1.8, strideTempoMultiplier: 1.07, legSwingMultiplier: 1.04, armSwingMultiplier: 0.92, bobMultiplier: 1.05, idleOffsetSeconds: 0.85, idleTempoMultiplier: 1.08, lateralDriftTiles: 0.026, forwardDriftTiles: 0.018 },
      { stridePhaseRadians: 3.55, strideTempoMultiplier: 0.98, legSwingMultiplier: 0.9, armSwingMultiplier: 1.08, bobMultiplier: 0.96, idleOffsetSeconds: 1.55, idleTempoMultiplier: 0.96, lateralDriftTiles: 0.022, forwardDriftTiles: 0.03 },
      { stridePhaseRadians: 5.15, strideTempoMultiplier: 1.03, legSwingMultiplier: 1.08, armSwingMultiplier: 0.96, bobMultiplier: 1.02, idleOffsetSeconds: 2.25, idleTempoMultiplier: 1.03, lateralDriftTiles: 0.03, forwardDriftTiles: 0.02 },
    ],
    standHeightTiles: 0.53,
    overheadLiftTiles: 0.4,
    deployedSinkTiles: 0,
  },
  fpvOperators: {
    slots: [
      { rightTiles: 0, forwardTiles: 0.2 },
      { rightTiles: -0.36, forwardTiles: -0.16 },
      { rightTiles: 0.36, forwardTiles: -0.14 },
    ],
    memberMotion: [
      { stridePhaseRadians: 0.2, strideTempoMultiplier: 0.94, legSwingMultiplier: 0.92, armSwingMultiplier: 0.9, bobMultiplier: 0.9, idleOffsetSeconds: 0.2, idleTempoMultiplier: 0.9, lateralDriftTiles: 0.014, forwardDriftTiles: 0.018 },
      { stridePhaseRadians: 2.25, strideTempoMultiplier: 1.05, legSwingMultiplier: 1.04, armSwingMultiplier: 1.02, bobMultiplier: 1.04, idleOffsetSeconds: 1.1, idleTempoMultiplier: 1.06, lateralDriftTiles: 0.022, forwardDriftTiles: 0.016 },
      { stridePhaseRadians: 4.45, strideTempoMultiplier: 0.99, legSwingMultiplier: 0.96, armSwingMultiplier: 1.08, bobMultiplier: 0.97, idleOffsetSeconds: 2, idleTempoMultiplier: 0.97, lateralDriftTiles: 0.018, forwardDriftTiles: 0.024 },
    ],
    standHeightTiles: 0.53,
    overheadLiftTiles: 0.4,
    deployedSinkTiles: 0.08,
  },
};

/** The FPV drone prop rests ahead of the lead operator's right hand and launches its attack from there. */
export const SQUAD_DRONE_CONFIG: SquadDroneConfig = {
  modelScaleTiles: 0.55,
  slot: { rightTiles: 0.4, forwardTiles: 0.36 },
  launchHeightTiles: 0.16,
};

export const SQUAD_CASUALTY_CONFIG: SquadCasualtyConfig = {
  fallSeconds: 0.5,
  tiltRadians: 1.2,
  dropTiles: 0.1,
  fadeStartFraction: 0.4,
};

export const SQUAD_RECOIL_CONFIG: SquadRecoilConfig = {
  attackSeconds: 0.03,
  releaseSeconds: 0.17,
  armKickRadians: 0.16,
  bodyKickTiles: 0.02,
};
