"""Original Ant colony assets. Metres, Z up, front -Y, root at soil level.
Editable parts stay in Blender; runtime meshes are merged into material batches.
Run through Blender MCP with scripts/ant-colony/blender.mjs.
"""
import bpy, bmesh, math, random, os, json
from mathutils import Vector
R='/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web'
OUT=R+'/assets/ant-colony'
os.makedirs(OUT,exist_ok=True)
random.seed(710)
name='Ant Colony — reference rebuild'
selected=globals().get('ANT_ASSETS')
old=bpy.data.collections.get(name)
if old and selected:
 roots=[o for o in old.objects if o.parent is None and o.get('ant_asset_id',o.name.split('.')[0]) in selected]
 doomed=set(roots)
 for root in roots:doomed.update(root.children_recursive)
 for o in doomed:bpy.data.objects.remove(o,do_unlink=True)
 col=old
else:
 if old:
  for o in list(old.all_objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(old)
 col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
parts=[];exports=[]
if selected and os.path.exists(OUT+'/model-manifest.json'):
 exports=[a for a in json.load(open(OUT+'/model-manifest.json')) if a['id'] not in selected]
def wanted(asset):return selected is None or asset in selected
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
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bev,segments=2,affect='EDGES',profile=.5);bm.to_mesh(o.data);bm.free();o.data.update()
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
 p=Vector(p);v=Vector(axis).normalized()
 # Split bark has long shallow facets; avoid a featureless round brown bar.
 vertices=[];sides=11;rings=6
 for row in range(rings):
  t=row/(rings-1)
  for j in range(sides):
   angle=j*math.tau/sides
   radius=r*(1-.07*t)*(.98+.045*math.sin(j*3.7+row*.7))
   vertices.append((math.cos(angle)*radius,math.sin(angle)*radius,(t-.5)*L))
 faces=[tuple(range(sides-1,-1,-1)),tuple(range((rings-1)*sides,rings*sides))]
 faces += [(row*sides+j,row*sides+(j+1)%sides,(row+1)*sides+(j+1)%sides,(row+1)*sides+j) for row in range(rings-1) for j in range(sides)]
 bark=mesh('Split faceted bark',vertices,faces,wood[1]);bark.data.materials.append(wood[0]);bark.data.materials.append(wood[2])
 for face in bark.data.polygons:face.material_index=1 if face.index%7==0 else 2 if face.index%11==0 else 0
 bark.location=p;bark.rotation_euler=v.to_track_quat('Z','Y').to_euler()
 tangent=v.cross(Vector((0,0,1)))
 if tangent.length<.01:tangent=v.cross(Vector((0,1,0)))
 tangent.normalize();other=v.cross(tangent)
 for j in range(7):
  a=j*math.tau/7+.18;normal=tangent*math.cos(a)+other*math.sin(a)
  points=[p+v*((t-.5)*L*.94)+normal*(r*(1-.07*t)+.008) for t in [0,.3,.65,1]]
  tube('Long bark fissure',points,.009,wood[0])
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
def arch_roof(cx,cy,base,rx,rz,depth,rows=4,plates=8,pitched=False):
 from mathutils.bvhtree import BVHTree
 roof_vertices=[];roof_faces=[]
 def height(a):return 1-abs(math.cos(a)) if pitched else math.sin(a)
 # Hand-shaped shell shingles: stagger courses and turn down the exposed lip.
 rng=random.Random(612 if pitched else 913)
 for j in range(rows):
  for k in range(plates):
   offset=.15*math.sin(k*2.4)
   y0=cy-depth/2+j*depth/rows-.08+offset
   y1=y0+depth/rows+.22
   a0=.045+k*(math.pi-.09)/plates
   a1=.045+(k+1)*(math.pi-.09)/plates+.025
   bulge=rng.uniform(.10,.19);skew=rng.uniform(-.045,.045)
   vs=[]
   for v in range(6):
    t=v/5
    for u in range(7):
     q=u/6;a=a0+(a1-a0)*q+skew*math.sin(t*math.pi)
     relief=.10+bulge*math.sin(q*math.pi)*math.sin((.15+.85*t)*math.pi)+.07*(1-t)
     # Rounded scallop with a tiny asymmetric chipped corner.
     lip=.13*math.sin(q*math.pi)+.025*math.sin(q*math.pi*3+j)
     yy=y0+(y1-y0)*t-lip*(1-t)**3
     if u==1 and (j+k)%3==0:yy+=.055*(1-t)**3
     vs.append((cx+(rx+relief)*math.cos(a),yy,base+(rz+relief)*height(a)))
   faces=[(v*7+u+7,v*7+u+8,v*7+u+1,v*7+u) for v in range(5) for u in range(6)]
   offset=len(roof_vertices);roof_vertices.extend(vs);roof_faces.extend(tuple(i+offset for i in f) for f in faces)
   o=mesh('Overlapping rounded shell shingle',vs,faces,red[rng.choice([0,1,1,2,3])])
   for f in o.data.polygons:f.use_smooth=True
   sol=o.modifiers.new('Thick exposed shell edge','SOLIDIFY');sol.thickness=.09
   bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
   # A narrow warm edge catches the sun and separates plates at game distance.
   edge=[(x,y-.004,z+.006) for x,y,z in vs[:7]]
   tube('Worn shell lip',edge,.016,red[2])
 roof_tree=BVHTree.FromPolygons(roof_vertices,roof_faces,all_triangles=False)
 def at(a,y,radd=0):
  x=cx+(rx+.12)*math.cos(a)
  yy=max(cy-depth/2+.12,min(cy+depth/2-.12,y))
  hit,_,_,_=roof_tree.ray_cast(Vector((x,yy,base+rz+3)),Vector((0,0,-1)),10)
  if hit is None:
   xx=max(cx-rx+.03,min(cx+rx-.03,x))
   hit,_,_,_=roof_tree.ray_cast(Vector((xx,yy,base+rz+3)),Vector((0,0,-1)),10)
  z=hit.z if hit is not None else base+(rz+.22)*height(a)
  return(x,y,z+.085+radd)
 for yy in [cy-depth/2-.12,cy,cy+depth/2+.12]:
  half=.11
  for k in range(18):
   a0=.015+k*(math.pi-.03)/18;a1=.015+(k+1)*(math.pi-.03)/18
   outer=[at(a0,yy-half),at(a1,yy-half),at(a1,yy+half),at(a0,yy+half)]
   inner=[at(a0,yy-half,-.045),at(a1,yy-half,-.045),at(a1,yy+half,-.045),at(a0,yy+half,-.045)]
   mesh('Thick forged shell brace',outer+inner,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],iron)
   if k%2==0:rivet(at((a0+a1)/2,yy,.025),.055)
  for side in [-1,1]:
   pts=[at(.015+k*(math.pi-.03)/24,yy+side*half,.012) for k in range(25)]
   tube('Polished armor brace rim',pts,.016,silver)
 # Longitudinal spine straps tie the four transverse braces together.
 for a in [math.pi*.28,math.pi*.72]:
  pts=[at(a,cy-depth/2-.12+i*(depth+.24)/6,.03) for i in range(7)]
  for p,q in zip(pts,pts[1:]):beam('Spine strap',p,q,.095,iron)
