"""Original tiny foliage meshes and simple alpha-card meadow tufts."""
import bpy,math,random,json
from pathlib import Path
from forest_warfare import ForestKit
from woodland_originals import Kit as PineKit
class FoliageKit(ForestKit):
 def __init__(self,asset):
  if not bpy.app.background:raise RuntimeError('Background Blender only')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.asset=Path(asset);self.config=json.loads((self.asset/'asset.json').read_text());self.rng=random.Random(471);self.palette={};self.groups={};self.group('Original ground cover')
  self.green=self.mat('Muted olive leaves','#35452a');self.green2=self.mat('Leaf light facets','#445332');self.cut=self.green
 def cards(self,name):
  mat=PineKit.tex(self,'Original meadow grass','albedo.png',True)
  low=name=='grass-low';messy=name=='grass-messy';height=.72 if low else 1.0 if messy else 1.6;width=1.7 if low else 2.1
  cells=[0,4,0] if low else [3,5,2] if messy else [1,3,5] if name=='grass-high-a' else [2,5,1]
  for i,cell in enumerate(cells):
   a=i*2.14+.2;d=(math.cos(a),math.sin(a));side=(-d[1],d[0]);ox,oy=d[0]*.18,d[1]*.18
   vs=[]
   for j in range(2):
    for col in range(3):
     u=col/2;curve=.15*(1-abs(col-1));vs.append((ox+side[0]*(u-.5)*width+d[0]*curve,oy+side[1]*(u-.5)*width+d[1]*curve,-.045 if j==0 else height))
   o=self.mesh('Bent meadow card',vs,[(0,1,4,3),(1,2,5,4)],mat)
   for poly in o.data.polygons:
    for li in poly.loop_indices:
     vi=o.data.loops[li].vertex_index;u=(vi%3)/2;v=vi//3
     o.data.uv_layers.active.data[li].uv=((cell%3+.03125+u*.9375)/3,1-(cell//3+.03125+(1-v)*.9375)/2)
 def lilies(self,variant):
  count=5 if variant=='a' else 8
  for i in range(count):
   a=i*2.399;r=.25+math.sqrt(i)*.37;x,y=math.cos(a)*r,math.sin(a)*r;rr=self.rng.uniform(.24,.43);n=10
   vs=[(x,y,.06)]+[(x+math.cos(a+.24+j*(math.tau-.48)/(n-1))*rr,y+math.sin(a+.24+j*(math.tau-.48)/(n-1))*rr,.025+(.012 if j%3==0 else 0)) for j in range(n)]
   self.mesh('Notched floating lily',vs,[(0,j+1,j+2) for j in range(n-1)],[self.green,self.green2],[0,0,1,0,0,0,1,0,0])
 def daisies(self):
  cream=self.mat('Soft ivory petals','#afa991');gold=self.mat('Muted flower centers','#93803f')
  for i in range(5):
   a=i*2.4;x,y=math.cos(a)*.6,math.sin(a)*.6;h=.25+i%3*.13
   self.tube('Daisy stem',[(x,y,0),(x+.04,y,h)],[.016,.012],self.green,4)
   for j in range(6):
    a=j*math.tau/6;dx,dy=math.cos(a),math.sin(a);vs=[(x,y,h+.02),(x+dx*.2-dy*.06,y+dy*.2+dx*.06,h),(x+dx*.25,y+dy*.25,h+.01),(x+dx*.2+dy*.06,y+dy*.2-dx*.06,h)]
    self.mesh('Simple daisy petal',vs,[(0,1,2,3)],cream)
   self.ell('Daisy center',(x,y,h+.035),(.065,.065,.025),gold,n=6,rings=3)
 def export(self):
  self.finish();meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
  for o in meshes:o.select_set(True)
  bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
  bpy.ops.export_scene.gltf(filepath=str(self.asset/'geometry.glb'),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False,export_extras=True,export_animations=False,export_yup=True)
def build(asset):
 k=FoliageKit(asset);name=asset.name.removeprefix('woodland-')
 if name.startswith('lily-'):k.lilies(name[-1])
 elif name=='daisies':k.daisies()
 else:k.cards(name)
 k.export()
