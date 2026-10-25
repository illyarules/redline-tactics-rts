"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-combat-buggy beside this repository; use -- --output-dir PATH to override.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import HALF_PI, Model  # noqa: E402

m = Model('meridian-combat-buggy', 'Meridian Combat Buggy Study', 'MeridianCombatBuggy')

# Four wide wheels on a broad track; axles run along X.
WHEEL_X, WHEEL_R, WHEEL_W = 0.98, 0.46, 0.42
AXLE_Y = {'Front': -1.3, 'Rear': 1.3}
for axle, y in AXLE_Y.items():
    for side, label in ((-1, 'Left'), (1, 'Right')):
        m.wheel(f'Wheel{axle}{label}', (side * WHEEL_X, y, WHEEL_R), WHEEL_R, WHEEL_W)
    m.box('Axle', (0, y, WHEEL_R), (1.8, 0.12, 0.12), 'Equipment', bevel=0.02)

# Chassis and the slab-sided lower body of a light utility truck.
m.box('Chassis', (0, 0, 0.58), (1.5, 4.0, 0.22), 'Equipment', bevel=0.04)
m.box('LowerBody', (0, 0, 0.84), (1.9, 3.9, 0.46), 'BaseArmor', bevel=0.07)
for side in (-1, 1):
    # Squared-off fender flares over the wheels.
    for axle, y in AXLE_Y.items():
        m.box(f'{axle}Flare', (side * WHEEL_X, y, 1.0), (0.58, 1.2, 0.09), 'BaseArmorLight', bevel=0.03)
    m.box('SideSill', (side * 0.97, 0, 0.62), (0.08, 1.6, 0.1), 'Equipment', bevel=0.02)
    m.box('DoorStripe', (side * 0.96, 0.1, 1.04), (0.02, 0.9, 0.06), 'TeamColor', bevel=0.004)

# Flat hood, grille and bull-bar bumper.
m.box('Hood', (0, -1.3, 1.16), (1.8, 1.3, 0.24), 'BaseArmor', bevel=0.07)
m.box('HoodStripe', (0, -1.25, 1.292), (0.4, 0.9, 0.012), 'TeamColor', bevel=0.004)
m.box('Grille', (0, -1.97, 1.0), (1.2, 0.05, 0.34), 'Equipment', bevel=0.012)
for i in range(4):
    m.box('GrilleSlat', (-0.45 + i * 0.3, -2.0, 1.0), (0.1, 0.02, 0.26), 'ExposedSteel', bevel=0.004)
for x in (-0.78, 0.78):
    m.box('Headlight', (x, -1.97, 1.04), (0.2, 0.05, 0.16), 'Lamp', bevel=0.015)
m.box('FrontBumper', (0, -2.04, 0.68), (1.95, 0.14, 0.2), 'Equipment', bevel=0.04)
for x in (-0.55, 0.55):
    m.bar('BullBar', (x, -2.1, 0.62), (x, -2.1, 1.02), 0.06, 0.06, 'ExposedSteel', bevel=0.012)
m.bar('BullBarTop', (-0.55, -2.1, 1.02), (0.55, -2.1, 1.02), 0.06, 0.06, 'ExposedSteel', bevel=0.012)
m.box('TowHook', (0, -2.13, 0.6), (0.12, 0.06, 0.08), 'ExposedSteel', bevel=0.012)

# Boxy cabin with a raked windshield, four side windows and a rear window.
m.box('Cabin', (0, 0.35, 1.5), (1.85, 2.3, 0.62), 'BaseArmor', bevel=0.07)
m.box('Roof', (0, 0.35, 1.835), (1.7, 2.15, 0.06), 'BaseArmorLight', bevel=0.02)
m.box('RoofPlate', (0, 0.65, 1.875), (0.8, 0.9, 0.02), 'TeamColor', bevel=0.004)
slope = math.radians(28)
m.box('Windshield', (0, -0.82, 1.5), (1.55, 0.04, 0.4), 'Optics', bevel=0.008, rotation=(slope, 0, 0))
for side in (-1, 1):
    for y in (-0.1, 0.8):
        m.box('SideWindow', (side * 0.93, y, 1.5), (0.03, 0.75, 0.34), 'Optics', bevel=0.008)
    m.box('DoorSeam', (side * 0.93, 0.35, 1.3), (0.03, 0.025, 0.55), 'Equipment', bevel=0.004)
    m.box('Mirror', (side * 1.02, -0.8, 1.45), (0.06, 0.1, 0.16), 'Equipment', bevel=0.015)
    m.bar('MirrorArm', (side * 0.94, -0.78, 1.42), (side * 1.0, -0.8, 1.45), 0.03, 0.03, 'Equipment', bevel=0.005)
