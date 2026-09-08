"""Original Ant colony assets. Metres, Z up, front -Y, root at soil level.
Editable parts stay in Blender; runtime meshes are merged into material batches.
Run through Blender MCP with scripts/ant-colony/blender.mjs.
"""
import bpy, math, random, os, json
from mathutils import Vector
R='/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web'
OUT=R+'/assets/ant-colony'
os.makedirs(OUT,exist_ok=True)
random.seed(710)
name='Ant Colony — reference rebuild'
old=bpy.data.collections.get(name)
if old:
 for o in list(old.all_objects): bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(old)
col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
parts=[];exports=[]
def mat(name,hex,metal=0,rough=.8,emission=0):
 m=bpy.data.materials.get('Ant '+name) or bpy.data.materials.new('Ant '+name);m.use_nodes=True
 rgb=[int(hex[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission
 return m
wood=[mat('timber '+str(i),c) for i,c in enumerate(['6c482d','8c5a33','a77747','b88a54'])]
red=[mat('carapace roof '+str(i),c,.1,.66) for i,c in enumerate(['8e3627','a74631','ba563a','783124'])]
iron=mat('forged iron','394249',.72,.48);silver=mat('worn steel','a0a6a2',.65,.43)
cut=mat('end grain','c59f61');grain=mat('growth rings','866039');dark=mat('recess','241c17')
rock=[mat('foundation '+str(i),c) for i,c in enumerate(['746d57','8c8065','a39679','615c4d'])]
leaf=[mat('leaf '+str(i),c) for i,c in enumerate(['556228','728238','8a9642','414d20'])]
flagmat=mat('faction red','b43329');gold=mat('ant emblem','d3b77e',.35)
chitin=mat('rust chitin','9f432c',.15,.58);chitinlight=mat('chitin planes','bb5939',.15,.6)
eye=mat('onyx eyes','11191c',.2,.22);glint=mat('eye glint','b3c4bf',.3,.18)
amber=mat('resin lamp','ff9f26',0,.35,3);flame=mat('flame heart','ffe693',0,.3,6)
def mesh(label,verts,faces,m):
 d=bpy.data.meshes.new(label);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(label,d);col.objects.link(o);parts.append(o)
 if m:d.materials.append(m)
 return o
def box(label,p,s,m,bev=0):
 x,y,z=[v/2 for v in s];o=mesh(label,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m);o.location=p
 if bev:
  bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Hand worn corners','BEVEL');mod.width=bev;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cyl(label,a,b,r,m,r2=None,n=8):
 a,b=Vector(a),Vector(b);L=(b-a).length;r2=r if r2 is None else r2
 vs=[(math.cos(i*math.tau/n)*radius,math.sin(i*math.tau/n)*radius,z) for z,radius in [(-L/2,r),(L/2,r2)] for i in range(n)]
 fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(label,vs,fs,m);o.location=(a+b)/2;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def beam(label,a,b,w,m):
 a,b=Vector(a),Vector(b);o=box(label,(a+b)/2,(w,w,(b-a).length),m,.025);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def ell(label,p,s,m,seg=12,rings=6):
 vs=[]
 for j in range(rings+1):
  t=math.pi*j/rings
  for i in range(seg):
   a=i*math.tau/seg;vs.append((s[0]*math.sin(t)*math.cos(a),s[1]*math.sin(t)*math.sin(a),s[2]*math.cos(t)))
 fs=[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)]
 o=mesh(label,vs,fs,m);o.location=p;return o
def tube(label,points,r,m):
 for i in range(len(points)-1):cyl(label,points[i],points[i+1],r*(1-i/len(points)*.65),m,r*(1-(i+1)/len(points)*.65))
def log(p,L=1.35,r=.18,axis=(1,0,0)):
 p=Vector(p);v=Vector(axis).normalized();cyl('Irregular bark',p-v*L/2,p+v*L/2,r,wood[0],r*.93,n=9)
 for sign in [-1,1]:
  e=p+v*sign*(L/2+.007);cyl('Cut end',e,e+v*sign*.015,r*.86,cut,n=10)
  for ratio in [.62,.32]:
   # Raised annular wood grain, thin enough to read without painted concentric discs.
   vs=[]
   for rad in [r*ratio,r*(ratio-.055)]:
    for j in range(12):vs.append((rad*math.cos(j*math.tau/12),rad*math.sin(j*math.tau/12),0))
   o=mesh('Growth ring',vs,[(j,(j+1)%12,(j+1)%12+12,j+12) for j in range(12)],grain);o.location=e+v*sign*.016;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
 return
def rivet(p,r=.055):ell('Steel rivet',p,(r,r,r*.65),silver,8,4)
def arch_roof(cx,cy,base,rx,rz,depth,rows=4,plates=8):
 # Barrel vault: individual overlapping shell plates, iron ribs, pale worn rims.
 for j in range(rows):
  y0=cy-depth/2+j*depth/rows;y1=y0+depth/rows+.065
  for k in range(plates):
   a0=.07+k*(math.pi-.14)/plates;a1=.07+(k+1)*(math.pi-.14)/plates-.025
   vs=[]
   for y in [y0,y1]:
    for step in range(4):
     a=a0+(a1-a0)*step/3;vs.append((cx+rx*math.cos(a),y,base+rz*math.sin(a)))
   o=mesh('Forged red shell plate',vs,[(i+4,i+5,i+1,i) for i in range(3)],red[(j+k)%4]);sol=o.modifiers.new('Plate thickness','SOLIDIFY');sol.thickness=.09;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
 for yy in [cy-depth/2-.035,cy-depth/6,cy+depth/6,cy+depth/2+.035]:
  for k in range(16):
   a0=.02+k*(math.pi-.04)/16;a1=.02+(k+1)*(math.pi-.04)/16
   def at(a,y,radd=0):return(cx+(rx+.07+radd)*math.cos(a),y,base+(rz+.07+radd)*math.sin(a))
   mesh('Curved iron roof rib',[at(a0,yy-.065),at(a1,yy-.065),at(a1,yy+.065),at(a0,yy+.065)],[(3,2,1,0)],iron)
   if k%2==0:rivet(at((a0+a1)/2,yy,.025))
  for side in [-1,1]:
   pts=[at(.02+k*(math.pi-.04)/20,yy+side*.069,.007) for k in range(21)];tube('Worn rib edge',pts,.016,silver)
def lamp(x,y,z):
 beam('Lamp bracket',(x,y+.1,z+.35),(x,y-.14,z+.35),.08,iron)
 ell('Glowing resin',(x,y,z),(.12,.12,.23),amber,8,5)
 for zz in [z-.23,z+.22]:box('Lantern cap',(x,y,zz),(.3,.3,.06),iron,.03)
 for dx,dy in [(-.11,-.11),(.11,-.11),(-.11,.11),(.11,.11)]:beam('Lantern cage',(x+dx,y+dy,z-.22),(x+dx,y+dy,z+.22),.025,iron)
def torch(x,y,z):
 cyl('Torch post',(x,y,z),(x,y,z+.8),.075,wood[0]);ell('Brazier',(x,y,z+.83),(.22,.22,.13),iron)
 ell('Golden flame',(x,y,z+1.02),(.12,.10,.25),amber);ell('Flame core',(x,y-.04,z+1.04),(.06,.065,.18),flame)
def banner(x,y,z):
 cyl('Banner pole',(x,y,z),(x,y,z+1.65),.047,wood[0]);beam('Banner crossbar',(x-.06,y,z+1.5),(x+.76,y,z+1.5),.06,wood[2])
 mesh('Red swallowtail',[(x+.04,y,z+1.47),(x+.74,y+.05,z+1.44),(x+.72,y+.02,z+.32),(x+.39,y-.01,z+.5),(x+.05,y,z+.28)],[(0,1,2,3,4)],flagmat)
 # Angular ant sigil, gold small thorax and mandibles.
 for a,b in [((.4,1.24),(.4,.64)),((.4,1.18),(.23,1.3)),((.4,1.18),(.57,1.3)),((.4,.96),(.21,.85)),((.4,.96),(.60,.85)),((.4,.78),(.26,.6)),((.4,.78),(.56,.6))]:beam('Ant sigil',(x+a[0],y-.025,z+a[1]),(x+b[0],y-.025,z+b[1]),.023,gold)
def plank(p,L=1.4):
 box('Sawn timber',p,(L,.30,.13),wood[2],.035)
 for yy in [-.075,.05]:box('Wood grain',(p[0],p[1]+yy,p[2]+.067),(L*.75,.013,.005),wood[0])
def export(asset,offset):
 global parts
 bpy.ops.object.select_all(action='DESELECT');copies=[]
 for o in parts:
  d=o.copy();d.data=o.data.copy();col.objects.link(d);d.matrix_world=o.matrix_world.copy();d.select_set(True);copies.append(d)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name=asset
 bpy.ops.export_scene.gltf(filepath=OUT+'/'+asset+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
 faces=len(merged.data.polygons);bpy.data.objects.remove(merged,do_unlink=True)
 root=bpy.data.objects.new(asset,None);col.objects.link(root)
 for o in parts:o.parent=root
 root.location=offset;exports.append({'id':asset,'parts':len(parts),'faces':faces});parts=[]
def fort():
 # Squat earth-root stronghold. Layered irregular masonry around an open doorway.
 for row in range(4):
  for j in range(18):
   a=j*math.tau/18
   if math.sin(a)<-.8:continue
   o=box('Rounded foundation block',(3.15*math.cos(a),2.65*math.sin(a),.35+row*.48),(1.05,.66,.44),rock[(row+j)%4],.10);o.rotation_euler.z=a+math.pi/2
 for x in [-1,1]:
  for j in range(3):
   xx=x*(2.15+j*.45);yy=-1.45+j*1.7
   tube('Massive root buttress',[(xx,yy,2.4),(xx+x*.45,yy-.25,1.1),(xx+x*1.05,yy-.55,.07)],.35,wood[j%3])
 for x in [-1.03,1.03]:beam('Great oak gatepost',(x,-2.72,.1),(x,-2.72,2.45),.37,wood[1])
 box('Gate darkness',(0,-2.32,1.1),(1.9,.13,2.15),dark)
 for x in [-.75,-.45,.45,.75]:box('Recessed door planks',(x,-2.40,1.03),(.25,.1,1.9),wood[0],.025)
 for i in range(3):box('Threshold step',(0,-3.05-i*.3,.18-i*.045),(2.3+i*.1,.42,.23),rock[1],.07)
 # Timber parapet, main vault and entrance canopy.
 for j in range(16):
  a=j*math.tau/16
  if math.sin(a)<-.85:continue
  x,y=3*math.cos(a),2.4*math.sin(a)
  cyl('Parapet oak post',(x,y,1.7),(x,y,2.85),.13,wood[2]);rivet((x,y,2.36),.075)
  b=(j+1)*math.tau/16
  if math.sin(b)>=-.85:beam('Parapet rail',(x,y,2.35),(3*math.cos(b),2.4*math.sin(b),2.35),.20,wood[1])
 box('Upper chamber',(0,.25,2.65),(4.8,3.6,1.55),wood[0],.1)
 arch_roof(0,.25,2.65,2.65,1.65,3.85,4,9)
 arch_roof(0,-2.3,2.0,1.4,.8,1.55,2,7)
 for x in [-1.53,1.53]:torch(x,-3.05,.1)
 banner(-2.8,.4,2.2);banner(1.7,-2.78,.7)
def workshop(kind):
 w,d=3.9,3.15
 for x in [-w/2,w/2]:
  for y in [-d/2,d/2]:
   box('Individual foundation',(x,y,.16),(.63,.63,.32),rock[1],.1)
   beam('Squared oak pillar',(x,y,.28),(x,y,2.4),.27,wood[1]);box('Iron post strap',(x,y,.65),(.30,.30,.13),iron,.02)
 for row in range(5):
  log((0,d/2,.46+row*.3),w+.15,.17)
  if kind!='sawmill':log((-w/2,0,.46+row*.3),d+.22,.17,(0,1,0))
  if kind=='lumberjack':
   log((w/2,0,.46+row*.3),d+.22,.17,(0,1,0))
   # Half-width enclosed workroom leaves an open entrance beneath the vault.
   log((-1.28,-d/2,.46+row*.3),1.35,.17)
 if kind=='lumberjack':
  for yy in [-.8,.4]:beam('Wall diagonal brace',(w/2+.19,yy,.5),(w/2+.19,yy+.8,1.8),.14,wood[2])
 for y in [-d/2,d/2]:beam('Crossbeam',(-2.1,y,2.08),(2.1,y,2.08),.3,wood[2])
 for x in [-w/2,w/2]:
  for y in [-d/2,d/2]:beam('Knee brace',(x,y,1.5),(x*.6,y,2.1),.16,wood[2])
 if kind!='forester':arch_roof(0,0,2.12,2.27,1.0,3.65,4,8)
 else:
  for y in [-1.9,1.9]:beam('Nursery ridge',(0,y,3.2),(2.25,y,2.05),.16,wood[1]);beam('Nursery ridge',(0,y,3.2),(-2.25,y,2.05),.16,wood[1])
  for side in [-1,1]:
   for row in range(4):
    for j in range(6):
     x=side*(.22+row*.56);y=-1.72+j*.63+(row%2)*.16;z=3.15-abs(x)*.5
     vs=[(x-side*.38,y-.31,z+.22),(x-side*.34,y+.32,z+.22),(x+side*.42,y+.31,z-.23),(x+side*.67,y,z-.39),(x+side*.42,y-.31,z-.23),(x+side*.04,y,z+.07)]
     mesh('Overlapping ribbed leaf tile',vs,[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],leaf[(j+row)%4]);beam('Leaf roof vein',vs[5],vs[3],.025,leaf[2])
 lamp(1.85,-1.8,1.68)
 if kind=='lumberjack':
  log((-1.15,-2.7,.38),.7,.52,(0,0,1));beam('Great axe haft',(-1.15,-2.7,.78),(-.72,-2.7,1.9),.105,wood[2])
  mesh('Broad axe blade',[(-.8,-2.80,1.88),(-.2,-2.80,1.9),(-.1,-2.80,1.42),(-.49,-2.80,1.48),(-.8,-2.64,1.88),(-.2,-2.64,1.9),(-.1,-2.64,1.42),(-.49,-2.64,1.48)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],silver)
 elif kind=='sawmill':
  for x in [-.85,.85]:
   for y in [-1.4,1.2]:beam('Saw table leg',(x,y,.2),(x,y,1.1),.15,wood[1])
  for x in [-.8,.8]:beam('Saw runner',(x,-2.6,.95),(x,1.6,.95),.18,wood[2])
  for y in [-2,-1,0,1]:cyl('Feed roller',(-.9,y,.9),(.9,y,.9),.12,iron)
  vs=[]
  for i in range(40):
   a=i*math.tau/40;r=.66 if i%2==0 else .57;vs.append((r*math.cos(a),-.45,1.11+r*math.sin(a)))
  mesh('Toothed steel saw',vs,[tuple(range(40))],silver)
  for x in [-1.2,1.2]:beam('Saw frame',(x,-.45,.4),(x,-.45,1.65),.12,iron)
  log((0,-1.15,1.1),2.65,.20,(0,1,0))
 elif kind=='forester':
  for x in [-.95,.35,1.5]:
   box('Seedling box',(x,-2.05,.3),(1,.75,.45),wood[1],.04);box('Potting soil',(x,-2.05,.535),(.85,.6,.025),dark)
   for i in range(3):
    px=x-.26+i*.25;cyl('Sapling',(px,-2.05,.54),(px,-2.05,.88),.015,wood[2])
    for side in [-1,1]:ell('Young leaf',(px+side*.10,-2.05,.79),(.14,.055,.035),leaf[i%3],8,4)
  for x,y in [(2.35,-1.6),(2.2,-.9)]:ell('Clay vessel',(x,y,.37),(.26,.26,.36),wood[2]);cyl('Vessel rim',(x,y,.65),(x,y,.72),.17,cut)
def ant(guard=False):
 # 1.55m small RTS biped; separate elbowed antennae and visible mandibles.
 for side in [-1,1]:
  x=side*.17;ell('Leather boot',(x,-.1,.12),(.16,.26,.12),wood[0]);cyl('Shin',(x,0,.2),(x+side*.05,.02,.48),.085,chitin);ell('Knee',(x+side*.05,.02,.51),(.11,.10,.10),iron)
  cyl('Thigh',(x+side*.05,.02,.53),(side*.10,0,.82),.105,chitin)
 ell('Abdomen',(0,.24,.86),(.24,.32,.27),chitin)
 ell('Thorax',(0,0,1.04),(.25,.16,.29),iron,10,6)
 beam('Chest leather strap',(-.19,-.16,1.25),(.18,-.17,.9),.055,wood[2]);box('Belt',(0,-.01,.84),(.42,.35,.09),wood[0],.03)
 for side in [-1,1]:
  ell('Pauldron',(side*.28,0,1.21),(.19,.18,.14),iron,8,4);rivet((side*.28,-.15,1.21),.033)
  elbow=(side*.35,-.08,.99);hand=(side*.29,-.27,.9)
  cyl('Upper arm',(side*.27,0,1.17),elbow,.075,chitin);cyl('Forearm',elbow,hand,.09,chitin);ell('Gauntlet',hand,(.105,.09,.10),iron)
 ell('Ant head',(0,-.025,1.47),(.23,.21,.25),chitinlight,10,6)
 for side in [-1,1]:
  ell('Compound eye',(side*.157,-.172,1.49),(.085,.071,.12),eye,10,6);ell('Eye catchlight',(side*.16,-.231,1.53),(.017,.009,.025),glint,6,3)
  tube('Elbowed antenna',[(side*.10,-.02,1.66),(side*.17,-.04,1.94),(side*.29,-.17,2.02)],.028,chitin)
  tube('Mandible',[(side*.11,-.18,1.33),(side*.12,-.30,1.3),(side*.03,-.34,1.33)],.035,cut)
 if guard:
  cyl('Spear shaft',(.43,-.27,.05),(.43,-.27,2.06),.027,wood[2]);ell('Spear tip',(.43,-.27,2.22),(.08,.035,.20),silver,6,4)
for kind,off in [('fort',(0,12,0)),('lumberjack',(-8,0,0)),('sawmill',(8,0,0)),('forester',(8,12,0))]:
 fort() if kind=='fort' else workshop(kind);export(kind,off)
ant();export('worker',(-4,-7,0));ant(True);export('guard',(-1,-7,0))
log((0,0,.19));export('item-log',(2,-7,0));plank((0,0,.065));export('item-plank',(4,-7,0));box('Dressed stone',(0,0,.25),(.58,.55,.5),rock[2],.08);export('item-stone',(6,-7,0))
for i in range(9):log(((i%3)*.37-.37,(i//3)*.36-.36,.2+(i//6)*.3),1.5,.18,(0,1,0))
export('log-stack',(-4,-10,0))
for row in range(3):
 for j in range(4):plank((0,(j-1.5)*.31,.08+row*.145),1.7)
export('plank-stack',(0,-10,0))
# Save editable assets without overwriting the user's active Blender project.
bpy.data.libraries.write(OUT+'/Ant-colony-source.blend',{col},fake_user=True)
open(OUT+'/model-manifest.json','w').write(json.dumps(exports,indent=2))
result={'assets':exports,'source':OUT+'/Ant-colony-source.blend'}
