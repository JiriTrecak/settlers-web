"""Briarwatch quest ledger, vigor seed, ring, draughts and scroll.
Original geometry from the generated item reference sheet; sampled material colors.
"""
import bpy,bmesh,math,json,random,sys,struct
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;ROOT=A.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage,aim
if not bpy.app.background:raise RuntimeError('Build in background Blender')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(91826);P=json.loads((A/'palette.json').read_text())['samples']
origins={'leaf-ledger':(-2,1,0),'vigor-seed':(0,1,0),'family-ring':(2,1,0),'healing-draught':(-2,-1,0),'mana-draught':(0,-1,0),'healing-scroll':(2,-1,0)}
cols={}
for name in [*origins,'Studio']:
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);cols[name]=c
current=None;offset=Vector((0,0,0))
def material(name,color,rough=.85,emit=0):
 rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)] if color not in P else P[color]['representative']['rgb'];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb] if color not in P else P[color]['representative']['linear_rgb']
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*linear,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear,1);p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*linear,1);p.inputs['Emission Strength'].default_value=emit
 return m
bark=[material('Bark shadow','49301f'),material('Bark warm','704b30'),material('Bark ridges','93683f')]
wood=material('Honey heartwood','b28952');cut=material('Pale cut ends','c8a874');dark=material('Recessed openings','201b14');shell=material('Seed shell plaster','b8a27b')
rope=material('Woven root fibre','967e50');resin=material('Amber resin joints','b96e21',.35);glow=material('Warm lantern resin','f2b34d',.3,.45)
leaves=[material('Leaf shade','344622'),material('Leaf green','5d7033'),material('Leaf veins','8c944b')]
team=material('TC_TeamColor','a83f2e');iron=material('Weathered latch','575247',.62)
def mesh(name,vs,fs,mats,indices=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);current.objects.link(ob);ob.location=offset
 for m in mats:me.materials.append(m)
 if indices:
  for face in me.polygons:face.material_index=indices[face.index%len(indices)]
 return ob
def box(name,p,size,m,bevel=0):
 x,y,z=p;w,d,h=size;vs=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
 ob=mesh(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],[m])
 if bevel:mod=ob.modifiers.new('Chipped edges','BEVEL');mod.width=bevel;mod.segments=1
 return ob
def rod(name,a,b,r,m,sides=7,r2=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.1:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u);vs=[tuple(p+(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))*radius) for p,radius in [(a,r),(b,r if r2 is None else r2)] for i in range(sides)]
 fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
 return mesh(name,vs,fs,[m])
def ellipsoid(name,p,s,m,seg=10,rings=5):
 vs=[]
 for j in range(rings+1):
  phi=math.pi*j/rings
  for i in range(seg):
   a=math.tau*i/seg;vs.append((p[0]+s[0]*math.sin(phi)*math.cos(a),p[1]+s[1]*math.sin(phi)*math.sin(a),p[2]+s[2]*math.cos(phi)))
 fs=[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)]
 return mesh(name,vs,fs,[m])
def leaf(name,a,b,width,m=None):
 a,b=Vector(a),Vector(b);direction=b-a;across=direction.cross(Vector((0,0,1)))
 if across.length<.1:across=Vector((1,0,0))
 across.normalize();vs=[]
 for t in [0,.25,.55,.8,1]:
  center=a+direction*t+Vector((0,0,.1*math.sin(t*math.pi)))
  w=width*math.sin(t*math.pi);vs.extend([tuple(center-across*w),tuple(center+Vector((0,0,.075))),tuple(center+across*w)])
 fs=[]
 for i in range(4):
  j=i*3;fs.extend([(j,j+3,j+4,j+1),(j+1,j+4,j+5,j+2)])
 o=mesh(name,vs,fs,[m] if m else leaves,[i%2 for i in range(8)] if not m else None)
 mod=o.modifiers.new('Leaf thickness','SOLIDIFY');mod.thickness=.022
 rod(name+' midrib',a,b,.018,leaves[2])
 return o
def lantern(x,y,z):
 ellipsoid('Amber lantern',(x,y,z),(.17,.17,.26),glow)
 for h in [-.22,.23]:rod('Lantern collar',(x,y,z+h),(x,y,z+h+.06),.19,bark[0])
 rod('Hanging fibre',(x,y,z+.26),(x,y,z+.55),.025,rope)
def select(name):
 global current,offset
 current=cols[name];offset=Vector(origins[name])
