"""Player barracks: deterministic editable compact four-tower reference reconstruction."""
import bpy,bmesh,math,random,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Background build only')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];random.seed(28);scene=bpy.context.scene
cols={}
for n in ['01 Stone foundations','02 Timber hall','03 Guard towers','04 Red shingle roof','05 Gate and military fittings','06 Player flag','07 Studio']:
 c=bpy.data.collections.new(n);scene.collection.children.link(c);cols[n]=c
cur=cols['01 Stone foundations']
def rgb(h):return [((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4)]
def mat(n,color,grain=False):
 m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*color,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.85
 if grain:
  ns=m.node_tree.nodes;ls=m.node_tree.links;co=ns.new('ShaderNodeTexCoord');mp=ns.new('ShaderNodeVectorMath');mp.operation='MULTIPLY';mp.inputs[1].default_value=(7,7,1.2);ls.new(co.outputs['Generated'],mp.inputs[0]);no=ns.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=2.5;no.inputs['Detail'].default_value=1.2;ls.new(mp.outputs[0],no.inputs['Vector']);ra=ns.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=tuple(v*.65 for v in color)+(1,);ra.color_ramp.elements[1].color=tuple(min(1,v*1.2) for v in color)+(1,);ls.new(no.outputs['Fac'],ra.inputs[0]);ls.new(ra.outputs['Color'],bs.inputs['Base Color'])
 return m
WOOD=[mat('Oak '+str(i),[v*f for v in P['oak']['representative']['linear_rgb']],True) for i,f in enumerate([.65,.85,1,1.15])]
RED=[mat('Terracotta shingles '+str(i),[v*f for v in P['roof_red']['representative']['linear_rgb']],True) for i,f in enumerate([.42,.56,.7,.82])]
STONE=[mat('Warm grey stone '+str(i),rgb(h)) for i,h in enumerate(['746d60','8d8473','a0957e'])]
IRON=mat('Forged iron',rgb('595650'));STEEL=mat('Steel blade',rgb('b2b8b6'));GOLD=mat('Brass rivets',rgb('b6904c'));END=mat('Cut oak ends',rgb('cfaa70'));TEAM=mat('TC_TeamColor',rgb('b72e21'));DARK=mat('Recess shadow',rgb('241d15'));GLOW=mat('Amber lantern glass',rgb('ffb52b'));bs=GLOW.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.35,.025,1);bs.inputs['Emission Strength'].default_value=2

def mesh(n,v,f,m):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();ob=bpy.data.objects.new(n,me);cur.objects.link(ob);me.materials.append(m);return ob

def cube(n,p,s,m,bevel=0):
 x,y,z=s;v=[(i*x/2,j*y/2,k*z/2) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 ob=mesh(n,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m);ob.location=p
 if bevel:mo=ob.modifiers.new('Soft hewn corners','BEVEL');mo.width=bevel;mo.segments=1
 return ob

def rod(n,a,b,r,m,r2=None,sides=8):
 a,b=Vector(a),Vector(b);axis=b-a;u=axis.normalized().cross(Vector((0,1,0)))
 if u.length<.01:u=axis.normalized().cross(Vector((1,0,0)))
 u.normalize();v=axis.normalized().cross(u);verts=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:
  for i in range(sides):verts.append(tuple(p+rr*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)))
 faces=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
 return mesh(n,verts,faces,m)
def beam(n,a,b,width,m,bevel=.025):
 a,b=Vector(a),Vector(b);ob=cube(n,(a+b)/2,(width,width,(b-a).length),m,bevel);ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return ob
# Foundation and complete walls, including inferred rear.
for side in [-1,1]:
 for i in range(6):cube('Hall foundation',(side*1.62,-1.4+i*.56,.23),(.42,.54,.46),STONE[i%3],.07)
for i in range(6):cube('Rear foundation',(-1.4+i*.56,1.55,.23),(.54,.42,.46),STONE[i%3],.07)
cur=cols['02 Timber hall']
cube('Hall dark interior',(0,0,1.42),(3.2,3.0,2.35),DARK)
for side in [-1,1]:
 for i in range(10):cube('Side wall broad planks',(side*1.62,-1.4+i*.31,1.43),(.19,.30,2.05),WOOD[i%4],.012)
 for z in [.65,2.4]:beam('Side wall binding',(side*1.75,-1.55,z),(side*1.75,1.55,z),.23,WOOD[0])
