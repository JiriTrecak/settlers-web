"""Six broad lanterncaps, authored against the retained black-background concept."""
import bpy,bmesh,json,math,random,sys
from pathlib import Path
from mathutils import Vector
if not bpy.app.background:raise RuntimeError('Use a separate background Blender process')
A=Path(__file__).resolve().parent;ROOT=A.parents[3];sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed'])
geo=bpy.data.collections.new('Lanterncap grove');bpy.context.scene.collection.children.link(geo)
studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
def linear(h):
 rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
def material(name,color,texture=None,vertex=False,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1);p.inputs['Roughness'].default_value=.88
 if texture:
  path=A/texture if (A/texture).exists() else ROOT/'assets/textures/terrain'/texture
  im=bpy.data.images.load(str(path),check_existing=True);im.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 if vertex:
  v=m.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Organic color';m.node_tree.links.new(v.outputs['Color'],p.inputs['Base Color'])
 if emission:p.inputs['Emission Color'].default_value=(*linear(color),1);p.inputs['Emission Strength'].default_value=emission
 return m
cap=material('Weathered blue-green caps','607a70','lanterncap-skin.png')
organic=material('Stem rim and moss vertex color','ffffff',vertex=True)
gill=material('Quiet teal gill glow','9cbfae',emission=.22)
bark=material('Old root bark','65523b','hollow-bark.png')
stem=material('Fibrous ochre stalks','c7ad79','lanterncap-stem.png')
moss=material('Moss cushion foliage','687244',str(ROOT/'assets/textures/materials/ants/moss-surface.png'))
def mesh(name,vertices,faces,mat,color=None,smooth=False,uv=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);geo.objects.link(o);me.materials.append(mat)
 for p in me.polygons:p.use_smooth=smooth
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 colors=me.color_attributes.new(name='Organic color',type='FLOAT_COLOR',domain='CORNER')
 tex=me.uv_layers.new(name='Surface UV')
 for p in me.polygons:
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;v=me.vertices[vi].co
   colors.data[li].color=(*(color(v) if color else (1,1,1)),1)
   tex.data[li].uv=uv(v) if uv else ((v.y if abs(p.normal.x)>.6 else v.x)*.22,v.z*.22)
 return o
