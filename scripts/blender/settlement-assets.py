"""Simple original RTS models. Only replaces our own collection and outputs."""
import bpy,math,os
ROOT='/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/props/settlement'
os.makedirs(ROOT,exist_ok=True)
name='UTC Settlement Prototype'
old=bpy.data.collections.get(name)
if old:
 for o in list(old.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
def mat(name,color):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 c=[int(color[i:i+2],16)/255 for i in (0,2,4)];c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
 m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*c,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.88;return m
wood=mat('UTC Settlement timber','805c3b');plaster=mat('UTC Settlement plaster','e9dcae');roof=mat('UTC Settlement roof','9c513b');stone=mat('UTC Settlement stone','899c98');team=mat('UTC Team color','4da8dd');skin=mat('UTC Settler skin','dba97e');pants=mat('UTC Settler trousers','594f42');metal=mat('UTC Tools','8cabae')
objects=[]
def own(o,m,label):
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.name=label;o.data.materials.append(m);objects.append(o);return o
def box(label,loc,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=own(bpy.context.object,m,label);o.scale=size;return o
def cone(label,loc,r1,r2,depth,m,vertices=8):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc);return own(bpy.context.object,m,label)
def mesh(label,vs,faces,m):
 g=bpy.data.meshes.new(label);g.from_pydata(vs,[],faces);g.update();o=bpy.data.objects.new(label,g);collection.objects.link(o);o.data.materials.append(m);objects.append(o);return o
def export(label):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bpy.ops.export_scene.gltf(filepath=ROOT+'/'+label+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
for kind in ['tower','lumberjack','stonemason','house']:
 objects=[]
 box('Foundation',(0,0,.2),(4.4,4,.4),stone)
 if kind=='tower':
  box('Tower walls',(0,0,2.6),(2.5,2.5,4.8),plaster)
  for x in [-1.3,1.3]:
   for y in [-1.3,1.3]:box('Tower timber',(x,y,2.8),(.22,.22,5.2),wood)
  box('Lookout deck',(0,0,5.0),(3.5,3.5,.35),wood)
  for x,y,sx,sy in [(0,-1.6,3.4,.18),(0,1.6,3.4,.18),(-1.6,0,.18,3.4),(1.6,0,.18,3.4)]:box('Lookout rail',(x,y,5.6),(sx,sy,.75),wood)
  cone('Tower roof',(0,0,6.8),2.8,0,2.3,roof,4).rotation_euler.z=math.pi/4
  box('Flag pole',(0,0,8.1),(.08,.08,1.8),wood);box('Player flag',(.45,0,8.6),(.85,.07,.5),team)
  box('Door',(0,-1.265,1.1),(.7,.04,1.7),wood)
 else:
  box('Plaster walls',(0,0,1.25),(3.5,3,1.9),plaster)
  for x in [-1.75,1.75]:
   for y in [-1.5,1.5]:box('Corner timber',(x,y,1.35),(.15,.15,2.1),wood)
  mesh('Gabled roof',[(-2,-1.9,2.3),(2,-1.9,2.3),(-2,1.9,2.3),(2,1.9,2.3),(0,-1.9,3.5),(0,1.9,3.5)],[(0,4,5,2),(4,1,3,5),(0,1,4),(2,5,3)],roof)
  box('Door',(0,-1.52,1),(.65,.05,1.5),wood);box('Player sign',(0,-1.57,2),(.65,.06,.35),team)
  for x in [-1.1,1.1]:box('Window',(x,-1.52,1.5),(.55,.05,.55),wood)
  if kind=='lumberjack':
   for j in range(4):cone('Stacked logs',(-1.3+j*.7,-2.1,.4),.24,.24,1.1,wood,7).rotation_euler.x=math.pi/2
   box('Axe haft',(1.6,-2,.95),(.09,.09,1.1),wood);box('Axe head',(1.78,-2,1.4),(.4,.12,.3),metal)
  if kind=='stonemason':
   box('Work bench',(1.6,-2,.7),(.9,.65,.25),wood)
   for j in range(3):cone('Cut stone',(-1.5+j*.55,-2,.35),.35,.3,.6,stone,5)
  if kind=='house':box('Chimney',(1,.6,3.25),(.55,.55,1.6),stone)
 export(kind)
objects=[]
for x in [-.17,.17]:
 box('Leg L' if x<0 else 'Leg R',(x,0,.35),(.22,.27,.65),pants)
 box('Boot',(x,-.08,.09),(.25,.42,.18),wood)
cone('Body',(0,0,.95),.35,.28,.75,team,8)
for x in [-.43,.43]:box('Arm L' if x<0 else 'Arm R',(x,0,.99),(.18,.22,.62),skin)
cone('Head',(0,0,1.57),.24,.22,.43,skin,8)
cone('Hat brim',(0,0,1.80),.33,.33,.07,wood,10);cone('Hat',(0,0,1.9),.22,.15,.2,wood,8)
export('settler')
bpy.data.libraries.write(ROOT+'/Settlement-source.blend',{collection})
print('Exported tower, lumberjack, stonemason, house and settler')