for i in range(10):cube('Rear wall plank',(-1.4+i*.31,1.53,1.43),(.30,.18,2.05),WOOD[i%4],.012)
for side in [-1,1]:
 for i in range(3):cube('Front flanking plank',(side*(.97+i*.28),-1.55,1.43),(.27,.19,2.05),WOOD[i%4],.012)
# Four chunky octagonal bastions.
cur=cols['03 Guard towers']
for tx in [-2.15,2.15]:
 for ty in [-1.58,1.58]:
  label=('Front' if ty<0 else 'Rear')+(' left' if tx<0 else ' right')
  for i in range(8):
   a=i*math.tau/8; x=tx+.69*math.cos(a);y=ty+.69*math.sin(a)
   ob=cube(label+' stone footing',(x,y,.34),(.67,.45,.68),STONE[i%3],.07);ob.rotation_euler.z=a+math.pi/2
   ob=cube(label+' oak stave',(x,y,1.52),(.57,.30,1.78+random.uniform(-.05,.05)),WOOD[i%4],.045);ob.rotation_euler.z=a+math.pi/2
   ob=cube(label+' lower iron band',(x,y,.82),(.59,.34,.18),IRON,.016);ob.rotation_euler.z=a+math.pi/2
   ob=cube(label+' red parapet',(x,y,2.65),(.64,.28,.40),RED[i%4],.035);ob.rotation_euler.z=a+math.pi/2
  rod(label+' watch platform',(tx,ty,2.32),(tx,ty,2.45),.81,WOOD[2],sides=8)
  for i in range(4):
   a=math.pi/4+i*math.pi/2;x=tx+.76*math.cos(a);y=ty+.76*math.sin(a)
   cube(label+' parapet post',(x,y,2.72),(.29,.29,.64),WOOD[2],.035);cube(label+' post end',(x,y,3.045),(.27,.27,.035),END,.012)
   cube(label+' iron post socket',(x,y,2.62),(.34,.34,.22),IRON,.016)
   if i%2==0:rod(label+' defensive spike',(x,y,3.05),(x,y,3.49),.17,STEEL,r2=0,sides=4)
# Shingle roof: three overlapping hip-roof courses, broad individually editable boards.
cur=cols['04 Red shingle roof']
for tier,(outer,inner,z0,z1) in enumerate([(2.0,1.25,2.72,3.55),(1.5,.68,3.40,4.13),(.91,.12,4.02,4.65)]):
 count=[7,6,4][tier]
 for face in range(4):
  a=face*math.pi/2
  def rot(x,y,z):return(x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z)
  for j in range(count):
   u=j/count*2-1;v=(j+1)/count*2-1;end=z0+random.uniform(-.055,.02)
   verts=[rot(u*outer,-outer,end),rot(v*outer-.015,-outer,end+.025),rot(v*inner-.015,-inner,z1),rot(u*inner,-inner,z1)]
   verts+= [(x,y,z-.11) for x,y,z in verts]
   ob=mesh('Roof course %d shingle %d %d'%(tier,face,j),verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],RED[(j+face+tier)%4])
   mo=ob.modifiers.new('Worn shingle edges','BEVEL');mo.width=.025;mo.segments=1
for side in [-1,1]:
 beam('Heavy roof eave',(side*1.9,-1.9,2.66),(side*1.9,1.9,2.66),.24,WOOD[1])
# Visible diagonal iron roof straps following the hip contour.
for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]:
 pts=[(sx*1.89,sy*1.89,2.86),(sx*1.2,sy*1.2,3.62),(sx*.62,sy*.62,4.2),(sx*.10,sy*.10,4.72)]
 for i in range(3):beam('Hip roof forged strap',pts[i],pts[i+1],.14,IRON,.01)
 for p in pts[:-1]:rod('Large roof brass rivet',p,(p[0],p[1],p[2]+.08),.07,GOLD,sides=6)
# Entrance, recognizable crossed swords and lanterns.
cur=cols['05 Gate and military fittings']
for i in range(6):cube('Gate oak plank',(-.66+i*.265,-1.68,1.23),(.25,.17,1.90),WOOD[(i+1)%4],.016)
for side in [-1,1]:
 cube('Gate stone pedestal',(side*1.04,-1.83,.26),(.62,.62,.52),STONE[1],.08)
 cube('Gate massive upright',(side*1.04,-1.73,1.43),(.40,.42,2.08),WOOD[2],.05)
 cube('Gate upper iron collar',(side*1.04,-1.74,2.32),(.48,.48,.29),IRON,.025)
 for z in [.77,1.63]:cube('Door iron hinge',(side*.43,-1.795,z),(.69,.07,.11),IRON,.015)
 rod('Door ring boss',(side*.20,-1.79,1.15),(side*.20,-1.88,1.15),.115,GOLD,sides=8)