m.box('RearWindow', (0, 1.51, 1.5), (1.4, 0.03, 0.3), 'Optics', bevel=0.008)

# Rear: tailgate, bumper, lamps, a spare wheel and an antenna.
m.box('Tailgate', (0, 1.99, 0.98), (1.85, 0.08, 0.6), 'BaseArmor', bevel=0.04)
m.box('RearBumper', (0, 2.06, 0.64), (1.95, 0.14, 0.2), 'Equipment', bevel=0.04)
for x in (-0.78, 0.78):
    m.box('TailLamp', (x, 2.05, 1.05), (0.14, 0.03, 0.18), 'TailLamp', bevel=0.008)
m.cylinder('SpareWheel', (0, 2.2, 1.0), 0.36, 0.22, 'Equipment', rotation=(HALF_PI, 0, 0), vertices=16)
m.cylinder('SpareHub', (0, 2.32, 1.0), 0.14, 0.04, 'ExposedSteel', rotation=(HALF_PI, 0, 0), vertices=12)
m.cylinder('Snorkel', (0.97, -0.7, 1.45), 0.045, 0.7, 'Equipment', vertices=8)
m.cylinder('AntennaBase', (-0.7, 1.35, 1.9), 0.05, 0.1, 'Equipment', vertices=10)
m.cylinder('Antenna', (-0.7, 1.35, 2.35), 0.012, 0.9, 'Equipment', vertices=6)
m.join_children(m.root, 'BuggyBodyMesh')

# Roof-mounted machine gun: a ring mount on the roof, a yawing pedestal with a gun shield, and a
# separate barrel pivot so the recoil slides the weapon back.
turret = m.pivot('TurretPivot', (0, 0.15, 1.9), m.root)
m.cylinder('MountRing', (0, 0, 0.04), 0.4, 0.08, 'ExposedSteel', turret, vertices=16, bevel=0.01)
m.cylinder('Pedestal', (0, 0, 0.22), 0.07, 0.3, 'Equipment', turret, vertices=10)
m.box('GunShield', (0, -0.3, 0.46), (0.74, 0.05, 0.42), 'BaseArmor', turret, bevel=0.02)
m.box('ShieldSlot', (0, -0.33, 0.52), (0.2, 0.02, 0.08), 'Optics', turret, bevel=0.004)
for side in (-1, 1):
    m.box('ShieldWing', (side * 0.34, -0.15, 0.46), (0.05, 0.34, 0.36), 'BaseArmor', turret, bevel=0.015)
m.box('AmmoBox', (0.28, 0.1, 0.34), (0.16, 0.26, 0.18), 'Equipment', turret, bevel=0.02)
m.box('AmmoBoxStripe', (0.28, 0.1, 0.44), (0.12, 0.2, 0.012), 'TeamColor', turret, bevel=0.003)
m.join_children(turret, 'TurretMesh')

barrel = m.pivot('BarrelPivot', (0, -0.22, 0.44), turret)
m.box('Receiver', (0, 0.1, 0), (0.12, 0.42, 0.14), 'Equipment', barrel, bevel=0.02)
m.cylinder('BarrelJacket', (0, -0.28, 0), 0.05, 0.5, 'ExposedSteel', barrel, (HALF_PI, 0, 0),
           bevel=0.008, vertices=10)
m.cylinder('Barrel', (0, -0.66, 0), 0.028, 0.35, 'ExposedSteel', barrel, (HALF_PI, 0, 0),
           bevel=0.004, vertices=8)
m.cylinder('MuzzleBrake', (0, -0.86, 0), 0.04, 0.08, 'Equipment', barrel, (HALF_PI, 0, 0),
           bevel=0.008, vertices=8)
m.box('Handle', (0, 0.28, 0.1), (0.04, 0.2, 0.05), 'Equipment', barrel, bevel=0.008)
m.join_children(barrel, 'BarrelMesh')

m.export_and_preview((7, -9, 6), (0, 0, 1.0), 6.4)
