"""Shared detail helpers for the Meridian building generators (not run directly).

Buildings are drawn in tile units: a 3x3 footprint is about 2.8 Blender units wide, a 4x4 about 3.8.
Z is up and the entrance faces -Y (towards the game camera after export). Body walls use 'BaseArmor'
(recoloured per owner); the structure around them is charcoal and steel, as in the menu renders.
"""

import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import HALF_PI, Model, make_material  # noqa: E402

BODY, LIGHT, DARK, STEEL, TEAM = 'BaseArmor', 'BaseArmorLight', 'Equipment', 'ExposedSteel', 'TeamColor'
GLOW, AMBER, CONCRETE, VOID = 'Glow', 'Amber', 'Concrete', 'Void'
BASE_Z = 0.3  # top of the plinth


def building(slug, title, root):
    """A Model with the building-only materials added: emissive cyan and amber, and plinth grey."""
    m = Model(slug, title, root)
    m.mat[GLOW] = emissive('Glow cyan', (0.1, 0.8, 1.0), 1.6)
    m.mat[AMBER] = emissive('Glow amber', (1.0, 0.55, 0.08), 2.0)
    # Buildings read lighter than the units: structure is mid grey, and only openings are near black.
    m.mat[DARK] = make_material('Equipment · plate grey', (0.21, 0.24, 0.27), 0.35, 0.6)
    m.mat[STEEL] = make_material('Exposed steel · light', (0.36, 0.4, 0.43), 0.6, 0.4)
    m.mat[VOID] = make_material('Opening', (0.02, 0.03, 0.04), 0.1, 0.8)
    m.mat[CONCRETE] = make_material('Plinth grey', (0.16, 0.18, 0.2), 0.25, 0.7)
    return m


def emissive(name, color, strength):
    mat = make_material(name, color, 0.0, 0.4)
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for key in ('Emission Color', 'Emission'):
        if key in shader.inputs:
            shader.inputs[key].default_value = (*color, 1)
            break
    if 'Emission Strength' in shader.inputs:
        shader.inputs['Emission Strength'].default_value = strength
    return mat


def block(m, name, cx, cy, z0, sx, sy, sz, mat=BODY, bevel=0.05):
    """A box standing on `z0`, centred at (cx, cy)."""
    return m.box(name, (cx, cy, z0 + sz / 2), (sx, sy, sz), mat, bevel=bevel)


