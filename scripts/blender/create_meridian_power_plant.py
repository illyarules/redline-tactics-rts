"""Run with blender --background --python this_file [-- --output-dir PATH].

Meridian Power Plant: a stepped base, a lit reactor drum, two coolant towers joined by elbow pipes
and a front maintenance door. Outputs go to assets/models/meridian-power-plant beside this repository.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_building_common import *  # noqa: E402,F403

m = building('meridian-power-plant', 'Meridian Power Plant Study', 'MeridianPowerPlant')
top = plinth(m, 2.8, tiers=3)
top = 0.18 + 0.12 + 0.12

# Reactor drum: blue shell, vertical lit slits, steel hoops, a glowing collar and a domed cap.
m.cylinder('Drum', (0, 0.1, top + 0.55), 0.78, 1.1, BODY, vertices=12)
for i in range(8):
    a = i * math.tau / 8 + math.pi / 8
    m.box('DrumSlit', (0.79 * math.cos(a), 0.1 + 0.79 * math.sin(a), top + 0.6), (0.06, 0.1, 0.6), GLOW,
          bevel=0.01, rotation=(0, 0, a))
for z in (0.12, 0.98):
    m.cylinder('DrumHoop', (0, 0.1, top + z), 0.84, 0.1, STEEL, vertices=12)
m.cylinder('DrumCollar', (0, 0.1, top + 1.14), 0.8, 0.08, GLOW, vertices=24)
m.cylinder('DrumRoof', (0, 0.1, top + 1.24), 0.7, 0.14, STEEL, vertices=12)
m.cylinder('DrumCore', (0, 0.1, top + 1.36), 0.3, 0.12, DARK, vertices=12)
m.cylinder('DrumCoreRing', (0, 0.1, top + 1.43), 0.32, 0.03, GLOW, vertices=24)

# Coolant towers on both sides, each with a lit tube and a steel cap.
for x in (-1.0, 1.0):
    m.cylinder('Tower', (x, 0.5, top + 0.62), 0.27, 1.24, DARK, vertices=12)
    m.cylinder('TowerBase', (x, 0.5, top + 0.08), 0.35, 0.16, STEEL, vertices=12)
    m.box('TowerTube', (x, 0.5 - 0.27, top + 0.7), (0.1, 0.06, 0.7), GLOW, bevel=0.01)
    m.cylinder('TowerCap', (x, 0.5, top + 1.28), 0.33, 0.1, STEEL, vertices=12)
    m.cylinder('TowerBand', (x, 0.5, top + 1.0), 0.29, 0.06, BODY, vertices=12)
    pipe(m, (x * 0.75, 0.2, top + 0.7), (x, 0.5, top + 0.7), 0.1)
    pipe(m, (x * 0.74, 0.2, top + 0.7), (x * 0.74, 0.1, top + 0.95), 0.1)

# Front annex: blue low block with a maintenance door, vents and a ramp.
block(m, 'Annex', 0, -0.85, top, 1.3, 0.7, 0.5, BODY)
block(m, 'AnnexCap', 0, -0.85, top + 0.5, 1.4, 0.8, 0.07, STEEL, 0.03)
door(m, 0, -1.22, top, 0.5, 0.4, GLOW)
side_vent(m, -0.66, -0.85, top + 0.28, 0.4, 0.26, 4, -1)
side_vent(m, 0.66, -0.85, top + 0.28, 0.4, 0.26, 4, 1)
for x in (-0.4, 0.4):
    light_strip(m, x, -1.2, top + 0.4, 0.04, 0.03, 0.2)
ramp(m, 0, -1.25, 0.7, 0.45, top)
for y in (-0.6, 0.0):
    m.cylinder('Fuse', (-1.3, y, top + 0.15), 0.1, 0.3, DARK, vertices=10)
    m.cylinder('FuseCap', (-1.3, y, top + 0.32), 0.1, 0.04, AMBER, vertices=10)
block(m, 'Transformer', 1.2, -0.75, 0.3 + 0.12, 0.4, 0.5, 0.35, DARK, 0.04)
light_strip(m, 1.2, -1.01, 0.3 + 0.12 + 0.2, 0.2, 0.03, 0.04, AMBER)
finish(m, 'PowerPlantBodyMesh')
