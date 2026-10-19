"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-worker beside this repository; use -- --output-dir PATH to override.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import HALF_PI, Model  # noqa: E402

m = Model('meridian-worker', 'Meridian Worker Study', 'MeridianWorker')

# Four wheels: slightly larger at the rear. Axles run along X.
for name, x, y, radius, width in (
    ('WheelFrontLeft', -0.82, -0.62, 0.44, 0.38),
    ('WheelFrontRight', 0.82, -0.62, 0.44, 0.38),
    ('WheelRearLeft', -0.82, 0.45, 0.5, 0.42),
    ('WheelRearRight', 0.82, 0.45, 0.5, 0.42),
):
    m.wheel(name, (x, y, radius), radius, width)

# Chassis, lower body and engine hood.
m.box('Chassis', (0, 0.05, 0.5), (1.1, 2.0, 0.32), 'Equipment', bevel=0.06)
m.box('LowerBody', (0, 0.1, 0.78), (1.25, 2.0, 0.28), 'BaseArmor', bevel=0.08)
m.solid('EngineHood', (0, 0, 0),
        m.extrude([(-1.28, 0.9), (-0.28, 0.9), (-0.28, 1.4), (-1.0, 1.4), (-1.28, 1.18)], 0.4),
        'BaseArmor', bevel=0.07)
m.box('Grille', (0, -1.3, 0.97), (0.5, 0.05, 0.17), 'Equipment', bevel=0.012)
for x in (-0.27, 0.27):
    m.box('WorkLightHood', (x, -1.3, 1.12), (0.16, 0.06, 0.1), 'Lamp', bevel=0.015)
m.box('HoodStripe', (0, -0.62, 1.412), (0.3, 0.42, 0.025), 'TeamColor', bevel=0.006)
for x in (-0.82, 0.82):
    m.box('RearFender', (x, 0.45, 1.07), (0.5, 1.0, 0.1), 'BaseArmorLight', bevel=0.04)
    m.box('FenderLip', (x * 1.32, 0.45, 0.98), (0.05, 0.9, 0.2), 'BaseArmorLight', bevel=0.02)
    m.box('FenderMarking', (x * 1.37, 0.72, 1.0), (0.02, 0.25, 0.05), 'TeamColor', bevel=0.004)

# Semi-enclosed rear cab: glazed on four sides, roof slab, roof lights.
m.box('Cab', (0, 0.3, 1.395), (1.1, 1.1, 0.95), 'BaseArmor', bevel=0.09)
m.box('CabRoof', (0, 0.3, 1.9), (1.2, 1.2, 0.09), 'BaseArmorLight', bevel=0.035)
m.box('RoofStripe', (0, 0.3, 1.956), (0.5, 0.4, 0.022), 'TeamColor', bevel=0.005)
m.box('Windshield', (0, -0.26, 1.42), (0.85, 0.04, 0.55), 'Optics', bevel=0.01)
m.box('RearWindow', (0, 0.86, 1.42), (0.8, 0.04, 0.45), 'Optics', bevel=0.01)
for x in (-0.56, 0.56):
    m.box('SideWindow', (x, 0.3, 1.42), (0.04, 0.72, 0.5), 'Optics', bevel=0.01)
for x in (-0.45, 0.45):
    m.box('WorkLightRoof', (x, -0.27, 1.87), (0.14, 0.07, 0.1), 'Lamp', bevel=0.015)
m.box('CabRearPlate', (0, 0.865, 1.65), (0.5, 0.03, 0.1), 'TeamColor', bevel=0.005)

# Exhaust stack beside the cab, rear bumper and tail lamps.
m.cylinder('ExhaustPipe', (0.62, -0.18, 1.45), 0.045, 0.7, 'Equipment', vertices=10)
m.cylinder('ExhaustCap', (0.62, -0.25, 1.82), 0.05, 0.16, 'Equipment', rotation=(HALF_PI, 0, 0),
           vertices=10)
m.box('RearBumper', (0, 1.2, 0.62), (1.0, 0.2, 0.3), 'Equipment', bevel=0.05)
for x in (-0.4, 0.4):
    m.box('TailLamp', (x, 1.115, 0.82), (0.1, 0.03, 0.08), 'TailLamp', bevel=0.008)
m.join_children(m.root, 'WorkerBodyMesh')

# Loader assembly: two short arms and a broad shallow scoop, pivoting at the cab-side hinge.
HINGE = (0, -0.4, 1.1)
loader = m.pivot('LoaderPivot', HINGE, m.root)


def rel(x, y, z):
    return (x - HINGE[0], y - HINGE[1], z - HINGE[2])


for side in (-1, 1):
    x = side * 0.55
    m.bar('LoaderArm', rel(x, -0.4, 1.1), rel(x, -1.55, 0.5), 0.12, 0.14, 'BaseArmor', loader)
    m.cylinder('ArmHingeRear', rel(x, -0.4, 1.1), 0.08, 0.16, 'Equipment', loader,
               (0, HALF_PI, 0), vertices=12)
    m.cylinder('ArmHingeFront', rel(x, -1.55, 0.5), 0.08, 0.16, 'Equipment', loader,
               (0, HALF_PI, 0), vertices=12)
    m.box('ScoopBracket', rel(x, -1.6, 0.52), (0.14, 0.16, 0.2), 'Equipment', loader, bevel=0.025)
    m.solid('ScoopSide', (side * 0.8, 0, 0),
            m.extrude([rel(0, *p)[1:] for p in ((-2.25, 0.06), (-1.58, 0.06), (-1.58, 0.72))], 0.03),
            'BaseArmor', loader, bevel=0.012)
m.box('ScoopFloor', rel(0, -1.93, 0.09), (1.6, 0.65, 0.06), 'BaseArmor', loader, bevel=0.02)
m.box('ScoopBack', rel(0, -1.62, 0.4), (1.6, 0.07, 0.62), 'BaseArmor', loader, bevel=0.025)
m.box('ScoopLip', rel(0, -2.26, 0.065), (1.6, 0.07, 0.05), 'ExposedSteel', loader, bevel=0.012)
m.join_children(loader, 'LoaderMesh')

m.export_and_preview((6, -8, 6), (0, -0.4, 0.8), 5.6)