def lamp(x,y,z):
 beam('Lamp bracket',(x,y+.1,z+.35),(x,y-.14,z+.35),.08,iron)
 ell('Glowing resin',(x,y,z),(.12,.12,.23),amber,8,5)
 for zz in [z-.23,z+.22]:box('Lantern cap',(x,y,zz),(.3,.3,.06),iron,.03)
 for dx,dy in [(-.11,-.11),(.11,-.11),(-.11,.11),(.11,.11)]:beam('Lantern cage',(x+dx,y+dy,z-.22),(x+dx,y+dy,z+.22),.025,iron)
def torch(x,y,z):
 cyl('Torch post',(x,y,z),(x,y,z+.8),.075,wood[0]);ell('Brazier',(x,y,z+.83),(.22,.22,.13),iron)
 outer=mat('torch orange fringe','ff5309',0,1,1.3)
 middle=mat('torch golden flame','ff9c26',0,1,1.8)
 core=mat('torch hot core','ffe6a0',0,1,2.0)
 for material in [outer,middle,core]:
  material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(0,0,0,1)
 for dx,dy,h,r,lean,m in [(0,.02,.62,.12,.09,outer),(-.10,.01,.40,.07,-.07,outer),(.09,0,.34,.06,.06,outer),(-.01,-.075,.43,.082,-.03,middle),(.015,-.13,.24,.045,.035,core)]:
  vs=[]
  for t,width in [(0,.38),(.22,1),(.48,.62),(.73,.43),(1,.005)]:
   for j in range(7):
    a=j*math.tau/7
    bend=lean*math.sin(t*math.pi*.8)-lean*.3*math.sin(t*math.pi*2)
    vs.append((x+dx+bend+math.cos(a)*r*width,y+dy+math.sin(a)*r*width,z+.9+t*h))
  o=mesh('Curling fire tongue',vs,[(k*7+j,k*7+(j+1)%7,(k+1)*7+(j+1)%7,(k+1)*7+j) for k in range(4) for j in range(7)],m)
  for f in o.data.polygons:f.use_smooth=True

def banner(x,y,z):
 cyl('Banner pole',(x,y,z),(x,y,z+1.65),.047,wood[0]);beam('Banner crossbar',(x-.06,y,z+1.5),(x+.76,y,z+1.5),.06,wood[2])
 mesh('Red swallowtail',[(x+.04,y,z+1.47),(x+.74,y+.05,z+1.44),(x+.72,y+.02,z+.32),(x+.39,y-.01,z+.5),(x+.05,y,z+.28)],[(0,1,2,3,4)],flagmat)
 # Angular ant sigil, gold small thorax and mandibles.
 for a,b in [((.4,1.24),(.4,.64)),((.4,1.18),(.23,1.3)),((.4,1.18),(.57,1.3)),((.4,.96),(.21,.85)),((.4,.96),(.60,.85)),((.4,.78),(.26,.6)),((.4,.78),(.56,.6))]:beam('Ant sigil',(x+a[0],y-.025,z+a[1]),(x+b[0],y-.025,z+b[1]),.023,gold)
