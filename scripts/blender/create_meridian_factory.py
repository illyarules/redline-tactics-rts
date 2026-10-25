"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian Factory: a wide hall with a vehicle door and apron, roof hatches, a fan bank, two stacks
and side pipework. Outputs go to assets/models/meridian-factory beside this repository.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-factory', 'Meridian Factory Study', 'MeridianFactory')
top = plinth(m, 3.8)

# Hall.
block(m, 'Hall', 0, 0.35, top, 3.2, 2.5, 0.95)
corner_posts(m, 0, 0.35, top, 3.2, 2.5, 0.95, 0.24)
block(m, 'RoofRim', 0, 0.35, top + 0.95, 3.4, 2.7, 0.09, BODY, 0.03)
block(m, 'RoofDeck', 0, 0.35, top + 1.04, 3.1, 2.4, 0.05, BODY, 0.02)
vent(m, -0.65, -0.2, top + 1.09, 1.0, 0.7, 5, 'y')
vent(m, 0.65, -0.2, top + 1.09, 1.0, 0.7, 5, 'y')
for x in (-1.5, 1.5):
    block(m, 'RoofBracket', x, -0.7, top + 1.0, 0.22, 0.4, 0.24, STEEL, 0.04)

# Fan bank on the right, slung over the roof edge.
block(m, 'FanPlate', 1.1, 0.75, top + 1.09, 0.95, 0.75, 0.1, STEEL, 0.03)
for dx in (-0.22, 0.22):
    for dy in (-0.17, 0.17):
        m.cylinder('FanWell', (1.1 + dx, 0.75 + dy, top + 1.2), 0.15, 0.06, DARK, vertices=14)
        m.cylinder('FanHub', (1.1 + dx, 0.75 + dy, top + 1.24), 0.05, 0.04, GLOW, vertices=8)

# Two stacks of unequal height, with lit rings and a feed pipe.
stack(m, -1.3, 1.1, top + 1.0, 1.2, 0.2)
stack(m, -0.75, 1.1, top + 1.0, 0.85, 0.16)
pipe(m, (-1.3, 1.1, top + 1.3), (-0.75, 1.1, top + 1.0), 0.05)
pipe(m, (-1.3, 0.75, top + 1.15), (-1.3, 0.2, top + 1.12), 0.05)

# Vehicle door, hazard apron, status lamps.
block(m, 'DoorSurround', 0, -0.95, top, 2.1, 0.3, 0.95, STEEL, 0.05)
door(m, 0, -1.12, top, 1.7, 0.78, AMBER)
for i in range(4):
    light_strip(m, -0.6 + i * 0.4, -1.2, top + 0.4, 0.14, 0.03, 0.34, AMBER)
ramp(m, 0, -1.15, 1.8, 0.45, top)
hazard(m, 0, -1.2, top + 0.02, 1.8, 0.14, 8)
for x in (-1.3, 1.3):
    block(m, 'DoorLampMount', x, -1.2, top + 0.4, 0.14, 0.14, 0.4, DARK, 0.03)
    light_strip(m, x, -1.29, top + 0.65, 0.07, 0.03, 0.07, AMBER)

# Sides: pipework, grilles, windows, ladder.
for y in (-0.3, 0.2, 0.7):
    pipe(m, (1.68, y, top + 0.2), (1.68, y, top + 0.85), 0.05)
pipe(m, (1.68, -0.3, top + 0.85), (1.68, 0.7, top + 0.85), 0.05)
side_vent(m, -1.68, 0.2, top + 0.45, 0.8, 0.5, 6, -1)
window_wall(m, -1.66, -0.5, top + 0.75, 1, 0.5, 'left')
for z in (0.15, 0.35, 0.55, 0.75):
    m.box('LadderRung', (1.72, 1.1, top + z), (0.04, 0.3, 0.03), STEEL, bevel=0.005)
greebles(m, 11, (-1.4, 1.4, -0.8, 1.4), 5, top + 1.09)
greebles(m, 12, (-1.5, 1.5, -1.8, -1.45), 0, top)
finish(m, 'FactoryBodyMesh')
