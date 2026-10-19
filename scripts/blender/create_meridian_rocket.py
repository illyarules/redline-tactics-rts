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

# Six wheels, three per side.
for side, label in ((-1, 'Left'), (1, 'Right')):
    for y, axle in ((-1.45, 'Front'), (0.05, 'Middle'), (1.55, 'Rear')):
        m.wheel(f'Wheel{axle}{label}', (side * 0.95, y, 0.48), 0.48, 0.4)
        m.box('WheelArch', (side * 0.95, y, 1.04), (0.5, 0.95, 0.1), 'BaseArmorLight', bevel=0.04)
        m.box('WheelArchLip', (side * 1.22, y, 0.96), (0.05, 0.9, 0.2), 'BaseArmorLight', bevel=0.02)
for y in (-1.45, 0.05, 1.55):
    m.box('Axle', (0, y, 0.48), (1.7, 0.12, 0.12), 'Equipment', bevel=0.02)

# Chassis, main body and equipment deck.
m.box('Chassis', (0, -0.05, 0.62), (1.3, 4.3, 0.25), 'Equipment', bevel=0.05)
m.box('Body', (0, 0.675, 0.95), (1.5, 2.95, 0.42), 'BaseArmor', bevel=0.09)
m.box('DeckPlate', (0, 0.9, 1.19), (1.4, 2.5, 0.06), 'BaseArmorLight', bevel=0.02)
m.box('VentBed', (0, -0.45, 1.22), (0.5, 0.4, 0.04), 'Equipment', bevel=0.01)
for i in range(4):
    m.box('VentFin', (0, -0.58 + i * 0.09, 1.255), (0.44, 0.035, 0.03), 'ExposedSteel', bevel=0.006)
for side in (-1, 1):
    for y in (-0.65, 0.85):
        m.box('SidePod', (side * 0.8, y, 0.95), (0.1, 0.5, 0.28), 'Equipment', bevel=0.03)
m.box('RearBumper', (0, 2.2, 0.8), (1.5, 0.15, 0.25), 'Equipment', bevel=0.04)
for x in (-0.5, 0.5):
    m.box('TailLamp', (x, 2.285, 0.9), (0.12, 0.03, 0.08), 'TailLamp', bevel=0.008)

# Armored cab: low block, sloped upper cabin, dark visor slit, bumper and side armor.
m.box('CabBase', (0, -1.5, 1.02), (1.5, 1.5, 0.56), 'BaseArmor', bevel=0.1)
m.solid('CabUpper', (0, 0, 0),
        m.extrude([(-2.0, 1.3), (-0.75, 1.3), (-0.75, 2.0), (-1.45, 2.0), (-2.0, 1.5)], 0.67),
        'BaseArmor', bevel=0.08)
slope = math.atan2(2.0 - 1.5, 2.0 - 1.45)
normal_y, normal_z = -math.sin(slope), math.cos(slope)
m.box('Visor', (0, -1.725 + normal_y * 0.014, 1.75 + normal_z * 0.014), (1.0, 0.03, 0.14),
      'Optics', bevel=0.01, rotation=(slope - HALF_PI, 0, 0))
for x in (-0.685, 0.685):
    m.box('CabSideWindow', (x, -1.15, 1.75), (0.03, 0.6, 0.2), 'Optics', bevel=0.008)
    for y in (-1.6, -1.0):
        m.box('SideArmor', (x * 1.2, y, 1.4), (0.12, 0.4, 0.25), 'Equipment', bevel=0.03)
m.box('CabRoofPlate', (0, -1.1, 2.012), (0.4, 0.5, 0.025), 'TeamColor', bevel=0.005)
m.box('FrontBumper', (0, -2.36, 0.88), (1.5, 0.2, 0.28), 'Equipment', bevel=0.05)
for x in (-0.55, 0.55):
    m.box('BumperMarking', (x, -2.47, 0.9), (0.1, 0.03, 0.18), 'TeamColor', bevel=0.006)
m.box('CabSideMarking', (0.76, -1.4, 1.15), (0.02, 0.3, 0.05), 'TeamColor', bevel=0.004)

# Launcher trunnion brackets rise from the deck; the cradle pivots between them.
HINGE = (0, 1.45, 1.65)
for side in (-1, 1):
    m.box('TrunnionBracket', (side * 0.72, 1.5, 1.5), (0.12, 0.55, 0.65), 'Equipment', bevel=0.04)
    m.cylinder('TrunnionHub', (side * 0.8, 1.45, 1.65), 0.12, 0.08, 'ExposedSteel',
               rotation=(0, HALF_PI, 0))
    m.cylinder('TrunnionMarking', (side * 0.85, 1.45, 1.65), 0.06, 0.04, 'TeamColor',
               rotation=(0, HALF_PI, 0), vertices=12)
m.box('CradleBase', (0, 1.2, 1.26), (1.3, 1.1, 0.1), 'Equipment', bevel=0.03)
m.join_children(m.root, 'RocketBodyMesh')

# Launcher: three parallel tubes raised ~20 degrees toward the front, no missiles showing.
launcher = m.pivot('LauncherElevationPivot', HINGE, m.root)
launcher.rotation_euler = (-math.radians(20), 0, 0)
LENGTH, TUBE_R = 2.2, 0.19
for x in (-0.42, 0, 0.42):
    y_mid = -LENGTH / 2 + 0.1
    m.cylinder('Tube', (x, y_mid, 0), TUBE_R, LENGTH, 'BaseArmor', launcher,
               (HALF_PI, 0, 0), bevel=0.01)
    m.cylinder('TubeMouth', (x, y_mid - LENGTH / 2 + 0.06, 0), TUBE_R + 0.02, 0.12, 'ExposedSteel',
               launcher, (HALF_PI, 0, 0), bevel=0.01)
    m.cylinder('TubeBore', (x, y_mid - LENGTH / 2 - 0.005, 0), TUBE_R - 0.03, 0.03, 'Equipment',
               launcher, (HALF_PI, 0, 0), bevel=0.003)
    m.cylinder('TubeCollar', (x, y_mid - LENGTH / 2 + 0.28, 0), TUBE_R + 0.012, 0.1, 'TeamColor',
               launcher, (HALF_PI, 0, 0), bevel=0.005)
    m.cylinder('TubeRearCap', (x, y_mid + LENGTH / 2 - 0.03, 0), TUBE_R + 0.01, 0.1, 'Equipment',
               launcher, (HALF_PI, 0, 0), bevel=0.01)
for y in (-0.6, -1.4):
    m.box('TubeStrapTop', (0, y, 0.215), (1.3, 0.12, 0.04), 'Equipment', launcher, bevel=0.01)
    m.box('TubeStrapBottom', (0, y, -0.215), (1.3, 0.12, 0.04), 'Equipment', launcher, bevel=0.01)
m.box('LauncherCradle', (0, -0.9, -0.27), (1.3, 1.7, 0.07), 'Equipment', launcher, bevel=0.02)
m.join_children(launcher, 'LauncherMesh')

m.export_and_preview((7, -9, 7), (0, 0, 1.0), 7.0)
