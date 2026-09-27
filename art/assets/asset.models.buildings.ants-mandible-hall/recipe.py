"""Mandible Hall: modular, symmetric, editable ant command hall.
Blender Z-up, front -Y. Linked tower meshes, reflected mandibles; no ground mesh.
Run in background Blender. Textures are authored by textures.py, and packed on save.
"""
import bpy, math, json, sys, random
from pathlib import Path
from mathutils import Vector, Matrix
P=Path(__file__).resolve().parent
ROOT=P.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
if not bpy.app.background: raise RuntimeError('Recipe requires background Blender; never resets an open artist document.')
bpy.ops.wm.read_factory_settings(use_empty=True)
CFG=json.loads((P/'asset.json').read_text())
R=random.Random(CFG['seed'])

def collection(name):
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
C=collection('01 Central seed-shell hall')

def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4

def material(name,color,rough=.65,texture=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*[linear(c) for c in color],1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=m.diffuse_color;b.inputs['Roughness'].default_value=rough
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(P/texture));t.image.pack();t.interpolation='Linear'
  m.node_tree.links.new(t.outputs['Color'],b.inputs['Base Color'])
  normal_path=P/(Path(texture).stem+'-normal.png')
  if normal_path.exists():
   nt=m.node_tree.nodes.new('ShaderNodeTexImage');nt.image=bpy.data.images.load(str(normal_path));nt.image.colorspace_settings.name='Non-Color';nt.image.pack()
   nm=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(nt.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],b.inputs['Normal'])
 return m
WOOD=material('Wood_Dark',(.41,.25,.13),texture='wood.png')
DOME=material('Wood_Light_Dome',(.75,.53,.29),texture='dome.png')
LEAF=material('Leaf_Green',(.34,.47,.11),.72,'leaf.png')
CHITIN=material('Chitin_Red',(.65,.21,.13),.28,'chitin.png')
CHITIN.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.20
IVORY=material('Ivory',(.88,.79,.61),.43)
DARK=material('Interior_Dark',(.095,.052,.029),.9)
TEAM=material('TC_TeamColor',(.80,.29,.18),.44,'team.png')
# Exporter uses the neutral painted pattern and preserves this red default as the factor.
TEAM['ownership_texture_neutral']=True
b=TEAM.node_tree.nodes.get('Principled BSDF');t=next(n for n in TEAM.node_tree.nodes if n.type=='TEX_IMAGE')
mix=TEAM.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=TEAM.diffuse_color
TEAM.node_tree.links.new(t.outputs['Color'],mix.inputs[1]);TEAM.node_tree.links.new(mix.outputs[0],b.inputs['Base Color'])