def plank(p,L=1.4):
 rng=random.Random(round(L*10000)+round(p[2]*1000));p=Vector(p)
 width=rng.uniform(.27,.32);thickness=rng.uniform(.115,.14)
 vs=[]
 for j in range(3):
  x=(j/2-.5)*L;bow=.013 if j==1 else 0
  w=width*(1+rng.uniform(-.05,.05))/2
  for y,z in [(-w,-thickness/2),(w,-thickness/2),(w,thickness/2),(-w,thickness/2)]:vs.append((x,y,z+bow))
 fs=[(3,2,1,0),(8,9,10,11)]+[(j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k) for j in range(2) for k in range(4)]
 o=mesh('Hand sawn board',vs,fs,wood[rng.choice([1,2,2,3])]);o.location=p
 o.data.materials.append(cut)
 o.data.polygons[0].material_index=1;o.data.polygons[1].material_index=1
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.016,segments=1,affect='EDGES',profile=.5);bm.to_mesh(o.data);bm.free()
 for yy in [-.075,.05]:box('Wood grain',(p[0],p[1]+yy,p[2]+thickness/2+.015),(L*.75,.009,.003),wood[0])
def bake_contact_shading(obj):
 from mathutils.bvhtree import BVHTree
 geometry=obj.data
 tree=BVHTree.FromPolygons([v.co for v in geometry.vertices],[tuple(f.vertices) for f in geometry.polygons],all_triangles=False)
 colors=geometry.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
 geometry.color_attributes.active_color=colors
 cache={};rays=16
 for vertex in geometry.vertices:
  p=vertex.co;n=vertex.normal.normalized()
  key=tuple(round(v,3) for v in (*p,*n))
  if key not in cache:
   tangent=n.cross(Vector((0,0,1)))
   if tangent.length<.01:tangent=n.cross(Vector((0,1,0)))
   tangent.normalize();bitangent=n.cross(tangent);occlusion=0
   for i in range(rays):
    radius=math.sqrt((i+.5)/rays);angle=i*2.3999632297
    direction=tangent*(radius*math.cos(angle))+bitangent*(radius*math.sin(angle))+n*math.sqrt(1-radius*radius)
    hit,_,_,distance=tree.ray_cast(p+n*.018,direction,1.15)
    if hit is not None:occlusion+=(1-distance/1.15)**.65
   cache[key]=1-.58*occlusion/rays
  value=cache[key];colors.data[vertex.index].color=(value,value,value,1)
 return len(cache)
def export(asset,offset):
 global parts
 # Resolve pending object transforms before copying matrices into the GLB batch.
 bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='DESELECT');copies=[]
 for o in parts:
  d=o.copy();d.data=o.data.copy();col.objects.link(d);d.matrix_world=o.matrix_world.copy();d.select_set(True);copies.append(d)
  # Bake grain coordinates per modeling part before material batching. Beam/log
  # long axes retain their grain orientation after objects are joined for glTF.
  uv=d.data.uv_layers.new(name='Ant surface UV')
  extent=[max(v.co[a] for v in d.data.vertices)-min(v.co[a] for v in d.data.vertices) for a in range(3)]
  long_axis=max(range(3),key=lambda a:extent[a])
  for polygon in d.data.polygons:
   normal_axis=max(range(3),key=lambda a:abs(polygon.normal[a]))
   axes=[a for a in range(3) if a!=normal_axis]
   along=long_axis if long_axis in axes else axes[1]
   across=next(a for a in axes if a!=along)
   for loop in polygon.loop_indices:
    co=d.data.vertices[d.data.loops[loop].vertex_index].co
    uv.data[loop].uv=(co[across]*.52,co[along]*.52)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name=asset
 if asset.startswith('pine-'):
  # Simplify only the runtime copy. Editable needle masses retain their rings.
  reduce=merged.modifiers.new('Runtime bough simplification','DECIMATE');reduce.ratio=.55
  reduce.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=reduce.name)
 if asset in {'fort','lumberjack','sawmill','forester','log-stack','plank-stack'}:bake_contact_shading(merged)
 bpy.ops.export_scene.gltf(filepath=OUT+'/'+asset+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_vertex_color='ACTIVE')
 faces=len(merged.data.polygons);bpy.data.objects.remove(merged,do_unlink=True)
 root=bpy.data.objects.new(asset,None);root["ant_asset_id"]=asset;col.objects.link(root)
 for o in parts:o.parent=root
 root.location=offset;exports.append({'id':asset,'parts':len(parts),'faces':faces});parts=[]
