"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-fpv-operators beside this repository; use -- --output-dir PATH to override.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import HALF_PI, Model  # noqa: E402

m = Model('meridian-fpv-operators', 'Meridian FPV Operators Study', 'MeridianFPVOperators')
# Same simplified body proportions as the infantry squad: 1.8 m tall, forward is -Y.
HIP_Z = 0.93
WAIST_Z = HIP_Z + 0.02
SHOULDER_Z = 1.46
FABRIC, PLATE, GEAR, STEEL = 'UniformFabric', 'BaseArmorLight', 'Equipment', 'ExposedSteel'


def build_leg(side, op, name):
    p = m.pivot(f'{name}_Leg{"Right" if side > 0 else "Left"}', (side * 0.1, 0, HIP_Z), op)
    # Local space: the hip is the origin, the ground is at z = -HIP_Z.
    m.limb('Thigh', (0, 0, -0.02), (0, -0.02, -0.46), 0.098, 0.075, FABRIC, p)
    m.box('ThighPocket', (side * 0.085, -0.02, -0.25), (0.035, 0.1, 0.15), GEAR, p, 0.012)
    m.limb('Shin', (0, -0.02, -0.46), (0, 0.0, -0.8), 0.07, 0.058, FABRIC, p)
    m.box('KneePad', (0, -0.075, -0.46), (0.15, 0.07, 0.17), PLATE, p, 0.02)
    m.box('ShinGuard', (0, -0.055, -0.63), (0.11, 0.045, 0.2), PLATE, p, 0.015)
    m.box('Boot', (0, -0.04, -0.855), (0.15, 0.3, 0.12), GEAR, p, 0.03)
    m.box('BootToeCap', (0, -0.16, -0.865), (0.14, 0.09, 0.09), STEEL, p, 0.025)
    m.box('BootSole', (0, -0.04, -0.915), (0.16, 0.32, 0.03), STEEL, p, 0.01)
    m.join_children(p, f'{p.name}Mesh')


def build_torso(body, pack):
    """Torso, head and backpack in waist space. `pack` picks the role-specific backpack."""
    m.box('Pelvis', (0, 0, 0), (0.38, 0.23, 0.18), FABRIC, body, 0.05)
    m.box('Belt', (0, 0, 0.1), (0.4, 0.25, 0.06), GEAR, body, 0.015)
    m.box('BeltBuckle', (0, -0.128, 0.1), (0.07, 0.015, 0.045), STEEL, body, 0.005)
    for x in (-0.15, 0.15):
        m.box('UtilityPouch', (x, -0.135, 0.07), (0.1, 0.06, 0.12), GEAR, body, 0.015)
    m.box('Chest', (0, 0, 0.3), (0.43, 0.26, 0.42), FABRIC, body, 0.07)
    m.box('Plastron', (0, -0.155, 0.33), (0.34, 0.06, 0.34), PLATE, body, 0.03)
    m.box('ChestMarking', (0, -0.19, 0.4), (0.2, 0.012, 0.04), 'TeamColor', body, 0.004)
    for x in (-0.1, 0.0, 0.1):
        m.box('ChestPouch', (x, -0.205, 0.17), (0.08, 0.05, 0.1), GEAR, body, 0.012)
    for x in (-0.12, 0.12):
        m.box('Strap', (x, 0.0, 0.5), (0.07, 0.28, 0.04), GEAR, body, 0.008)
    for side in (-1, 1):
        m.ellipsoid('ShoulderPad', (side * 0.255, 0.0, 0.5), (0.1, 0.105, 0.075), PLATE, body)
        m.box('ShoulderBadge', (side * 0.29, -0.05, 0.545), (0.035, 0.07, 0.012), 'TeamColor',
              body, 0.004)
    pack(body)
    m.cylinder('Neck', (0, 0, 0.56), 0.055, 0.12, 'Skin', body, vertices=10)
    m.box('Collar', (0, 0, 0.565), (0.2, 0.17, 0.06), PLATE, body, 0.02)
    m.ellipsoid('Head', (0, -0.005, 0.7), (0.085, 0.1, 0.11), 'Skin', body)
    m.box('Goggles', (0, -0.085, 0.715), (0.14, 0.04, 0.05), 'Optics', body, 0.012)
    m.box('GoggleStrap', (0, 0.0, 0.715), (0.185, 0.19, 0.03), GEAR, body, 0.008)
    m.ellipsoid('Helmet', (0, 0.005, 0.755), (0.125, 0.14, 0.1), PLATE, body)
    m.box('HelmetBrim', (0, -0.1, 0.765), (0.18, 0.06, 0.025), PLATE, body, 0.01)
    m.box('HelmetMarking', (0, 0.0, 0.85), (0.04, 0.22, 0.012), 'TeamColor', body, 0.004)
    m.box('ChinStrap', (0, -0.06, 0.63), (0.15, 0.03, 0.025), GEAR, body, 0.006)