def mesh(name,verts,faces,mat,uvs=None,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(mat);me.update()
 ob=bpy.data.objects.new(name,me);C.objects.link(ob)
 uv=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  p.use_smooth=smooth
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index
   uv.data[li].uv=uvs[vi] if uvs else (verts[vi][0],verts[vi][2])
 return ob

def bevel(ob,w=.04):
 # Timber already has clipped corners; extra bevel rings are subpixel at RTS distance.
 m=ob.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');m.keep_sharp=True
 return ob

def beam(name,a,b,width=.25,depth=None,mat=WOOD,taper=.96):
 """Eight-sided bevelled timber, along its local Z; notched joints use collars/pegs."""
 a,b=Vector(a),Vector(b);length=(b-a).length;d=depth or width
 verts=[];uvs=[]
 # Rectangular cross-section with clipped corners, no expensive subdivision.
 outline=[(-.38,-.5),(.38,-.5),(.5,-.38),(.5,.38),(.38,.5),(-.38,.5),(-.5,.38),(-.5,-.38)]
 for k,z in enumerate([0,length]):
  for i,(x,y) in enumerate(outline):
   f=1 if k==0 else taper;verts.append((x*width*f,y*d*f,z));uvs.append((i/8,z/max(length,.001)))
 faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 ob=mesh(name,verts,faces,mat,uvs);ob.location=a;ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return bevel(ob,.018)

def tube(name,points,radii,mat=WOOD,sides=8):
 verts=[];uv=[]
 for i,p in enumerate(points):
  p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  t.normalize();ref=Vector((0,1,0)) if abs(t.y)<.92 else Vector((1,0,0));u=ref.cross(t).normalized();v=t.cross(u).normalized();r=radii[i] if isinstance(radii,list) else radii
  for j in range(sides):
   ang=j*2*math.pi/sides
   if mat==WOOD and sides==8:
    xx,yy=[(-.76,-1),(.76,-1),(1,-.76),(1,.76),(.76,1),(-.76,1),(-1,.76),(-1,-.76)][j]
   else:
    flute=1+.075*math.cos(ang*6) if mat==IVORY else 1
    xx,yy=math.cos(ang)*flute,math.sin(ang)*flute
   verts.append(tuple(p+u*(xx*r)+v*(yy*r)));uv.append((j/sides,i/(len(points)-1)))
 faces=[]
 for i in range(len(points)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
 faces.extend([tuple(range(sides-1,-1,-1)),tuple(range((len(points)-1)*sides,len(points)*sides))])
 return mesh(name,verts,faces,mat,uv,True)

def ring(name,r,z,thick,mat=WOOD,segments=24,gate=False):
 points=[]
 # Leave a proper centered opening for the lower structural hoops.
 start=-math.pi/2+.38 if gate else 0;end=3*math.pi/2-.38 if gate else 2*math.pi
 for i in range(segments+1):
  a=start+(end-start)*i/segments;points.append((r*math.cos(a),r*math.sin(a),z))
 return tube(name,points,thick,mat,8)

def leaf(name,length,width,curvature=.2,thickness=.035,origin=(0,0,0),orientation=(0,0,0),mat=LEAF,drop=0,fan=False):
 """Broad roof leaf with folded midrib, scalloped outline and painted UV veins."""
 n=4;verts=[];uv=[]
 for side in [0,1]:
  for i in range(n+1):
   t=i/n;w=width*.5*(.12+.88*math.sin(math.pi*(t**.72))**.68)*(1-.035*(i%2))
   if fan:w=width*.5*(.05+.95*t)*min(1,(1-t)/.14)
   if i==n:w=.012
   for j in [-1,0,1]:
    x=w*j;y=length*t;z=curvature*math.sin(math.pi*t)-drop*(t**.55)+.025*width*(1-abs(j))*math.sin(math.pi*t)-side*thickness
    verts.append((x,y,z));uv.append(((j+1)/2,t))
 faces=[];stride=(n+1)*3
 for side in range(2):
  for i in range(n):
   for j in range(2):
    a=side*stride+i*3+j;face=(a,a+1,a+4,a+3);faces.append(face if side==0 else tuple(reversed(face)))
 edge=[i*3 for i in range(n+1)]+[n*3+1]+[i*3+2 for i in range(n,-1,-1)]+[1]
 for i,a in enumerate(edge):b=edge[(i+1)%len(edge)];faces.append((a,b,b+stride,a+stride))
 ob=mesh(name,verts,faces,mat,uv,True);ob.location=origin;ob.rotation_euler=orientation;return ob

def spike(name,base,height=.85,radius=.28,lean=(0,0)):
 points=[];radii=[]
 for i in range(6):
  t=i/5;points.append((base[0]+lean[0]*t*t,base[1]+lean[1]*t*t,base[2]+height*t));radii.append(radius*(1-t)**.72+.003)
 return tube(name,points,radii,IVORY,8)

def collar(name,center,r=.38,h=.3):
 # Fitted curved timber segments with recessed joints; no rope or metal straps.
 for i in range(12):
  verts=[];uv=[]
  for z in [0,h]:
   for radius in [r-.09,r+.09]:
    for j in range(3):
     angle=math.tau*(i+.012+j*.488)/12
     verts.append((center[0]+radius*math.cos(angle),center[1]+radius*math.sin(angle),center[2]+z));uv.append((j/2,z/h))
  faces=[(0,1,4,3),(1,2,5,4),(6,9,10,7),(7,10,11,8),(0,6,7,1),(1,7,8,2),(3,4,10,9),(4,5,11,10),(0,3,9,6),(2,8,11,5)]
  bevel(mesh(name,verts,faces,WOOD,uv),.018)

def tower():
 """Author once in local space; copies share every mesh and material datablock."""
 for x in [-.78,.78]:
  for y in [-.78,.78]:
   beam('Tower corner post',(x,y,0),(x,y,5.85),.35,.38)
   for z in [.18,1.25,3.05,5.60]:
    beam('Tower notched block',(x,y,z-.18),(x,y,z+.18),.49,.49,mat=WOOD)
 for z in [.22,1.35,3.05,5.36]:
  for y in [-.78,.78]:beam('Tower cross rail',(-.86,y,z),(.86,y,z),.29,.3)
  for x in [-.78,.78]:beam('Tower side rail',(x,-.78,z),(x,.78,z),.29,.3)
 for side in range(4):
  a=side*math.pi/2
  def pos(x,y,z):return (x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z)
  for i in range(6):
   x=-.60+i*.24
   beam('Tower fitted wall board',pos(x,-.70,.3),pos(x,-.70,3.0),.232,.13,taper=1)
  for x in [-.49,.49]:beam('Tower upper upright',pos(x,-.70,3.1),pos(x,-.70,5.38),.23,.18)
  # Natural ownership plate on all faces, no banners or synthetic cloth.
  leaf('Tower hanging ownership plate',1.48,.82,.065,.06,pos(0,-.84,5.20),(-math.pi/2,0,a),TEAM)
  for x in [-.28,.28]:beam('Wooden plate peg',pos(x,-.91,5.12),pos(x,-.70,5.12),.11,.11,mat=DOME)
 for y in [-.98,.98]:
  for x in [-.78,.78]:
   for z in [1.35,3.05]:beam('Tower exposed timber peg',(x,y,z),(x,y+(.05 if y>0 else -.05),z),.105,.105,mat=DOME)
 for layer in range(1):
  for i in range(12):
   a=math.tau*(i+.5*layer)/12
   leaf('Tower layered roof leaf',1.60,.83,.015,.045,(0,0,6.25),(0,0,a),drop=.85,fan=True)
 collar('Tower carved spike socket',(0,0,6.02),.34,.33)
 spike('Tower ivory finial',(0,0,6.32),1.0,.29)

# Central wall: open doorway interrupts boards and both plinth rails.
rad=3.24
for i in range(72):
 a=math.tau*i/72;x=rad*math.cos(a);y=rad*math.sin(a)
 if y<-2.8 and abs(x)<1.14:continue
 ob=beam('Hall vertical fitted board',(x,y,.06),(x,y,4.30),.278,.18,taper=1);ob.rotation_euler.z=a+math.pi/2
for z in [.20,1.60,4.2]:ring('Hall timber hoop',rad,z,.17,gate=True)
for i in range(12):
 a=math.tau*i/12
 if abs(math.cos(a))<.2 and math.sin(a)<0:continue
 beam('Hall structural upright',(rad*math.cos(a),rad*math.sin(a),0),(rad*math.cos(a),rad*math.sin(a),4.4),.34,.35)
# Seed-shell dome made from contiguous curved panels, not a complete sphere hidden inside walls.
profiles=[(3.46,4.30),(3.35,4.53),(3.12,4.80),(2.79,5.11),(2.35,5.49),(1.84,5.81),(1.32,6.04),(.94,6.10)]
for sector in range(48):
 verts=[];uv=[]
 for k,(r,z) in enumerate(profiles):
  for j in range(3):
   a=math.tau*(sector+(j/2)*.991)/48;rr=r+.025*math.sin(math.pi*j/2)
   verts.append((rr*math.cos(a),rr*math.sin(a),z));uv.append((j/2,k/(len(profiles)-1)))
 faces=[]
 for k in range(len(profiles)-1):
  for j in range(2):a=k*3+j;faces.append((a,a+1,a+4,a+3))
 mesh('Carved seed shell segment',verts,faces,DOME,uv,True)
for i in range(10):
 a=math.tau*i/10+math.pi/10
 tube('Dome radial timber rib',[(r*math.cos(a),r*math.sin(a),z+.06) for r,z in profiles],.19,WOOD,8)
ring('Dome eave ring',3.48,4.38,.17)
ring('Crown lower carved collar',1.05,5.97,.16,DOME)
ring('Crown wide timber collar',1.15,6.30,.19)
ring('Crown upper timber rim',1.15,6.55,.13)
# Large leaves shelter side walls and span towards the repeated towers.
for i in range(10):
 a=math.tau*i/10
 if abs(math.cos(a))<.35 and math.sin(a)<0:continue
 leaf('Hall broad leaf eave',1.65,1.74,.10,.045,(2.48*math.cos(a),2.48*math.sin(a),4.49),(0,0,a-math.pi/2),drop=.62)
for x in [-3.35,3.35]:
 for j in range(3):
  y=-1.05+j*1.05
  leaf('Side connecting leaf roof',1.25,1.45,.1,.04,(x*.79,y,4.7),(0,0,-math.pi/2 if x>0 else math.pi/2),drop=.38)
for side in [-1,1]:
 leaf('Entrance side shelter leaf',1.65,1.72,.09,.05,(side*1.98,-2.63,4.48),(0,0,math.pi),drop=.63)
for side in [-1,1]:
 beam('Leaf gallery outer rafter',(side*3.15,-1.3,4.40),(side*3.15,1.8,5.65),.24,.24)
 leaf('Long connecting gallery leaf',3.15,1.50,-.14,.045,(side*3.15,1.80,5.82),(0,0,math.pi),drop=1.24)
# Four identical mesh sets, merely translated/rotated around hall.
C=collection('02 Tower master linked geometry')
tower();template=list(C.objects)
centers=[(-3.22,-2.55),(3.22,-2.55),(-3.22,2.55),(3.22,2.55)]
for idx,(x,y) in enumerate(centers):
 target=C if idx==0 else collection('0%d Tower linked instance'%(idx+2))
 transform=Matrix.Translation((x,y,0))@Matrix.Diagonal((1,1,1.12,1))
 for ob in template:
  item=ob if idx==0 else ob.copy()
  if idx:item.data=ob.data;target.objects.link(item)
  # Template's matrix must be local for every copy.
  if idx==0:ob['local_matrix']=[v for row in ob.matrix_basis for v in row]
  local=Matrix([ob['local_matrix'][j:j+4] for j in range(0,16,4)])
  item.matrix_world=transform@local
  item['module']='tower';item['instance']=idx
C=collection('07 Entrance arch and mirrored mandibles')
# Curved entrance frame with genuine empty cavity and fitted interior floor.
for sign in [-1,1]:
 pts=[(sign*1.32,-3.37,.02),(sign*1.34,-3.43,.8),(sign*1.19,-3.48,1.65),(sign*.87,-3.48,2.49),(sign*.42,-3.46,2.98),(0,-3.42,3.15)]
 tube('Entrance carved arch jamb',pts,.18,WOOD,10)
 beam('Door inner upright',(sign*.91,-3.23,.2),(sign*.91,-3.23,2.38),.22,.3)
 beam('Grounded entrance post',(sign*1.49,-3.55,0),(sign*1.49,-3.55,.74),.4,.45)
# Interior wall is recessed, not a flat black sticker over the doorway.
mesh('Recessed dark interior wall',[(-1.0,-1.6,.25),(1.0,-1.6,.25),(1.0,-1.6,2.65),(-1.0,-1.6,2.65)],[(0,1,2,3)],DARK)
for sign in [-1,1]:
 for j in range(6):beam('Warm inner doorway lining',(sign*.98,-3.30+j*.25,.2),(sign*.98,-3.30+j*.25,2.4),.21,.20,taper=1)
for j in range(9):beam('Interior floor plank',(-1.03,-3.30+j*.23,.42),(1.03,-3.30+j*.23,.42),.21,.12,mat=WOOD,taper=1)
for j in range(6):
 y=-4.70+j*.23;z=.08+j*.075
 beam('Short entry stair tread',(-1.07,y,z),(1.07,y,z),.255,.12,mat=WOOD,taper=1)
for s in [-1,1]:
 beam('Stair stringer',(s*1.1,-4.82,.06),(s*1.1,-3.43,.42),.20,.20)
 for y,z in [(-4.72,.25),(-3.46,.50)]:beam('Stair end tenon',(s*1.12,y,0),(s*1.12,y,z),.28,.3,mat=DOME)

def mandible():
 # Closed convex lens section following crescent silhouette. Major inner teeth are integrated.
 n=30;verts=[];uv=[]
 for i in range(n+1):
  t=i/n
  z=.28+4.15*t
  center=1.03+.43*math.sin(math.pi*t)-.46*t
  half=.015+.29*math.sin(math.pi*t)**.64
  # Three broad cusps project into the entrance; smooth elsewhere.
  tooth=sum(.22*max(0,1-abs(t-at)/.075)**1.2 for at in [.26,.48,.69])
  inner=center-half-tooth;outer=center+half
  for j in range(10):
   a=j*math.tau/10;x=(inner+outer)/2+(outer-inner)/2*math.cos(a)
   y=-3.69+.22*math.sin(a)*math.sin(math.pi*t)**.6
   verts.append((x,y,z));uv.append((j/10,t))
 faces=[]
 for i in range(n):
  for j in range(10):a=i*10+j;b=i*10+(j+1)%10;faces.append((a,b,b+10,a+10))
 faces.extend([tuple(range(9,-1,-1)),tuple(range(n*10,(n+1)*10))])
 ob=mesh('Entrance chitin mandible · right',verts,faces,CHITIN,uv,True)
 mirror=ob.copy();mirror.data=ob.data;mirror.name='Entrance chitin mandible · left';mirror.scale.x=-1;C.objects.link(mirror)
 ob['module']='mandible';mirror['module']='mandible';return ob
mandible()
# Stretch the entrance frame to meet the raised dome eave.
for obj in C.objects:
 if obj.name.startswith(('Entrance carved arch','Door inner upright')):obj.scale.z=1.36
C=collection('08 Crown of the colony')
collar('Central ivory socket',(0,0,6.52),.39,.35)
spike('Central crown ivory',(0,0,6.85),1.02,.30)
mesh('Carved crown timber seat',[(0,0,6.30)]+[(1.12*math.cos(i*math.tau/48),1.12*math.sin(i*math.tau/48),6.30) for i in range(48)],[(0,i+1,(i+1)%48+1) for i in range(48)],WOOD)
# Three large chitin crown petals rise around the central ivory; symmetrical around front axis.
for i in range(3):
 a=math.tau*i/3+math.pi/2+.45;points=[];rr=[]
 for k in range(15):
  t=k/14;r=.76+.38*math.sin(math.pi*t)-.12*t
  points.append((r*math.cos(a),r*math.sin(a),6.45+1.92*t));rr.append(.36*(1-t)**.72+.006)
 tube('Crown chitin petal',points,rr,CHITIN,12)
C=collection('09 Studio camera and lighting')
scene=create_stage(CFG,C)
bpy.data.lights["Warm key"].size=4.0
bpy.data.lights["Amber right rim"].size=4.0
# Warm inner bounce is studio-only; exported cavity relies on material shading.
ld=bpy.data.lights.new('Warm entrance bounce','POINT');ld.energy=65;ld.color=(1,.38,.07);ld.shadow_soft_size=.35
ob=bpy.data.objects.new('Warm entrance bounce',ld);C.objects.link(ob);ob.location=(0,-2.95,1.65)
ref=bpy.data.images.load(str(P/'reference.png'));ref.name='reference.png';ref.pack();ref.use_fake_user=True
for m in bpy.data.materials:m.use_fake_user=True
bpy.context.view_layer.update()
for obj in [o for o in scene.objects if o.type=='MESH']:
 inv=obj.matrix_world.inverted()
 for vertex in obj.data.vertices:
  world=obj.matrix_world@vertex.co
  if world.z<0:world.z=0;vertex.co=inv@world
for filename in ['model.py','textures.py','asset.json']:
 text=bpy.data.texts.new(filename);text.write((P/filename).read_text())
meshes=[o for o in scene.objects if o.type=='MESH']
stats={'objects':len(meshes),'uniqueMeshes':len({o.data.name for o in meshes}),'sourceTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'towerInstances':4,'towerMeshCount':len(template),'groundPlane':False,'seed':CFG['seed']}
(P/'model-stats.json').write_text(json.dumps(stats,indent=2))
scene['asset']='Mandible Hall';scene['front']='-Y';scene['structure']='Four linked towers; mirror-paired entrance mandibles; no integrated terrain.'
bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']))
print('MODEL_STATS',json.dumps(stats))
