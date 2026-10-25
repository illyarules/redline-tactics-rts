"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian Resource Depot: an open hopper heaped with ore over a delivery bay, a slanted conveyor and
two storage tanks. Outputs go to assets/models/meridian-resource-depot beside this repository.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-resource-depot', 'Meridian Resource Depot Study', 'MeridianResourceDepot')
top = plinth(m, 2.8)

# Delivery bay: a low dark tunnel with a lit frame, hazard-striped ramp and side walls.
block(m, 'BayBase', 0, -0.2, top, 1.6, 1.6, 0.55, BODY)
for x in (-0.82, 0.82):
    block(m, 'BayWall', x, -0.3, top, 0.28, 1.5, 0.75, STEEL, 0.05)
door(m, 0, -0.98, top, 1.0, 0.5, AMBER)
ramp(m, 0, -1.0, 1.0, 0.45, top)
hazard(m, 0, -1.05, top + 0.02, 1.0, 0.14, 6)
light_strip(m, 0, -1.03, top + 0.62, 1.1, 0.04, 0.04)

# Hopper: a wide blue bowl tapering to the bay, rimmed in steel, full of ore.
m.solid('Hopper', (0, 0.45, top + 0.95),
        m.loft([(-0.55, -0.4, 0.5), (0.55, -0.4, 0.5), (0.75, 0.4, 0.95), (-0.75, 0.4, 0.95)]), BODY, bevel=0.05)
block(m, 'HopperRimFront', 0, -0.35, top + 1.3, 1.9, 0.12, 0.1, STEEL, 0.03)
block(m, 'HopperRimBack', 0, 1.25, top + 1.3, 1.9, 0.12, 0.1, STEEL, 0.03)
for x in (-0.98, 0.98):
    block(m, 'HopperRimSide', x, 0.45, top + 1.3, 0.12, 1.75, 0.1, STEEL, 0.03)
block(m, 'HopperMask', 0, -0.32, top + 1.0, 0.9, 0.08, 0.3, DARK, 0.02)
light_strip(m, -0.25, -0.38, top + 1.05, 0.2, 0.03, 0.04)
light_strip(m, 0.25, -0.38, top + 1.05, 0.2, 0.03, 0.04)
block(m, 'OreBed', 0, 0.45, top + 1.2, 1.7, 1.55, 0.12, VOID, 0.02)
for i, (x, y, s) in enumerate([(-0.5, 0.1, 0.34), (0.1, 0.5, 0.4), (0.5, 0.15, 0.3), (-0.3, 0.8, 0.32),
                              (0.4, 0.95, 0.28), (-0.7, 0.5, 0.26), (0.0, 0.1, 0.24)]):
    m.box('Ore', (x, y, top + 1.35), (s, s * 0.9, s * 0.8), STEEL, bevel=0.03, rotation=(0.2 * i, 0.3, 0.5 * i))
for x, y in ((-0.2, 0.3), (0.25, 0.75), (0.55, 0.4)):
    m.box('Crystal', (x, y, top + 1.5), (0.09, 0.09, 0.17), GLOW, bevel=0.01, rotation=(0.3, 0.2, 0.6))

# Conveyor climbing the right side of the hopper, with a motor housing.
m.bar('Conveyor', (1.05, 1.0, top + 0.3), (1.05, 0.0, top + 1.25), 0.22, 0.12, DARK)
m.bar('ConveyorRail', (1.2, 1.0, top + 0.3), (1.2, 0.0, top + 1.25), 0.05, 0.14, STEEL)
block(m, 'Motor', 1.05, 1.1, top, 0.4, 0.4, 0.45, STEEL, 0.05)
light_strip(m, 1.05, 0.9, top + 0.25, 0.14, 0.03, 0.04, AMBER)

# Storage tanks and pipes at the right-front.
barrel(m, 1.0, -0.5, top, 0.28, 0.75)
barrel(m, 0.55, -0.85, top, 0.24, 0.6)
pipe(m, (1.0, -0.5, top + 0.75), (1.05, 0.2, top + 0.75), 0.05)
for y in (-0.2, 0.2):
    side_vent(m, -1.3, y, top + 0.3, 0.3, 0.3, 3, -1)
window_wall(m, -1.3, 0.8, top + 0.5, 2, 0.3, 'left')
greebles(m, 21, (-1.1, -0.9, -1.0, 0.8), 3, top)
finish(m, 'ResourceDepotBodyMesh')
