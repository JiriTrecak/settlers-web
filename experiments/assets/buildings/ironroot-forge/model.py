"""Ironroot Forge: broad timber shelter, masonry furnace, chimney and working anvil.
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
for n in ['Foundation and apron','Timber shelter','Curved roof','Furnace','Tools','Ownership','Studio']:
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
# A squat stone apron supports the open smithing floor, with a masonry furnace to the right.
for row in range(4):
 for col in range(6):box('Hewn plinth',(-2.2+col*.88,-1.75+row*1.05,.18),(.86,1.03,.36),STONE[(row+col)%3],.07)
for j in range(12):box('Floor board',(-.7,-1.75+j*.32,.42),(3.5,.30,.12),WOOD[j%3],.018)
cur=cols['Timber shelter']
for x in [-2.1,.8]:
 for y in [-1.25,1.5]:
  box('Shelter post',(x,y,1.7),(.4,.4,2.65),WOOD[1],.055)
  box('Stone post shoe',(x,y,.68),(.60,.60,.55),STONE[1],.055)
  for z in [1,2.65]:box('Forged post cuff',(x,y,z),(.46,.46,.19),IRON)
  box('Pale post end',(x,y,3.04),(.38,.38,.065),END)
  beam('Triangular brace',(x,y,2.1),(x+(.62 if x<0 else -.62),y,2.85),.20,WOOD[2])
for y in [-1.4,1.7]:beam('Gable beam',(-2.36,y,2.8),(1.06,y,2.8),.3,WOOD[1])
for x in [-2.1,.8]:beam('Side wall plate',(x,-1.55,2.8),(x,1.83,2.8),.3,WOOD[1])
for i in range(10):box('Back wall plank',(-2+i*.29,1.56,1.55),(.27,.17,1.8),WOOD[i%3],.015)
cur=cols['Curved roof']
# Independently layered, convex shingles; the broad bands read at RTS distance.
for side in [-1,1]:
 for row in range(3):
  t0=row/3;t1=(row+1)/3+.045
  for j in range(7):
   v=[]
   for k in range(3):
    t=t0+(t1-t0)*k/2
    for y in [-1.68+j*.53,-1.68+j*.53+.51]:v.append((-.65+side*1.9*t,y,3.9-1.05*t**1.45+.055*(2-row)))
   v += [(x,y,z-.10) for x,y,z in v]
   mesh('Curved roof shingle',v,[(0,1,3,2),(2,3,5,4),(6,8,9,7),(8,10,11,9),(0,6,7,1),(4,5,11,10),(0,2,8,6),(2,4,10,8),(1,7,9,3),(3,9,11,5)],ROOF[(row+j)%3])
 for y in [-1.72,.15,2.02]:
  for j in range(6):
   t=j/6;t2=(j+1)/6
   beam('Roof iron strap',(-.65+side*1.91*t,y,4.07-1.05*t**1.45),(-.65+side*1.91*t2,y,4.07-1.05*t2**1.45),.10,IRON)
   if j%2==0:rod('Roof brass rivet',(-.65+side*1.91*t,y,4.09-1.05*t**1.45),(-.65+side*1.91*t,y,4.14-1.05*t**1.45),.065,BRASS,8)
beam('Ridge timber',(-.65,-1.95,4.05),(-.65,2.15,4.05),.24,WOOD[1])
cur=cols['Furnace']
# Hearth is open towards the camera, framed by broad wedge-shaped stones.
box('Furnace dark interior',(1.67,.56,1.1),(1.35,1.4,1.6),DARK,.02)
for side in [-1,1]:
 for row in range(3):box('Hearth jamb',(1.67+side*.63,-.26,.62+row*.35),(.4,.55,.34),STONE[row%3],.06)
for j in range(7):
 a=math.pi*j/6
 o=box('Hearth arch stone',(1.67+.63*math.cos(a),-.29,1.47+.56*math.sin(a)),(.36,.6,.37),STONE[j%3],.045);o.rotation_euler.y=a-math.pi/2
for row in range(6):
 for j in range(2):
  box('Chimney masonry',(1.38+j*.61,.78,2.0+row*.39),(.59,.95,.37),STONE[(row+j)%3],.055)
box('Chimney lower cornice',(1.68,.78,4.24),(1.46,1.23,.21),IRON,.04)
# Hollow chimney rim, no capped cylinder pretending to be a flue.
for x in [1.08,2.28]:box('Flue side',(x,.78,4.45),(.20,1.21,.32),STONE[2],.04)
for y in [.27,1.29]:box('Flue end',(1.68,y,4.45),(1.05,.20,.32),STONE[1],.04)
box('Soot dark opening',(1.68,.78,4.23),(1.0,.8,.02),DARK,0)
EMBER=mat('Banked amber coals',linear('ed6919'));bs=EMBER.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(*linear('e86512'),1);bs.inputs['Emission Strength'].default_value=.8
for j in range(11):
 x=1.20+(j%4)*.25;y=-.15+(j//4)*.23
 o=box('Hearth coal',(x,y,.66),(.21,.22,.15),EMBER,.05);o.rotation_euler.z=j*.73
for x in [1.20,1.45,1.7,1.95,2.2]:beam('Iron hearth grate',(x,-.52,.52),(x,.6,.52),.06,IRON)
# Close the furnace's side and rear masonry around the dark firebox interior.
for row in range(4):
 for side in [-1,1]:
  for j in range(3):box('Firebox side masonry',(1.67+side*.73,.02+j*.48,.66+row*.35),(.26,.46,.33),STONE[(row+j)%3],.055)
 for j in range(3):box('Firebox rear masonry',(1.18+j*.49,1.29,.66+row*.35),(.47,.27,.33),STONE[(row+j+1)%3],.055)

cur=cols['Tools']
# The anvil is a readable forged silhouette with tapered horn, waist and broad foot.
rod('Anvil timber block',(-.7,-1.10,.49),(-.7,-1.10,1.18),.54,WOOD[1],10,r2=.47)
ring('Anvil stump band',(-.7,-1.10,.70),.54,.055,.10,IRON,10)
box('Anvil foot',(-.7,-1.1,1.2),(1.03,.60,.16),IRON,.035)
box('Anvil waist',(-.7,-1.1,1.45),(.45,.39,.40),IRON,.04)
box('Steel anvil face',(-.7,-1.1,1.7),(1.03,.56,.16),EDGE,.035)
rod('Tapered anvil horn',(-1.2,-1.1,1.63),(-1.9,-1.1,1.68),.21,EDGE,10,r2=.025)
beam('Hammer handle',(-.34,-1.18,1.85),(.0,-1.0,1.45),.08,WOOD[2]);box('Hammer head',(-.35,-1.19,1.9),(.34,.21,.18),IRON,.035)
# Bellows beside the furnace: layered broad leather folds rather than costly fine ribs.
LEATHER=mat('Bellows hide',linear('694738'))
for j in range(5):box('Bellows leather fold',(2.40,-1.15,.87+j*.08),(.72-j*.02,.9,.10),LEATHER,.05)
for z in [.79,1.25]:box('Bellows board',(2.4,-1.15,z),(.8,1.0,.12),WOOD[2],.045)
rod('Bellows nozzle',(2.3,-.72,1.0),(2.09,-.28,1.0),.13,IRON,10,r2=.08)
beam('Bellows lever',(2.43,-.8,1.33),(2.43,-2.0,1.59),.12,WOOD[1])
# Rear weapon rack and worked metal blanks.
for x in [-1.8,-.1]:beam('Rack upright',(x,1.18,.5),(x,1.18,2.2),.10,WOOD[2])
beam('Rack rail',(-1.95,1.18,1.8),(.1,1.18,1.8),.13,WOOD[1])
for j in range(4):
 x=-1.55+j*.42
 beam('Spear shaft',(x,1.13,.6),(x,1.13,2.38),.055,WOOD[2]);rod('Spear tip',(x,1.13,2.38),(x,1.13,2.69),.10,EDGE,4,r2=0)
for j in range(5):box('Steel billet',(.24+(j%2)*.28,-1.94+(j//2)*.15,.54),(.25,.54,.12),IRON,.02)
# Proud timber end caps and broad iron armor at the front eaves.
for x in [-2.1,.8]:
 box('Exposed hewn post head',(x,-1.25,3.09),(.46,.46,.46),WOOD[1],.07)
 box('End grain cap',(x,-1.25,3.34),(.43,.43,.05),END,.035)
 box('Heavy eave collar',(x,-1.25,2.91),(.56,.56,.23),IRON,.045)
 for xx in [-.16,.16]:rod('Collar rivet',(x+xx,-1.55,2.91),(x+xx,-1.58,2.91),.055,BRASS,8)
# Small silhouette variation in broad masonry, rather than expensive surface rubble.
for o in list(cols['Furnace'].objects):
 if o.type=='MESH' and ('masonry' in o.name or 'jamb' in o.name):
  for v in o.data.vertices:
   v.co.x+=rng.uniform(-.025,.025);v.co.z+=rng.uniform(-.025,.025)
for o in list(cols['Curved roof'].objects):
 if o.name.startswith('Roof iron strap'):
  o.scale.x=1.9;o.scale.y=.65

cur=cols['Ownership']
beam('Pennant mast',(-2.1,-1.25,2.6),(-2.1,-1.25,4.55),.09,WOOD[1])
v=[];f=[]
for j in range(4):
 for i in range(7):
  u=i/6;t=j/3;v.append((-2.09+.8*u,-1.25+.06*math.sin(u*5+t),4.5-.55*t-.06*u))
for j in range(3):
 for i in range(6):p=j*7+i;f.append((p,p+1,p+8,p+7))
mesh('Plain ownership pennant',v,f,TEAM)
create_stage(C,cols['Studio'])
scene['source_note']='Original Ironroot Forge architecture using ant stonemason material/style reference. Furnace, anvil and hidden surfaces inferred.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'source_faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
