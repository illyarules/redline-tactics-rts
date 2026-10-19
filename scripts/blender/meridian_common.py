"""Shared helpers for the Meridian Blender generators in this folder (not run directly).

Each create_meridian_*.py script imports this module, builds its model under a root pivot, and calls
export_and_preview(). Blender: Z up, -Y forward; the glTF export converts to Y up, +Z forward.
"""

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

# Meridian material family, as in the tank and infantry generators. The game recolours by name:
# 'deep teal' -> owner body, 'light panels' -> owner light plane, 'TeamColor' -> owner accent.
# Keys are what the generator scripts use; values are (Blender material name, linear colour, metallic, roughness).
PALETTE = {
    'BaseArmor': ('Armor · deep teal', (0.055, 0.23, 0.24), 0.55, 0.36),
    'BaseArmorLight': ('Armor · light panels', (0.15, 0.39, 0.39), 0.5, 0.4),
    'UniformFabric': ('Uniform · deep teal', (0.055, 0.23, 0.24), 0.0, 0.75),
    'Equipment': ('Equipment · charcoal', (0.04, 0.055, 0.065), 0.05, 0.85),
    'Rubber': ('Track rubber', (0.025, 0.035, 0.045), 0.1, 0.8),
    'ExposedSteel': ('Exposed steel', (0.12, 0.17, 0.19), 0.8, 0.34),
    'Optics': ('Optics', (0.08, 0.65, 0.85), 0.4, 0.2),
    'Lamp': ('Work lamp', (0.7, 0.68, 0.55), 0.0, 0.3),
    'TailLamp': ('Tail lamp', (0.35, 0.06, 0.04), 0.0, 0.4),
    'Skin': ('Skin', (0.55, 0.38, 0.29), 0.0, 0.6),
    'TeamColor': ('TeamColor', (0.95, 0.55, 0.12), 0.25, 0.4),
}
HALF_PI = math.pi / 2


def output_directory(slug):
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if args.output_dir:
        return args.output_dir.resolve()
    return Path(__file__).resolve().parents[2] / 'assets/models' / slug


def make_material(name, color, metallic=0.0, roughness=0.5):
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


