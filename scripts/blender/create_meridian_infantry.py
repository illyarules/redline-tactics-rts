"""Run in Blender's Text Editor or with blender --background --python this_file.

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-infantry-squad beside this repository; use -- --output-dir PATH to override.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def output_directory():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if args.output_dir:
        return args.output_dir.resolve()
    source = globals().get('__file__')
    if not source:
        raise RuntimeError('Open the saved script in Blender, or specify --output-dir on the command line.')
    return Path(source).resolve().parents[2] / 'assets/models/meridian-infantry-squad'


OUT = output_directory()
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Meridian Infantry Squad Study')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'


def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    return mat


# Same palette family as the Meridian tank; names keep the substrings the game loader recolours by.
fabric = material('Uniform · deep teal', (0.055, 0.23, 0.24), 0.0, 0.75)
plate = material('Armor · light panels', (0.15, 0.39, 0.39), 0.35, 0.45)
gear = material('Webbing · charcoal', (0.04, 0.055, 0.065), 0.05, 0.85)
steel = material('Exposed steel', (0.12, 0.17, 0.19), 0.8, 0.34)
team = material('TeamColor', (0.95, 0.55, 0.12), 0.25, 0.4)
glass = material('Optics', (0.08, 0.65, 0.85), 0.4, 0.2)
skin = material('Skin', (0.55, 0.38, 0.29), 0.0, 0.6)


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def finish(obj, name, location, mat, parent, bevel=0):
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Edge highlights', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    return obj


def box(name, location, size, mat, parent, bevel=0.012, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.dimensions = size
    finish(obj, name, location, mat, parent, bevel)
    obj.rotation_euler = rotation
    return obj


def ellipsoid(name, location, radii, mat, parent, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1)
    obj = bpy.context.object
    obj.scale = radii
    finish(obj, name, location, mat, parent)
    obj.rotation_euler = rotation
    return obj


def limb(name, start, end, r_start, r_end, mat, parent):
    """A tapered tube between two points in the parent's space."""
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r_start, radius2=r_end,
                                    depth=(b - a).length, end_fill_type='NGON')
    obj = finish(bpy.context.object, name, (a + b) / 2, mat, parent, 0.008)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def cylinder(name, location, radius, depth, mat, parent, rotation=(0, 0, 0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = finish(bpy.context.object, name, location, mat, parent, 0.006)
    obj.rotation_euler = rotation
    return obj


HIP_Z = 0.93
SHOULDER = (0.285, 0.0, 1.46)
HALF_PI = math.pi / 2


def build_leg(side, soldier):
    x = side * 0.1
    p = pivot(f'{soldier.name}_Leg{"Right" if side > 0 else "Left"}', (x, 0, HIP_Z), soldier)
    # Local space: the hip is the origin, the ground is at z = -HIP_Z.
    limb('Thigh', (0, 0, -0.02), (0, -0.02, -0.46), 0.098, 0.075, fabric, p)
    box('ThighPocket', (side * 0.085, -0.02, -0.25), (0.035, 0.1, 0.15), gear, p)
    limb('Shin', (0, -0.02, -0.46), (0, 0.0, -0.8), 0.07, 0.058, fabric, p)
    box('KneePad', (0, -0.075, -0.46), (0.15, 0.07, 0.17), plate, p, 0.02)
    box('ShinGuard', (0, -0.055, -0.63), (0.11, 0.045, 0.2), plate, p, 0.015)
    box('Boot', (0, -0.04, -0.855), (0.15, 0.3, 0.12), gear, p, 0.03)
    box('BootToeCap', (0, -0.16, -0.865), (0.14, 0.09, 0.09), steel, p, 0.025)
    box('BootSole', (0, -0.04, -0.915), (0.16, 0.32, 0.03), steel, p, 0.01)
    return p


def build_rifle(arms):
    """Held low-ready, muzzle forward (-Y). Local space is the right shoulder pivot."""
    z, x = -0.27, -0.1
    box('Receiver', (x, -0.28, z), (0.07, 0.34, 0.1), steel, arms, 0.01)
    box('ReceiverStripe', (x, -0.25, z + 0.052), (0.035, 0.22, 0.012), team, arms, 0.004)
    box('Stock', (x, 0.1, z - 0.015), (0.07, 0.26, 0.13), plate, arms, 0.02)
    box('CheekRest', (x, 0.07, z + 0.07), (0.055, 0.15, 0.03), gear, arms, 0.01)
    box('Handguard', (x, -0.58, z - 0.005), (0.075, 0.3, 0.085), gear, arms, 0.015)
    cylinder('Barrel', (x, -0.88, z), 0.018, 0.34, steel, arms, (HALF_PI, 0, 0), 10)
    cylinder('MuzzleBrake', (x, -1.07, z), 0.03, 0.07, steel, arms, (HALF_PI, 0, 0), 10)
    box('Magazine', (x, -0.33, z - 0.14), (0.05, 0.085, 0.19), gear, arms, 0.01, (0.18, 0, 0))
    box('PistolGrip', (x, -0.13, z - 0.09), (0.05, 0.06, 0.12), gear, arms, 0.01, (-0.3, 0, 0))
    box('Scope', (x, -0.27, z + 0.105), (0.055, 0.2, 0.06), steel, arms, 0.015)
    box('ScopeLens', (x, -0.375, z + 0.105), (0.04, 0.012, 0.04), glass, arms, 0.004)
    box('RailLight', (x, -0.72, z - 0.07), (0.04, 0.07, 0.04), steel, arms, 0.008)


def build_arms(soldier_body):
    arms = pivot(f'{soldier_body.parent.name}_Arms', SHOULDER, soldier_body)
    # Right arm: shoulder -> elbow -> glove on the pistol grip.
    limb('UpperArmR', (0, 0, 0), (0.025, -0.04, -0.28), 0.062, 0.052, fabric, arms)
    limb('ForearmR', (0.025, -0.04, -0.28), (-0.085, -0.16, -0.33), 0.05, 0.04, fabric, arms)
    box('ElbowPadR', (0.04, -0.015, -0.29), (0.08, 0.085, 0.09), plate, arms, 0.02)
    box('GloveR', (-0.1, -0.15, -0.34), (0.065, 0.085, 0.07), gear, arms, 0.02)
    # Left arm reaches across to the handguard (mirrored shoulder is at x = -2 * SHOULDER.x).
    lx = -2 * SHOULDER[0]
    limb('UpperArmL', (lx, 0, 0), (lx - 0.02, -0.04, -0.28), 0.062, 0.052, fabric, arms)
    limb('ForearmL', (lx - 0.02, -0.04, -0.28), (-0.11, -0.52, -0.285), 0.05, 0.038, fabric, arms)
    box('ElbowPadL', (lx - 0.035, -0.015, -0.29), (0.08, 0.085, 0.09), plate, arms, 0.02)
    box('GloveL', (-0.105, -0.54, -0.285), (0.07, 0.1, 0.075), gear, arms, 0.02)
    build_rifle(arms)
    return arms


def build_torso(body, leader):
    # Pelvis and belt kit.
    box('Pelvis', (0, 0, 0.0), (0.38, 0.23, 0.18), fabric, body, 0.05)
    box('Belt', (0, 0, 0.1), (0.4, 0.25, 0.06), gear, body, 0.015)
    box('BeltBuckle', (0, -0.128, 0.1), (0.07, 0.015, 0.045), steel, body, 0.005)
    for x in (-0.15, 0.15):
        box('AmmoPouch', (x, -0.135, 0.07), (0.1, 0.06, 0.12), gear, body, 0.015)
    box('Holster', (0.22, -0.02, -0.03), (0.06, 0.12, 0.2), gear, body, 0.02)
    box('Canteen', (-0.215, 0.09, 0.0), (0.07, 0.1, 0.2), steel, body, 0.025)
    # Chest, plate carrier and shoulders.
    box('Chest', (0, 0, 0.3), (0.43, 0.26, 0.42), fabric, body, 0.07)
    box('Plastron', (0, -0.155, 0.33), (0.34, 0.06, 0.34), plate, body, 0.03)
    box('PlastronStripe', (0, -0.19, 0.4), (0.22, 0.012, 0.04), team, body, 0.004)
    for x in (-0.1, 0.0, 0.1):
        box('ChestPouch', (x, -0.205, 0.17), (0.08, 0.05, 0.1), gear, body, 0.012)
    for x in (-0.12, 0.12):
        box('Strap', (x, 0.0, 0.5), (0.07, 0.28, 0.04), gear, body, 0.008)
    for side in (-1, 1):
        ellipsoid('ShoulderPad', (side * 0.255, 0.0, 0.5), (0.1, 0.105, 0.075), plate, body)
        box('ShoulderBadge', (side * 0.29, -0.05, 0.545), (0.035, 0.07, 0.012), team, body, 0.004)
    # Backpack with a rolled blanket.
    box('Backpack', (0, 0.22, 0.31), (0.32, 0.16, 0.36), gear, body, 0.04)
    box('PackLid', (0, 0.225, 0.52), (0.3, 0.17, 0.06), fabric, body, 0.02)
    cylinder('BedRoll', (0, 0.25, 0.575), 0.065, 0.34, team, body, (0, HALF_PI, 0), 14)
    if leader:
        cylinder('RadioMast', (-0.12, 0.27, 0.75), 0.008, 0.62, steel, body, vertices=6)
        box('RadioBox', (-0.12, 0.31, 0.3), (0.1, 0.07, 0.16), steel, body, 0.015)
    # Neck and head.
    cylinder('Neck', (0, 0, 0.56), 0.055, 0.12, skin, body, vertices=10)
    box('Collar', (0, 0, 0.565), (0.2, 0.17, 0.06), plate, body, 0.02)
    ellipsoid('Head', (0, -0.005, 0.7), (0.085, 0.1, 0.11), skin, body)
    box('Goggles', (0, -0.085, 0.715), (0.14, 0.04, 0.05), glass, body, 0.012)
    box('GoggleStrap', (0, 0.0, 0.715), (0.185, 0.19, 0.03), gear, body, 0.008)
    ellipsoid('Helmet', (0, 0.005, 0.755), (0.125, 0.14, 0.1), plate, body)
    box('HelmetBrim', (0, -0.1, 0.765), (0.18, 0.06, 0.025), plate, body, 0.01)
    box('HelmetStripe', (0, 0.0, 0.85), (0.04, 0.22, 0.012), team, body, 0.004)
    box('ChinStrap', (0, -0.06, 0.63), (0.15, 0.03, 0.025), gear, body, 0.006)


def build_soldier(name, location, leader=False):
    soldier = pivot(name, location, squad)
    body = pivot(f'{name}_Body', (0, 0, HIP_Z + 0.02), soldier)  # waist; bob and lean here
    build_torso(body, leader)
    # Arms are expressed in the BodyPivot's space; shoulder height is relative to it.
    arms = build_arms_rel(body)
    legs = [build_leg(-1, soldier), build_leg(1, soldier)]
    return soldier, body, arms, legs


def build_arms_rel(body):
    global SHOULDER
    original = SHOULDER
    SHOULDER = (original[0], original[1], original[2] - (HIP_Z + 0.02))
    arms = build_arms(body)
    SHOULDER = original
    return arms


def join_by_parent(soldier, parts):
    for parent in parts:
        meshes = [o for o in parent.children if o.type == 'MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = f'{parent.name}Mesh'


# Blender: Z up, -Y forward. Slots mirror the game's squad triangle (1 tile = 2.34 m).
squad = pivot('MeridianInfantrySquad', (0, 0, 0))
for name, x, y, leader in (
    ('Soldier1', 0.0, -0.66, True),
    ('Soldier2', -0.7, 0.56, False),
    ('Soldier3', 0.7, 0.56, False),
):
    soldier, body, arms, legs = build_soldier(name, (x, y, 0), leader)
    join_by_parent(soldier, [body, arms, *legs])

bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'meridian-infantry-squad.glb'),
                          export_format='GLB', use_selection=True,
                          use_active_scene=True, export_yup=True)

# Studio items are added after export and are not included in the game asset.
ground = material('Studio floor', (0.065, 0.085, 0.11), 0, 0.85)
bpy.ops.mesh.primitive_cube_add()
floor = bpy.context.object
floor.dimensions = (200, 200, 0.1)
finish(floor, 'StudioGround', (0, 0, -0.05), ground, None)
world = bpy.data.worlds.new('Studio World')
scene.world = world
world.use_nodes = True
world.node_tree.nodes.clear()
background = world.node_tree.nodes.new('ShaderNodeBackground')
world_output = world.node_tree.nodes.new('ShaderNodeOutputWorld')
world.node_tree.links.new(background.outputs[0], world_output.inputs['Surface'])
background.inputs[0].default_value = (0.2, 0.25, 0.32, 1)
background.inputs[1].default_value = 0.4
for name, location, energy, size, color in (
    ('Key', (3, -5, 6), 700, 4, (1, 0.89, 0.74)),
    ('Fill', (-5, -2, 3), 500, 4, (0.65, 0.82, 1)),
    ('Rim', (1, 5, 4), 800, 3, (0.7, 0.9, 1)),
):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.9)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('PreviewCamera')
camera = bpy.data.objects.new('PreviewCamera', camera_data)
scene.collection.objects.link(camera)
camera.location = (4.5, -6, 3.6)
camera.rotation_euler = (Vector((0, 0, 0.85)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type, camera_data.ortho_scale = 'ORTHO', 3.6
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'preview.png')
# Save only this generated scene, leaving any user's open document untouched.
bpy.data.libraries.write(str(OUT / 'meridian-infantry-squad.blend'), {scene}, fake_user=True)
bpy.ops.render.render(write_still=True)
print(f'Created model, Blender scene and preview in {OUT}')