paper=material('Layered leaf parchment','paper');cover=material('Pressed green leaves','leaf');amber=material('Vigor resin glow','resin',.28,.35)
red=material('Red healing resin','a92d13',.28,.18);blue=material('Blue mana resin','1a59cf',.24,.24);gold=material('Antique ring metal','b38c3c',.3)
select('leaf-ledger')
for i in range(7):box('Individual birch leaf pages',(0,0,.12+i*.045),(1,.74,.04),paper,.015)
for z in [.08,.45]:box('Leaf leather book cover',(0,0,z),(1.12,.82,.075),cover,.04)
rod('Bark book spine',(-.55,-.41,.28),(-.55,.41,.28),.12,bark[1]);box('Amber clasp',(.5,-.03,.43),(.25,.22,.13),resin,.04)
leaf('Leaf cover emblem',(-.24,-.25,.52),(.15,.22,.52),.14,leaves[2])
for y in [-.27,.27]:rod('Root binding',(-.61,y,.1),(-.61,y,.48),.032,rope)
select('vigor-seed')
ellipsoid('Luminous vigor acorn',(0,0,.43),(.39,.32,.47),amber,12,7)
ellipsoid('Bark seed cap',(0,0,.79),(.37,.32,.17),bark[1],10,4);rod('Acorn stem',(0,0,.88),(.12,.02,1.08),.07,bark[2])
for i in range(3):
 a=i*math.tau/3;leaf('Protective green seed leaf',(math.cos(a)*.22,math.sin(a)*.18,.9),(math.cos(a)*.35,math.sin(a)*.30,.15),.23)
select('family-ring')
# A band lying on the ground; all surfaces are closed, including its inner wall.
for i in range(16):
 a=i*math.tau/16;b=(i+1)*math.tau/16
 rod('Golden ring band',(math.cos(a)*.34,math.sin(a)*.34,.10),(math.cos(b)*.34,math.sin(b)*.34,.10),.085,gold,8)
ellipsoid('Green resin cabochon',(0,-.35,.19),(.19,.16,.13),cover,10,5);leaf('Ring leaf motif',(-.3,-.26,.16),(-.14,-.44,.16),.09,leaves[2])
for name,liquid in [('healing-draught',red),('mana-draught',blue)]:
 select(name);ellipsoid('Opaque glowing resin flask',(0,0,.39),(.32,.29,.36),liquid,12,7)
 rod('Flask neck',(0,0,.63),(0,0,.86),.13,liquid,10);rod('Bark stopper',(0,0,.86),(0,0,1.02),.15,bark[2],9)
 for j in [0,1]:
  z=.16+j*.44
  for i in range(12):
   a=i*math.tau/12;b=(i+1)*math.tau/12;r=.26 if j==0 else .25
   rod('Protective root basket',(math.cos(a)*r,math.sin(a)*r,z),(math.cos(b)*r,math.sin(b)*r,z),.036,bark[1])
 leaf('Flask leaf tag',(-.10,0,.88),(-.36,-.18,.5),.12)
select('healing-scroll')
rod('Rolled birch parchment',(-.48,0,.23),(.48,0,.23),.19,paper,12);rod('Scroll twig spindle',(-.60,0,.23),(.60,0,.23),.06,bark[2],8)
for x in [-.47,.47]:rod('Rolled outer leaf edge',(x,0,.23),(x+(.03 if x>0 else -.03),0,.23),.21,paper,12)
box('Scroll binding ribbon',(0,0,.25),(.14,.4,.42),red,.03);ellipsoid('Red resin seal',(0,-.22,.35),(.14,.06,.14),red,10,5);leaf('Scroll sprig',(.15,-.2,.15),(.44,-.4,.16),.13)
create_stage(C,cols['Studio'])
for o in cols['Studio'].objects:
 if o.type=='LIGHT':aim(o,(0,0,.4))
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.scene['source_note']='Original ant-scale quest rewards modeled from the generated icon reference. Opaque resin avoids transparent sorting. Undersides inferred. Separate ground-item GLBs.'
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
report=[]
for name,origin in origins.items():
 bpy.ops.object.select_all(action='DESELECT');deps=bpy.context.evaluated_depsgraph_get();copies=[]
 for ob in cols[name].objects:
  evaluated=ob.evaluated_get(deps);data=bpy.data.meshes.new_from_object(evaluated);copy=bpy.data.objects.new(ob.name+' runtime',data);bpy.context.scene.collection.objects.link(copy);copy.matrix_world=ob.matrix_world;copy.location-=Vector(origin);copy.select_set(True);copies.append(copy)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name=name
 out=A/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(out),use_selection=True,export_format='GLB',export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
 data=out.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
 report.append({'id':name,'triangles':triangles,'meshes':len(doc['meshes']),'materials':len(doc.get('materials',[])),'bytes':len(data)})
 bpy.data.objects.remove(merged,do_unlink=True)
(A/'exports.json').write_text(json.dumps(report,indent=2))
