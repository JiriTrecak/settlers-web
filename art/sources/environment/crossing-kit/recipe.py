"""Three neutral crossings; their visible floor follows the declared navigation profile."""
import bpy,bmesh,math,json,random,sys
from pathlib import Path
from mathutils import Vector

def build(A):
 if not bpy.app.background:raise RuntimeError('Run in a background Blender process')
 ROOT=A.parents[3];sys.path.insert(0,str(ROOT/'experiments/building-studio'))
 from stage import create_stage,aim
 bpy.ops.wm.read_factory_settings(use_empty=True)
 C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed']);D=C['deck'];half=D['depth']/2
 geo=bpy.data.collections.new('Crossing · editable parts');bpy.context.scene.collection.children.link(geo)
 studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
 def floor(y):return D['height']+D['arch']*math.cos(y*math.pi/D['depth'])
 def mat(name,color,texture=None,rough=.9,emit=0):
  rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
  m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
  if texture:
   im=bpy.data.images.load(str(ROOT/texture),check_existing=True);im.pack();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if emit:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emit
  return m
 bark=mat('Warm split bark','684428','assets/textures/terrain/hollow-bark.png')
 wood=mat('Weathered heartwood','976d43','assets/textures/terrain/heartwood-grain.png')
 cut=mat('Cut annual rings','887257','assets/textures/terrain/heartwood-rings.png')
 moss=[mat('Moss cushion '+str(i),c) for i,c in enumerate(['46542b','59683a','718147'])]
 stones=[mat('Weathered limestone '+str(i),c,C.get('stone_texture'),rough=.83+i*.04) for i,c in enumerate(['6b7063','818777','999c86','747a67'])]
 if C.get('stone_texture'):
  # glTF preserves image × constant as baseColorTexture + baseColorFactor.
  # Modest block-to-block values retain readable masonry under canopy shadows.
  for m,tint in zip(stones,[.58,.78,1,.7]):
   nodes,links=m.node_tree.nodes,m.node_tree.links;p=nodes.get('Principled BSDF');image=next(n for n in nodes if n.type=='TEX_IMAGE')
   multiply=nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
   a=next(s for s in multiply.inputs if s.name=='A' and s.type=='RGBA');b=next(s for s in multiply.inputs if s.name=='B' and s.type=='RGBA');b.default_value=(tint,tint*.99,tint*.95,1)
   links.new(image.outputs['Color'],a);links.new(next(s for s in multiply.outputs if s.type=='RGBA'),p.inputs['Base Color'])
 rope=mat('Twisted fibre','78634a');resin=mat('Warm resin lamp','efa336',rough=.35,emit=.8)
 def mesh(name,vs,fs,mats,inds=None,uv='wood',smooth=False):
  me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);geo.objects.link(ob)
  for m in mats:me.materials.append(m)
  for p in me.polygons:p.material_index=inds[p.index] if inds else 0;p.use_smooth=smooth
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
  layer=me.uv_layers.new(name='Authored grain')
  for p in me.polygons:
   for li in p.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co
    if C.get('stone_texture') and mats[p.material_index] in stones:
     # One material tile spans several blocks. World-space projection keeps the
     # paving's scale consistent; per-part offsets avoid obvious copied cracks.
     offset=(sum(map(ord,name))%43)/43
     if abs(p.normal.z)>.6:co=(v.x*.21+offset,v.y*.21)
     elif abs(p.normal.x)>.6:co=(v.y*.21+offset,v.z*.21)
     else:co=(v.x*.21+offset,v.z*.21)
    elif uv=='cross':co=(v.x/8+.5,v.z/6+.7)
    elif abs(p.normal.z)>.6:co=(v.y*.4+(sum(map(ord,name))%37)/37,v.x*.18) if mats[p.material_index]==wood else (v.x*.16,v.y*.13)
    elif abs(p.normal.x)>.6:co=(v.y*.13,v.z*.22)
    else:co=(v.x*.16,v.z*.22)
    layer.data[li].uv=co
  if any(m in stones for m in mats):
   bevel=ob.modifiers.new('Weather-worn corners','BEVEL');bevel.width=.075;bevel.segments=1;bevel.affect='EDGES'
   normal=ob.modifiers.new('Broad stone face normals','WEIGHTED_NORMAL');normal.keep_sharp=True
  return ob
 def box(name,x,y,w,d,low,high,material):
  vs=[(x+sx*w/2,y+sy*d/2,z) for z in [low,high] for sy in [-1,1] for sx in [-1,1]]
  return mesh(name,vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],[material])
 def beam(name,a,b,r,material,sides=8):
  a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
  if u.length<.1:u=direction.cross(Vector((0,1,0)))
  u.normalize();v=direction.cross(u);vs=[tuple(p+(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))*r) for p in [a,b] for i in range(sides)]
  fs=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
  return mesh(name,vs,fs,[material],smooth=False)
 def cushion(name,x,y,z,rx,ry):
  vs=[(x,y,z+.13)]+[(x+math.cos(i*math.tau/9)*rx*rng.uniform(.8,1.1),y+math.sin(i*math.tau/9)*ry*rng.uniform(.8,1.1),z-.015) for i in range(9)]
  return mesh(name,vs,[(0,i+1,(i+1)%9+1) for i in range(9)],moss,[rng.randrange(3) for _ in range(9)])
 def strip(name,x1,x2,y1,y2,thickness,material,offset=0,segments=1):
  vs=[]
  for i in range(segments+1):
   y=y1+(y2-y1)*i/segments;z=floor(y)+offset
   vs.extend([(x1,y,z),(x2,y,z),(x1,y,z-thickness),(x2,y,z-thickness)])
  fs=[]
  for i in range(segments):
   a=i*4;b=a+4;fs.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
  fs.extend([(0,1,3,2),(segments*4,segments*4+2,segments*4+3,segments*4+1)])
  return mesh(name,vs,fs,[material])
 if C['kind']=='root':
  # Flattened upper crown is usable footing; rounded sides remain outside the deck.
  section=[(-2.7,0),(0,0),(2.7,0),(3.45,-.55),(3.2,-1.55),(1.7,-2.35),(0,-2.6),(-1.7,-2.35),(-3.2,-1.55),(-3.45,-.55)]
  steps=48;vs=[]
  for i in range(steps+1):
   y=-half+D['depth']*i/steps
   for j,(x,z) in enumerate(section):
    wobble=0 if j<3 else .1*math.sin(i*.61+j*1.7)
    vs.append((x+wobble,y,floor(y)+z))
  n=len(section);fs=[(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(steps) for j in range(n)]
  mesh('Arched ancient root · continuous walk crown',vs,fs,[bark],smooth=False)
  for end,index in [('south',0),('north',steps)]:mesh('Broken root end '+end,vs[index*n:index*n+n],[tuple(range(n))],[cut],uv='cross')
  # Edge-only growth leaves the central walking strip visually open.
  for side in [-1,1]:
   for i in range(16):
    y=-half+1+i*(D['depth']-2)/15+rng.uniform(-.2,.2);x=side*rng.uniform(2.8,3.2)
    cushion('Moss along root edge %s.%s'%(side,i),x,y,floor(y)-.15,.35,rng.uniform(.35,.65))
   for i in range(10):
    y=-half+1.5+i*(D['depth']-3)/9;z=floor(y)-.65
    mesh('Split side bark %s.%s'%(side,i),[(side*3.24,y-.7,z+.3),(side*3.45,y-.5,z),(side*3.42,y+.55,z-.3),(side*3.15,y+.9,z+.15)],[(0,1,2,3)],[bark])
 elif C['kind']=='timber':
  for side in [-1,1]:strip('Continuous bent support '+str(side),side*2.3-.2,side*2.3+.2,-half,half,.65,bark,offset=-.2,segments=36)
  rows=24;dy=D['depth']/rows
  for i in range(rows):
   y=-half+i*dy;left=-3+rng.uniform(-.07,.07);right=3+rng.uniform(-.07,.07)
   strip('Weathered plank %02d'%i,left,right,y+.025,y+dy-.025,.22,wood,segments=2)
  for side in [-1,1]:
   for j,y in enumerate([-half+.5,0,half-.5]):
    z=floor(y);beam('Bridge post %s.%s'%(side,j),(side*3.35,y,z-.8),(side*3.35,y,z+1.55),.23,bark)
    box('Cut post cap %s.%s'%(side,j),side*3.35,y,.5,.5,z+1.5,z+1.62,cut)
   for part,(a,b) in enumerate([(-half+.5,0),(0,half-.5)]):
    for rail,h in enumerate([.8,1.35]):
     for j in range(12):
      def ropePoint(t):
       y=a+(b-a)*t;z=(floor(a)+h)*(1-t)+(floor(b)+h)*t-.24*math.sin(t*math.pi)
       return (side*3.35,y,z)
      beam('Fibre railing %s.%s.%s.%s'%(side,part,rail,j),ropePoint(j/12),ropePoint((j+1)/12),.07,rope)
   for y in [-half+.5,half-.5]:
    # Readable resin lanterns, hanging outside the walking lane.
    z=floor(y)+1.1;x=side*3.7
    beam('Lantern branch',(side*3.35,y,z+.3),(x,y,z+.3),.09,wood)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,z));o=bpy.context.object;o.name='Amber waylight';o.scale=(.22,.22,.34);o.data.materials.append(resin)
    for col in list(o.users_collection):col.objects.unlink(o)
    geo.objects.link(o)
    box('Lantern wooden hood',x,y,.6,.55,z+.32,z+.43,wood)
 elif C['kind']=='stone':
  strip('Continuous masonry arch',-3.35,3.35,-half,half,D['thickness'],stones[0],segments=48)
  rows=18;dy=D['depth']/rows
  for i in range(rows):
   y=-half+i*dy
   # Alternating long/short stones form a bonded pavement instead of a chessboard.
   # Heights and the six-metre playable width remain identical to the walk profile.
   cuts=[-3,-1,1,3] if i%2==0 else [-3,-2,0,2,3]
   for j,(left,right) in enumerate(zip(cuts,cuts[1:])):
    strip('Worn paving %02d.%s'%(i,j),left+.035,right-.035,y+.035,y+dy-.035,.14,stones[(i+j)%4],offset=.035,segments=2)
  for side in [-1,1]:
   for i in range(12):
    y=-half+i*D['depth']/12+.05;end=y+D['depth']/12-.1
    strip('Low parapet %s.%s'%(side,i),side*3.65-.35,side*3.65+.35,y,end,1.15,stones[(i+1)%4],offset=1.1,segments=3)
    if i%2==0:cushion('Parapet moss %s.%s'%(side,i),side*3.65,(y+end)/2,floor((y+end)/2)+1.13,.33,.58)
   for end in [-1,1]:
    y=end*(half-.5);box('Stone abutment %s.%s'%(side,end),side*4,y,1.5,2.3,-.65,floor(y)+1.22,stones[1])
 else:raise ValueError('Unknown crossing kind')
 create_stage(C,studio)
 for o in studio.objects:
  if o.type=='LIGHT':o.location*=2.5;o.data.size*=2.5;aim(o,(0,0,2))
 im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
 scene=bpy.context.scene;scene['source_note']='Hollow Gate concept; hidden construction inferred. Neutral crossing. Top walk profile is declared in asset.json and matches the exported geometry.'
 scene['walk_profile']=json.dumps(D,sort_keys=True)
 bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'meshes':len(geo.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in geo.objects),'materials':len({m.name for o in geo.objects for m in o.data.materials})},indent=2))
 bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
