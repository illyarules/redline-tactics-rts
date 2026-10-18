"""Run in Blender's Text Editor or with blender --background --python this_file.

Creates a separate scene without deleting existing scenes. Outputs are written to
assets/models/meridian-tank beside this repository; use -- --output-dir PATH to override.
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
    return Path(source).resolve().parents[2] / 'assets/models/meridian-tank'


OUT = output_directory()
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Meridian Tank Study')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
model_objects = []


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


armor = material('Armor · deep teal', (0.055, 0.23, 0.24), 0.55, 0.36)
edge = material('Armor · light panels', (0.15, 0.39, 0.39), 0.5, 0.4)
dark = material('Track rubber', (0.025, 0.035, 0.045), 0.1, 0.8)
steel = material('Exposed steel', (0.12, 0.17, 0.19), 0.8, 0.34)
team = material('TeamColor', (0.95, 0.55, 0.12), 0.25, 0.4)
glass = material('Optics', (0.08, 0.65, 0.85), 0.4, 0.2)


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    model_objects.append(obj)
    return obj


root = pivot('MeridianTank', (0, 0, 0))


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
        normals = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normals.name)
    model_objects.append(obj)
    return obj


def box(name, location, size, mat, parent=root, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.dimensions = size
    return finish(obj, name, location, mat, parent, bevel)


def cylinder(name, location, radius, depth, mat, parent=root, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth)
    obj = finish(bpy.context.object, name, location, mat, parent, 0.015)
    obj.rotation_euler = rotation
    return obj


# Blender: Z up, -Y forward. glTF export converts to Y up, +Z forward.
box('Hull', (0, 0, 0.8), (2.35, 3.7, 0.68), armor, bevel=0.22)
box('UpperDeck', (0, 0.1, 1.17), (2.12, 2.8, 0.3), edge, bevel=0.12)
box('FrontArmor', (0, -1.48, 1.05), (2.0, 0.7, 0.3), armor, bevel=0.12)
for side in (-1, 1):
    x = side * 1.27
    box('TrackBelt', (x, 0, 0.48), (0.52, 3.9, 0.88), dark, bevel=0.23)
    for y in (-1.42, -0.71, 0, 0.71, 1.42):
        cylinder('RoadWheel', (x + side * 0.23, y, 0.46), 0.32, 0.08,
                 steel, rotation=(0, math.pi / 2, 0))
        cylinder('WheelHub', (x + side * 0.28, y, 0.46), 0.13, 0.09,
                 edge, rotation=(0, math.pi / 2, 0))
    for y in [i * 0.23 for i in range(-7, 8)]:
        for z in (0.055, 0.9):
            box('Tread', (x, y, z), (0.57, 0.12, 0.08), steel, bevel=0.012)
    box('TrackGuard', (x, 0, 1.02), (0.64, 3.7, 0.16), armor)
    for y in (-1.15, -0.25, 0.65):
        box('SideSkirt', (side * 1.56, y, 0.89), (0.09, 0.76, 0.4), edge)
    box('FactionStripe', (side * 0.83, -1.4, 1.215), (0.18, 0.62, 0.035), team, bevel=0.008)
    box('Headlight', (side * 0.91, -1.83, 0.95), (0.24, 0.06, 0.12), glass, bevel=0.02)
for x in (-0.55, 0.55):
    box('EngineVentBed', (x, 1.12, 1.34), (0.65, 0.62, 0.05), dark)
    for i in range(5):
        box('VentFin', (x, 0.9 + i * 0.1, 1.38), (0.59, 0.035, 0.05), steel, bevel=0.007)

cylinder('TurretRing', (0, -0.25, 1.36), 0.77, 0.18, steel)
turret = pivot('TurretPivot', (0, -0.25, 1.42), root)
box('Turret', (0, 0, 0.3), (1.7, 1.75, 0.65), armor, turret, 0.23)
box('TurretRoof', (0, 0.05, 0.62), (1.27, 1.18, 0.08), edge, turret)
cylinder('Hatch', (0.29, 0.22, 0.7), 0.29, 0.12, steel, turret)
box('HatchHandle', (0.29, 0.22, 0.79), (0.23, 0.06, 0.07), team, turret, 0.01)
box('OpticsHousing', (-0.43, -0.33, 0.73), (0.35, 0.36, 0.21), steel, turret)
box('OpticsLens', (-0.43, -0.518, 0.73), (0.25, 0.025, 0.1), glass, turret, 0.008)
for x in (-0.65, 0.65):
    box('TurretMarking', (x, -0.1, 0.638), (0.12, 0.65, 0.025), team, turret, 0.005)
cylinder('AntennaBase', (0.57, 0.55, 0.65), 0.09, 0.13, steel, turret)
cylinder('Antenna', (0.57, 0.55, 1.09), 0.018, 0.8, dark, turret)
barrel = pivot('BarrelPivot', (0, -0.77, 0.3), turret)
box('Mantlet', (0, -0.08, 0), (0.65, 0.48, 0.44), steel, barrel, 0.09)
cylinder('Barrel', (0, -1.03, 0), 0.115, 1.8, steel, barrel, (math.pi / 2, 0, 0))
box('Muzzle', (0, -1.97, 0), (0.32, 0.42, 0.27), armor, barrel)
box('MuzzleOpening', (0, -2.185, 0), (0.19, 0.012, 0.13), dark, barrel, 0.01)

# Join static pieces into three articulated meshes; materials still cost draw calls.
for parent, name in ((root, 'HullMesh'), (turret, 'TurretMesh'), (barrel, 'BarrelMesh')):
    parts = [o for o in scene.objects if o.type == 'MESH' and o.parent == parent]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name

bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'meridian-tank.glb'),
                          export_format='GLB', use_selection=True,
                          use_active_scene=True, export_yup=True)

# Studio items are added after export and are not included in the game asset.
ground = material('Studio floor', (0.065, 0.085, 0.11), 0, 0.85)
box('StudioGround', (0, 0, -0.08), (200, 200, 0.1), ground, parent=None, bevel=0)
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
    ('Key', (3, -5, 8), 1500, 5, (1, 0.89, 0.74)),
    ('Fill', (-5, -1, 4), 1100, 5, (0.65, 0.82, 1)),
    ('Rim', (1, 5, 6), 1800, 4, (0.7, 0.9, 1)),
):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.7)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('PreviewCamera')
camera = bpy.data.objects.new('PreviewCamera', camera_data)
scene.collection.objects.link(camera)
camera.location = (6, -8, 6)
camera.rotation_euler = (Vector((0, -0.4, 0.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type, camera_data.ortho_scale = 'ORTHO', 7.4
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'preview.png')
# Save only this generated scene, leaving any user's open document untouched.
bpy.data.libraries.write(str(OUT / 'meridian-tank.blend'), {scene}, fake_user=True)
bpy.ops.render.render(write_still=True)
print(f'Created model, Blender scene and preview in {OUT}')