def antenna(parent, x, y, z, height):
    m.cylinder('Antenna', (x, y, z + height / 2), 0.009, height, GEAR, parent, vertices=6)
    m.box('AntennaTab', (x, y, z + height - 0.03), (0.03, 0.012, 0.05), 'TeamColor', parent, 0.003)


def pack_controller(body):  # Operator 1: small radio pack, one short antenna
    m.box('Backpack', (0, 0.22, 0.3), (0.3, 0.14, 0.34), GEAR, body, 0.04)
    m.box('PackLid', (0, 0.225, 0.5), (0.28, 0.15, 0.05), FABRIC, body, 0.02)
    antenna(body, 0.12, 0.27, 0.45, 0.3)


def pack_drone(body):  # Operator 2: pack with a folded quadcopter strapped to the back
    m.box('Backpack', (0, 0.22, 0.3), (0.34, 0.16, 0.38), GEAR, body, 0.04)
    m.box('PackLid', (0, 0.225, 0.52), (0.32, 0.17, 0.05), FABRIC, body, 0.02)
    m.box('FoldedDroneShell', (0, 0.34, 0.31), (0.16, 0.07, 0.16), PLATE, body, 0.02)
    m.box('FoldedDroneMarking', (0, 0.378, 0.31), (0.07, 0.012, 0.05), 'TeamColor', body, 0.003)
    for x in (-0.11, 0.11):
        for z in (0.2, 0.42):
            m.torus('FoldedRotorGuard', (x, 0.33, z), 0.055, 0.014, GEAR, body, (HALF_PI, 0, 0))
    m.box('DroneStrap', (0, 0.3, 0.31), (0.3, 0.02, 0.025), GEAR, body, 0.005)


def pack_radio(body):  # Operator 3: tall radio pack with two short antennas
    m.box('Backpack', (0, 0.23, 0.32), (0.36, 0.18, 0.46), GEAR, body, 0.04)
    m.box('RadioPanel', (0, 0.325, 0.38), (0.24, 0.015, 0.14), STEEL, body, 0.006)
    m.box('PackMarking', (0, 0.335, 0.25), (0.16, 0.012, 0.04), 'TeamColor', body, 0.003)
    for x in (-0.11, 0.11):
        antenna(body, x, 0.28, 0.52, 0.34)


def arm_pair(arms, right_elbow, right_hand, left_elbow, left_hand):
    """Both arms as tapered tubes from the shoulders (+-0.285, 0, 0) to a hand box each."""
    for side, elbow, hand in ((1, right_elbow, right_hand), (-1, left_elbow, left_hand)):
        shoulder = (side * 0.285, 0, 0)
        m.limb('UpperArm', shoulder, elbow, 0.062, 0.052, FABRIC, arms)
        m.limb('Forearm', elbow, hand, 0.05, 0.04, FABRIC, arms)
        m.box('ElbowPad', elbow, (0.08, 0.085, 0.09), PLATE, arms, 0.02)
        m.box('Glove', hand, (0.07, 0.085, 0.075), GEAR, arms, 0.02)


def arms_controller(arms):
    """Both hands on a compact two-stick controller held at chest height, sun hood folded."""
    arm_pair(arms, (0.31, -0.06, -0.28), (0.16, -0.36, -0.3), (-0.31, -0.06, -0.28), (-0.16, -0.36, -0.3))
    y, z = -0.38, -0.3
    m.box('ControllerBody', (0, y, z), (0.36, 0.15, 0.07), GEAR, arms, 0.02)
    m.box('ControllerScreen', (0, y - 0.01, z + 0.037), (0.16, 0.09, 0.01), 'Optics', arms, 0.003)
    m.box('SunHoodFolded', (0, y + 0.03, z + 0.05), (0.2, 0.04, 0.02), STEEL, arms, 0.006)
    for x in (-0.11, 0.11):
        m.cylinder('ControlStick', (x, y - 0.03, z + 0.06), 0.01, 0.06, STEEL, arms, vertices=8)
        m.cylinder('StickKnob', (x, y - 0.03, z + 0.095), 0.016, 0.02, GEAR, arms, vertices=8)
    for x in (-0.15, 0.15):
        antenna(arms, x, y + 0.05, z + 0.03, 0.14)


