"""Rootworks: open feed apron, paired crushing rollers and a bound root-vat.
The stonemason reference supplies the shared material/style language, not this new architecture.
"""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background: raise RuntimeError('Background build only; do not reset an open document')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text()); P=json.loads((A/'palette.json').read_text())['samples']
rng=random.Random(491); scene=bpy.context.scene
cols={}
for n in ['Foundation and apron','Timber shelter','Curved roof','Root press','Feed roots','Ownership','Studio']:
 c=bpy.data.collections.new(n); scene.collection.children.link(c); cols[n]=c
cur=cols['Foundation and apron']
def linear(h):
 return [(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for v in [int(h[i:i+2],16)/255 for i in (0,2,4)]]
def mat(n, color, metallic=0):
 m=bpy.data.materials.new(n); m.use_nodes=True; m.diffuse_color=(*color,1)
 bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=.72; bs.inputs['Metallic'].default_value=metallic
 return m
def sample(n,key,f=1,metallic=0):return mat(n,[min(1,v*f) for v in P[key]['representative']['linear_rgb']],metallic)
WOOD=[sample('Oak '+str(i),'oak',f) for i,f in enumerate([1.0,1.4,1.8])]
ROOF=[sample('Bark-red roof '+str(i),'roof_red',f) for i,f in enumerate([.22,.32,.42])]
STONE=[mat('Foundation stone '+str(i),linear(h)) for i,h in enumerate(['626764','7d8075','959788'])]
IRON=sample('Weathered iron','iron',.7,.65); EDGE=mat('Polished steel edge',linear('9baba9'),.7)
END=sample('Pale cut timber','endgrain',.65); BRASS=mat('Brass fasteners',linear('ad8447'),.5)
ROOT=mat('Corrupted root bark',linear('44313e')); CORE=mat('Pale root heart',linear('a293bb'))
TEAM=mat('TC_TeamColor',linear('A04B31')); DARK=mat('Recesses',linear('171b19'))
for material in WOOD+ROOF:
 ns=material.node_tree.nodes; ls=material.node_tree.links; base=material.diffuse_color[:3]
 coord=ns.new('ShaderNodeTexCoord'); scale=ns.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(3,3,.6)
 noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;noise.inputs['Detail'].default_value=1
 ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.65 for v in base)+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,v*1.4) for v in base)+(1,)
 ls.new(coord.outputs['Generated'],scale.inputs[0]);ls.new(scale.outputs[0],noise.inputs['Vector']);ls.new(noise.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs['Color'],ns.get('Principled BSDF').inputs['Base Color'])
def mesh(n,v,f,m):
 me=bpy.data.meshes.new(n); me.from_pydata(v,[],f); me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(n,me);cur.objects.link(ob);me.materials.append(m);return ob
