"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-fpv-operators beside this repository; use -- --output-dir PATH to override.

Three compact, toy-like FPV specialists built on the same proportions as the Infantry squad (see
"compact toy soldier" in meridian_common.py), plus the squad's drone. Each operator is an
`OperatorN` pivot holding `OperatorN_Body`, `OperatorN_Arms` (both arms and the role equipment) and
`OperatorN_LegLeft` / `OperatorN_LegRight`; the drone is `FPVDrone` / `FPVDroneMesh`.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import (  # noqa: E402
    FABRIC, GEAR, HALF_PI, PLATE, SOLDIER_SHOULDER_Z, SOLDIER_WAIST_Z, STEEL, Model,
    refine_soldier_silhouette, soldier_arm, soldier_leg, soldier_torso, squad_location,
)

m = Model('meridian-fpv-operators', 'Meridian FPV Operators Study', 'MeridianFPVOperators')
SHOULDER_X = 0.31


def antenna(parent, x, y, z, height):
    m.cylinder('Antenna', (x, y, z + height / 2), 0.012, height, GEAR, parent, vertices=6)
    m.box('AntennaTab', (x, y, z + height - 0.03), (0.04, 0.015, 0.06), 'TeamColor', parent, 0.003)


def pack_controller(body):  # Operator 1: small radio pack, one short antenna
    m.box('Backpack', (0, 0.27, 0.2), (0.34, 0.16, 0.26), GEAR, body, 0.05)
    m.box('PackLid', (0, 0.275, 0.36), (0.32, 0.17, 0.05), FABRIC, body, 0.02)
    antenna(body, 0.13, 0.31, 0.3, 0.34)


def pack_drone(body):  # Operator 2: pack with a folded quadcopter strapped to the back
    m.box('Backpack', (0, 0.27, 0.21), (0.38, 0.18, 0.3), GEAR, body, 0.05)
    m.box('PackLid', (0, 0.275, 0.38), (0.36, 0.19, 0.05), FABRIC, body, 0.02)
    m.box('FoldedDroneShell', (0, 0.4, 0.22), (0.18, 0.08, 0.18), PLATE, body, 0.02)
    m.box('FoldedDroneMarking', (0, 0.445, 0.22), (0.08, 0.012, 0.05), 'TeamColor', body, 0.003)
    for x in (-0.13, 0.13):
        for z in (0.12, 0.32):
            m.torus('FoldedRotorGuard', (x, 0.39, z), 0.06, 0.016, GEAR, body, (HALF_PI, 0, 0))
    m.box('DroneStrap', (0, 0.35, 0.22), (0.34, 0.02, 0.03), GEAR, body, 0.005)


def pack_radio(body):  # Operator 3: tall radio pack with two short antennas
    m.box('Backpack', (0, 0.28, 0.22), (0.4, 0.2, 0.34), GEAR, body, 0.05)
    m.box('RadioPanel', (0, 0.385, 0.28), (0.26, 0.015, 0.15), STEEL, body, 0.006)
    m.box('PackMarking', (0, 0.395, 0.15), (0.17, 0.012, 0.045), 'TeamColor', body, 0.003)
    for x in (-0.12, 0.12):
        antenna(body, x, 0.32, 0.4, 0.4)


def arm_pair(arms, right_elbow, right_hand, left_elbow, left_hand):
    for side, elbow, hand in ((1, right_elbow, right_hand), (-1, left_elbow, left_hand)):
        soldier_arm(m, arms, (side * SHOULDER_X, 0, 0), elbow, hand)


def arms_controller(arms):
    """Both hands on a compact two-stick controller held at chest height."""
    arm_pair(arms, (0.37, -0.06, -0.15), (0.17, -0.3, -0.17), (-0.37, -0.06, -0.15),
             (-0.17, -0.3, -0.17))
    y, z = -0.32, -0.17
    m.box('ControllerBody', (0, y, z), (0.4, 0.16, 0.08), GEAR, arms, 0.02)
    m.box('ControllerScreen', (0, y - 0.01, z + 0.044), (0.18, 0.1, 0.012), 'Optics', arms, 0.003)
    m.box('SunHoodFolded', (0, y + 0.04, z + 0.06), (0.22, 0.04, 0.025), STEEL, arms, 0.006)
    for x in (-0.12, 0.12):
        m.cylinder('ControlStick', (x, y - 0.04, z + 0.07), 0.012, 0.07, STEEL, arms, vertices=8)
        m.cylinder('StickKnob', (x, y - 0.04, z + 0.11), 0.02, 0.025, GEAR, arms, vertices=8)
    for x in (-0.17, 0.17):
        antenna(arms, x, y + 0.06, z + 0.04, 0.18)


