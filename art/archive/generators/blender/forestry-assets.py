"""Original chunky forestry set. Geometry, UV-free materials and export authored in Blender."""
import bpy,math,os,random
from mathutils import Vector
ROOT='/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/props/settlement'
random.seed(46)
name='UTC Fort and Forestry'
old=bpy.data.collections.get(name)
if old:
 for o in list(old.all_objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
def material(name,hex):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 c=[int(hex[i:i+2],16)/255 for i in (0,2,4)];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
 m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1)
 m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
 return m
wood=[material('UTC Forestry timber '+str(i),h) for i,h in enumerate(['855032','9e643d','b77b49','714731'])]
cut=material('UTC Forestry cut end','d5b77a');grain=material('UTC Forestry growth rings','aa8752');dark=material('UTC Forestry recess','333f37');metal=material('UTC Forestry iron','596e76');edge=material('UTC Forestry steel edge','b7cece');dirt=material('UTC Forestry soil','60482f');leaf=material('UTC Forestry leaves','5e9141');pine=material('UTC Forestry pine','246849');team=material('UTC Team color','49a4d8');roof=[material('UTC Forestry roof '+str(i),h) for i,h in enumerate(['b86e42','cc8550','a3613d'])];green=[material('UTC Forestry moss roof '+str(i),h) for i,h in enumerate(['728746','83964d','607540'])];stone=[material('UTC Fort stone '+str(i),h) for i,h in enumerate(['9aa59d','aeb5a4','8a9894','b9bfac'])]
objects=[]
def own(o,m,label):
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.name=label
 if m:o.data.materials.append(m)
 objects.append(o);return o