class Model:
    """One generated model: its Blender scene, materials, primitive builders and export."""

    def __init__(self, slug, scene_title, root_name):
        self.slug = slug
        self.out = output_directory(slug)
        self.out.mkdir(parents=True, exist_ok=True)
        self.scene = bpy.data.scenes.new(scene_title)
        bpy.context.window.scene = self.scene
        self.scene.unit_settings.system = 'METRIC'
        self.mat = {key: make_material(*spec) for key, spec in PALETTE.items()}
        self.root = self.pivot(root_name, (0, 0, 0))

    # -- primitives -------------------------------------------------------------------------
    def pivot(self, name, location, parent=None):
        obj = bpy.data.objects.new(name, None)
        self.scene.collection.objects.link(obj)
        obj.parent = parent
        obj.location = location
        return obj

    def _activate(self, obj):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    def _finish(self, obj, name, location, mat, parent, bevel=0.0, smooth=True):
        obj.name = name
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.parent = parent or self.root
        obj.location = location
        obj.data.materials.append(self.mat[mat])
        if bevel:
            mod = obj.modifiers.new('Edge highlights', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if smooth:
            bpy.ops.object.shade_smooth()
            normals = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
            bpy.ops.object.modifier_apply(modifier=normals.name)
        return obj

    def box(self, name, location, size, mat, parent=None, bevel=0.04, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add()
        obj = bpy.context.object
        obj.dimensions = size
        self._finish(obj, name, location, mat, parent, min(bevel, min(size) * 0.3))
        obj.rotation_euler = rotation
        return obj

    def cylinder(self, name, location, radius, depth, mat, parent=None, rotation=(0, 0, 0),
                 bevel=0.012, vertices=16):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
        obj = self._finish(bpy.context.object, name, location, mat, parent,
                           min(bevel, radius * 0.4, depth * 0.3))
        obj.rotation_euler = rotation
        return obj

    def ellipsoid(self, name, location, radii, mat, parent=None, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1)
        obj = bpy.context.object
        obj.scale = radii
        self._finish(obj, name, location, mat, parent)
        obj.rotation_euler = rotation
        return obj

    def torus(self, name, location, major, minor, mat, parent=None, rotation=(0, 0, 0)):
        bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=6,
                                         major_radius=major, minor_radius=minor)
        obj = self._finish(bpy.context.object, name, location, mat, parent)
        obj.rotation_euler = rotation
        return obj

    def limb(self, name, start, end, r_start, r_end, mat, parent=None):
        """A tapered tube between two points in the parent's space."""
        a, b = Vector(start), Vector(end)
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r_start, radius2=r_end,
                                        depth=(b - a).length, end_fill_type='NGON')
        obj = self._finish(bpy.context.object, name, (a + b) / 2, mat, parent, 0.008)
        obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
        return obj

    def bar(self, name, start, end, width, height, mat, parent=None, bevel=0.02):
        """A rectangular strut between two points; `height` is measured along the parent's Z."""
        a, b = Vector(start), Vector(end)
        bpy.ops.mesh.primitive_cube_add()
        obj = bpy.context.object
        obj.dimensions = (width, (b - a).length, height)
        self._finish(obj, name, (a + b) / 2, mat, parent, min(bevel, min(width, height) * 0.3))
        obj.rotation_euler = (b - a).to_track_quat('Y', 'Z').to_euler()
        return obj

    def solid(self, name, location, points, mat, parent=None, bevel=0.04):
        """The convex solid spanned by `points` (x, y, z), e.g. a wedge or a tapered body."""
        bm = bmesh.new()
        for p in points:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts[:])
        bmesh.ops.dissolve_limit(bm, angle_limit=0.002, verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        self.scene.collection.objects.link(obj)
        self._activate(obj)
        return self._finish(obj, name, location, mat, parent, bevel)

    @staticmethod
    def loft(profile):
        """(y, z, half_width) triples -> mirrored 3D points for `solid`."""
        return [(sx * hw, y, z) for y, z, hw in profile for sx in (-1, 1)]

    @staticmethod
    def extrude(profile, half_width):
        """(y, z) side profile extruded to +-half_width -> points for `solid`."""
        return Model.loft([(y, z, half_width) for y, z in profile])

    # -- hierarchy --------------------------------------------------------------------------
    def join_children(self, parent, name):
        """Join the direct mesh children of `parent` into one mesh called `name`."""
        meshes = [o for o in parent.children if o.type == 'MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = name
        meshes[0].data.name = name

    def wheel(self, name, center, radius, width, parent=None, hub=0.5):
        """A wheel pivot at its axle with one joined tyre-and-hub mesh; axle runs along X."""
        side = 1 if center[0] > 0 else -1
        pivot = self.pivot(name, center, parent or self.root)
        self.cylinder('Tyre', (0, 0, 0), radius, width, 'Rubber', pivot, (0, HALF_PI, 0),
                      bevel=width * 0.3, vertices=20)
        self.cylinder('Hub', (side * width * 0.5, 0, 0), radius * hub, 0.05, 'BaseArmorLight',
                      pivot, (0, HALF_PI, 0), vertices=14)
        self.cylinder('HubCap', (side * (width * 0.5 + 0.03), 0, 0), radius * hub * 0.4, 0.04,
                      'ExposedSteel', pivot, (0, HALF_PI, 0), vertices=10)
        self.join_children(pivot, f'{name}Mesh')
        return pivot

    # -- export and preview -----------------------------------------------------------------
    def export_and_preview(self, camera_location, camera_target, ortho_scale, light_scale=1.0):
        scene, out, slug = self.scene, self.out, self.slug
        bpy.ops.object.select_all(action='DESELECT')
        for obj in scene.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(out / f'{slug}.glb'), export_format='GLB',
                                  use_selection=True, use_active_scene=True, export_yup=True)

        # Studio items are added after export and are not included in the game asset.
        ground = make_material('Studio floor', (0.065, 0.085, 0.11), 0, 0.85)
        bpy.ops.mesh.primitive_cube_add()
        floor = bpy.context.object
        floor.dimensions = (200, 200, 0.1)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        floor.name = 'StudioGround'
        floor.location = (0, 0, -0.05)
        floor.data.materials.append(ground)
        world = bpy.data.worlds.new('Studio World')
        scene.world = world
        world.use_nodes = True
        world.node_tree.nodes.clear()
        background = world.node_tree.nodes.new('ShaderNodeBackground')
        world_output = world.node_tree.nodes.new('ShaderNodeOutputWorld')
        world.node_tree.links.new(background.outputs[0], world_output.inputs['Surface'])
        background.inputs[0].default_value = (0.2, 0.25, 0.32, 1)
        background.inputs[1].default_value = 0.4
        target = Vector(camera_target)
        for name, location, energy, size, color in (
            ('Key', (3, -5, 8), 1500, 5, (1, 0.89, 0.74)),
            ('Fill', (-5, -1, 4), 1100, 5, (0.65, 0.82, 1)),
            ('Rim', (1, 5, 6), 1800, 4, (0.7, 0.9, 1)),
        ):
            data = bpy.data.lights.new(name, 'AREA')
            data.energy, data.shape, data.size, data.color = energy * light_scale, 'DISK', size, color
            obj = bpy.data.objects.new(name, data)
            scene.collection.objects.link(obj)
            obj.location = location
            obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data = bpy.data.cameras.new('PreviewCamera')
        camera = bpy.data.objects.new('PreviewCamera', camera_data)
        scene.collection.objects.link(camera)
        camera.location = camera_location
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data.type, camera_data.ortho_scale = 'ORTHO', ortho_scale
        scene.camera = camera
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 32
        scene.cycles.use_denoising = True
        scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(out / 'preview.png')
        # Save only this generated scene, leaving any user's open document untouched.
        bpy.data.libraries.write(str(out / f'{slug}.blend'), {scene}, fake_user=True)
        bpy.ops.render.render(write_still=True)
        print(f'Created model, Blender scene and preview in {out}')
