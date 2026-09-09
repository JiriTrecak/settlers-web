"""Deterministic solid-mesh pine; hidden radial boughs and brown stump inferred."""
import bpy, json, math, random, sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage, aim
if not bpy.app.background: raise RuntimeError('Use separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text()); P=json.loads((A/'palette.json').read_text())['samples']; random.seed(C['seed'])
scene=bpy.context.scene
cols={}
for n in ['01 Thick brown stump and roots','02 Layered olive boughs','03 Studio']:
 c=bpy.data.collections.new(n); scene.collection.children.link(c); cols[n]=c
woodcol=cols['01 Thick brown stump and roots']; leafcol=cols['02 Layered olive boughs']
def mat(n,col):
 m=bpy.data.materials.new(n); m.use_nodes=True; m.diffuse_color=(*col,1); b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*col,1); b.inputs['Roughness'].default_value=.92; b.inputs['Specular IOR Level'].default_value=.08; return m
base=P['olive_light']['representative']['linear_rgb']
leaves=[mat('Olive foliage '+str(i),[v*f for v in base]) for i,f in enumerate([.50,.65,.78,.9,1.05])]
# Soft broad pigment variation, with no outlines or contrasting edge material.
for m in leaves:
 nodes=m.node_tree.nodes; links=m.node_tree.links; bs=nodes.get('Principled BSDF')
 color=tuple(bs.inputs['Base Color'].default_value)
 tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3.5;tex.inputs['Detail'].default_value=1.2
 ramp=nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=tuple(c*.68 for c in color[:3])+(1,)
 ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=tuple(c*1.12 for c in color[:3])+(1,)
 links.new(tex.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bs.inputs['Base Color'])
def linear(h):
 return [((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4)]
woods=[mat('Brown bark '+str(i),linear(h)) for i,h in enumerate(['654023','805333','93623c','50321f'])]
def mesh(n,v,f,ms,col):
 me=bpy.data.meshes.new(n); me.from_pydata(v,[],f); me.update(); ob=bpy.data.objects.new(n,me); col.objects.link(ob)
 for m in ms: me.materials.append(m)
 return ob

def tube(n,points,radii):
 v=[]; f=[]; sides=10
 for j,(p,r) in enumerate(zip(points,radii)):
  for i in range(sides):
   a=math.tau*i/sides; rr=r*(1+.09*math.sin(i*7.1)); v.append((p[0]+rr*math.cos(a),p[1]+rr*math.sin(a),p[2]))
 for j in range(len(points)-1):
  for i in range(sides): f.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
 f.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))]); ob=mesh(n,v,f,woods,woodcol)
 for p in ob.data.polygons:p.material_index=(p.index%10)%4
 return ob

tube('Thick tapered brown stump',[(0,0,0),(.02,0,.22),(-.02,.02,.85),(.04,.03,1.5),(.03,0,3.3),(-.04,0,5.8),(0,0,6.25)],[.53,.46,.35,.3,.22,.105,.015])
for i in range(6):
 a=i*math.tau/6+.17; tube('Short root buttress %02d'%i,[(0,0,.65),(.42*math.cos(a),.42*math.sin(a),.22),(.8*math.cos(a),.8*math.sin(a),.065)],[.25,.21,.035])
# Five connected, plump foliage masses with softly scalloped hanging edges.
# Rounded undersides replace thin doubled sheets and their dark perimeter seams.
def canopy(level, top, radius, depth):
 n=144; rings=18; verts=[]; faces=[]; phase=level*2.399
 def outline(a):
  broad=.5+.5*math.cos(7*a+phase)
  fingers=.5+.5*math.cos(21*a+phase+.45*math.sin(7*a))
  rad=1+.095*math.cos(7*a+phase)+.046*math.cos(21*a+phase)+.04*math.sin(3*a+phase)
  drop=.32*broad+.15*fingers
  return rad,drop
 # Crown converges at one vertex, then continuously flares into heavy boughs.
 verts.append((.05*math.sin(phase),0,top))
 for j in range(1,rings+1):
  t=j/rings
  for i in range(n):
   a=math.tau*i/n; rad,drop=outline(a)
   rr=radius*(t**.78)*(1+(rad-1)*t*t)
   z=top-depth*(t**.88)-drop*(t**3)
   z+=.17*math.cos(7*a+phase)*math.sin(math.pi*t)+.035*math.sin(21*a+phase)*math.sin(math.pi*t)
   verts.append((rr*math.cos(a),rr*math.sin(a),z))
 for i in range(n):faces.append((0,1+i,1+(i+1)%n))
 for j in range(rings-1):
  for i in range(n):
   p=1+j*n+i;q=1+j*n+(i+1)%n;faces.append((p,p+n,q+n,q))
 # Round the hem inward without an exposed lip or contrasting border material.
 for k,(factor,dz) in enumerate([(.985,-.055),(.94,-.10),(.82,-.07),(.55,.03),(.20,.11)]):
  for i in range(n):
   a=math.tau*i/n;rad,drop=outline(a);rr=radius*rad*factor
   verts.append((rr*math.cos(a),rr*math.sin(a),top-depth-drop*factor+dz))
  prev=1+(rings+k-1)*n;cur=prev+n
  for i in range(n):faces.append((prev+i,cur+i,cur+(i+1)%n,prev+(i+1)%n))
 center=len(verts);verts.append((0,0,top-depth+.12));start=center-n
 for i in range(n):faces.append((start+i,center,start+(i+1)%n))
 ob=mesh('Foliage level %d • rounded scalloped canopy'%(level+1),verts,faces,[leaves[2]],leafcol)
 # Recalculate consistent outward normals on the watertight mass.
 import bmesh
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 for poly in ob.data.polygons:poly.use_smooth=True
for level,(top,radius,depth) in enumerate([(2.85,2.5,1.55),(3.75,2.15,1.50),(4.65,1.75,1.48),(5.50,1.30,1.43),(6.38,.82,1.50)]):
 canopy(level,top,radius,depth)
create_stage(C,cols['03 Studio'])
for ob in cols['03 Studio'].objects:
 if ob.type=='LIGHT' and ob.name.startswith('Warm key'):ob.location=( -1,-4,10);ob.location.x=5;aim(ob,(0,0,3.5))
light=bpy.data.lights.new('Soft stump fill','AREA'); light.energy=65; light.color=(1,.72,.46); light.size=3
ob=bpy.data.objects.new('Soft stump fill',light); cols['03 Studio'].objects.link(ob); ob.location=(1,-3,1.8); aim(ob,(0,0,.5))
scene['source_note']='Reference-based stylized pine; back, branches and thick brown stump are inferred. No ownership flag: natural vegetation asset.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
stats={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string}
(A/'model-stats.json').write_text(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