def box(n,p,s,m,bevel=.025):
 v=[(a*s[0]/2,b*s[1]/2,c*s[2]/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 o=mesh(n,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m);o.location=p
 if bevel:mod=o.modifiers.new('Hewn edge','BEVEL');mod.width=bevel;mod.segments=1
 return o
def beam(n,a,b,w,m):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)/2,(w,w,(b-a).length),m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def rod(n,a,b,r,m,sides=12,r2=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();w=axis.cross(u);v=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:
  for j in range(sides):v.append(tuple(p+rr*(math.cos(j*math.tau/sides)*u+math.sin(j*math.tau/sides)*w)))
 f=[tuple(reversed(range(sides))),tuple(sides+j for j in range(sides))]+[(j,(j+1)%sides,(j+1)%sides+sides,j+sides) for j in range(sides)]
 return mesh(n,v,f,m)
def ring(n,center,r,width,depth,m,sides=20):
 x,y,z=center;v=[]
 for zz,rr in [(z-depth/2,r),(z-depth/2,r-width),(z+depth/2,r),(z+depth/2,r-width)]:
  v.extend([(x+rr*math.cos(j*math.tau/sides),y+rr*math.sin(j*math.tau/sides),zz) for j in range(sides)])
 f=[]
 for a,b in [(0,1),(0,2),(2,3),(1,3)]:
  for j in range(sides):k=(j+1)%sides;f.append((a*sides+j,a*sides+k,b*sides+k,b*sides+j))
 return mesh(n,v,f,m)
# A low loading platform. Rear shelter stays shallow so the mechanism is readable from play camera.
for row in range(3):
 for col in range(6):box('Stone plinth',(-2.3+col*.9,-1.65+row*1.25,.16),(.88,1.23,.32),STONE[(row+col)%3],.07)
for j in range(14):box('Apron plank',(0,-2.1+j*.32,.38),(5,.30,.16),WOOD[j%3],.015)
cur=cols['Timber shelter']
for x in [-2.1,.8]:
 for y in [-.3,1.5]:
  box('Heavy post',(x,y,1.55),(.36,.36,2.4),WOOD[1],.05)
  for z in [.65,2.55]:box('Post collar',(x,y,z),(.42,.42,.17),IRON)
  box('Cut post cap',(x,y,2.78),(.36,.36,.065),END)
  beam('Knee brace',(x,y,2.05),(x+.48 if x<0 else x-.48,y,2.6),.20,WOOD[2])
for y in [-.3,1.5]:beam('Shelter crossbeam',(-2.3,y,2.65),(1,y,2.65),.28,WOOD[1])
for x in [-2.1,.8]:beam('Side beam',(x,-.5,2.65),(x,1.7,2.65),.27,WOOD[1])
for i in range(9):box('Rear planking',(-1.94+i*.32,1.53,1.5),(.30,.14,1.9),WOOD[i%3],.012)
cur=cols['Curved roof']
for side in [-1,1]:
 for row in range(3):
  t0=row/3;t1=(row+1)/3+.045
  for j in range(5):
   v=[]
   for k in range(3):
    t=t0+(t1-t0)*k/2
    for y in [-.65+j*.52,-.65+j*.52+.50]:v.append((-.65+side*1.7*t,y,3.7-1.02*t**1.5+.07*(2-row)))
   v += [(x,y,z-.09) for x,y,z in v]
   mesh('Broad curved shingle',v,[(0,1,3,2),(2,3,5,4),(6,8,9,7),(8,10,11,9),(0,6,7,1),(4,5,11,10),(0,2,8,6),(2,4,10,8),(1,7,9,3),(3,9,11,5)],ROOF[(row+j)%3])
 for y in [-.67,1.96]:
  for k in range(5):
   t=k/5;s=(k+1)/5
   beam('Curved roof edge',(-.65+side*1.76*t,y,3.8-1.02*t**1.5),(-.65+side*1.76*s,y,3.8-1.02*s**1.5),.15,IRON)
beam('Roof ridge',(-.65,-.85,3.88),(-.65,2.08,3.88),.26,WOOD[1])
# Front feed rollers, iron teeth and the side flywheel.
cur=cols['Root press']
for x in [-1.8,.4]:box('Press bearing post',(x,-.42,1.15),(.38,.42,1.6),WOOD[1],.045)
for z in [.95,1.62]:
 rod('Crushing roller',(-1.7,-.56,z),(.3,-.56,z),.25,IRON,16)
 for x in [-1.5,-1.1,-.7,-.3,.1]:
  for j in range(8):
   a=j*math.tau/8
   box('Roller tooth',(x,-.56+.26*math.cos(a),z+.26*math.sin(a)),(.14,.15,.15),EDGE,.018)
rod('Drive shaft',(-2.38,-.56,1.62),(.65,-.56,1.62),.09,EDGE)
wheel=ring('Iron flywheel',(0,0,0),.77,.15,.17,IRON,24);wheel.rotation_euler.y=math.pi/2;wheel.location=(-2.35,-.56,1.62)
for j in range(6):
 a=j*math.tau/6
 beam('Flywheel spoke',(-2.35,-.56,1.62),(-2.35,-.56+.69*math.cos(a),1.62+.69*math.sin(a)),.10,BRASS)
for j in range(6):box('Feed chute plank',(-1.6+j*.35,-1.5,.89),(.33,1.3,.12),WOOD[j%3],.012)
for x in [-1.82,.43]:beam('Chute lip',(x,-2.2,.95),(x,-.8,.95),.12,IRON)
# Broad banded open vat beside the press, with a recognizable pale-purple root mass.
for j in range(16):
 a=j*math.tau/16;x=1.74+.78*math.cos(a);y=.40+.78*math.sin(a)
 o=box('Vat stave',(x,y,1.04),(.30,.20,1.22),WOOD[j%3],.025);o.rotation_euler.z=a-math.pi/2
for z in [.55,1.35,1.68]:ring('Vat binding',(1.74,.4,z),.9,.105,.13,IRON)
rod('Root mash',(1.74,.4,.5),(1.74,.4,1.5),.70,DARK,20)
for j in range(10):
 a=j*2.4;p=(1.74+math.cos(a)*.45,.4+math.sin(a)*.45,1.52+rng.random()*.08)
 rod('Processed root fibers',p,(p[0]+.21,p[1]-.22,p[2]+.07),.075,CORE,7)
cur=cols['Feed roots']
for j in range(5):
 x=-1.40+j*.32;y=-1.8+rng.random()*.22
 rod('Harvested twisted root',(x,y,.96),(x+.10,y+.47,1.03),.13,ROOT,9,r2=.10)
 rod('Exposed pale cut',(x,y-.025,.96),(x,y-.018,.96),.11,CORE,9)
 rod('Root fork',(x+.05,y+.22,1.01),(x+.32,y+.49,1.09),.075,ROOT,8,r2=.025)
# Visible ownership flag above front post; no recoloring of roof or machinery.
cur=cols['Ownership'];beam('Flag mast',(.85,-1.3,.6),(.85,-1.3,4.4),.09,WOOD[1])
v=[];f=[]
for j in range(4):
 for i in range(7):
  u=i/6;t=j/3;v.append((.86+.8*u,-1.3+.06*math.sin(u*5+t),4.3-.55*t-.06*u))
for j in range(3):
 for i in range(6):p=j*7+i;f.append((p,p+1,p+8,p+7))
mesh('Plain ownership pennant',v,f,TEAM)
create_stage(C,cols['Studio'])
scene['source_note']='Original Rootworks design using stonemason material/style reference. Mechanism and unseen surfaces inferred.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'source_faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
