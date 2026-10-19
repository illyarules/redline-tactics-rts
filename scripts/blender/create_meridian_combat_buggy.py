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

# Four wheels: slightly smaller at the front, large at the rear. Axles run along X.
FRONT = {'y': -1.35, 'radius': 0.47, 'width': 0.4, 'x': 0.95}
REAR = {'y': 1.0, 'radius': 0.55, 'width': 0.46, 'x': 0.92}
for axle, spec in (('Front', FRONT), ('Rear', REAR)):
    for side, label in ((-1, 'Left'), (1, 'Right')):
        m.wheel(f'Wheel{axle}{label}', (side * spec['x'], spec['y'], spec['radius']),
                spec['radius'], spec['width'])
        inner = spec['x'] - spec['width'] / 2
        z, y = spec['radius'], spec['y']
        # Exposed dark suspension: upper and lower arms plus an axle stub to the hub.
        m.bar('UpperArm', (side * 0.45, y, z + 0.3), (side * (inner + 0.02), y, z + 0.08),
              0.09 if axle == 'Rear' else 0.1, 0.07, 'Equipment', bevel=0.015)
        m.bar('LowerArm', (side * 0.42, y, z - 0.1), (side * (inner + 0.02), y, z - 0.08),
              0.12, 0.07, 'Equipment', bevel=0.015)
        m.cylinder('AxleStub', (side * (inner - 0.04), y, z), 0.07, 0.14, 'ExposedSteel',
                   rotation=(0, HALF_PI, 0), vertices=10)

# Low wedge hull: narrow armored nose widening into the cabin and engine bay.
m.box('Belly', (0, -0.1, 0.45), (1.0, 2.8, 0.22), 'Equipment', bevel=0.05)
m.solid('Hull', (0, 0, 0),
        m.loft([(-1.95, 0.52, 0.4), (-1.95, 0.66, 0.4), (-0.55, 1.05, 0.62),
                (1.65, 1.05, 0.62), (1.65, 0.52, 0.62)]),
        'BaseArmor', bevel=0.07)
m.box('FrontBumper', (0, -1.98, 0.48), (0.85, 0.1, 0.14), 'Equipment', bevel=0.03)
for x in (-0.25, 0.25):
    m.box('Headlight', (x, -2.04, 0.58), (0.18, 0.04, 0.1), 'Lamp', bevel=0.012)
nose = math.atan2(1.05 - 0.66, 1.4)
m.box('NoseStripe', (0, -1.25, 0.87), (0.24, 0.4, 0.02), 'TeamColor', bevel=0.005,
      rotation=(nose, 0, 0))
for side in (-1, 1):
    m.box('RearFender', (side * 0.85, 1.0, 1.1), (0.7, 1.2, 0.14), 'BaseArmorLight', bevel=0.04)
    m.box('FrontFender', (side * 0.95, -1.35, 1.04), (0.45, 0.7, 0.08), 'BaseArmorLight', bevel=0.03)
    m.box('HullStripe', (side * 0.625, -0.2, 0.8), (0.025, 0.7, 0.07), 'TeamColor', bevel=0.005)

# Compact armored cabin with a sloped windshield and one small cyan slit.
m.solid('Cabin', (0, 0, 0),
        m.loft([(-0.75, 0.98, 0.46), (0.65, 0.98, 0.58), (0.45, 1.55, 0.5), (-0.25, 1.55, 0.4)]),
        'BaseArmor', bevel=0.05)
slope = math.atan2(1.55 - 0.98, 0.5)
normal_y, normal_z = -math.sin(slope), math.cos(slope)
m.box('Windshield', (0, -0.5 + normal_y * 0.014, 1.265 + normal_z * 0.014), (0.66, 0.03, 0.15),
      'Optics', bevel=0.008, rotation=(slope - HALF_PI, 0, 0))
for side in (-1, 1):
    m.box('CabinWindow', (side * 0.525, 0.15, 1.33), (0.03, 0.55, 0.12), 'Optics', bevel=0.008)
m.box('TurretRing', (0, -0.05, 1.58), (0.52, 0.52, 0.08), 'ExposedSteel', bevel=0.03)

# Raised rear engine block with a visible vent, rear grille and one antenna.
m.box('EngineBlock', (0, 1.1, 1.2), (1.0, 0.95, 0.3), 'BaseArmor', bevel=0.06)
m.box('EngineVent', (0, 1.15, 1.357), (0.7, 0.55, 0.03), 'Equipment', bevel=0.008)
for i in range(5):
    m.box('VentSlat', (0, 0.95 + i * 0.1, 1.38), (0.62, 0.03, 0.03), 'ExposedSteel', bevel=0.006)
m.box('RearGrille', (0, 1.59, 1.2), (0.6, 0.03, 0.18), 'Equipment', bevel=0.008)
m.box('RearBumper', (0, 1.7, 0.5), (0.9, 0.12, 0.2), 'Equipment', bevel=0.03)
for x in (-0.5, 0.5):
    m.box('TailLamp', (x, 1.665, 0.85), (0.1, 0.03, 0.08), 'TailLamp', bevel=0.008)
m.cylinder('AntennaBase', (0.55, 0.62, 1.09), 0.06, 0.1, 'Equipment', vertices=10)
m.cylinder('Antenna', (0.55, 0.62, 1.55), 0.015, 0.82, 'Equipment', vertices=6)
m.join_children(m.root, 'BuggyBodyMesh')

# Remote weapon station: yaw pivot with a small turret and a separate barrel elevation pivot.
turret = m.pivot('TurretPivot', (0, -0.05, 1.62), m.root)
m.box('Turret', (0, 0, 0.14), (0.62, 0.7, 0.26), 'BaseArmor', turret, bevel=0.07)
m.box('TurretTop', (0, 0.02, 0.285), (0.44, 0.48, 0.04), 'BaseArmorLight', turret, bevel=0.012)
m.box('TurretStripe', (0, 0.05, 0.31), (0.18, 0.3, 0.015), 'TeamColor', turret, bevel=0.004)
for side in (-1, 1):
    m.box('TurretMarking', (side * 0.318, 0.1, 0.17), (0.018, 0.28, 0.05), 'TeamColor', turret,
          bevel=0.004)
m.box('SensorHousing', (-0.38, -0.08, 0.2), (0.2, 0.22, 0.18), 'Equipment', turret, bevel=0.03)
m.box('SensorLens', (-0.38, -0.195, 0.2), (0.12, 0.02, 0.09), 'Optics', turret, bevel=0.005)
m.join_children(turret, 'TurretMesh')

barrel = m.pivot('BarrelPivot', (0, -0.35, 0.16), turret)
m.box('Mantlet', (0, -0.03, 0), (0.2, 0.22, 0.2), 'ExposedSteel', barrel, bevel=0.04)
m.cylinder('Barrel', (0, -0.52, 0), 0.035, 0.85, 'ExposedSteel', barrel, (HALF_PI, 0, 0),
           bevel=0.005, vertices=10)
m.box('BarrelShroud', (0, -0.38, 0), (0.1, 0.22, 0.1), 'BaseArmor', barrel, bevel=0.02)
m.cylinder('MuzzleBrake', (0, -0.97, 0), 0.05, 0.1, 'Equipment', barrel, (HALF_PI, 0, 0),
           bevel=0.01, vertices=10)
m.join_children(barrel, 'BarrelMesh')

m.export_and_preview((6, -8, 6), (0, -0.2, 0.7), 5.6)