def arms_case(arms):
    """Right hand carries a rugged case at the side; the left arm hangs relaxed."""
    arm_pair(arms, (0.31, -0.02, -0.28), (0.3, -0.02, -0.55), (-0.31, 0.0, -0.28), (-0.31, -0.02, -0.55))
    m.box('CaseHandle', (0.3, -0.02, -0.63), (0.05, 0.16, 0.04), STEEL, arms, 0.008)
    m.box('Case', (0.33, -0.02, -0.82), (0.12, 0.4, 0.3), GEAR, arms, 0.03)
    m.box('CaseLatchTop', (0.33, -0.02, -0.7), (0.125, 0.4, 0.03), STEEL, arms, 0.006)
    m.box('CaseMarking', (0.397, -0.02, -0.82), (0.012, 0.2, 0.06), 'TeamColor', arms, 0.003)
    for y in (-0.19, 0.15):
        m.box('CaseCorner', (0.33, y, -0.82), (0.13, 0.04, 0.32), STEEL, arms, 0.01)


def arms_mast(arms):
    """Right hand holds a slim folded tripod / radio mast upright; the left arm hangs relaxed."""
    arm_pair(arms, (0.31, -0.05, -0.28), (0.34, -0.14, -0.4), (-0.31, 0.0, -0.28), (-0.31, -0.02, -0.55))
    x, y = 0.34, -0.14
    for dx, dy in ((0, 0), (0.035, 0.02), (-0.035, 0.02)):
        m.cylinder('TripodLeg', (x + dx, y + dy, -0.1), 0.017, 1.3, GEAR, arms, vertices=8)
    m.box('TripodHead', (x, y + 0.01, 0.58), (0.12, 0.07, 0.12), STEEL, arms, 0.015)
    for dx in (-0.035, 0.035):
        m.cylinder('MastTip', (x + dx, y + 0.01, 0.74), 0.01, 0.2, GEAR, arms, vertices=6)
    m.cylinder('TripodBand', (x, y + 0.01, -0.3), 0.055, 0.05, 'TeamColor', arms, vertices=10)
    m.cylinder('TripodBandUpper', (x, y + 0.01, 0.25), 0.05, 0.04, STEEL, arms, vertices=10)


def build_operator(name, location, pack, arms_builder):
    op = m.pivot(name, location, m.root)
    body = m.pivot(f'{name}_Body', (0, 0, WAIST_Z), op)  # waist; bob and lean here
    build_torso(body, pack)
    arms = m.pivot(f'{name}_Arms', (0, 0, SHOULDER_Z), op)  # shoulder line; swing here
    arms_builder(arms)
    legs = [build_leg(-1, op, name), build_leg(1, op, name)]
    for pivot in (body, arms):
        m.join_children(pivot, f'{pivot.name}Mesh')
    return legs


# Staggered so no operator hides another from the three-quarter preview and RTS camera.
build_operator('Operator1', (0.3, -0.4, 0), pack_controller, arms_controller)
build_operator('Operator2', (-0.92, -0.44, 0), pack_drone, arms_case)
build_operator('Operator3', (0.68, 0.76, 0), pack_radio, arms_mast)

# Compact four-rotor FPV drone resting on the ground beside the squad.
drone = m.pivot('FPVDrone', (1.06, -0.58, 0), m.root)
m.box('DroneShell', (0, 0.02, 0.15), (0.2, 0.28, 0.08), 'BaseArmor', drone, 0.03)
m.box('DroneMarking', (0, 0.04, 0.196), (0.09, 0.07, 0.01), 'TeamColor', drone, 0.003)
m.box('DroneBattery', (0, 0.1, 0.205), (0.12, 0.1, 0.03), GEAR, drone, 0.008)
m.box('DroneFrame', (0, 0.0, 0.11), (0.22, 0.26, 0.05), GEAR, drone, 0.012)
m.box('DroneCamera', (0, -0.17, 0.12), (0.12, 0.1, 0.09), GEAR, drone, 0.02)
m.cylinder('DroneLens', (0, -0.225, 0.12), 0.027, 0.02, 'Optics', drone, (HALF_PI, 0, 0),
           bevel=0.003, vertices=12)
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * 0.2, sy * 0.19
        m.bar('DroneArm', (sx * 0.08, sy * 0.08, 0.12), (x, y, 0.14), 0.04, 0.03, GEAR, drone, 0.008)
        m.torus('RotorGuard', (x, y, 0.15), 0.115, 0.014, GEAR, drone)
        m.cylinder('RotorHub', (x, y, 0.15), 0.03, 0.04, STEEL, drone, vertices=10)
        blade = math.atan2(sy, sx) + HALF_PI
        m.box('RotorBlade', (x, y, 0.15), (0.2, 0.025, 0.008), STEEL, drone, 0.002,
              rotation=(0, 0, blade))
        m.box('DroneFoot', (x * 0.65, y * 0.65, 0.025), (0.04, 0.04, 0.05), GEAR, drone, 0.01)
m.join_children(drone, 'FPVDroneMesh')

m.export_and_preview((4.5, -6, 3.6), (0.2, 0, 0.85), 4.8, 0.6)