def box(label,loc,size,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=own(bpy.context.object,m,label);o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Broad worn edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cyl(label,loc,r,depth,m,axis='Z',vertices=8,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc);o=own(bpy.context.object,m,label)
 if axis=='X':o.rotation_euler.y=math.pi/2
 if axis=='Y':o.rotation_euler.x=math.pi/2
 return o
def beam(label,a,b,width,m):
 a,b=Vector(a),Vector(b);o=box(label,(a+b)/2,(width,width,(b-a).length),m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def log(loc,length=.95,r=.2,axis='X',rings=True):
 o=cyl('Faceted bark',loc,r,length,wood[0],axis)
 v={'X':Vector((1,0,0)),'Y':Vector((0,1,0)),'Z':Vector((0,0,1))}[axis]
 for sign in [-1,1]:
  end=Vector(loc)+v*(length/2+.007)*sign;cyl('Honey cut end',end,r*.89,.018,cut,axis)
  if rings:
   cyl('Growth ring',end+v*.012*sign,r*.58,.012,grain,axis);cyl('Heartwood',end+v*.021*sign,r*.43,.012,cut,axis)
 return o
def flag(x,y,z):
 cyl('Flagstaff',(x,y,z+.65),.06,1.3,wood[0]);box('Player pennant',(x+.34,y,z+1.04),(.68,.035,.36),team)
def window(x,y,z):
 box('Deep window',(x,y,z),(.62,.07,.62),dark)
 for dx in [-.35,.35]:box('Window jamb',(x+dx,y-.05,z),(.09,.1,.8),wood[1])
 for dz in [-.36,.36]:box('Window sill',(x,y-.07,z+dz),(.82,.14,.09),wood[2])
 box('Window cross',(x,y-.08,z),(.06,.08,.63),wood[2])
def cabin(width=3.8,depth=2.8):
 for row in range(6):
  z=.4+row*.38
  for x in [-width/2,width/2]:log((x,0,z),depth+.4,.23,'Y',True)
  for x in [-width/2+.5,width/2-.5]:log((x,-depth/2,z),.8,.22,'X',False)
  log((0,depth/2,z),width+.2,.23,'X',False)
 box('Door shadow',(0,-depth/2+.1,1.1),(1.1,.2,1.95),dark)
 for x in [-.6,.6]:box('Door post',(x,-depth/2-.1,1.13),(.17,.2,2.1),wood[1])
 box('Door lintel',(0,-depth/2-.1,2.2),(1.4,.2,.18),wood[2])
 window(-1.25,-depth/2-.22,1.4)
def gable(width,depth,eave,peak,palette):
 half=width/2;slope=math.atan2(peak-eave,half);length=math.hypot(half,peak-eave)
 for side in [-1,1]:
  for j in range(9):
   y=-depth/2+(j+.5)*depth/9
   o=box('Individual roof plank',(side*half/2,y,(eave+peak)/2),(length+.12,depth/9+.025,.13),palette[j%len(palette)],.025);o.rotation_euler.y=side*slope
  for y in [-depth/2+.08,depth/2-.08]:beam('Roof end trim',(0,y,peak+.06),(side*half,y,eave+.06),.16,wood[0])
 box('Ridge cap',(0,0,peak+.12),(.22,depth+.24,.2),wood[0],.03)
def base(width,depth):box('Low stone footings',(0,0,.12),(width,depth,.24),stone[2],.1)
def root_export(kind,offset):
 root=bpy.data.objects.new(kind,None);collection.objects.link(root)
 for o in objects:o.parent=root
 # Merge temporary copies for a handful of material draw calls; keep editable source parts.
 bpy.ops.object.select_all(action='DESELECT');copies=[]
 for o in objects:
  duplicate=o.copy();duplicate.data=o.data.copy();collection.objects.link(duplicate);duplicate.parent=None;duplicate.matrix_world=o.matrix_world.copy();duplicate.select_set(True);copies.append(duplicate)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name=kind+' game mesh'
 bpy.ops.export_scene.gltf(filepath=ROOT+'/'+kind+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
 bpy.data.objects.remove(merged,do_unlink=True)
 root.location=offset
 print(kind, len(objects),'parts',sum(len(o.data.polygons) for o in objects if o.type=='MESH'),'faces')
# A single resource per file; stockpiles are assembled by the game.
objects=[];log((0,0,.21),1.15,.21,'X');root_export('item-log',(-10,-12,0))
objects=[];box('Sawn plank',(0,0,.095),(1.2,.35,.19),wood[2],.035)
for y in [-.09,.08]:box('Long wood grain',(0,y,.193),(.85,.012,.004),wood[1])
root_export('item-plank',(-7,-12,0))
objects=[];box('Dressed stone',(0,0,.29),(.65,.6,.58),stone[1],.08);box('Chisel mark',(.05,-.303,.25),(.23,.01,.025),stone[2]);root_export('item-stone',(-4,-12,0))
# Fort: short and broad, with open courtyard, gate towers and raised rear keep.
objects=[];base(8.5,7.4)
box('Courtyard paving',(0,0,.32),(7.8,6.7,.4),stone[1],.1)
def wall(cx,cy,w,d,height):
 for row in range(round(height/.65)):
  count=max(1,round(w/.9))
  for i in range(count):box('Ashlar masonry',(cx-w/2+(i+.5)*w/count,cy,.65+row*.65),(w/count-.045,d,.61),stone[(row+i)%4],.045)
 for i in range(max(2,round(w/.95))):
  xx=cx-w/2+(i+.5)*w/max(2,round(w/.95));box('Broad merlon',(xx,cy,height+.9),(.56,d+.08,.6),stone[(i+1)%4],.06)
 box('Parapet coping',(cx,cy,height+.48),(w+.1,d+.12,.23),stone[1],.04)
wall(0,2.8,7.3,.75,3.25)
for x in [-3.55,3.55]:
 # Side walls use segmented blocks with visible courses.
 for row in range(5):
  for j in range(7):box('Side masonry',(x,-2.7+j*.87,.65+row*.65),(.75,.82,.61),stone[(row+j)%4],.045)
 for j in range(7):box('Side battlements',(x,-2.7+j*.87,4.1),(.83,.52,.65),stone[1],.05)
 box('Team wall ribbon',(x+(.39 if x>0 else -.39),0,2.25),(.06,5.9,.23),team)
for x in [-2.7,2.7]:
 for row in range(7):cyl('Octagonal gate tower',(x,-2.25,.65+row*.58),1.1,.55,stone[row%4],vertices=8)
 cyl('Tower crown',(x,-2.25,4.75),1.22,.26,stone[1],vertices=8)
 for j in range(8):
  a=j*math.pi/4;box('Tower crenel',(x+math.cos(a)*.93,-2.25+math.sin(a)*.93,5.16),(.49,.49,.62),stone[j%4],.055)
 cyl('Blue tower band',(x,-2.25,2.5),1.115,.24,team,vertices=8)
 # Dark slit clearly reads as a defended fort.
 box('Arrow slit',(x,-3.32,3.25),(.16,.035,.7),dark)
wall(0,-2.9,3.1,.7,2.6)
box('Deep gate opening',(0,-3.29,1.35),(1.8,.08,2.15),dark)
for x in [-.95,.95]:box('Gate jamb',(x,-3.36,1.36),(.28,.25,2.3),stone[1],.045)
for j in range(6):box('Gate iron bars',(-.7+j*.28,-3.39,1.5),(.055,.05,1.7),metal)
box('Gate lintel',(0,-3.39,2.58),(2.18,.3,.32),stone[1],.055)
for j in range(6):box('Entrance timber ramp',(0,-3.6-j*.12,.28-j*.022),(1.75,.14,.13),wood[j%4],.02)
box('Raised rear keep',(0,1.55,2.2),(3.6,2.45,3.7),stone[2],.08)
wall(0,.25,3.6,.35,4.55);flag(0,1.6,5.0)
root_export('fort',(-8,5,0))
# Lumberjack: recognizable stacked log ends, warm pitched roof and splitting block.
objects=[];base(5.8,4.0);cabin();gable(4.8,3.8,2.4,4.1,roof)
for y in [-.6,.6]:beam('Cabin side brace',(2,y,1),(2,y+.45,2.05),.13,wood[2])
log((2.25,-1.8,.45),.9,.43,'Z');beam('Axe handle',(2.15,-1.8,.65),(2.4,-1.8,1.6),.1,wood[2]);box('Axe wedge',(2.56,-1.8,1.5),(.45,.12,.34),edge,.025)
box('Crossed axes sign',(0,-1.72,2.4),(.74,.14,.52),wood[0]);beam('Sign haft A',(-.22,-1.82,2.2),(.22,-1.82,2.61),.065,cut);beam('Sign haft B',(.22,-1.82,2.2),(-.22,-1.82,2.61),.065,cut);flag(.25,.55,4.08)
root_export('lumberjack',(3,6,0))
# Sawmill: open saw bay and oversized wheel, independent of a river.
objects=[];base(7.1,5.8)
for x in [-1.8,1.8]:
 for y in [-1.7,1.4]:box('Mill structural post',(x,y,1.8),(.25,.25,3.5),wood[0],.04)
for row in range(7):box('Rear plank wall',(0,1.4,.48+row*.42),(3.8,.18,.39),wood[row%4],.025)
gable(4.5,3.8,3.3,4.35,roof)
box('Saw table',(0,-.5,1.2),(2.8,1.6,.24),wood[1],.035)
for x in [-1.1,1.1]:box('Saw table trestle',(x,-.5,.72),(.22,1.2,.85),wood[0])
# Obvious exposed blade with coarse teeth around its edge.
cyl('Saw blade',(0,-.4,1.52),.61,.08,edge,'Y',16)
for j in range(12):
 a=j*math.tau/12;o=box('Saw tooth',(.64*math.cos(a),-.4,1.52+.64*math.sin(a)),(.16,.1,.16),edge);o.rotation_euler.y=-a
# Eight-spoke wooden drive wheel on the side, a bold RTS silhouette.
for side in [-1,1]:
 x=2.65+side*.23
 for j in range(12):
  a=j*math.tau/12;b=(j+1)*math.tau/12;beam('Wheel rim',(x,.1+1.45*math.cos(a),1.75+1.45*math.sin(a)),(x,.1+1.45*math.cos(b),1.75+1.45*math.sin(b)),.24,wood[0])
for j in range(8):
 a=j*math.tau/8;beam('Wheel spoke',(2.65,.1,1.75),(2.65,.1+1.4*math.cos(a),1.75+1.4*math.sin(a)),.16,wood[2]);o=box('Wheel paddle',(2.65,.1+1.48*math.cos(a),1.75+1.48*math.sin(a)),(.85,.34,.13),wood[1]);o.rotation_euler.x=a
cyl('Iron wheel hub',(2.65,.1,1.75),.25,1.3,metal,'X');flag(-1.3,.8,4.0)
root_export('sawmill',(-8,-5,0))
# Forester: low green roof, nursery trays, spade and sapling emblem.
objects=[];base(5.9,4.4);cabin(3.3,2.7);gable(4.25,3.5,2.4,3.7,green)
for x in [-1.5,1.5]:
 box('Nursery tray',(x,-2,.35),(.8,.65,.25),wood[1],.03);box('Seedling soil',(x,-2,.49),(.69,.53,.03),dirt)
 for dx in [-.2,.2]:
  cyl('Sapling stem',(x+dx,-2,.73),.035,.45,wood[1]);cyl('Sapling crown',(x+dx,-2,1.02),.2,.42,pine,vertices=6,r2=0)
beam('Spade haft',(2,-.9,.3),(2.2,-.9,1.65),.08,wood[2]);box('Spade blade',(2,-.9,.38),(.36,.09,.43),metal,.06)
box('Nursery emblem backing',(0,-1.62,2.4),(.75,.12,.5),wood[0]);cyl('Pine emblem',(0,-1.71,2.47),.23,.4,leaf,vertices=3,r2=0)
flag(.4,.55,3.7);root_export('forester',(3,-4,0))
# Illustrative piles belong to the study, never baked into building exports.
for kind,cx,cy in [('log',3,2.7),('plank',-8,-9.3),('stone',-8,.6)]:
 for i in range(16):
  slot=i%4;layer=i//4;x=cx+(-1.4 if slot%2==0 else 1.4);y=cy-(slot//2)*.6
  if kind=='log':log((x,y,.21+layer*.42),1.15,.21,'X')
  elif kind=='plank':box('Study stacked plank',(x,y,.095+layer*.19),(1.2,.35,.19),wood[2],.035)
  else:
   local=i//2;x=cx+(-1.4 if i%2==0 else 1.4)+(local%2-.5)*.68;y=cy-((local//2)%2)*.65
   box('Study stacked stone',(x,y,.29+(local//4)*.58),(.65,.6,.58),stone[1],.08)
# Save an editable Blender collection arranged for inspection, without touching other artwork.

for c in bpy.context.scene.collection.children:
 if c!=collection:c.hide_render=True
world=bpy.data.worlds.new('UTC Forestry Studio') if not bpy.data.worlds.get('UTC Forestry Studio') else bpy.data.worlds['UTC Forestry Studio'];bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.3,.32,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55
bpy.ops.object.light_add(type='AREA',location=(-6,-10,22));light=bpy.context.object;light.name='UTC Forestry Studio key';
for c in list(light.users_collection):c.objects.unlink(light)
collection.objects.link(light)
light.data.energy=5000;light.data.shape='DISK';light.data.size=12;light.rotation_euler=(Vector((-3,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(23,-34,29));cam=bpy.context.object;cam.name='UTC Forestry Studio camera';cam.rotation_euler=(Vector((-3,-1,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=29;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.render.filepath=ROOT+'/forestry-preview.png';scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [e.identifier for e in scene.view_settings.bl_rna.properties['look'].enum_items] else scene.view_settings.look;
bpy.ops.object.light_add(type='SUN',location=(0,0,12));sun=bpy.context.object
for c in list(sun.users_collection):c.objects.unlink(sun)
collection.objects.link(sun);sun.data.energy=2;sun.rotation_euler=(.45,-.35,-.4)
bpy.ops.render.render(write_still=True)
# Keep the new set selected for the user's Blender inspection.
bpy.ops.object.select_all(action='DESELECT')
for o in collection.objects:o.select_set(True)
print('Fort and forestry set exported and rendered')

# A background authoring run owns its whole scene and can safely save a standalone file.
# In an interactive MCP session keep other user scenes out of the exported library.
if bpy.app.background:
 bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/Fort-Forestry-source.blend',copy=True)
else:
 bpy.data.libraries.write(ROOT+'/Fort-Forestry-library.blend',{collection},compress=True)
print('Saved editable fort and forestry source')
