"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-rocket beside this repository; use -- --output-dir PATH to override.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import HALF_PI, Model  # noqa: E402

m = Model('meridian-rocket', 'Meridian Rocket Study', 'MeridianRocket')

# Six wheels on three axles, like a wheeled rocket artillery truck.
AXLES = ((-1.1, 'Front'), (0.0, 'Middle'), (1.05, 'Rear'))
for side, label in ((-1, 'Left'), (1, 'Right')):
    for y, axle in AXLES:
        m.wheel(f'Wheel{axle}{label}', (side * 0.82, y, 0.4), 0.4, 0.34)
for y, _ in AXLES:
    m.box('Axle', (0, y, 0.4), (1.5, 0.1, 0.1), 'Equipment', bevel=0.02)

# Long low chassis with fenders over the wheels.
m.box('Chassis', (0, -0.05, 0.58), (1.2, 3.6, 0.2), 'Equipment', bevel=0.05)
for side in (-1, 1):
    for y, _ in AXLES:
        m.box('Fender', (side * 0.82, y, 0.82), (0.46, 0.95, 0.07), 'BaseArmorLight', bevel=0.03)

# Cab ahead of the launcher: low block, sloped windshield, side windows and a team plate.
m.box('CabBase', (0, -1.2, 0.98), (1.4, 1.1, 0.56), 'BaseArmor', bevel=0.09)
m.solid('CabUpper', (0, 0, 0),
        m.extrude([(-1.75, 1.26), (-0.65, 1.26), (-0.65, 1.85), (-1.2, 1.85), (-1.75, 1.4)], 0.62),
        'BaseArmor', bevel=0.07)
slope = math.atan2(1.85 - 1.4, 1.75 - 1.2)
normal_y, normal_z = -math.sin(slope), math.cos(slope)
m.box('Visor', (0, -1.475 + normal_y * 0.014, 1.625 + normal_z * 0.014), (1.0, 0.03, 0.14),
      'Optics', bevel=0.01, rotation=(slope - HALF_PI, 0, 0))
for x in (-0.635, 0.635):
    m.box('CabSideWindow', (x, -1.0, 1.55), (0.03, 0.5, 0.2), 'Optics', bevel=0.008)
m.box('CabRoofPlate', (0, -0.9, 1.865), (0.4, 0.4, 0.025), 'TeamColor', bevel=0.005)
m.box('FrontBumper', (0, -1.8, 0.74), (1.4, 0.16, 0.26), 'Equipment', bevel=0.05)
for x in (-0.5, 0.5):
    m.box('BumperMarking', (x, -1.89, 0.76), (0.09, 0.03, 0.16), 'TeamColor', bevel=0.006)

# Equipment box behind the cab and the rear deck the launcher sits on.
m.box('EquipmentBox', (0, -0.25, 1.0), (1.3, 0.5, 0.5), 'BaseArmor', bevel=0.07)
m.box('RearDeck', (0, 0.75, 0.8), (1.35, 1.9, 0.16), 'BaseArmor', bevel=0.05)
m.box('RearBumper', (0, 1.74, 0.7), (1.35, 0.12, 0.2), 'Equipment', bevel=0.04)
for x in (-0.5, 0.5):
    m.box('TailLamp', (x, 1.81, 0.76), (0.1, 0.03, 0.07), 'TailLamp', bevel=0.008)
# Stabilizer jacks folded beside the rear deck.
for side in (-1, 1):
    m.box('JackArm', (side * 0.82, 1.55, 0.62), (0.12, 0.5, 0.1), 'Equipment', bevel=0.02)
    m.box('JackPad', (side * 0.82, 1.75, 0.5), (0.3, 0.2, 0.06), 'ExposedSteel', bevel=0.02)

# Launcher trunnion brackets at the rear; the pod pivots between them.
HINGE = (0, 1.45, 1.2)
for side in (-1, 1):
    m.box('TrunnionBracket', (side * 0.62, 1.4, 1.05), (0.1, 0.5, 0.5), 'Equipment', bevel=0.04)
m.box('CradleBase', (0, 0.85, 0.92), (1.1, 1.3, 0.08), 'Equipment', bevel=0.03)
m.join_children(m.root, 'RocketBodyMesh')

# Launcher pod: a boxy canister raised ~25 degrees toward the front, three tubes in its face.
launcher = m.pivot('LauncherElevationPivot', HINGE, m.root)
launcher.rotation_euler = (-math.radians(25), 0, 0)
POD_LENGTH = 1.8
m.box('PodBody', (0, -POD_LENGTH / 2 + 0.1, 0.05), (1.1, POD_LENGTH, 0.5), 'BaseArmor', launcher, bevel=0.06)
m.box('PodTopRail', (0, -POD_LENGTH / 2 + 0.1, 0.31), (0.9, POD_LENGTH - 0.2, 0.04), 'Equipment', launcher, bevel=0.01)
m.box('PodStripe', (0, -0.5, 0.325), (0.5, 0.35, 0.015), 'TeamColor', launcher, bevel=0.004)
front = -POD_LENGTH + 0.1
for x in (-0.33, 0, 0.33):
    m.cylinder('TubeMouth', (x, front - 0.01, 0.05), 0.14, 0.06, 'ExposedSteel',
               launcher, (HALF_PI, 0, 0), bevel=0.01)
    m.cylinder('TubeBore', (x, front - 0.045, 0.05), 0.105, 0.03, 'Equipment',
               launcher, (HALF_PI, 0, 0), bevel=0.003)
m.box('PodRearCap', (0, 0.12, 0.05), (1.0, 0.06, 0.4), 'Equipment', launcher, bevel=0.02)
m.join_children(launcher, 'LauncherMesh')

m.export_and_preview((7, -9, 7), (0, 0, 0.9), 7.0)
