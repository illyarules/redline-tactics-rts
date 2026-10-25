"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian Barracks: a low armoured hall with a plated roof, a front entrance bay and a side antenna.
Outputs go to assets/models/meridian-barracks beside this repository.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-barracks', 'Meridian Barracks Study', 'MeridianBarracks')
top = plinth(m, 2.8)

# Hall: blue walls, steel corner posts, dark plated roof with clamps.
block(m, 'Hall', 0, 0.25, top, 2.3, 1.95, 0.8)
corner_posts(m, 0, 0.25, top, 2.3, 1.95, 0.8)
block(m, 'RoofRim', 0, 0.25, top + 0.8, 2.5, 2.15, 0.08, BODY, 0.03)
roof_plates(m, 0, 0.25, top + 0.88, 2.1, 1.8, 3, 2)
block(m, 'RoofRidge', 0, 0.25, top + 0.94, 0.5, 1.9, 0.12, BODY, 0.04)
light_strip(m, 0, -0.76, top + 1.0, 0.7, 0.03, 0.035)
for x in (-0.95, 0.95):
    block(m, 'RoofBracket', x, -0.55, top + 0.88, 0.2, 0.34, 0.2, STEEL, 0.04)
    block(m, 'RoofBracket', x, 1.05, top + 0.88, 0.2, 0.34, 0.2, STEEL, 0.04)

# Front bay: a gabled entrance block, door, lit frame, ramp.
block(m, 'Porch', 0, -0.95, top, 1.15, 0.6, 0.62, BODY)
block(m, 'PorchCap', 0, -0.95, top + 0.62, 1.3, 0.72, 0.09, BODY, 0.04)
door(m, 0, -1.26, top, 0.6, 0.48)
for x in (-0.3, 0.3):
    light_strip(m, x * 2.3, -1.3, top + 0.5, 0.04, 0.03, 0.34)
ramp(m, 0, -1.3, 0.8, 0.45, top)
hazard(m, 0, -1.35, top + 0.02, 0.6, 0.12)

# Side walls: lit windows, comm gear and a vent.
window_wall(m, -1.16, 0.25, top + 0.5, 3, 0.5, 'left')
window_wall(m, 1.16, 0.0, top + 0.5, 2, 0.5, 'right')
side_vent(m, 1.18, 0.75, top + 0.38, 0.5, 0.4)
for y in (-0.25, 0.1):
    pipe(m, (1.22, y, top + 0.15), (1.22, y, top + 0.72), 0.04)
for y in (-0.6, 0.7):
    block(m, 'CommBox', -1.2, y, top + 0.08, 0.12, 0.3, 0.24, DARK, 0.02)
antenna(m, 1.0, 1.0, top + 0.9, 0.9)
greebles(m, 3, (-0.8, 0.8, 0.9, 1.2), 4, top + 0.88)

finish(m, 'BarracksBodyMesh')