def tube(name,points,radii,mat,color=None,sides=12):
 points=[Vector(p) for p in points];vs=[]
 for j,p in enumerate(points):
  tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized();u=tangent.cross(Vector((0,1,0)))
  if u.length<.01:u=tangent.cross(Vector((1,0,0)))
  u.normalize();v=tangent.cross(u)
  for k in range(sides):
   a=k*math.tau/sides;r=radii[j]*(1+.05*math.sin(a*5+j*.35));vs.append(tuple(p+(u*math.cos(a)+v*math.sin(a))*r))
 fs=[tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))]
 fs += [(j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k) for j in range(len(points)-1) for k in range(sides)]
 ob=mesh(name,vs,fs,mat,color,True)
 if mat==stem:
  uv=ob.data.uv_layers.active
  for face in ob.data.polygons:
   seam=any(v%sides==sides-1 for v in face.vertices) and any(v%sides==0 for v in face.vertices)
   for li in face.loop_indices:
    vi=ob.data.loops[li].vertex_index;u=(vi%sides)/sides
    if seam and vi%sides==0:u=1
    uv.data[li].uv=(u,(vi//sides)/(len(points)-1))
 return ob
stemBase=linear('c7ad79');rimBase=linear('d3b27d');mossBase=linear('687244')
def shade(base,v,scale=.17):
 f=1+scale*(math.sin(v.x*2.3+v.z*.5)*math.sin(v.y*2.7-v.z*.7))
 return tuple(min(1,c*f) for c in base)
def mushroom(index,x,y,h,r,bend):
 N=48 if r>1.5 else 28;phase=index*.87
 def shape(a):return 1+.07*math.sin(a*3+phase)+.035*math.cos(a*7-phase)
 def rim(a):return h+r*(.045*math.sin(a*4+phase)+.025*math.sin(a*7))
 def pos(t,a,under=False):
  radius=r*t*shape(a)
  z=h+(rim(a)-h)*t*t+r*((-.35*(1-t)**.8-.065) if under else .40*(1-t*t)**1.3)
  return (x+math.cos(a)*radius,y+math.sin(a)*radius*.88,z)
 # An irregular dome with broad UV-painted scars, and a separate rolled rim.
 ts=[.025,.16,.34,.53,.72,.87,1];vs=[]
 for t in ts:
  for k in range(N):vs.append(pos(t,k*math.tau/N))
 faces=[tuple(reversed(range(N)))]
 faces += [(j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k) for j in range(len(ts)-1) for k in range(N)]
 mesh('Lanterncap %s · painted dome'%index,vs,faces,cap,smooth=True,uv=lambda v:((v.x-x)/(r*2.2)+.5+index*.13,(v.y-y)/(r*2.2)+.5))
 vs=[]
 for t,zoff in [(1,0),(1.015,-.035),(.99,-.075)]:
  for k in range(N):
   a=k*math.tau/N;p=pos(t if t<=1 else 1,a);vs.append((x+(p[0]-x)*t,y+(p[1]-y)*t,rim(a)+r*zoff))
 faces=[(j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k) for j in range(2) for k in range(N)]
 mesh('Lanterncap %s · parchment lip'%index,vs,faces,organic,lambda v:shade(rimBase,v,.08),True)
 # Radial gills are real broad folds, not thin line decoration.
 rings=[.14,.4,.7,.985];vs=[]
 for t in rings:
  for k in range(N*2):
   a=k*math.tau/(N*2);p=pos(t,a,True);vs.append((p[0],p[1],p[2]-(r*.065*math.sin(t*math.pi) if k%2==0 else 0)))
 faces=[tuple(reversed(range(N*2)))]
 faces += [(j*N*2+k,j*N*2+(k+1)%(N*2),(j+1)*N*2+(k+1)%(N*2),(j+1)*N*2+k) for j in range(len(rings)-1) for k in range(N*2)]
 underside=mesh('Lanterncap %s · radial luminous gills'%index,vs,faces,gill,smooth=False)
 # This open sheet has no enclosed volume to tell Blender which side is out.
 # Its visible side is explicitly down, on every cap, at every resolution.
 if sum(p.normal.z*p.area for p in underside.data.polygons)>0:
  bm=bmesh.new();bm.from_mesh(underside.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(underside.data);bm.free();underside.data.update()
 end=h-r*.38;pts=[];radii=[]
 for j in range(11):
  t=j/10;pts.append((x-bend*(1-t)+math.sin(t*math.pi)*bend*.4,y+.15*math.sin(t*math.pi),.12+end*t));radii.append(r*(.16+.06*(1-t)**3+.035*math.sin(t*math.pi)))
 tube('Lanterncap %s · curved stalk'%index,pts,radii,stem,sides=16)
 # Moss climbs the foot in broad facets, framing a readable pale stalk.
 for j in range(5):
  a=j*math.tau/5+phase;px=x-bend+math.cos(a)*r*.24;py=y+math.sin(a)*r*.24
  cushion('Stalk moss %s.%s'%(index,j),px,py,.2+rng.random()*.4,r*.31,r*.23)
def cushion(name,x,y,z,rx,ry):
 N=10;vs=[(x,y,z+.34)]
 for radius,height in [(.6,.26),(1,-.06)]:
  vs += [(x+math.cos(k*math.tau/N)*rx*radius*rng.uniform(.86,1.14),y+math.sin(k*math.tau/N)*ry*radius*rng.uniform(.86,1.14),z+height+rng.uniform(-.05,.05)) for k in range(N)]
 faces=[(0,1+k,1+(k+1)%N) for k in range(N)]+[(1+k,1+(k+1)%N,1+N+(k+1)%N,1+N+k) for k in range(N)]
 mesh(name,vs,faces,moss,smooth=True,uv=lambda v:(v.x*.55,v.y*.55))
for i in range(12):
 a=i*math.tau/12;length=rng.uniform(3.7,5);pts=[];rs=[]
 for j in range(9):
  t=j/8;r=.4+length*t;pts.append((math.cos(a)*r,math.sin(a)*r*.78,.12+math.sin(t*math.pi)*.33));rs.append(.48*(1-t)+.07)
 tube('Spreading deadwood root '+str(i),pts,rs,bark,sides=8)
 for j in [2,4,6]:cushion('Root moss %s.%s'%(i,j),pts[j][0],pts[j][1],pts[j][2]+rs[j]*.75,.5,.38)
for i,args in enumerate([(-2,1,5.9,2.75,.5),(2.1,1.2,4.4,2.45,-.55),(-.65,-1.65,2.9,2.2,.15),(-3.3,-1.8,1.65,1.05,.12),(3.1,-1.8,1.15,.9,-.1),(-.15,-3.25,.8,.66,.05)]):mushroom(i,*args)
create_stage(C,studio)
reference=bpy.data.images.load(str(A/'reference.png'),check_existing=True);reference.pack();reference.use_fake_user=True
parts=[o for o in geo.objects if o.type=='MESH'];(A/'model-stats.json').write_text(json.dumps({'meshes':len(parts),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts),'materials':6},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
