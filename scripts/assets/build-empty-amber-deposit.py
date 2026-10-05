"""Author a separate, editable exhausted seam after Tripo stopped accepting credits.

The three painted amber-bearing stages come from distinct Tripo generations. This
final earth-only state is deliberately independent geometry/material, with the
same 6.6 m footprint and no remapped amber UVs.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

randomizer = random.Random(913)
work = Path.cwd() / '.asset-work/build/resources/amber-deposit-empty-v2'
work.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, color, rough=0.93):
    material=bpy.data.materials.new(name)
    material.diffuse_color=(*color,1)
    material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=rough
    return material

earth=[mat('Painted woodland loam',(.5,.5,.5))]
soil_image=bpy.data.images.load(str(work/'soil-albedo.png'))
soil_image.pack()
soil_node=earth[0].node_tree.nodes.new('ShaderNodeTexImage')
soil_node.image=soil_image
earth[0].node_tree.links.new(soil_node.outputs['Color'],earth[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'])
stone=[mat('Stone',(.32,.293,.245))]
moss=[mat('Moss',(.26,.31,.105))]
leaf=[mat('Fallen leaves',(.36,.225,.085))]

parts=[]
segments=72
rings=13
verts=[]
faces=[]
materials=[]
craters=[(-.10,.25,1.20,1.0),(-1.47,-.87,.72,.68),(1.48,-.80,.63,.6)]
def height(x,y):
    radius=math.hypot(x,y)
    h=.17+.11*math.exp(-((radius-2.18)/.75)**2)
    h+=.075*math.sin(x*3.5+y*2.4)*math.cos(y*4.9-x*.8)
    for cx,cy,s,d in craters:
        r=math.hypot((x-cx)/s,(y-cy)/s)
        h+=.25*math.exp(-((r-1.05)/.25)**2)*d
        h-=.19*math.exp(-(r/.75)**4)*d
    return max(.025,h)
for ring in range(rings+1):
    rr=.04+(3.28-.04)*ring/rings
    for segment in range(segments):
        angle=2*math.pi*segment/segments
        rad=rr*(1+.035*math.sin(angle*7)+.024*math.sin(angle*13+1.3))
        x=rad*math.cos(angle);y=rad*math.sin(angle)
        verts.append((x,y,height(x,y)*(1-.93*max(0,(rad-2.8)/.48))))
for ring in range(rings):
    for segment in range(segments):
        a=ring*segments+segment;b=ring*segments+(segment+1)%segments
        c=(ring+1)*segments+segment;d=(ring+1)*segments+(segment+1)%segments
        faces.extend([(a,c,b),(b,c,d)])
        materials.extend((0,0))
mesh=bpy.data.meshes.new('Three excavated pockets');mesh.from_pydata(verts,[],faces);mesh.update()
uv_layer=mesh.uv_layers.new(name='Painted soil UV')
for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
        vertex=mesh.vertices[mesh.loops[loop_index].vertex_index].co
        uv_layer.data[loop_index].uv=((vertex.x+3.35)/6.7,(vertex.y+3.35)/6.7)
obj=bpy.data.objects.new('Excavated earth and empty amber sockets',mesh)
bpy.context.collection.objects.link(obj)
for material in earth:mesh.materials.append(material)
for polygon,index in zip(mesh.polygons,materials):polygon.material_index=index
parts.append(obj)

def pebble(x,y,z,scale,material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,z))
    o=bpy.context.object;o.name='Pebble';o.scale=(scale,scale*.72,scale*.48)
    o.data.materials.append(material);parts.append(o)

for i in range(55):
    a=randomizer.random()*math.tau;r=2.15+1.12*randomizer.random()
    x=r*math.cos(a);y=r*math.sin(a)
    size=randomizer.uniform(.045,.16)
    pebble(x,y,height(x,y)+size*.18,size,randomizer.choice(stone if i%3==0 else earth))

# Broad painted leaf/moss shapes soften the edge but leave the three sockets readable.
for i in range(95):
    a=randomizer.random()*math.tau;r=2.15+1.03*randomizer.random()
    x=r*math.cos(a);y=r*math.sin(a)
    z=height(x,y)+.018
    length=randomizer.uniform(.09,.28);width=length*randomizer.uniform(.30,.55)
    direction=a+randomizer.uniform(-1.2,1.2)
    dx=math.cos(direction);dy=math.sin(direction)
    px=-dy;py=dx
    vv=[(x-dx*length*.48,y-dy*length*.48,z),
        (x+px*width*.5,y+py*width*.5,z+.012),
        (x+dx*length*.58,y+dy*length*.58,z+.025),
        (x-px*width*.5,y-py*width*.5,z+.012)]
    mm=bpy.data.meshes.new('leaf');mm.from_pydata(vv,[],[(0,1,2),(0,2,3)]);mm.update()
    mm.materials.append(randomizer.choice(moss if i%4 else leaf))
    oo=bpy.data.objects.new('Fallen leaf or low moss',mm)
    bpy.context.collection.objects.link(oo);parts.append(oo)

# Keep a single runtime draw with material groups; the .blend stays editable.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=obj
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
obj=bpy.context.view_layer.objects.active
obj.name='amber_deposit_empty'
bpy.ops.wm.save_as_mainfile(filepath=str(work/'source.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(work/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)

scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=scene.render.resolution_y=768
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
world=bpy.data.worlds.new('Preview world');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.035,.04,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.world=world
camera_data=bpy.data.cameras.new('Preview camera')
camera=bpy.data.objects.new('Preview camera',camera_data);scene.collection.objects.link(camera)
camera.location=(9.6,-10.7,9.8)
camera.rotation_euler=(Vector((0,0,.18))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=10.9;scene.camera=camera
sun_data=bpy.data.lights.new('Preview sun','SUN');sun_data.energy=3
sun=bpy.data.objects.new('Preview sun',sun_data);scene.collection.objects.link(sun)
sun.rotation_euler=(math.radians(30),math.radians(-20),math.radians(35))
scene.render.filepath=str(work/'render.png');bpy.ops.render.render(write_still=True)
print('Amber empty triangles',sum(len(p.vertices)-2 for p in obj.data.polygons))
