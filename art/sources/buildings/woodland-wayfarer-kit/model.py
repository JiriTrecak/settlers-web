"""Neutral woodland infrastructure, using the approved colony image as a material/style reference."""
import bpy,bmesh,math,json,random,sys
from pathlib import Path
from mathutils import Vector
if not bpy.app.background:raise RuntimeError('Background build only')
A=Path(__file__).resolve().parent;sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];rng=random.Random(641)
scene=bpy.context.scene;cols={};offset=Vector((0,0,0));current=None
parts={'timber-bridge':(-5,0,0),'lantern-post':(1,-4,0),'splitrail-fence':(4,-4,0),'waystone-outcrop':(4,2,0),'road-segment':(-5,-6,0)}
for name in [*parts,'Studio']:
 col=bpy.data.collections.new(name);scene.collection.children.link(col);cols[name]=col

def mat(name,rgb,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.76 if not metal else .48
 if emission:bs.inputs['Emission Color'].default_value=(*rgb,1);bs.inputs['Emission Strength'].default_value=emission
 return m
def sampled(name,key,gain):return mat(name,[min(1,v*gain) for v in P[key]['representative']['linear_rgb']])
wood=[sampled('Hewn oak '+str(i),'timber',g) for i,g in enumerate([1.5,2.0,2.5])];cut=sampled('Cut timber','cut_wood',3.8)
iron=mat('Weathered silver iron',(.19,.22,.22),.65);dark=mat('Dark iron',(.045,.055,.06),.6);brass=mat('Amber brass',(.36,.20,.055),.65);glow=mat('Warm lantern glass',(1,.38,.055),0,1.2)
stone=[sampled('Slate '+str(i),'stone',g) for i,g in enumerate([1.05,1.35,1.8,2.1])];moss=mat('Moss crust',(.035,.065,.012))
def mesh(name,v,f,m):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);current.objects.link(ob);ob.location=offset;me.materials.append(m);return ob
def box(name,p,size,m,bevel=.03):
 v=[(p[0]+x*size[0]/2,p[1]+y*size[1]/2,p[2]+z*size[2]/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 ob=mesh(name,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m)
 if bevel:mod=ob.modifiers.new('Hewn corners','BEVEL');mod.width=bevel;mod.segments=1
 return ob
def rod(name,a,b,r,m,n=8,r2=None):
 a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');v=[]
 for p,rad in [(a,r),(b,r if r2 is None else r2)]:
  for i in range(n):v.append(tuple(p+q@Vector((math.cos(i*math.tau/n)*rad,math.sin(i*math.tau/n)*rad,0))))
 return mesh(name,v,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],m)
def lantern(x,y,z):
 box('Lantern amber glass',(x,y,z),(.35,.35,.49),glow,.015)
 for dz in [-.3,.3]:box('Iron lantern frame',(x,y,z+dz),(.49,.49,.09),iron)
 for dx in [-.205,.205]:
  for dy in [-.205,.205]:rod('Cage bar',(x+dx,y+dy,z-.29),(x+dx,y+dy,z+.29),.027,dark,6)
 rod('Peaked iron hood',(x,y,z+.33),(x,y,z+.54),.38,iron,4,.08)
 rod('Lantern hanger',(x,y,z+.5),(x,y,z+.76),.035,dark,6)
def select(name):
 global current,offset
 current=cols[name];offset=Vector(parts[name])
select('timber-bridge')
for x in [-1.35,1.35]:rod('Load-bearing trunk',(x,-4,.23),(x,4,.23),.26,wood[0],10)
for i in range(20):
 y=-3.85+i*.405;z=.52+.35*math.cos(y*math.pi/8)
 box('Individual worn deck plank',(rng.uniform(-.035,.035),y,z),(3.65+rng.uniform(-.14,.14),.385,.18),wood[i%3],.04)
 for x in [-1.36,1.36]:rod('Deck peg',(x,y,z+.08),(x,y,z+.105),.035,dark,6)
for x in [-1.85,1.85]:
 for y in [-3.7,0,3.7]:
  rod('Octagonal bridge upright',(x,y,-2.4),(x,y,1.85),.16,wood[1],8,.12)
  rod('Pale post cap',(x,y,1.84),(x,y,1.94),.20,cut,8,.16)
  for z in [.5,1.6]:box('Iron post collar',(x,y,z),(.36,.36,.09),iron,.015)
 for a,b in [(-3.7,0),(0,3.7)]:
  rod('Handrail',(x,a,1.53),(x,b,1.53),.09,wood[2]);rod('Lower rail',(x,a,.98),(x,b,.98),.07,wood[1])
for x,y in [(-1.85,-3.7),(1.85,3.7)]:rod('Lantern bracket',(x,y,1.75),(x,y,2.45),.055,iron);lantern(x,y,2.0)
select('lantern-post')
rod('Ground stake',(0,0,-.25),(0,0,3.7),.13,wood[1],8,.09)
for z in [.12,.5,3.2]:rod('Metal collar',(0,0,z),(0,0,z+.10),.155,iron,8)
rod('Cross arm',(-.15,0,3.47),(.86,0,3.47),.08,wood[2]);rod('Diagonal brace',(.04,0,2.85),(.65,0,3.45),.055,iron);lantern(.78,0,2.85)
rod('Pole finial',(0,0,3.7),(0,0,3.92),.16,iron,6,.015)
select('splitrail-fence')
for x in [-1.5,1.5]:
 rod('Split fence post',(x,0,-.2),(x,0,1.25),.12,wood[0],6,.085)
 rod('Cut cap',(x,0,1.24),(x,0,1.3),.12,cut,6,.08)
for z in [.4,.91]:rod('Split oak rail',(-1.6,0,z),(1.6,0,z+.045),.09,wood[2],5)
rod('Leaning repair brace',(-1.35,-.04,.22),(1.32,-.04,1.05),.055,wood[1],5)
select('waystone-outcrop')
for i,(x,y,sx,sy,h) in enumerate([(-1.4,0,2.0,1.8,3.5),(.3,.5,1.8,1.7,4.8),(1.75,0,1.4,1.6,3.15),(-1,-1.5,1.35,1.1,1.6),(1.3,-1.6,1.4,1.0,1.15)]):
 n=7;v=[]
 for z,f in [(-.6,1.0),(h*.45,1.03),(h,.63)]:
  for j in range(n):
   a=j*math.tau/n;v.append((x+math.cos(a)*sx*f*rng.uniform(.88,1.1),y+math.sin(a)*sy*f*rng.uniform(.88,1.1),z+rng.uniform(-.10,.10)))
 faces=[tuple(reversed(range(n))),tuple(range(n*2,n*3))]+[(k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j) for k in range(2) for j in range(n)]
 ob=mesh('Fractured slate buttress',v,faces,stone[i%4]);ob.data.materials.append(stone[(i+1)%4]);ob.data.materials.append(moss)
 for face in ob.data.polygons:face.material_index=2 if face.normal.z>.65 and i%3==0 else rng.randrange(2)
select('road-segment')
road=sampled('Packed earth','earth',.85)
texpath=A/'road-albedo.png'
if texpath.exists():
 im=bpy.data.images.load(str(texpath));im.pack();nodes=road.node_tree.nodes;t=nodes.new('ShaderNodeTexImage');t.image=im;road.node_tree.links.new(t.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
ob=mesh('Road surface',[(-2,-1.5,.015),(2,-1.5,.015),(2,1.5,.015),(-2,1.5,.015)],[(0,1,2,3)],road)
uv=ob.data.uv_layers.new(name='RoadUV')
for loop,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=co
create_stage(C,cols['Studio']);scene['source_note']='Original neutral environment kit. Materials reference approved ant colony; hidden surfaces and structures designed for modular use. No ownership flags on scenery.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'source_faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'modules':parts},indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
# Individual runtime exports retain the editable modules and their distinct local origins.
out=A.parents[3]/'assets/environment/wayfarer';out.mkdir(parents=True,exist_ok=True);report=[]
for name,origin in parts.items():
 bpy.ops.object.select_all(action='DESELECT');objects=list(cols[name].objects)
 for ob in objects:ob.location-=Vector(origin);ob.select_set(True)
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();triangles=0
 for ob in objects:
  evaluated=ob.evaluated_get(deps);me=evaluated.to_mesh();me.calc_loop_triangles();triangles+=len(me.loop_triangles);evaluated.to_mesh_clear()
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),use_selection=True,export_format='GLB',export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
 for ob in objects:ob.location+=Vector(origin)
 import struct
 data=(out/(name+'.glb')).read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length])
 triangles=sum((gltf['accessors'][p['indices']]['count'] if 'indices' in p else gltf['accessors'][p['attributes']['POSITION']]['count'])//3 for m in gltf['meshes'] for p in m['primitives'])
 report.append({'id':name,'file':str(out/(name+'.glb')),'triangles':triangles})
(A/'exports.json').write_text(json.dumps(report,indent=2))