def shell_dome(cx,cy,base,rx,ry,rz):
 from mathutils.bvhtree import BVHTree
 shell_vertices=[];shell_faces=[]
 # Closed ellipsoidal carapace, built from individually bulging shell plates.
 def point(lat,lon,relief=0):
  return(cx+(rx+relief)*math.cos(lat)*math.cos(lon),cy+(ry+relief)*math.cos(lat)*math.sin(lon),base+(rz+relief)*math.sin(lat))
 # Parameterize across the long axis, keeping the poles on the hidden sides
 # rather than converging every seam at the visible roof crown.
 rng=random.Random(311)
 for column in range(7):
  phi0=-math.pi/2+column*math.pi/7;phi1=-math.pi/2+(column+1)*math.pi/7
  for row in range(5):
   shift=.045*math.sin(column*2.1)
   lo=max(0,row*math.pi/5+shift-.018);hi=min(math.pi,(row+1)*math.pi/5+shift+.022)
   verts=[];bulge=rng.uniform(.055,.105)
   for v in range(7):
    t=v/6;theta=lo+(hi-lo)*t
    for u in range(7):
     q=u/6;phi=phi0+(phi1-phi0)*q
     relief=.035+bulge*math.sin(q*math.pi)*math.sin(t*math.pi)+.035*(1-t)
     arc=math.cos(phi)
     verts.append((cx+(rx+relief)*math.sin(phi),cy+(ry+relief)*arc*math.cos(theta),base+(rz+relief)*arc*math.sin(theta)))
   faces=[(v*7+u,(v+1)*7+u,(v+1)*7+u+1,v*7+u+1) for v in range(6) for u in range(6)]
   offset=len(shell_vertices);shell_vertices.extend(verts);shell_faces.extend(tuple(i+offset for i in f) for f in faces)
   o=mesh('Broad staggered dome shell',verts,faces,red[rng.choice([0,1,1,2,3])])
   for polygon in o.data.polygons:polygon.use_smooth=True
   mod=o.modifiers.new('Heavy shell lip','SOLIDIFY');mod.thickness=.085
   bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 shell_tree=BVHTree.FromPolygons(shell_vertices,shell_faces,all_triangles=False)
 for offset in [-.68,0,.68]:
  center=cx+rx*offset;half=.14
  def at(a,x,lift=.24):
   arc=math.sqrt(max(.01,1-((x-cx)/rx)**2))
   direction=Vector((0,math.cos(a),math.sin(a)))
   ideal=Vector((x,cy+ry*arc*math.cos(a),base+rz*arc*math.sin(a)))
   hit,_,_,_=shell_tree.ray_cast(ideal+direction*.8,-direction,2)
   return tuple((hit if hit is not None else ideal)+direction*(lift-.19))
  for k in range(24):
   a=k*math.pi/24;b=(k+1)*math.pi/24
   mesh('Domed iron band',[at(a,center-half),at(b,center-half),at(b,center+half),at(a,center+half)],[(0,1,2,3)],iron)
   if k%3==1:rivet(at((a+b)/2,center,.28),.072)
  for side in [-1,1]:tube('Dome band polished rim',[at(k*math.pi/30,center+side*half,.255) for k in range(31)],.023,silver)
 # Front transverse armor belt crosses the long vault ribs.
 for lat in [.42]:
  for j in range(24):
   a=math.pi+j*math.pi/24;b=math.pi+(j+1)*math.pi/24
   mesh('Transverse vault iron belt',[point(lat-.042,a,.135),point(lat-.042,b,.135),point(lat+.042,b,.135),point(lat+.042,a,.135)],[(0,1,2,3)],iron)
   if j%3==1:rivet(point(lat,(a+b)/2,.16),.058)
  for edge in [-.042,.042]:tube('Vault belt worn edge',[point(lat+edge,math.pi+j*math.pi/36,.145) for j in range(37)],.014,silver)
 # Equatorial rim holds the lower shell together, with readable corner studs.
 pts=[point(.035,j*math.tau/48,.12) for j in range(49)]
 tube('Carapace lower rim',pts,.055,iron)
 for j in range(14):rivet(point(.10,j*math.tau/14,.13),.06)

