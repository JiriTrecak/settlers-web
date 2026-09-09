"""Ant revival sanctuary. Original architecture; hall reference supplies faction palette/material language."""
import bpy,bmesh,math,json,random,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Use a separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];rng=random.Random(41)
scene=bpy.context.scene
art=bpy.data.collections.new('Sanctuary');scene.collection.children.link(art)
studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
def material(name,key,f=1,metal=0,rough=.75):
 rgb=[min(1,v*f) for v in P[key]['representative']['linear_rgb']];m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1);b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
wood=material('Warm heartwood','timber',1.3);root=material('Structural roots','root_gold',.85);stone=material('Sanctuary stone','stone_light',.8)
iron=material('Forged iron','iron',.8,.7,.38);edge=material('Worn silver edge','iron_edge',.95,.65,.34)
red=[material('Red carapace tile '+str(i),'roof_red',f) for i,f in enumerate([.7,.95,1.15])]
team=material('TC_TeamColor','banner');rgb=(.3515,.07036,.03071);team.diffuse_color=(*rgb,1);team.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*rgb,1)
amber=material('Living amber','root_light',1.4,0,.3);b=amber.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(.9,.28,.018,1);b.inputs['Emission Color'].default_value=(1,.24,.012,1);b.inputs['Emission Strength'].default_value=.35
moss=material('Moss seams','root_shadow',.45);moss.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.09,.125,.028,1)
def assign(ob,m):
 for col in list(ob.users_collection):col.objects.unlink(ob)
 art.objects.link(ob);ob.data.materials.append(m);return ob

def box(name,pos,scale,m,bevel=.05):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);assign(o,m)
 if bevel:b=o.modifiers.new('Worn edges','BEVEL');b.width=bevel;b.segments=1;o.modifiers.new('Normals','WEIGHTED_NORMAL')
 return o

def tube(name,points,radii,m,sides=8):
 vs=[];fs=[]
 for i,(p,r) in enumerate(zip(points,radii)):
  axis=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u)
  for j in range(sides):vs.append(tuple(Vector(p)+r*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides))))
 fs=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
 for i in range(len(points)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);art.objects.link(o);me.materials.append(m);return o

def crystal(name,pos,scale,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;assign(o,m);return o
# Broad material variation is baked into export vertex colors, without extra decals.
for material in [wood,root,stone,*red]:
 nodes=material.node_tree.nodes;links=material.node_tree.links;base=material.diffuse_color[:3]
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3;noise.inputs['Detail'].default_value=2
 coord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,2,.3) if material in [wood,root] else (1,1,1)
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*[v*.65 for v in base],1);ramp.color_ramp.elements[1].color=(*[min(1,v*1.2) for v in base],1)
 links.new(coord.outputs['Generated'],mapping.inputs[0]);links.new(mapping.outputs[0],noise.inputs[0]);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
# Low octagonal dais, individual dressed blocks, open front steps.
for ring,radius,z in [(0,2.4,.18),(1,2.15,.46)]:
 for i in range(12):
  a=i*math.tau/12;o=box('Dais block', (math.cos(a)*radius,math.sin(a)*radius,z),(1.18,.68,.32),stone,.07);o.rotation_euler.z=a+math.pi/2
box('Flagstone floor',(0,0,.43),(3.8,3.8,.22),stone,.12)
for i in range(3):box('Front stair',(0,-2.2-i*.4,.38-i*.10),(2.3,.52,.28),stone,.06)
for i in range(8):
 a=i*math.tau/8
 if math.sin(a)<-.8:continue
 tube('Root anchorage',[(math.cos(a)*1.65,math.sin(a)*1.65,.9),(math.cos(a)*2.2,math.sin(a)*2.2,.45),(math.cos(a)*3.25,math.sin(a)*3.25,.05)],[.35,.28,.03],root)
# Four heavy timber pillars with iron collars supporting the open shrine.
for x in [-1.85,1.85]:
 for y in [-1.25,1.25]:
  tube('Timber pillar',[(x,y,.6),(x*.98,y,3.2)],[.24,.20],wood,10)
  for z in [.85,2.8]:box('Iron pillar collar',(x,y,z),(.5,.5,.18),iron,.03)
  crystal('Silver finial',(x,y,3.45),(.2,.2,.42),edge)
# Two flanking curved tile canopies leave the central amber cocoon exposed.
for side in [-1,1]:
 for row in range(5):
  x=side*(.65+row*.32);z=3.5-.14*row-.025*row*row
  for col in range(5):
   o=box('Overlapping carapace tile',(x,-1.35+col*.66,z),(.43,.71,.16),red[(row+col)%3],.05);o.rotation_euler.y=side*(.25+row*.08)
 for y in [-1.6,1.6]:
  points=[(side*(.55+i*.35),y,3.66-i*.14-i*i*.025) for i in range(6)];tube('Canopy silver binding',points,[.075]*6,edge,6)
 for y in [-1.6,1.6]:
  for i in range(5):crystal('Canopy rivet',(side*(.65+i*.32),y,3.7-.14*i-.025*i*i),(.055,.055,.045),edge)
 tube('Canopy ridge',[(side*.55,-1.75,3.64),(side*.55,1.75,3.64)],[.12,.12],iron)
# Large readable amber seed, cupped by mandible-like metal ribs.
box('Amber pedestal',(0,0,.78),(1.2,1.2,.55),iron,.12)
crystal('Sacred amber cocoon',(0,0,2.35),(.8,.75,1.25),amber)
for i in range(4):
 a=i*math.pi/2+math.pi/4;c=math.cos(a);s=math.sin(a)
 tube('Mandible cradle',[(c*.6,s*.6,.95),(c*.95,s*.95,1.8),(c*.88,s*.88,2.8),(c*.35,s*.35,3.7)],[.16,.17,.12,.015],edge,8)
# Rear arch and hanging ownership banner, clear from the approach.
for side in [-1,1]:tube('Root arch',[(side*1.3,1.6,.5),(side*1.35,1.6,2.9),(side*.65,1.6,4.3),(0,1.6,4.7)],[.28,.25,.2,.14],wood)
tube('Banner pole',[(1.9,-1.5,.6),(1.9,-1.5,4.4)],[.07,.07],iron)
box('Banner crossbar',(2.25,-1.5,4.25),(.85,.10,.10),edge,.02)
# Subdivided cloth provides real fold shading while retaining plain team color.
v=[];f=[]
for r in range(7):
 for c in range(5):v.append((1.92+c*.16,-1.52+math.sin(c*.9+r*.6)*.065,4.15-r*.17-(.08 if r==6 and c%2 else 0)))
for r in range(6):
 for c in range(4):i=r*5+c;f.append((i,i+1,i+6,i+5))
me=bpy.data.meshes.new('Ownership cloth');me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new('Ownership cloth',me);art.objects.link(o);me.materials.append(team)
for x in [-1.3,1.3]:
 tube('Brazier post',[(x,-2,.45),(x,-2,1.25)],[.11,.12],wood)
 crystal('Brazier bowl',(x,-2,1.28),(.25,.25,.16),iron);crystal('Amber brazier',(x,-2,1.55),(.15,.15,.38),amber)
for i in range(18):
 a=rng.random()*math.tau;r=rng.uniform(2.2,2.8);crystal('Moss at stone joints',(math.cos(a)*r,math.sin(a)*r,.21),(.24,.17,.06),moss)
create_stage(C,studio)
scene['source_note']='Original revival shrine; Rootbound Hall reference used for faction palette and construction language. Architecture and all hidden surfaces are inferred.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'materials':len(bpy.data.materials)},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
