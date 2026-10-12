"""Original needle-card pines and bound-twig bridge. Independently authored meshes and textures.
Z-up authoring, +Y bridge length (glTF -Z). Reproducible from local sources.
"""
import bpy,math,random,json,struct
from pathlib import Path
from mathutils import Vector
from forest_warfare import ForestKit
from forest_environment import tree_actions
def canopy_tint(z,height):
 # Linear albedo tint: cool shaded skirt, green middle, fresh crown.
 t=max(0.,min(1.,(z/height-.20)/.75))
 stops=[(.055,.14,.12),(.28,.48,.29),(1.,1.,.75)]
 i=0 if t<.5 else 1;f=t*2-i
 return tuple(stops[i][c]*(1-f)+stops[i+1][c]*f for c in range(3))+(1.,)

class Kit(ForestKit):
 def __init__(self,asset):
  if not bpy.app.background:raise RuntimeError('Background Blender only')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.asset=asset;self.config=json.loads((asset/'asset.json').read_text());self.rng=random.Random(91);self.palette={};self.groups={};self.group('Original woodland geometry')
  barkfile='albedo.png' if 'bridge' in asset.name or 'stump' in asset.name else 'albedo_2.png'
  self.bark=self.tex('Original warm bark',barkfile);self.wood=self.bark
  self.cut=self.mat('Fresh twig ends','#bba079');self.rope=self.mat('Twisted root bindings','#ad9768');self.leafmat=self.mat('Dried olive leaves','#858448');self.vein=self.mat('Leaf midrib','#c1a575')
 def tex(self,name,file,alpha=False):
  m=self.mat(name,'#ffffff');p=m.node_tree.nodes.get('Principled BSDF');t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(self.asset/file));t.image.pack();t.image.use_fake_user=True;m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if alpha:
   m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
  if alpha:
   tint=m.node_tree.nodes.new('ShaderNodeVertexColor');tint.layer_name='CanopyTint'
   blend=m.node_tree.nodes.new('ShaderNodeMixRGB');blend.blend_type='MULTIPLY';blend.inputs[0].default_value=1
   m.node_tree.links.new(t.outputs['Color'],blend.inputs[1]);m.node_tree.links.new(tint.outputs['Color'],blend.inputs[2]);m.node_tree.links.new(blend.outputs[0],p.inputs['Base Color'])
  p.inputs['Specular IOR Level'].default_value=0
  return m
 def tube(self,name,pts,radii,mat=None,n=8,cuts=False):
  o=super().tube(name,pts,radii,mat,n,cuts)
  for p in o.data.polygons:
   if p.index<2:continue
   for li in p.loop_indices:
    idx=o.data.loops[li].vertex_index;ring,side=divmod(idx,n);o.data.uv_layers.active.data[li].uv=(side/(n-1),ring/(len(pts)-1)*2)
  return o
 def bind(self,x,y,z,r=.22):
  for dz in [-.09,.04,.17]:
   pts=[(x+math.cos(i*math.tau/12)*r,y+math.sin(i*math.tau/12)*r,z+dz) for i in range(13)]
   self.tube('Root-fibre lashing',pts,[.045]*13,self.rope,4)
 def atlas_uv(self,u,v,cell,mirror=False):
  # One high-detail fan fills the texture. Mirrored sheets vary the painted strokes
  # without spending five sixths of the runtime texture on near-identical fans.
  if cell%2:u=1-u
  # The wide fan occupies the central vertical half of the square source.
  # Map that painted region, not its transparent padding, onto the branch.
  return (.005+u*.99,.22+v*.53)
 def bough(self,a,h,r,width,drop,foliage,cell=0):
  # One draped 3-by-4 sheet per bough, as in the reference's construction.
  # The centre ridge sits well above the edges: the flat-shaded fold gives each
  # bough a sunlit half and a shaded half. No intersecting secondary card.
  # Atlas top is the attachment end and atlas bottom is the hanging outer end.
  d=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
  verts=[]
  for j in range(4):
   t=j/3;distance=r*(.025+t*.88+.12*t*t)
   for col in range(3):
    across=col-1
    edge_drop=abs(across)*width*.10
    c=d*(distance-abs(across)*r*.06)+side*across*width*.5
    c.z=h-drop*(.65*t+.35*t*t)-edge_drop
    verts.append(tuple(c))
  # Upward winding is required by the foliage shader's camera-independent normals.
  o=self.mesh('Draped needle bough',verts,[(j*3+c,(j+1)*3+c,(j+1)*3+c+1,j*3+c+1) for j in range(3) for c in range(2)],foliage)
  for p in o.data.polygons:
   for li in p.loop_indices:
    vi=o.data.loops[li].vertex_index
    o.data.uv_layers.active.data[li].uv=self.atlas_uv(vi%3/2,1-vi//3/3,cell)
  tint=o.data.color_attributes.new(name='CanopyTint',type='FLOAT_COLOR',domain='CORNER')
  for p in o.data.polygons:
   for li in p.loop_indices:tint.data[li].color=canopy_tint(o.data.vertices[o.data.loops[li].vertex_index].co.z,self.tree_height)
  o['atlasCell']=0;o['atlasMirrored']=bool(cell%2);o['singleDrapedSheet']=True
 def tree(self,variant):
  small=variant=='sapling';h=3.1 if small else 12.3 if variant=='a' else 11.4
  self.tree_height=h
  self.tube('Tapered harvest trunk',[(0,0,0),(.07,0,h*.3),(-.09,.08,h*.7),(.02,.04,h*(.975 if small else 1))],[.19 if small else .78,.13 if small else .51,.05 if small else .22,.008 if small else .025],self.bark,8,True)
  if not small:
   for i in range(5):
    a=i*math.tau/5;self.tube('Root flare',[(math.cos(a)*1.30,math.sin(a)*1.30,.04),(math.cos(a)*.55,math.sin(a)*.55,.58),(0,0,1.65)],[.055,.30,.42],self.bark,6)
  foliage=self.tex('Original pine needles','albedo.png',True)
  # Broad separated tiers leave the bottom fifth as a readable harvest trunk.
  # Four sheets per whorl retain open branch gaps without overlapping five
  # fans into a dense cone. Lower tiers spread horizontally before drooping.
  # (attachment height, reach, width, drop, number of boughs), normalized below.
  bands=[(5.2,3.8,3.8,1.65,4),(7.0,3.2,3.45,1.65,4),
         (8.65,2.65,3.0,1.5,4),(10.05,1.95,2.45,1.45,4),
         (11.25,1.2,1.65,1.3,4)]
  if small:bands=[(5.0,3.7,4.1,1.8,5),(7.3,3.05,3.4,1.85,5),(9.4,2.1,2.5,1.65,5),(10.9,1.2,1.5,1.3,4)]
  scale=h/12.3;radial=1 if variant!='b' else .96
  for tier,(z,r,w,drop,count) in enumerate(bands):
   phase=tier*2.39+(.4 if variant=='b' else 0)
   for i in range(count):
    a=i*math.tau/count+phase+self.rng.uniform(-.12,.12)
    jitter=self.rng.uniform(.93,1.07);hh=z+self.rng.uniform(-.24,.24)
    palette=[0,3,0,4,1,3,2,5] if variant=='a' else [1,2,4,5,2,5,0,3]
    cell=palette[(tier*3+i*5)%len(palette)]
    self.bough(a,hh*scale,r*scale*jitter*radial,w*scale*jitter*radial,drop*scale,foliage,cell)
  # Three small curved crown fronds replace the two perpendicular upright cards.
  for i in range(3):
   self.bough(i*math.tau/3+.3,h*(1.0-i*.006),.60*scale,.95*scale,2.15*scale,foliage,1)
  if not small:tree_actions(self)
 def bridge(self):
  def deck(y):return .35+.75*math.cos(y*math.pi/24)
  self.group('Bound twig deck')
  for j in range(30):
   y=-11.6+j*.8;z=deck(y)-.33;r=.34+self.rng.uniform(-.02,.02)
   self.tube('Crosswise split twig %02d'%j,[(-3.65-self.rng.random()*.2,y,z),(-1.2,y+.06,z+.02),(1.3,y-.04,z),(3.65+self.rng.random()*.2,y+.03,z-.02)],[r*.92,r,r*.98,r*.91],self.bark,8,True)
  self.group('Curved structural runners and rails')
  for sign in [-1,1]:
   x=sign*3.15;ys=[-12+i*2 for i in range(13)]
   self.tube('Long supporting branch',[(x,y,deck(y)-.65) for y in ys],[.30]*len(ys),self.bark,8,True)
   for y in [-11.6,-7,-2.35,2.35,7,11.6]:
    h=deck(y);px=sign*3.7
    self.tube('Handrail fork post',[(px,y,h-.8),(px+sign*.10,y+.05,h+1.1),(px+sign*.17,y,h+2.15)],[.27,.22,.15],self.bark,7,True)
    self.bind(px+sign*.1,y,h+1.6,.25);self.bind(px,y,h-.03,.28)
    if y in [-11.6,2.35,11.6]:
     self.leaf('Protective bound leaf',(px+sign*.12,y,h+1.70),(px+sign*.2,y+.60,h+.7),.44,self.leafmat,(sign,0,0),True)
   self.tube('Bent twig handrail',[(sign*3.83,y,deck(y)+1.75-.15*math.sin(y*.6)**2) for y in ys],[.16]*len(ys),self.bark,7,True)
  self.group('End brace branches')
  for y in [-10.8,10.8]:
   for sign in [-1,1]:self.tube('Diagonal root brace',[(sign*3.3,y,deck(y)-.4),(sign*4.05,y*.88,deck(y)+1.15)],[.15,.09],self.bark,6,True)
 def stump(self):
  self.tube('Harvest stump',[(0,0,0),(.05,0,.45),(.03,.02,.78)],[.5,.38,.35],self.bark,9,True)
  for i in range(5):
   a=i*math.tau/5;self.tube('Stump root',[(math.cos(a)*.85,math.sin(a)*.85,.04),(math.cos(a)*.3,math.sin(a)*.3,.24),(0,0,.44)],[.03,.20,.25],self.bark,6)
 def export(self):
  # Preserve editable parts in .blend; join disposable export for low draw overhead.
  self.finish()
  meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
  for o in meshes:o.select_set(True)
  bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
  bpy.ops.export_scene.gltf(filepath=str(self.asset/'geometry.glb'),export_format='GLB',use_selection=False,export_cameras=False,export_lights=False,export_extras=True,export_animations=True,export_nla_strips=True,export_yup=True)
  if 'pine' in self.asset.name and 'stump' not in self.asset.name:self.prepare_game_tree()
 def prepare_game_tree(self):
  # Reproducible runtime metadata, including the shader's foliage pivot attribute.
  path=self.asset/'geometry.glb';data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
  doc=json.loads(data[20:20+length]);binary=bytearray(data[28+length:])
  for m in doc['materials']:
   foliage=m['name']=='Original pine needles';p=m['pbrMetallicRoughness'];factor=p.get('baseColorFactor',[1,1,1,1])
   # The painted atlas is already the intended color. Lighting calibration must
   # not be baked into a dark base-color multiplier on individual tree assets.
   p['baseColorFactor']=factor
   m['extras']={'referenceEnvironment':True,'sourceShader':'plant','foliage':foliage,'painted':True,'vertexColorUsage':'tint' if foliage else 'occlusion','backsideLighting':.1 if foliage else 0,'crownNormal':.45,'sourceShaderAttributes':{'IsUseGroundColor':'false'}}
   if foliage:m.update(alphaMode='MASK',alphaCutoff=.4,doubleSided=True)
  height=3.1 if 'sapling' in self.asset.name else 12.3 if self.asset.name.endswith('-a') else 11.4
  for node in doc.get('nodes',[]):node['extras']={**node.get('extras',{}),'referenceEnvironment':True,'plantHeight':height,'foliageWind':{'amplitude':.1,'speed':.18}}
  for mesh in doc['meshes']:
   for primitive in mesh['primitives']:
    if not doc['materials'][primitive['material']]['extras']['foliage']:continue
    position=doc['accessors'][primitive['attributes']['POSITION']];pv=doc['bufferViews'][position['bufferView']]
    count=position['count'];start=pv.get('byteOffset',0)+position.get('byteOffset',0);stride=pv.get('byteStride',12)
    colors=[canopy_tint(struct.unpack_from('<3f',binary,start+i*stride)[1],height) for i in range(count)]
    binary.extend(bytes((-len(binary))%4));offset=len(binary)
    for color in colors:binary.extend(struct.pack('<4f',*color))
    view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':count*16})
    primitive['attributes']['COLOR_0']=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5126,'count':count,'type':'VEC4'})
    binary.extend(bytes((-len(binary))%4));offset=len(binary)
    binary.extend(struct.pack('<4f',.5,.5,.5,1)*count);view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':count*16})
    primitive['attributes']['_LEAF']=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5126,'count':count,'type':'VEC4'})
  doc['buffers'][0]['byteLength']=len(binary);raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
  path.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(raw)+len(binary),len(raw),0x4e4f534a)+raw+struct.pack('<2I',len(binary),0x004e4942)+binary)

def build(asset):
 k=Kit(asset);name=asset.name
 if 'bridge' in name:k.bridge()
 elif 'stump' in name:k.stump()
 else:k.tree(name.replace('woodland-pine-',''))
 k.export()
