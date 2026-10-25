"""Run with blender --background --python this_file [-- --output-dir PATH].

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-infantry-squad beside this repository; use -- --output-dir PATH to override.

Four compact, toy-like Meridian riflemen (see "compact toy soldier" in meridian_common.py). Each is
a `SoldierN` pivot holding `SoldierN_Body`, `SoldierN_Arms` (both arms and the rifle, with a
`SoldierN_Muzzle` empty at the rifle's tip) and `SoldierN_LegLeft` / `SoldierN_LegRight`. The game
loads all four, one per formation slot, and swings the pivots in its walk cycle.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from meridian_common import (  # noqa: E402
    FABRIC, GEAR, HALF_PI, PLATE, SOLDIER_SHOULDER_Z, SOLDIER_WAIST_Z, STEEL, Model,
    refine_soldier_silhouette, soldier_arm, soldier_leg, soldier_torso, squad_location,
)

m = Model('meridian-infantry-squad', 'Meridian Infantry Squad Study', 'MeridianInfantrySquad')
SHOULDER_X = 0.31  # the arms pivot sits on the right shoulder; the rifle is held across the chest
RIFLE_X, RIFLE_Z = -0.2, -0.17  # rifle centre line in arms space


def antenna(body):
    m.cylinder('RadioMast', (-0.13, 0.33, 0.7), 0.012, 0.46, STEEL, body, vertices=6)
    m.box('RadioMastTab', (-0.13, 0.33, 0.9), (0.04, 0.015, 0.06), 'TeamColor', body, 0.003)
    m.box('RadioBox', (-0.15, 0.37, 0.2), (0.12, 0.08, 0.18), STEEL, body, 0.015)


def side_canteen(body):
    m.cylinder('Canteen', (-0.31, 0.12, 0.0), 0.06, 0.2, STEEL, body, vertices=10)
    m.box('SidePouch', (0.3, 0.1, 0.02), (0.08, 0.14, 0.12), GEAR, body, 0.015)


def shoulder_bag(body):
    m.box('GrenadeBag', (0.3, 0.12, 0.17), (0.1, 0.16, 0.14), GEAR, body, 0.02)
    m.box('GrenadeBagFlap', (0.3, 0.12, 0.25), (0.11, 0.17, 0.03), FABRIC, body, 0.01)


def build_pack(extra):
    def pack(body):
        m.box('Backpack', (0, 0.28, 0.22), (0.38, 0.18, 0.28), GEAR, body, 0.05)
        m.box('PackLid', (0, 0.285, 0.38), (0.36, 0.19, 0.05), FABRIC, body, 0.02)
        m.cylinder('BedRoll', (0, 0.29, 0.43), 0.07, 0.4, 'TeamColor', body, (0, HALF_PI, 0),
                   vertices=14)
        if extra:
            extra(body)
    return pack


def build_rifle(arms, soldier_name):
    """Held low-ready across the chest, muzzle forward (-Y). Local space: the right shoulder."""
    x, z = RIFLE_X, RIFLE_Z
    m.box('Receiver', (x, -0.2, z), (0.1, 0.32, 0.13), STEEL, arms, 0.012)
    m.box('ReceiverStripe', (x, -0.18, z + 0.07), (0.04, 0.2, 0.012), 'TeamColor', arms, 0.004)
    m.box('Stock', (x, 0.08, z - 0.01), (0.1, 0.2, 0.16), PLATE, arms, 0.025)
    m.box('Handguard', (x, -0.48, z - 0.005), (0.11, 0.26, 0.11), GEAR, arms, 0.02)
    m.cylinder('Barrel', (x, -0.69, z), 0.03, 0.16, STEEL, arms, (HALF_PI, 0, 0), vertices=10)
    m.cylinder('MuzzleBrake', (x, -0.8, z), 0.042, 0.06, STEEL, arms, (HALF_PI, 0, 0), vertices=10)
    m.box('Magazine', (x, -0.28, z - 0.14), (0.07, 0.1, 0.17), GEAR, arms, 0.012, (0.18, 0, 0))
    m.box('PistolGrip', (x, -0.08, z - 0.1), (0.07, 0.07, 0.12), GEAR, arms, 0.012, (-0.3, 0, 0))
    m.box('Scope', (x, -0.22, z + 0.1), (0.07, 0.2, 0.07), STEEL, arms, 0.018)
    m.box('ScopeLens', (x, -0.325, z + 0.1), (0.05, 0.012, 0.05), 'Optics', arms, 0.004)
    # Where the game starts the muzzle flash and tracer; it swings and recoils with the arms.
    m.pivot(f'{soldier_name}_Muzzle', (x, -0.84, z), arms)


def build_arms(soldier, soldier_name):
    arms = m.pivot(f'{soldier_name}_Arms', (SHOULDER_X, 0, SOLDIER_SHOULDER_Z), soldier)
    soldier_arm(m, arms, (0, 0, 0), (0.03, -0.07, -0.15), (RIFLE_X + 0.09, -0.22, RIFLE_Z))
    lx = -2 * SHOULDER_X  # the left shoulder, in right-shoulder space
    soldier_arm(m, arms, (lx, 0, 0), (lx + 0.1, -0.14, -0.17), (RIFLE_X - 0.04, -0.4, RIFLE_Z))
    build_rifle(arms, soldier_name)
    return arms


def build_soldier(name, location, extra):
    soldier = m.pivot(name, location, m.root)
    body = m.pivot(f'{name}_Body', (0, 0, SOLDIER_WAIST_Z), soldier)  # waist; bob and lean here
    soldier_torso(m, body, build_pack(extra))
    arms = build_arms(soldier, name)
    legs = [soldier_leg(m, -1, soldier, name), soldier_leg(m, 1, soldier, name)]
    for pivot in (body, arms):
        m.join_children(pivot, f'{pivot.name}Mesh')
    refine_soldier_silhouette(soldier)
    return legs


# Slots mirror SQUAD_ROLES.infantry in src/config/squad.ts (right, forward in tiles), lead first.
for name, location, extra in (
    ('Soldier1', squad_location(-0.36, 0.2), antenna),
    ('Soldier2', squad_location(0.2, 0.26), None),
    ('Soldier3', squad_location(-0.12, -0.26), side_canteen),
    ('Soldier4', squad_location(0.4, -0.2), shoulder_bag),
):
    build_soldier(name, location, extra)

m.export_and_preview((4.5, -6, 3.6), (0.0, 0, 0.45), 3.4)
