"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian Unmanned Systems Center: a hall with a glazed control tower, a tilted radar panel and two
drone pads. Outputs go to assets/models/meridian-unmanned-systems-center beside this repository.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-unmanned-systems-center', 'Meridian Unmanned Systems Center Study',
             'MeridianUnmannedSystemsCenter')
top = plinth(m, 2.8)

# Hall and roof.
block(m, 'Hall', 0, 0.3, top, 2.2, 1.7, 0.75)
corner_posts(m, 0, 0.3, top, 2.2, 1.7, 0.75)
block(m, 'RoofRim', 0, 0.3, top + 0.75, 2.4, 1.9, 0.08, BODY, 0.03)
block(m, 'RoofDeck', 0, 0.3, top + 0.83, 2.1, 1.6, 0.05, BODY, 0.02)

# Control tower: octagonal blue base, glazed cyan band, steel crown and three masts.
m.cylinder('TowerBase', (-0.2, 0.55, top + 1.05), 0.52, 0.5, BODY, vertices=8)
m.cylinder('TowerGlass', (-0.2, 0.55, top + 1.42), 0.5, 0.26, GLOW, vertices=8)
m.cylinder('TowerRing', (-0.2, 0.55, top + 1.29), 0.55, 0.06, STEEL, vertices=8)
m.cylinder('TowerCrown', (-0.2, 0.55, top + 1.62), 0.55, 0.12, STEEL, vertices=8)
m.cylinder('TowerRoof', (-0.2, 0.55, top + 1.72), 0.36, 0.1, BODY, vertices=8)
for dx, h in ((-0.12, 0.8), (0.0, 0.95), (0.12, 0.7)):
    m.cylinder('TowerMast', (-0.2 + dx, 0.6, top + 1.77 + h / 2), 0.02, h, STEEL, vertices=6)
m.cylinder('MastLamp', (-0.2, 0.6, top + 2.8), 0.035, 0.08, GLOW, vertices=8)
for a in range(0, 360, 90):
    r = math.radians(a)
    m.box('TowerBrace', (-0.2 + 0.5 * math.cos(r), 0.55 + 0.5 * math.sin(r), top + 1.08), (0.1, 0.1, 0.45),
          STEEL, bevel=0.02, rotation=(0, 0, r))

# Radar panel on a mast at the right, tilted towards the sky.
m.cylinder('RadarMast', (0.9, 0.5, top + 1.1), 0.07, 0.6, STEEL, vertices=8)
m.box('RadarYoke', (0.9, 0.5, top + 1.42), (0.3, 0.12, 0.12), DARK, bevel=0.03)
m.box('RadarPanel', (0.9, 0.5, top + 1.75), (0.85, 0.12, 0.6), BODY, bevel=0.04, rotation=(-0.45, 0, 0.0))
m.box('RadarFace', (0.9, 0.42, top + 1.72), (0.7, 0.03, 0.48), GLOW, bevel=0.01, rotation=(-0.45, 0, 0.0))

# Front door with lit frame and ramp.
block(m, 'Porch', 0, -0.62, top, 0.95, 0.4, 0.55, STEEL)
door(m, 0, -0.84, top, 0.5, 0.42, GLOW)
ramp(m, 0, -0.9, 0.7, 0.45, top)
window_wall(m, 0, -0.56, top + 0.62, 3, 0.4, 'front')
side_vent(m, 1.12, -0.1, top + 0.4, 0.5, 0.4, 5, 1)
window_wall(m, -1.12, 0.4, top + 0.45, 3, 0.4, 'left')

# Two drone pads on the front corners: octagonal landing disc, lit rim and a small quadcopter.
for x in (-0.95, 0.95):
    m.cylinder('PadBase', (x, -0.75, top + 0.04), 0.5, 0.08, STEEL, vertices=8)
    m.cylinder('PadDisc', (x, -0.75, top + 0.09), 0.42, 0.03, DARK, vertices=8)
    m.cylinder('PadRing', (x, -0.75, top + 0.115), 0.36, 0.015, GLOW, vertices=8)
    m.box('Drone', (x, -0.75, top + 0.2), (0.18, 0.18, 0.06), BODY, bevel=0.02)
    for dx in (-0.14, 0.14):
        for dy in (-0.14, 0.14):
            m.cylinder('DroneRotor', (x + dx, -0.75 + dy, top + 0.25), 0.07, 0.015, GLOW, vertices=10)
    m.bar('DroneArm', (x - 0.14, -0.89, top + 0.2), (x + 0.14, -0.61, top + 0.2), 0.03, 0.03, DARK)
    m.bar('DroneArm', (x - 0.14, -0.61, top + 0.2), (x + 0.14, -0.89, top + 0.2), 0.03, 0.03, DARK)
greebles(m, 31, (-0.9, 0.5, -0.1, 0.9), 4, top + 0.83)
antenna(m, -0.95, 0.9, top + 0.88, 0.7)
finish(m, 'UnmannedSystemsCenterBodyMesh')