def fort():
 # Squat earth-root stronghold. Layered irregular masonry around an open doorway.
 for row in range(4):
  for j in range(18):
   a=j*math.tau/18
   if math.sin(a)<-.8:continue
   o=box('Rounded foundation block',(3.15*math.cos(a),2.65*math.sin(a),.35+row*.48),(1.05,.66,.44),rock[(row+j)%4],.10);o.rotation_euler.z=a+math.pi/2
 # Twisted roots splay into soil; varying radial sections keep them organic.
 for side in [-1,1]:
  for j in range(5):
   yy=-1.65+j*.95;xx=side*(2.35+.15*math.sin(j))
   points=[(xx,yy,2.1),(xx+side*.22,yy-.18,1.58),(xx+side*.48,yy+.13,1.02),(xx+side*.70,yy+.05,.42),(xx+side*1.20,yy-.21,.12),(xx+side*1.7,yy-.46,.035)]
   radii=[.38,.45,.39,.31,.20,.04]
   # Smooth the root's centerline while preserving its broad buttress profile.
   knots=[Vector(p) for p in points];curved=[];widths=[]
   for segment in range(len(knots)-1):
    p0=knots[max(0,segment-1)];p1=knots[segment];p2=knots[segment+1];p3=knots[min(len(knots)-1,segment+2)]
    for sample in range(4):
     t=sample/4
     curved.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
     widths.append(radii[segment]*(1-t)+radii[segment+1]*t)
   curved.append(knots[-1]);widths.append(radii[-1]);points=curved;radii=widths;verts=[]
   for k,point in enumerate(points):
    tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(k-1,0)])
    tangent.normalize();u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
    for n in range(9):
     a=n*math.tau/9;r=radii[k]*(1+.10*math.sin(n*3+j+k));verts.append(tuple(Vector(point)+r*(u*math.cos(a)+v*math.sin(a))))
   faces=[(k*9+n,k*9+(n+1)%9,(k+1)*9+(n+1)%9,(k+1)*9+n) for k in range(len(points)-1) for n in range(9)]
   root=mesh('Ancient twisted root',verts,faces,wood[(j+1)%3])
   for face in root.data.polygons:face.use_smooth=True
   if j%2==0:tube('Root fork',[points[12],(xx+side*1.12,yy+.5,.18),(xx+side*1.8,yy+.75,.015)],.15,wood[1])
 gate_start=len(parts)
 for x in [-1.03,1.03]:beam('Great oak gatepost',(x,-2.72,.1),(x,-2.72,2.45),.37,wood[1])
 box('Gate darkness',(0,-2.32,1.1),(1.9,.13,2.15),dark)
 # Open entrance: a dark recess and side reveals, no door planks across the mouth.
 for x in [-.93,.93]:box('Gate interior reveal',(x,-2.5,1.05),(.14,.56,2.08),wood[0],.025)
 box('Entrance floor',(0,-2.55,.12),(1.86,.70,.15),rock[3],.03)
 for i in range(3):box('Threshold step',(0,-3.05-i*.3,.18-i*.045),(2.3+i*.1,.42,.23),rock[1],.07)
 # A smaller recessed mouth leaves space for thick supporting shoulders.
 for o in parts[gate_start:]:
  o.location.x*=.82;o.location.z*=.80
  o.scale.x*=.82;o.scale.z*=.80
 # Staggered timber shoulders tie the gateway into the mound wall.
 for side in [-1,1]:
  for row in range(5):
   log((side*1.78,-2.37,.43+row*.29),1.45+(row%2)*.15,.16)
  beam('Gate shoulder iron tie',(side*2.27,-2.58,.38),(side*2.27,-2.58,1.95),.12,iron)
 # Timber parapet, main vault and entrance canopy.
 for j in range(16):
  a=j*math.tau/16
  if math.sin(a)<-.92:continue
  x,y=3*math.cos(a),2.4*math.sin(a)
  beam('Heavy parapet oak post',(x,y,1.7),(x,y,2.88),.27,wood[2])
  box('Parapet split crown',(x,y,2.92),(.34,.34,.19),cut,.045)
  box('Parapet iron binding',(x,y,2.56),(.30,.30,.12),iron,.018)
  # Uneven paired stakes form the split timber crown of each parapet post.
  for side in [-1,1]:
   xx=x+math.cos(a+math.pi/2)*side*.16;yy=y+math.sin(a+math.pi/2)*side*.16
   top=2.98+.06*math.sin(j*2.3+side)
   cyl('Bundled parapet stake',(xx,yy,1.93),(xx,yy,top),.105,wood[(j+1)%3],n=7)
   cyl('Stake pale cut crown',(xx,yy,top),(xx,yy,top+.027),.098,cut,n=7)
  box('Parapet bundle strap',(x,y,2.53),(.53,.33,.115),iron,.018).rotation_euler.z=a+math.pi/2

  rivet((x,y,2.36),.075)
  b=(j+1)*math.tau/16
  if math.sin(b)>=-.92:beam('Parapet rail',(x,y,2.35),(3*math.cos(b),2.4*math.sin(b),2.35),.20,wood[1])
 # Circular drum supports a fully rounded shell, without exposed square gables.
 for j in range(30):
  a=j*math.tau/30;x=2.35*math.cos(a);y=.25+1.75*math.sin(a)
  o=box('Radial chamber timber',(x,y,2.53),(.46,.19,1.05),wood[1+j%3],.035);o.rotation_euler.z=a+math.pi/2
 for side in [-1,1]:
  for row in range(3):box('Gate dressed stone',(side*1.11,-2.61,.34+row*.46),(.57,.58,.43),rock[(row+1)%4],.09)
 shell_dome(0,.25,2.78,2.75,2.05,1.12)
 arch_roof(0,-2.42,1.72,1.4,.68,1.8,3,7)
 for x in [-1.53,1.53]:torch(x,-3.05,.1)
 banner(-3.05,-.5,2.8);banner(1.7,-2.78,.7)
