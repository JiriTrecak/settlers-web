"""Selectable neutral loot chest: walnut boards, iron hoops and an amber clasp."""
import bpy,bmesh,json,math,sys,random
from pathlib import Path
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Separate background Blender process required')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];rng=random.Random(488)
scene=bpy.context.scene;cols={}
for name in ['Chest boards','Iron fittings','Clasp and rivets','Studio']:
 c=bpy.data.collections.new(name);scene.collection.children.link(c);cols[name]=c
cur=cols['Chest boards']
def material(name,key,factor=1,metal=0,rough=.65):
 rgb=[min(1,v*factor) for v in P[key]['representative']['linear_rgb']]
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
wood=[material('Walnut '+str(i),'wood',f) for i,f in enumerate([.7,1,1.3])]
iron=material('Forged dark silver','iron',1,.6,.4);bronze=material('Antique gold rivets','bronze',1,.6,.38);amber=material('Amber clasp','amber',1,.15,.25)
def mesh(name,v,f,m):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);cur.objects.link(ob);me.materials.append(m);return ob
def box(name,p,s,m,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);ob=bpy.context.object;ob.name=name
 for col in list(ob.users_collection):col.objects.unlink(ob)
 cur.objects.link(ob);ob.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(m)
 if bevel:
  mod=ob.modifiers.new('Forged bevel','BEVEL');mod.width=bevel;mod.segments=1;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
 return ob
def cap(name,p,s,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p);ob=bpy.context.object;ob.name=name
 for col in list(ob.users_collection):col.objects.unlink(ob)
 cur.objects.link(ob);ob.scale=s;ob.data.materials.append(m);return ob
def arc(name,x0,x1,a0,a1,r,thick,m):
 # Cross-section extruded across the width, with a real inner shell.
 steps=max(3,math.ceil((a1-a0)/(math.pi/24)));n=steps+1
 angles=[a0+(a1-a0)*i/steps for i in range(n)];v=[]
 for x in [x0,x1]:
  for radius in [r,r-thick]:
   for a in angles:v.append((x,math.cos(a)*radius,.94+math.sin(a)*radius))
 f=[]
 for j in range(steps):f.extend([(j,j+1,j+1+n*2,j+n*2),(j+n,j+n*3,j+n*3+1,j+n+1),(j,j+n,j+n+1,j+1),(j+n*2,j+n*2+1,j+n*3+1,j+n*3)])
 f.extend([(0,n*2,n*3,n),(n-1,n*2-1,n*4-1,n*3-1)]);return mesh(name,v,f,m)
for i in range(4):
 z=.22+i*.20
 for sign in [-1,1]:box('Horizontal walnut plank',(0,sign*.69,z),(2.6,.13,.19),wood[i%3],.018)
 for sign in [-1,1]:box('End board',(sign*1.23,0,z),(.14,1.30,.19),wood[(i+1)%3],.018)
box('Chest base',(0,0,.15),(2.5,1.35,.15),wood[0])
for i in range(8):arc('Curved lid stave',-1.3,1.3,i*math.pi/8+.015,(i+1)*math.pi/8-.015,.76,.09,wood[i%3])
for sign in [-1,1]:
 v=[(sign*1.28,0,.94)]+[(sign*1.28,math.cos(i*math.pi/12)*.75,.94+math.sin(i*math.pi/12)*.75) for i in range(13)]
 mesh('Solid wooden lid end',v,[tuple(range(len(v)))],wood[0])
cur=cols['Iron fittings']
for x in [-1.08,1.08]:
 arc('Iron lid hoop',x-.13,x+.13,0,math.pi,.81,.075,iron)
 for y in [-.735,.735]:
  box('Iron upright',(x,y,.53),(.26,.1,.92),iron)
  box('Broad iron foot',(x,y,.115),(.35,.24,.23),iron)
for y in [-.76,.76]:box('Lid lower iron rail',(0,y,.935),(2.72,.13,.16),iron)
for x in [-1.31,1.31]:box('End lower iron rail',(x,0,.935),(.13,1.51,.16),iron)
box('Front latch hinge',(0,-.823,1.04),(.36,.18,.29),iron,.05)
v=[(-.23,-.86,.94),(.23,-.86,.94),(.25,-.86,.64),(.14,-.86,.45),(-.14,-.86,.45),(-.25,-.86,.64)]
mesh('Shield clasp',v,[tuple(range(6))],iron)
cur=cols['Clasp and rivets']
cap('Amber bezel',(0,-.882,.73),(.18,.075,.22),bronze)
cap('Large amber clasp',(0,-.94,.73),(.128,.075,.163),amber)
for x in [-1.08,1.08]:
 for y in [-.81,.81]:
  for z in [.14,.49,.78]:cap('Upright rivet',(x,y,z),(.064,.03,.064),bronze)
 for a in [.18,.75,1.40,2.04,2.70]:cap('Hoop rivet',(x,math.cos(a)*.832,.94+math.sin(a)*.832),(.063,.053,.045),bronze)
for x in [-1.36,1.36]:
 for y in [-.48,.48]:cap('End rivet',(x,y,.94),(.035,.06,.06),bronze)
create_stage(C,cols['Studio'])
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
scene['source_note']='Neutral shared loot chest. Hidden rear inferred. No team color; the item definition owns the displayed identity.'
(A/'model-stats.json').write_text(json.dumps({'meshes':sum(o.type=='MESH' for o in scene.objects),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
