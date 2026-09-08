"""Shared orthographic black studio, also used when rendering saved manual Blender edits."""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def camera_view(scene, config, azimuth=None, elevation=None):
    c = config['camera']
    az = math.radians(c['azimuth'] if azimuth is None else azimuth)
    el = math.radians(c['elevation'] if elevation is None else elevation)
    target = Vector(c['target'])
    cam = scene.camera
    cam.location = target + Vector((math.sin(az)*math.cos(el), -math.cos(az)*math.cos(el), math.sin(el))) * 20
    aim(cam, target)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = c['scale']


def create_stage(config, collection):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Studio · pure black background')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0
    scene.world = world
    camera = bpy.data.objects.new('Reference camera', bpy.data.cameras.new('Reference orthographic lens'))
    collection.objects.link(camera)
    scene.camera = camera
    camera_view(scene, config)
    lights = [('Warm key', (-3, -4, 8), config['light']['key_energy'], 5.0, (1, .84, .67)),
              ('Soft front fill', (1, -6, 5), config['light']['fill_energy'], 6, (.78, .84, 1)),
              ('Amber right rim', (5, 3, 7), config['light']['rim_energy'], 4, (1, .74, .47))]
    for name, position, energy, size, color in lights:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
        light = bpy.data.objects.new(name, data)
        collection.objects.link(light)
        light.location = position
        aim(light, (0, 0, 1.8))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = config['render']['samples']
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x = config['render']['width']
    scene.render.resolution_y = config['render']['height']
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    return scene