def workshop(kind):
 w,d=3.9,3.15
 for x in [-w/2,w/2]:
  for y in [-d/2,d/2]:
   box('Individual foundation',(x,y,.16),(.63,.63,.32),rock[1],.1)
   beam('Squared oak pillar',(x,y,.28),(x,y,2.75),.37,wood[1]);box('Iron post strap',(x,y,.65),(.40,.40,.16),iron,.025)
   box('Pale worn post crown',(x,y,2.76),(.44,.44,.23),cut,.065)
   box('Upper iron binding',(x,y,2.5),(.40,.40,.14),iron,.025)
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
 if kind=='lumberjack':
  log((0,0,3.86),4.05,.16,(0,1,0))
  for y in [-1.93,1.93]:
   beam('Ridge end upright',(0,y,3.25),(0,y,4.12),.30,wood[1])
   box('Ridge post cut cap',(0,y,4.13),(.36,.36,.14),cut,.045)
   box('Ridge iron collar',(0,y,3.93),(.33,.33,.12),iron,.02)
  for x in [-2.21,2.21]:log((x,0,2.12),4.25,.18,(0,1,0))
 if kind!='forester':arch_roof(0,.45 if kind=='sawmill' else 0,2.12,2.27,1.60 if kind=='lumberjack' else .78,2.75 if kind=='sawmill' else 3.65,4,7,pitched=kind=='lumberjack')
 else:
  for y in [-1.9,1.9]:beam('Nursery ridge',(0,y,3.2),(2.25,y,2.05),.16,wood[1]);beam('Nursery ridge',(0,y,3.2),(-2.25,y,2.05),.16,wood[1])
  # Broad living-leaf shingles with cupped cross-sections and tapered tips.
  # Lay from the eaves toward the ridge so the upper course overlaps naturally.
  rng=random.Random(193)
  for side in [-1,1]:
   for row in reversed(range(4)):
    for j in range(5):
     start=.02+row*.53; y=-1.65+j*.79+(row%2)*.17+rng.uniform(-.07,.07)
     length=rng.uniform(.94,1.18); width=rng.uniform(.42,.53); tilt=rng.uniform(-.12,.12)
     vs=[];centers=[]
     for k in range(9):
      t=k/8; x=side*(start+t*length)
      z=3.27-abs(x)*.49 + .05*(3-row) + .13*math.sin(t*math.pi)-.15*t*t
      yy=y+tilt*t+.045*math.sin(t*math.pi)
      centers.append((x,yy,z+.015))
      breadth=width*(math.sin(math.pi*(.08+.92*t))**.65 if t<1 else .015)
      for u in [-1,0,1]:
       edge=.055*math.sin(k*2.3+j)*abs(u)
       vs.append((x,yy+u*breadth,z-.105*abs(u)*math.sin(t*math.pi)+edge))
     fs=[]
     for k in range(8):
      for u in range(2):
       f=(k*3+u,(k+1)*3+u,(k+1)*3+u+1,k*3+u+1)
       fs.append(f if side>0 else tuple(reversed(f)))
     o=mesh('Cupped overlapping roof leaf',vs,fs,leaf[rng.choice([0,1,1,2,3])])
     # Thin lower skin gives eaves a visible edge without chunky green blocks.
     n=len(vs);o.data.clear_geometry()
     lower=[(x,y,z-.022) for x,y,z in vs]
     boundary=list(range(0,n,3))+list(range(n-1,1,-3))
     shell=fs+[tuple(i+n for i in reversed(f)) for f in fs]
     shell += [(boundary[i],boundary[(i+1)%len(boundary)],boundary[(i+1)%len(boundary)]+n,boundary[i]+n) for i in range(len(boundary))]
     o.data.from_pydata(vs+lower,[],shell);o.data.update()
     tube('Leaf central rib',centers,.012,leaf[1])
     for k in [2,4,6]:
      for u in [0,2]:tube('Fine leaf branching vein',[centers[k-1],vs[k*3+u]],.005,leaf[1])
 lamp(1.85,-1.8,1.68)
 if kind=='lumberjack':
  log((-1.15,-2.7,.38),.7,.52,(0,0,1));beam('Great axe haft',(-1.15,-2.7,.78),(-.72,-2.7,1.9),.105,wood[2])
  axe=mesh('Broad axe blade',[(-.8,-2.80,1.88),(-.2,-2.80,1.9),(-.1,-2.80,1.42),(-.49,-2.80,1.48),(-.8,-2.64,1.88),(-.2,-2.64,1.9),(-.1,-2.64,1.42),(-.49,-2.64,1.48)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],silver)
  for vertex in axe.data.vertices:
   vertex.co.x=-.75+(vertex.co.x+.75)*1.65
   vertex.co.z=1.6+(vertex.co.z-1.6)*1.45
 elif kind=='sawmill':
  equipment_start=len(parts)
  for x in [-.85,.85]:
   for y in [-1.4,1.2]:beam('Saw table leg',(x,y,.2),(x,y,1.1),.15,wood[1])
  for x in [-.8,.8]:beam('Saw runner',(x,-2.6,.95),(x,1.6,.95),.18,wood[2])
  for y in [-2,-1,0,1]:cyl('Feed roller',(-.9,y,.9),(.9,y,.9),.12,iron)
  # Exposed horizontal reciprocating blade, matching the approved mill close-up.
  vs=[(-1.65,-2.15,1.08),(1.65,-2.15,1.08),(1.65,-2.44,1.08)]
  for i in range(25):
   x=1.65-i*3.3/24;vs.append((x,-2.44-(.11 if i%2 else 0),1.08))
  saw=mesh('Horizontal toothed steel blade',vs,[tuple(range(len(vs)-1,-1,-1))],silver)
  thickness=saw.modifiers.new('Forged saw thickness','SOLIDIFY');thickness.thickness=.045
  bpy.context.view_layer.objects.active=saw;bpy.ops.object.modifier_apply(modifier=thickness.name)
  for x in [-1.78,1.78]:
   beam('Saw carriage rail',(x,-2.65,.75),(x,.8,.75),.14,iron)
   beam('Blade clamp',(x,-2.6,1.0),(x,-2.02,1.0),.15,iron)
  for x in [-1.25,1.25]:
   cyl('Feed wheel axle',(x,-2.2,.8),(x,-2.2,1.03),.10,iron)
  log((.40,-1.95,1.28),2.1,.36,(1,0,0))
  for x in [-1.12,1.12]:
   box('Heavy feed support',(x,-1.75,.66),(.28,.40,.94),wood[1],.045)
   box('Feed support cap',(x,-1.75,1.14),(.36,.46,.12),iron,.025)
  # A stout work bed and exposed crank identify this as a working sawmill.
  # Keep these forward of the shortened roof; they must read at game zoom.
  for xx in [-1.35,-.95,-.55,-.15,.25,.65,1.05,1.45]:
   box('Saw bed oak decking',(xx,-.65,.79),(.37,3.1,.17),wood[int((xx+1.35)*7)%4],.025)
  for yy in [-1.8,.55]:
   box('Oak machine sill',(0,yy,.49),(3.65,.34,.35),wood[0],.04)
  # Horizontal axle and broad iron collars cradle the log at the front.
  cyl('Front winding axle',(-1.65,-2.0,1.21),(1.85,-2.0,1.21),.14,iron,n=12)
  for xx in [-.67,1.47]:
   cyl('Log feed iron collar',(xx-.055,-1.95,1.28),(xx+.055,-1.95,1.28),.405,iron,n=14)
  # Open spoked crank, visible beyond the right side of the timber frame.
  center=Vector((2.08,-1.62,1.25));radius=.63
  for i in range(16):
   a=i*math.tau/16;b=(i+1)*math.tau/16
   cyl('Crank iron rim',center+Vector((0,math.cos(a)*radius,math.sin(a)*radius)),center+Vector((0,math.cos(b)*radius,math.sin(b)*radius)),.075,iron,n=6)
  for i in range(6):
   a=i*math.tau/6
   beam('Oak crank spoke',center,center+Vector((0,math.cos(a)*radius,math.sin(a)*radius)),.11,wood[2])
  cyl('Crank brass hub',(1.96,-1.62,1.25),(2.22,-1.62,1.25),.17,cut,n=10)
  cyl('Crank handle',(2.08,-1.16,1.61),(2.5,-1.16,1.61),.065,iron)
  # Offcuts and sawdust occupy the base, not the path in front of the mill.
  for i in range(11):
   o=box('Fresh sawmill offcut',(-1.6+(i%4)*.43,-.9+(i//4)*.6,.12+(i%2)*.07),(.13,.5+(i%3)*.13,.10),cut,.018)
   o.rotation_euler.z=i*1.71
  # Project the actual working mechanism beyond the shell canopy.
  for o in parts[equipment_start:]:o.location.y-=.65

 elif kind=='forester':
  for x in [-.95,.35,1.5]:
   box('Seedling box',(x,-2.05,.3),(1,.75,.45),wood[1],.04);box('Potting soil',(x,-2.05,.535),(.85,.6,.025),dark)
   for i in range(3):
    px=x-.26+i*.25;cyl('Sapling',(px,-2.05,.54),(px,-2.05,.88),.015,wood[2])
    for side in [-1,1]:ell('Young leaf',(px+side*.10,-2.05,.79),(.14,.055,.035),leaf[i%3],8,4)
  for x,y in [(2.35,-1.6),(2.2,-.9)]:ell('Clay vessel',(x,y,.37),(.26,.26,.36),wood[2]);cyl('Vessel rim',(x,y,.65),(x,y,.72),.17,cut)
def ant(guard=False,carrying=False):
 # Broad RTS proportions, with insect anatomy visible around practical plate armor.
 for side in [-1,1]:
  x=side*.23
  ell('Heavy leather boot',(x,-.13,.14),(.20,.30,.14),wood[0],10,5)
  ell('Steel toe cap',(x,-.27,.16),(.19,.18,.12),iron,10,5)
  cyl('Chitin shin',(x,0,.23),(x+side*.04,.02,.50),.12,chitin)
  ell('Knee guard',(x+side*.04,-.06,.52),(.15,.12,.13),iron,10,5)
  beam('Knee bright edge',(x-.095,-.155,.53),(x+.095,-.155,.53),.027,silver)
  cyl('Thigh',(x+side*.04,.02,.56),(side*.14,0,.88),.14,chitin)
 ell('Segmented abdomen',(0,.29,.91),(.31,.38,.30),chitin,14,8)
 for z in [.83,.99]:
  tube('Abdomen seam',[(-.25,.45,z),(0,.66,z-.025),(.25,.45,z)],.018,dark)
 ell('Thorax armor',(0,0,1.10),(.33,.22,.32),iron,14,8)
 # Raised breastplate facets and collar retain highlights at the default zoom.
 mesh('Raised breastplate',[(-.27,-.19,1.33),(.27,-.19,1.33),(.24,-.25,1.01),(0,-.30,.94),(-.24,-.25,1.01),(0,-.29,1.25)],[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],iron)
 tube('Steel breastplate rim',[(-.27,-.21,1.33),(-.24,-.27,1.01),(0,-.32,.94),(.24,-.27,1.01),(.27,-.21,1.33)],.024,silver)
 box('Player sash',(0,.005,.89),(.57,.43,.12),flagmat,.025)
 box('Leather belt',(0,-.025,.88),(.59,.44,.06),wood[0],.018)
 box('Forged buckle',(0,-.255,.9),(.13,.045,.13),silver,.025)
 for side in [-1,1]:
  shoulder=(side*.38,0,1.27)
  ell('Layered pauldron',shoulder,(.25,.25,.19),iron,12,6)
  tube('Pauldron steel edge',[(side*.19,-.19,1.3),(side*.36,-.25,1.22),(side*.57,-.15,1.24)],.027,silver)
  rivet((side*.39,-.242,1.31),.038)
  elbow=(side*.47,-.12 if carrying else -.05,1.06 if carrying else 1.03);hand=(side*.39,-.46 if carrying else -.32,1.16 if carrying else .98)
  cyl('Upper arm',(side*.35,0,1.22),elbow,.11,chitin)
  ell('Elbow plate',elbow,(.14,.13,.12),iron,10,5)
  cyl('Forearm',elbow,hand,.125,chitin)
  ell('Gauntlet',hand,(.145,.12,.13),iron,10,5)
  beam('Gauntlet cuff',(hand[0]-.075,hand[1]+.03,hand[2]+.1),(hand[0]+.075,hand[1]+.03,hand[2]+.1),.035,silver)
 ell('Ant head',(0,-.035,1.54),(.265,.235,.27),chitinlight,14,8)
 if guard:ell('Open helmet',(0,.09,1.58),(.285,.18,.29),iron,14,8)
 for side in [-1,1]:
  ell('Compound eye',(side*.18,-.194,1.56),(.095,.077,.135),eye,12,7)
  ell('Eye catchlight',(side*.18,-.260,1.6),(.019,.01,.028),glint,8,4)
  tube('Elbowed antenna',[(side*.12,-.02,1.75),(side*.19,-.05,1.98),(side*.31,-.18,2.07)],.032,chitin)
  tube('Mandible',[(side*.125,-.20,1.40),(side*.15,-.32,1.36),(side*.035,-.38,1.4)],.044,cut)
 if guard:
  cyl('Spear shaft',(.53,-.32,.04),(.53,-.32,2.15),.035,wood[2])
  ell('Spear tip',(.53,-.32,2.32),(.10,.045,.23),silver,8,4)
  ell('Armored backplate',(0,.34,1.18),(.31,.13,.30),iron,12,7)
for kind,off in [('fort',(0,12,0)),('lumberjack',(-8,0,0)),('sawmill',(8,0,0)),('forester',(8,12,0))]:
 if wanted(kind):
  fort() if kind=='fort' else workshop(kind);export(kind,off)
if wanted('worker'):ant();export('worker',(-4,-7,0))
if wanted('worker-carry'):ant(carrying=True);export('worker-carry',(-7,-7,0))
if wanted('guard'):ant(True);export('guard',(-1,-7,0))
if wanted('item-log'):log((0,0,.19));export('item-log',(2,-7,0))
if wanted('item-plank'):plank((0,0,.065));export('item-plank',(4,-7,0))
if wanted('item-stone'):box('Dressed stone',(0,0,.25),(.58,.55,.5),rock[2],.08);export('item-stone',(6,-7,0))
if wanted('log-stack'):
 rng=random.Random(215)
 for row in range(3):
  count=5-row
  for i in range(count):
   r=rng.uniform(.155,.19);lean=rng.uniform(-.10,.10)
   log(((i-(count-1)/2)*.375,rng.uniform(-.24,.24),.195+row*.31),rng.uniform(1.55,2.12),r,(lean,1,rng.uniform(-.015,.015)))
 export('log-stack',(-4,-10,0))
if wanted('plank-stack'):
 rng=random.Random(719)
 for row in range(4):
  for j in range([5,4,4,3][row]):
   center=Vector((rng.uniform(-.32,.32),(j-([5,4,4,3][row]-1)/2)*.325,.08+row*.145));start=len(parts)
   plank(center,rng.uniform(1.9,2.5))
   yaw=rng.uniform(-.045,.045)
   for o in parts[start:]:
    d=o.location-center
    o.location=center+Vector((d.x*math.cos(yaw)-d.y*math.sin(yaw),d.x*math.sin(yaw)+d.y*math.cos(yaw),d.z))
    o.rotation_euler.z+=yaw
 export('plank-stack',(0,-10,0))
# Save editable assets without overwriting the user's active Blender project.
bpy.data.libraries.write(OUT+'/Ant-colony-source.blend',{col},fake_user=True)
open(OUT+'/model-manifest.json','w').write(json.dumps(exports,indent=2))
result={'assets':exports,'source':OUT+'/Ant-colony-source.blend'}