def plinth(m, width, depth=None, tiers=2):
    """Stepped charcoal base with steel corner blocks and amber marker lamps along the front."""
    depth = depth or width
    z = 0.0
    for i in range(tiers):
        inset = i * 0.16
        h = 0.18 if i == 0 else 0.12
        block(m, 'PlinthTier', 0, 0, z, width - inset * 2, depth - inset * 2, h, DARK, 0.04)
        z += h
    m.box('PlinthRim', (0, 0, z + 0.005), (width - tiers * 0.32 - 0.1, depth - tiers * 0.32 - 0.1, 0.02),
          STEEL, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            block(m, 'PlinthCorner', sx * (width / 2 - 0.16), sy * (depth / 2 - 0.16), 0, 0.32, 0.32, 0.26,
                  STEEL, 0.05)
    for x in (-width * 0.3, width * 0.3):
        m.box('PlinthLamp', (x, -depth / 2 - 0.005, 0.1), (0.1, 0.03, 0.05), AMBER, bevel=0.008)
    return z


def ramp(m, x, y_front, width, length, z_top):
    """A sloped plate running from the ground at -Y up to the door sill at `y_front`."""
    drop = z_top
    slope = math.atan2(drop, length)
    cy = y_front - length / 2
    m.box('Ramp', (x, cy, z_top / 2), (width, math.hypot(length, drop), 0.06), DARK, bevel=0.015,
          rotation=(slope, 0, 0))
    for side in (-1, 1):
        m.box('RampRail', (x + side * (width / 2 - 0.03), cy, z_top / 2 + 0.04),
              (0.06, math.hypot(length, drop), 0.05), STEEL, bevel=0.01, rotation=(slope, 0, 0))
    return cy


def hazard(m, x, y, z, width, depth, count=5):
    """Alternating amber and charcoal stripes on a flat plate."""
    step = width / count
    for i in range(count):
        m.box('Hazard', (x - width / 2 + step * (i + 0.5), y, z), (step * 0.5, depth, 0.02),
              AMBER if i % 2 == 0 else DARK, bevel=0.004)


def door(m, x, y, z0, width, height, glow=AMBER):
    """A recessed dark door in a steel frame on a -Y wall at `y`, with a lit lintel."""
    m.box('DoorFrame', (x, y - 0.02, z0 + height / 2), (width + 0.2, 0.08, height + 0.1), STEEL, bevel=0.03)
    m.box('DoorLeaf', (x, y - 0.07, z0 + height / 2 - 0.02), (width, 0.05, height - 0.06), VOID, bevel=0.015)
    m.box('DoorLintel', (x, y - 0.1, z0 + height - 0.02), (width * 0.8, 0.03, 0.04), glow, bevel=0.005)
    for sx in (-1, 1):
        m.box('DoorPost', (x + sx * (width / 2 + 0.07), y - 0.05, z0 + height / 2), (0.1, 0.12, height), STEEL,
              bevel=0.02)


def light_strip(m, x, y, z, sx, sy, sz, mat=GLOW):
    return m.box('LightStrip', (x, y, z), (sx, sy, sz), mat, bevel=0.005)


def window_wall(m, x, y, z, count, spacing, face='front', mat=GLOW):
    """A row of small lit windows on a wall: `face` is 'front' (-Y), 'right' (+X) or 'left' (-X)."""
    for i in range(count):
        off = (i - (count - 1) / 2) * spacing
        if face == 'front':
            m.box('Window', (x + off, y, z), (0.16, 0.035, 0.09), mat, bevel=0.01)
        else:
            sign = 1 if face == 'right' else -1
            m.box('Window', (x, y + off, z), (0.035 * sign * sign, 0.16, 0.09), mat, bevel=0.01)


def vent(m, x, y, z, width, depth, slats=5, axis='y', frame=STEEL):
    """A flat louvred hatch lying on a roof: steel frame, dark bed, raised slats."""
    m.box('VentFrame', (x, y, z + 0.03), (width, depth, 0.06), frame, bevel=0.02)
    m.box('VentBed', (x, y, z + 0.065), (width - 0.1, depth - 0.1, 0.03), VOID, bevel=0.008)
    for i in range(slats):
        t = (i + 0.5) / slats - 0.5
        if axis == 'y':
            m.box('VentSlat', (x + t * (width - 0.14), y, z + 0.1), ((width - 0.14) / slats * 0.5, depth - 0.16, 0.05),
                  STEEL, bevel=0.008)
        else:
            m.box('VentSlat', (x, y + t * (depth - 0.14), z + 0.1), (width - 0.16, (depth - 0.14) / slats * 0.5, 0.05),
                  STEEL, bevel=0.008)


def side_vent(m, x, y, z, width, height, slats=5, sign=1):
    """A louvred grille on a +X (sign=1) or -X (sign=-1) wall."""
    m.box('GrilleFrame', (x, y, z), (0.07, width, height), STEEL, bevel=0.015)
    m.box('GrilleBed', (x + sign * 0.03, y, z), (0.03, width - 0.08, height - 0.08), VOID, bevel=0.006)
    for i in range(slats):
        t = (i + 0.5) / slats - 0.5
        m.box('GrilleSlat', (x + sign * 0.06, y, z + t * (height - 0.1)), (0.03, width - 0.1, height / slats * 0.4),
              STEEL, bevel=0.006)


def pipe(m, a, b, r=0.05, mat=STEEL):
    m.limb('Pipe', a, b, r, r, mat)
    m.cylinder('PipeJoint', a, r * 1.35, r * 1.1, DARK, vertices=10,
               rotation=_axis_rotation(a, b))
    m.cylinder('PipeJoint', b, r * 1.35, r * 1.1, DARK, vertices=10,
               rotation=_axis_rotation(a, b))


def _axis_rotation(a, b):
    from mathutils import Vector
    return (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()


def stack(m, x, y, z0, height, radius, band=GLOW):
    """A smokestack: dark shaft, steel collar and cap, one lit ring."""
    m.cylinder('StackShaft', (x, y, z0 + height / 2), radius, height, DARK, vertices=14)
    m.cylinder('StackBase', (x, y, z0 + 0.06), radius * 1.4, 0.12, STEEL, vertices=14)
    m.cylinder('StackRing', (x, y, z0 + height * 0.72), radius * 1.06, 0.07, band, vertices=14)
    m.cylinder('StackCap', (x, y, z0 + height + 0.03), radius * 1.25, 0.08, STEEL, vertices=14)


def antenna(m, x, y, z0, height, tip=GLOW):
    m.cylinder('AntennaMast', (x, y, z0 + height / 2), 0.025, height, STEEL, vertices=8)
    m.cylinder('AntennaBase', (x, y, z0 + 0.05), 0.07, 0.1, DARK, vertices=8)
    m.cylinder('AntennaTip', (x, y, z0 + height + 0.05), 0.04, 0.1, tip, vertices=8)


def barrel(m, x, y, z0, radius, height, mat=STEEL):
    m.cylinder('Barrel', (x, y, z0 + height / 2), radius, height, mat, vertices=14)
    for dz in (0.22, 0.78):
        m.cylinder('BarrelBand', (x, y, z0 + height * dz), radius * 1.05, 0.04, DARK, vertices=14)


def greebles(m, seed, region, count, z, mat=DARK):
    """Small deterministic crates scattered over a roof or apron: (x0, x1, y0, y1) limits."""
    rng = random.Random(seed)
    x0, x1, y0, y1 = region
    for _ in range(count):
        sx, sy, sz = rng.uniform(0.1, 0.24), rng.uniform(0.1, 0.24), rng.uniform(0.05, 0.14)
        block(m, 'Crate', rng.uniform(x0, x1), rng.uniform(y0, y1), z, sx, sy, sz,
              rng.choice((mat, STEEL, LIGHT)), 0.02)


def roof_plates(m, cx, cy, z, sx, sy, columns=3, rows=2):
    """A dark deck split into raised armoured plates with steel clamps between them."""
    pw, ph = sx / columns, sy / rows
    for c in range(columns):
        for r in range(rows):
            x = cx - sx / 2 + pw * (c + 0.5)
            y = cy - sy / 2 + ph * (r + 0.5)
            block(m, 'RoofPlate', x, y, z, pw - 0.06, ph - 0.06, 0.06, BODY, 0.025)
    for c in range(1, columns):
        m.box('RoofClamp', (cx - sx / 2 + pw * c, cy, z + 0.065), (0.07, sy, 0.05), STEEL, bevel=0.012)


def corner_posts(m, cx, cy, z0, sx, sy, sz, size=0.2):
    """Steel pillars on the four corners of a body block."""
    for ix in (-1, 1):
        for iy in (-1, 1):
            block(m, 'CornerPost', cx + ix * (sx / 2), cy + iy * (sy / 2), z0, size, size, sz + 0.04, STEEL, 0.04)


def finish(m, name, camera=(5.5, -7, 5.5), target=(0, 0, 0.9), scale=6.2):
    m.join_children(m.root, name)
    m.export_and_preview(camera, target, scale)
