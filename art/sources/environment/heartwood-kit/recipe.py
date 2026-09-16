"""Neutral modular heartwood walls and amber sconces for cutaway interiors."""
import bpy,bmesh,math,json,random,sys
from pathlib import Path
from mathutils import Vector

def build(A):
 if not bpy.app.background:raise RuntimeError('Recipe must run in a separate background Blender process')
 ROOT=A.parents[3];sys.path.insert(0,str(ROOT/'experiments/building-studio'))
 from stage import create_stage,aim
 bpy.ops.wm.read_factory_settings(use_empty=True)
 C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed'])
 geo=bpy.data.collections.new('Heartwood · editable structure');bpy.context.scene.collection.children.link(geo)
 studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
 def mat(name,h,texture=None,emission=0):
  rgb=[int(h[i:i+2],16)/255 for i in [0,2,4]];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
  m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=.87
  if texture:
   image=bpy.data.images.load(str(ROOT/'assets/textures/terrain'/texture),check_existing=True);image.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if emission:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission;p.inputs['Roughness'].default_value=.3
  return m
 wood=mat('Carved heartwood','9b6e42','heartwood-grain.png');bark=mat('Dark heartwood fissures','665038','hollow-bark.png');cut=mat('Exposed end grain','a1855b','heartwood-rings.png')
 amber=mat('Warm luminous amber','f5b449',emission=.65);amberDark=mat('Thick resin','ba671c',emission=.25)
 fungi=[mat('Shelf cap ochre','9c6336'),mat('Shelf cap edge','cc9f60'),mat('Shelf pale gills','dac49a')]
 moss=mat('Cave moss','3c512f')
 def mesh(name,vs,fs,mats,indices=None,smooth=False):
  me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);geo.objects.link(ob)
  for m in mats:me.materials.append(m)
  for p in me.polygons:p.material_index=indices[p.index] if indices else 0;p.use_smooth=smooth
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
  uv=me.uv_layers.new(name='Natural grain')
  for p in me.polygons:
   for li in p.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co
    uv.data[li].uv=(v.x*.12,v.y*.15) if abs(p.normal.z)>.6 else ((v.y if abs(p.normal.x)>.6 else v.x)*.2,v.z*.13)
  return ob
 def branch(name,a,b,r,material):
  a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
  if u.length<.1:u=d.cross(Vector((0,1,0)))
  u.normalize();v=d.cross(u);N=8;vs=[tuple(p+(u*math.cos(i*math.tau/N)+v*math.sin(i*math.tau/N))*r) for p in [a,b] for i in range(N)]
  return mesh(name,vs,[tuple(reversed(range(N))),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],[material],smooth=False)
 def droplet(name,x,y,z,scale=1):
  N=12;profile=[(-1,0),(-.82,.3),(-.45,.5),(-.1,.48),(.3,.3),(.8,.12),(1.4,0)]
  vs=[(x+math.cos(i*math.tau/N)*r*scale,y+math.sin(i*math.tau/N)*r*scale,z+h*scale) for h,r in profile for i in range(N)]
  fs=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(profile)-1) for i in range(N)]
  # Single-point poles avoid degenerate quads in the saved master.
  vs=[(x,y,z-scale)]+[(x+math.cos(i*math.tau/N)*r*scale,y+math.sin(i*math.tau/N)*r*scale,z+h*scale) for h,r in profile[1:-1] for i in range(N)]+[(x,y,z+1.4*scale)]
  fs=[(0,1+(i+1)%N,1+i) for i in range(N)]
  fs += [(1+j*N+i,1+j*N+(i+1)%N,1+(j+1)*N+(i+1)%N,1+(j+1)*N+i) for j in range(len(profile)-3) for i in range(N)]
  fs += [(len(vs)-1,1+(len(profile)-3)*N+i,1+(len(profile)-3)*N+(i+1)%N) for i in range(N)]
  return mesh(name,vs,fs,[amber],smooth=True)
 def shelf(name,x,y,z,r):
  N=16;vs=[]
  for ring in range(3):
   for i in range(N+1):
    a=math.pi*i/N;radius=[.08,r,r*.88][ring]*(1+.035*math.sin(i*2.2));vs.append((x+math.cos(a)*radius,y-math.sin(a)*radius*.72,z+[.14,0,-.35][ring]*r))
  fs=[];indices=[]
  for j in range(2):
   for i in range(N):fs.append((j*(N+1)+i,j*(N+1)+i+1,(j+1)*(N+1)+i+1,(j+1)*(N+1)+i));indices.append(j)
  fs += [tuple(reversed(range(N+1))),tuple(range(2*(N+1),3*(N+1)))];indices += [0,2]
  # The attachment back remains hidden inside the wall.
  ob=mesh(name,vs,fs,fungi,indices)
  for i in range(1,N,2):
   a=math.pi*i/N;branch(name+' radial gill '+str(i),(x+math.cos(a)*.15,y-math.sin(a)*.15,z-.1*r),(x+math.cos(a)*r*.82,y-math.sin(a)*r*.6,z-.29*r),.022,fungi[2])
  return ob
 if C['kind']=='wall':
  # Continuous, fluted inner tree wall. Uneven growth ridges share vertices,
  # avoiding a fence-like row of separate straight boards.
  N=40;bands=6;vs=[]
  tops=[10.3+.45*math.sin(i*.18)+.22*math.sin(i*.47+.5) for i in range(N+1)]
  for side in [-1,1]:
   for j in range(bands+1):
    t=j/bands
    for i in range(N+1):
     x=-8+i*16/N;ridge=.2+.3*(.5+.5*math.sin(i*2.1))
     dx=.16*math.sin(t*4+i*.47)*math.sin(i*math.pi/N)
     y=side*(1.5+ridge+.22*math.sin(t*5+i*.37))
     vs.append((x+dx,y,t*tops[i]))
  count=(N+1)*(bands+1);fs=[];indices=[]
  for side in range(2):
   off=side*count
   for j in range(bands):
    for i in range(N):
     a=off+j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1));indices.append(1 if i%7==0 else 0)
  for i in range(N):
   a=bands*(N+1)+i;fs.append((a,a+1,a+1+count,a+count));indices.append(2)
   fs.append((i,i+count,i+1+count,i+1));indices.append(1)
  for i in [0,N]:
   for j in range(bands):
    a=j*(N+1)+i;fs.append((a,a+count,a+N+1+count,a+N+1));indices.append(1)
  mesh('Continuous fluted heartwood wall',vs,fs,[wood,bark,cut],indices,smooth=False)
  for i,(x,z,r) in enumerate([(-5,3,1.1),(-3.8,5,1.5),(-5.3,7,.8),(3.6,2.4,1.7),(4.8,5.8,1.15),(1.6,8.5,.7)]):shelf('Shelf fungus %s'%i,x,-1.65,z,r)
  for i in range(8):
   x=rng.uniform(-7.5,7.5);z=rng.uniform(2,8);branch('Hanging root fibre %s'%i,(x,-1.83,z+2),(x+.3,-1.94,z),.035,bark)
 else:
  # An organically curved support with three luminous resin drops. No ownership surface.
  points=[(0,0,0),(.2,0,2),(-.4,0,4.2),(-.1,-.3,6.2),(1.2,-.7,7.1),(2.6,-.9,6.7)]
  for i in range(len(points)-1):branch('Resin bearer %s'%i,points[i],points[i+1],.38-i*.045,bark)
  for i,(x,y,z,s) in enumerate([(2.6,-.9,5.5,.8),(1.25,-.72,5.8,.42),(-.2,-.4,3.2,.36)]):
   branch('Resin thread %s'%i,(x,y,z+1.4*s),(x,y,z+1.9*s),.045,amberDark);droplet('Amber droplet %s'%i,x,y,z,s)
  shelf('Mushroom at root',-.5,-.1,.6,.9)
  for i in range(5):
   a=i*math.tau/5;branch('Foot root %s'%i,(0,0,.45),(math.cos(a)*1.2,math.sin(a)*1.2,0),.19,bark)
 create_stage(C,studio)
 for o in studio.objects:
  if o.type=='LIGHT':o.location*=2;o.data.size*=2;aim(o,(0,0,4))
 bpy.context.scene.world.color=(0,0,0)
 reference=bpy.data.images.load(str(A/'reference.png'),check_existing=True);reference.pack();reference.use_fake_user=True
 meshes=[o for o in geo.objects if o.type=='MESH']
 (A/'model-stats.json').write_text(json.dumps({'meshes':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'materials':len({m.name for o in meshes for m in o.data.materials})},indent=2))
 bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