def arms_case(arms):
    """Right hand carries a rugged case at the side; the left arm hangs relaxed."""
    arm_pair(arms, (0.37, -0.03, -0.15), (0.37, -0.05, -0.3), (-0.37, 0.0, -0.15),
             (-0.37, -0.03, -0.3))
    m.box('CaseHandle', (0.37, -0.05, -0.34), (0.06, 0.2, 0.04), STEEL, arms, 0.008)
    m.box('Case', (0.37, -0.05, -0.43), (0.15, 0.42, 0.22), GEAR, arms, 0.03)
    m.box('CaseLatchTop', (0.37, -0.05, -0.335), (0.155, 0.42, 0.03), STEEL, arms, 0.006)
    m.box('CaseMarking', (0.448, -0.05, -0.43), (0.012, 0.22, 0.07), 'TeamColor', arms, 0.003)
    for y in (-0.24, 0.14):
        m.box('CaseCorner', (0.37, y, -0.43), (0.16, 0.04, 0.24), STEEL, arms, 0.01)


def arms_mast(arms):
    """Right hand holds a folded tripod / radio mast upright; the left arm hangs relaxed."""
    arm_pair(arms, (0.37, -0.07, -0.15), (0.4, -0.15, -0.22), (-0.37, 0.0, -0.15),
             (-0.37, -0.03, -0.3))
    x, y = 0.4, -0.15
    for dx, dy in ((0, 0), (0.045, 0.025), (-0.045, 0.025)):
        m.cylinder('TripodLeg', (x + dx, y + dy, -0.05), 0.022, 1.0, GEAR, arms, vertices=8)
    m.box('TripodHead', (x, y + 0.01, 0.5), (0.14, 0.08, 0.14), STEEL, arms, 0.015)
    for dx in (-0.04, 0.04):
        m.cylinder('MastTip', (x + dx, y + 0.01, 0.66), 0.012, 0.22, GEAR, arms, vertices=6)
    m.cylinder('TripodBand', (x, y + 0.01, -0.3), 0.065, 0.05, 'TeamColor', arms, vertices=10)
    m.cylinder('TripodBandUpper', (x, y + 0.01, 0.22), 0.06, 0.04, STEEL, arms, vertices=10)


def build_operator(name, location, pack, arms_builder):
    op = m.pivot(name, location, m.root)
    body = m.pivot(f'{name}_Body', (0, 0, SOLDIER_WAIST_Z), op)  # waist; bob and lean here
    soldier_torso(m, body, pack, visor=True)
    arms = m.pivot(f'{name}_Arms', (0, 0, SOLDIER_SHOULDER_Z), op)  # shoulder line; swing here
    arms_builder(arms)
    legs = [soldier_leg(m, -1, op, name), soldier_leg(m, 1, op, name)]
    for pivot in (body, arms):
        m.join_children(pivot, f'{pivot.name}Mesh')
    refine_soldier_silhouette(op)
    return legs


# Slots mirror SQUAD_ROLES.fpvOperators in src/config/squad.ts (right, forward in tiles), lead first.
build_operator('Operator1', squad_location(0, 0.2), pack_controller, arms_controller)
build_operator('Operator2', squad_location(-0.36, -0.16), pack_drone, arms_case)
build_operator('Operator3', squad_location(0.36, -0.14), pack_radio, arms_mast)

# Compact four-rotor FPV drone resting on the ground ahead of the squad.
drone = m.pivot('FPVDrone', squad_location(0.4, 0.36), m.root)
m.box('DroneShell', (0, 0.02, 0.17), (0.26, 0.34, 0.1), 'BaseArmor', drone, 0.035)
m.box('DroneMarking', (0, 0.04, 0.225), (0.11, 0.09, 0.012), 'TeamColor', drone, 0.003)
m.box('DroneBattery', (0, 0.12, 0.24), (0.15, 0.12, 0.04), GEAR, drone, 0.01)
m.box('DroneFrame', (0, 0.0, 0.12), (0.28, 0.32, 0.06), GEAR, drone, 0.014)
m.box('DroneCamera', (0, -0.2, 0.14), (0.15, 0.12, 0.11), GEAR, drone, 0.025)
m.cylinder('DroneLens', (0, -0.265, 0.14), 0.034, 0.025, 'Optics', drone, (HALF_PI, 0, 0),
           bevel=0.003, vertices=12)
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * 0.22, sy * 0.2
        m.bar('DroneArm', (sx * 0.09, sy * 0.09, 0.12), (x, y, 0.15), 0.05, 0.04, GEAR, drone, 0.01)
        m.torus('RotorGuard', (x, y, 0.17), 0.12, 0.018, GEAR, drone)
        m.cylinder('RotorHub', (x, y, 0.17), 0.035, 0.05, STEEL, drone, vertices=10)
        blade = math.atan2(sy, sx) + HALF_PI
        m.box('RotorBlade', (x, y, 0.17), (0.2, 0.03, 0.01), STEEL, drone, 0.002,
              rotation=(0, 0, blade))
        m.box('DroneFoot', (x * 0.7, y * 0.7, 0.03), (0.05, 0.05, 0.06), GEAR, drone, 0.012)
m.join_children(drone, 'FPVDroneMesh')

m.export_and_preview((2.6, -7, 4.2), (0.05, -0.1, 0.45), 3.6)
