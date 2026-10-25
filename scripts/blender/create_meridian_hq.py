"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian HQ: a main hall with a stepped command tower, a technical wing with a dish, a porch and a
pennant. Outputs go to assets/models/meridian-hq beside this repository.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-hq', 'Meridian HQ Study', 'MeridianHq')
top = plinth(m, 3.8, tiers=3)
top = 0.42

# Main hall and stepped tower.
block(m, 'Hall', -0.5, 0.1, top, 2.4, 2.4, 1.0)
corner_posts(m, -0.5, 0.1, top, 2.4, 2.4, 1.0, 0.24)
block(m, 'RoofRim', -0.5, 0.1, top + 1.0, 2.6, 2.6, 0.1, BODY, 0.03)
roof_plates(m, -0.5, 0.1, top + 1.1, 2.2, 2.2, 3, 3)
light_strip(m, -0.5, -1.12, top + 0.85, 2.0, 0.03, 0.06, AMBER)
block(m, 'Tower', -1.0, 0.5, top + 1.1, 1.05, 1.05, 0.6)
corner_posts(m, -1.0, 0.5, top + 1.1, 1.05, 1.05, 0.6, 0.14)
block(m, 'TowerRim', -1.0, 0.5, top + 1.7, 1.2, 1.2, 0.1, STEEL, 0.03)
block(m, 'TowerDeck', -1.0, 0.5, top + 1.8, 0.95, 0.95, 0.05, BODY, 0.02)
m.box('TowerGlass', (-1.0, -0.04, top + 1.4), (0.7, 0.04, 0.3), GLOW, bevel=0.01)
window_wall(m, -1.54, 0.5, top + 1.4, 2, 0.4, 'left')
antenna(m, -1.35, 0.8, top + 1.82, 0.9)
antenna(m, -0.7, 0.85, top + 1.82, 0.6)

# Porch, door and ramp.
block(m, 'Porch', -0.5, -1.4, top, 1.3, 0.5, 0.55, BODY)
block(m, 'PorchCap', -0.5, -1.4, top + 0.55, 1.45, 0.62, 0.09, BODY, 0.04)
door(m, -0.5, -1.66, top, 0.7, 0.44, GLOW)
ramp(m, -0.5, -1.7, 1.0, 0.45, top)
hazard(m, -0.5, -1.75, top + 0.02, 1.0, 0.12)
window_wall(m, -1.5, -0.8, top + 0.6, 3, 0.4, 'front')
for x in (-1.45, 0.45):
    block(m, 'Brace', x, -1.15, top, 0.18, 0.18, 0.9, STEEL, 0.03)

# Technical wing on the right: dark roof, exhaust cans, dish and mast.
block(m, 'Wing', 1.25, 0.0, top, 1.2, 2.0, 0.65, LIGHT)
block(m, 'WingRoof', 1.25, 0.0, top + 0.65, 1.3, 2.1, 0.1, BODY, 0.03)
for y in (-0.7, 0.0, 0.7):
    m.cylinder('Exhaust', (1.25, y, top + 0.85), 0.12, 0.3, STEEL, vertices=10)
    m.cylinder('ExhaustGlow', (1.25, y, top + 1.01), 0.1, 0.03, GLOW, vertices=10)
side_vent(m, 1.86, 0.2, top + 0.35, 0.8, 0.4, 5, 1)
window_wall(m, 1.86, -0.7, top + 0.4, 2, 0.35, 'right')
m.cylinder('DishMast', (1.5, -0.9, top + 1.2), 0.05, 1.0, STEEL, vertices=8)
m.cylinder('DishCone', (1.5, -1.0, top + 1.8), 0.1, 0.1, DARK, vertices=10)
m.cylinder('Dish', (1.5, -1.1, top + 1.85), 0.34, 0.07, STEEL, vertices=16, rotation=(-1.0, 0, 0))
m.cylinder('DishCore', (1.5, -1.07, top + 1.83), 0.25, 0.03, DARK, vertices=16, rotation=(-1.0, 0, 0))

# Faction pennant on a mast at the back of the roof.
m.cylinder('FlagPole', (0.25, 1.0, top + 1.7), 0.03, 1.2, STEEL, vertices=8)
m.box('Flag', (0.5, 1.0, top + 2.15), (0.5, 0.04, 0.3), TEAM, bevel=0.01)
greebles(m, 41, (-1.4, 0.3, -0.8, -0.2), 3, top + 1.1)
finish(m, 'HqBodyMesh', camera=(6.5, -8, 6.5), target=(0, 0, 1.0), scale=7.5)