beam('Gate lintel',(-1.16,-1.72,2.42),(1.16,-1.72,2.42),.38,WOOD[2])
for i in range(4):cube('Entrance step',(-.78+i*.52,-1.98,.12),(.5,.7,.24),STONE[i%3],.04)
# Swords modeled as broad pointed diamond blades.
for side in [-1,1]:
 a=Vector((-side*.36,-1.99,2.36));b=Vector((side*.46,-1.99,3.14));d=(b-a).normalized();per=Vector((d.z,0,-d.x));mid=a+(b-a)*.7
 verts=[tuple(a-per*.10),tuple(a+per*.10),tuple(mid+per*.10),tuple(b),tuple(mid-per*.10),tuple(mid+Vector((0,-.07,0)))]
 mesh('Crossed sword blade',verts,[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5),(4,3,2,1,0)],STEEL)
 beam('Sword crossguard',a-per*.23,a+per*.23,.085,GOLD,.015);rod('Sword leather grip',a-d*.28,a,.065,WOOD[0],sides=6)
for side in [-1,1]:
 x=side*1.1;y=-2.13;z=1.64
 beam('Lantern bracket',(x,-1.72,2.19),(x,y,2.19),.10,IRON,.012)
 rod('Lantern hanger',(x,y,2.19),(x,y,1.98),.035,IRON,sides=6)
 cube('Warm lantern pane',(x,y,z),(.28,.25,.43),GLOW,.025)
 for zz in [z-.25,z+.25]:cube('Lantern frame cap',(x,y,zz),(.38,.34,.10),IRON,.035)
 for dx in [-.16,.16]:beam('Lantern frame',(x+dx,y-.14,z-.23),(x+dx,y-.14,z+.23),.045,IRON,0)
 beam('Lantern diagonal',(x-.16,y-.15,z-.23),(x+.16,y-.15,z+.23),.04,IRON,0)
 light=bpy.data.lights.new('Lantern amber spill','POINT');light.energy=14;light.color=(1,.32,.045);light.shadow_soft_size=.35;ob=bpy.data.objects.new('Lantern amber spill',light);cur.objects.link(ob);ob.location=(x,y-.15,z)
# Small military weapon rack beside front-right tower.
for x in [1.38,2.55]:beam('Rack upright',(x,-2.58,.08),(x,-2.58,1.25),.12,WOOD[2])
for z in [.27,.89]:beam('Rack crossbar',(1.3,-2.6,z),(2.65,-2.6,z),.12,WOOD[1])
for i in range(3):
 x=1.45+i*.34;rod('Stored spear shaft',(x,-2.64,.12),(x,-2.64,1.77),.035,WOOD[2],sides=6);rod('Stored spearhead',(x,-2.64,1.72),(x,-2.64,2.08),.10,STEEL,r2=0,sides=4)
for x in [1.62,2.28]:
 rod('Round shield rim',(x,-2.75,.50),(x,-2.86,.50),.35,IRON,sides=12);rod('Red shield face',(x,-2.865,.5),(x,-2.89,.5),.30,RED[1],sides=12);rod('Shield boss',(x,-2.90,.5),(x,-2.98,.5),.10,STEEL,r2=.055,sides=8)
# Plain ownership cloth: only this material recolors at runtime.
cur=cols['06 Player flag']
beam('Flag mast',(0,0,4.48),(0,0,5.95),.18,WOOD[2])
for z in [4.7,5.7]:cube('Flag mast iron collar',(0,0,z),(.23,.23,.13),IRON,.015)
v=[];f=[];nu=9;nv=5
for j in range(nv):
 for i in range(nu):
  u=i/(nu-1);t=j/(nv-1);x=.10+u*1.20;z=5.76-t*.78+.08*math.sin(u*4)-.11*u
  if i==nu-1:x-=.26*(1-abs(t-.5)*2)
  v.append((x,.11*math.sin(u*6+t*2),z))
for j in range(nv-1):
 for i in range(nu-1):p=j*nu+i;f.append((p,p+1,p+1+nu,p+nu))
ob=mesh('Ownership flag cloth',v,f,TEAM)
for p in ob.data.polygons:p.use_smooth=True
create_stage(C,cols['07 Studio'])
scene['source_note']='Single-image reconstruction; rear surfaces inferred. Only ownership flag uses TC_TeamColor.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();stats={'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string};(A/'model-stats.json').write_text(json.dumps(stats,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
