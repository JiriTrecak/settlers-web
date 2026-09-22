"""Original woodland scenery. Broad editable forms, deterministic construction.
All textures are original local artwork. Z-up source, Y-up runtime exports.
"""
import bpy,math,random,json
from pathlib import Path
from mathutils import Vector
from forest_warfare import ForestKit
from woodland_originals import Kit as PineKit
class DetailKit(ForestKit):
 def __init__(self,asset):
  if not bpy.app.background:raise RuntimeError('Background Blender only')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.asset=Path(asset);self.config=json.loads((self.asset/'asset.json').read_text());self.rng=random.Random(self.config.get('seed',813));self.palette={};self.groups={};self.group('Original woodland scenery')
  self.bark=PineKit.tex(self,'Weathered original bark','albedo.png');self.wood=self.bark
  self.cut=self.mat('Muted cut timber','#92754e');self.rope=self.mat('Root fibre','#9d885b');self.dark=self.mat('Hollow shadow','#26291d')
  self.stone=PineKit.tex(self,'Painted woodland stone','albedo_2.png');self.stone2=self.stone;self.moss=self.mat('Muted moss','#505e36')
  self.leafmat=self.mat('Dry olive leaf','#747842');self.amber=self.mat('Amber resin','#a87124',rough=.55,glow=.12)
 def rock(self,c=(0,0,.5),s=(1.5,1.1,1.1),seed=1):
  rng=random.Random(seed);vs=[];n=7
  for z,r in [(-.55,.75),(-.1,1),(.48,.72),(.7,.22)]:
   for i in range(n):
    a=math.tau*i/n+.19;rj=r*rng.uniform(.85,1.13);vs.append((c[0]+math.cos(a)*s[0]*rj,c[1]+math.sin(a)*s[1]*rj,c[2]+z*s[2]))
  faces=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]+[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(3) for i in range(n)]
  return self.mesh('Weathered faceted boulder',vs,faces,[self.stone,self.stone2,self.moss],[1,2]+[0,0,1,0,0,2,0]*3)
 def log(self,length=5,r=.55,hollow=False):
  ps=[(-length/2,0,r*.85),(0,.12,r*.92),(length/2,.08,r*.8)]
  if not hollow:self.tube('Fallen crooked trunk',ps,[r*.82,r,r*.75],self.bark,10,True)
  else:
   vs=[];n=12
   for x,rr in [(-length/2,r*.9),(length/2,r),(-length/2,r*.63),(length/2,r*.69)]:
    for i in range(n):a=math.tau*i/n;vs.append((x,math.cos(a)*rr,r+math.sin(a)*rr))
   faces=[];ids=[]
   for i in range(n):
    q=(i+1)%n;faces.extend([(i,q,n+q,n+i),(2*n+i,3*n+i,3*n+q,2*n+q),(i,2*n+i,2*n+q,q),(n+i,n+q,3*n+q,3*n+i)]);ids.extend([0,1,2,2])
   self.mesh('Open hollow log',vs,faces,[self.bark,self.dark,self.cut],ids)
  for x,y,z in [(-.8,.3,r*1.5),(.5,-.3,r*1.4)]:self.stick('Snapped limb',(x,0,r),(x+.6,y*2,z+.3),r*.24,self.bark)
 def plank(self,name,c,s):return self.box(name,c,s,self.wood)
 def wheel(self,c,r=.75,broken=False):
  x,y,z=c
  for i in range(10):
   if broken and i in [2,3,4]:continue
   a=i*math.tau/10;b=(i+1)*math.tau/10
   self.stick('Wooden wheel rim',(x,y+math.cos(a)*r,z+math.sin(a)*r),(x,y+math.cos(b)*r,z+math.sin(b)*r),.1,self.cut)
  for i in range(4):
   a=i*math.pi/4;self.stick('Wheel spoke',(x,y-math.cos(a)*r,z-math.sin(a)*r),(x,y+math.cos(a)*r,z+math.sin(a)*r),.055,self.cut)
  self.tube('Wheel hub',[(x-.15,y,z),(x+.15,y,z)],[.15,.15],self.bark,8,True)
 def cart(self):
  self.group('Broken trader cart')
  for j in range(6):
   o=self.plank('Cart bed board',(0,-1.6+j*.55,.95),(2.3,.5,.18));o.rotation_euler[0]=.05*(j-2)
  for x in [-1.1,1.1]:
   self.stick('Cart longitudinal runner',(x,-1.9,.72),(x,1.6,.72),.16)
   for j in range(3):
    length=3.4 if x<0 else 1.7;o=self.plank('Surviving side plank',(x,-.3,.95+j*.3),(.15,length,.24));o.rotation_euler[0]=.06 if x<0 else -.16
   self.stick('Pulling shaft',(x,-1.5,.7),(x*.65,-4,.4),.11)
  self.stick('Axle',(-1.6,.6,.72),(1.6,.6,.72),.15)
  self.wheel((-1.45,.6,.78));self.wheel((1.45,.6,.58),broken=True)
  for j in range(3):o=self.plank('Discarded cart board',(1.7+j*.3,-.4-j*.6,.12),(.24,1.8,.12));o.rotation_euler[2]=.5+j*.37
 def tower(self):
  self.group('Ruined timber lookout')
  for x,y in [(-1.65,-1.65),(1.65,-1.65),(-1.65,1.65),(1.65,1.65)]:
   h=6 if x<0 or y>0 else 4.9
   self.stick('Splayed lookout support',(x,y,.1),(x*.74,y*.74,h),.27)
   self.rock((x,y,.15),(.52,.47,.5),int(x*20+y*40+100))
  for j in range(7):
   length=3.6 if j!=5 else 2.4;self.plank('Weathered observation deck',(0,-1.65+j*.55,4.5),(length,.5,.2))
  for x in [-1.3,1.3]:
   self.stick('Diagonal brace',(x,-1.55,.7),(x,1.35,4.2),.15)
   self.stick('Surviving handrail',(x,-1.3,5.55),(x,1.3,5.6),.11)
  self.stick('Back rail',(-1.3,1.3,5.6),(1.3,1.3,5.6),.11)
  for j in range(7):self.stick('Broken ladder rung',(-.52,-1.9-j*.04,.3+j*.52),(.52,-1.9-j*.04,.3+j*.52),.07)
  for x in [-.62,.62]:self.stick('Leaning ladder side',(x,-2.5,.1),(x,-1.8,4.5),.1)
  for j in range(3):self.plank('Collapsed roof board',(1.6+j*.38,1.3,.18+j*.05),(.28,3.5,.16)).rotation_euler[2]=-.5+j*.12
 def lantern(self,mushroom=False):
  h=2.6
  self.stick('Crooked lantern stake',(0,0,0),(.13,.04,h),.15)
  self.stick('Hook branch',(.13,.04,h),(.8,.04,h+.15),.08)
  glow=self.mat('Warm amber lantern glow','#d29b3d',rough=.6,glow=1.8)
  self.ell('Amber lamp',(.78,.04,h-.35),(.25,.25,.4),glow,n=8,rings=4)
  if mushroom:self.ell('Mushroom lantern hood',(.78,.04,h),(.58,.52,.18),self.leafmat,n=10,rings=4)
  else:
   for z in [h-.72,h+.02]:self.ell('Acorn lamp cap',(.78,.04,z),(.34,.32,.1),self.cut,n=8,rings=3)
   for i in range(4):
    a=i*math.tau/4;self.stick('Lantern cage twig',(.78+math.cos(a)*.28,.04+math.sin(a)*.28,h-.7),(.78+math.cos(a)*.28,.04+math.sin(a)*.28,h),.035)
 def mushrooms(self):
  cap=self.mat('Ochre mushroom cap','#937440');pale=self.mat('Mushroom stalk','#a59a73')
  for x,y,h,r in [(0,0,1,.6),(.9,.3,.65,.4),(-.6,.6,.5,.32)]:
   self.tube('Curved mushroom stalk',[(x,y,0),(x+.07,y,h*.7),(x,y,h)],[.12,.09,.07],pale,7)
   self.ell('Broad ochre mushroom cap',(x,y,h), (r,r*.9,r*.22),cap,n=12,rings=4)
 def root_bridge(self):
  for x in [-1.2,1.2]:
   pts=[(x,-8+i*2,.25+1.4*math.cos((-8+i*2)*math.pi/16)) for i in range(9)]
   self.tube('Root arch runner',pts,[.34]*9,self.bark,8)
  for j in range(21):
   y=-8+j*.8;z=.25+1.4*math.cos(y*math.pi/16)
   self.tube('Root bridge tread',[(-1.6,y,z),(.1,y+.04,z+.02),(1.6,y,z)],[.23,.25,.22],self.bark,7,True)
 def detail(self,name):
  if name=='moss-boulder':self.rock(s=(2,1.4,1.5))
  elif name=='river-stones':
   for i in range(7):a=i*2.4;self.rock((math.cos(a)*(i*.22),math.sin(a)*(i*.2),.12),(.35,.3,.3),i)
  elif name=='rock-ledge':
   for i in range(4):self.rock((i*1.2-1.8,0,.3),(.95,.8,.8),i+30)
  elif name=='fallen-log':self.log()
  elif name=='hollow-log':self.log(6,.95,True)
  elif name=='giant-stump':
   self.tube('Ancient snapped trunk',[(0,0,0),(.2,0,2),(0,.2,3.8)],[2.8,2.1,1.85],self.bark,12,True)
   for i in range(7):a=i*math.tau/7;self.tube('Massive stump root',[(math.cos(a)*4.5,math.sin(a)*4.5,.05),(math.cos(a)*2,math.sin(a)*2,.6),(0,0,1.5)],[.08,.6,.9],self.bark,7)
  elif name=='ruined-watchtower':self.tower()
  elif name=='broken-trader-cart':self.cart()
  elif name in ['amber-lantern','mushroom-lantern']:self.lantern(name=='mushroom-lantern')
  elif name=='root-arch-bridge':self.root_bridge()
  elif name=='trail-sign':
   self.stick('Trail marker',(0,0,0),(.1,0,2.3),.14)
   self.plank('Blank weathered marker',(.1,0,1.9),(1.5,.16,.42)).rotation_euler[1]=.07
   self.plank('Second trail marker',(.2,.06,1.3),(1.1,.15,.35)).rotation_euler[1]=-.11
  elif name=='log-bench':
   for x in [-1,1]:self.tube('Bench stump leg',[(x,0,0),(x,0,.7)],[.27,.24],self.bark,8,True)
   self.plank('Split log seat',(0,0,.76),(3,.85,.2))
  elif name=='woodpile':
   for z,xs in [(.23,[-1.0,-.4,.2,.8]),(.67,[-.7,-.1,.5]),(1.08,[-.4,.2])]:
    for x in xs:self.tube('Stacked firewood',[(x,-.9,z),(x,.9,z)],[.22,.20],self.bark,8,True)
  elif name=='acorn-cache':
   shell=self.mat('Muted acorn shell','#81603c');cap=self.mat('Acorn caps','#5e5037')
   for x,y,s in [(0,0,1),(.7,.2,.75),(-.5,.5,.6)]:
    self.ell('Acorn shell',(x,y,s*.45),(.35*s,.35*s,.5*s),shell,n=9,rings=5);self.ell('Acorn cap',(x,y,s*.78),(.39*s,.39*s,.16*s),cap,n=9,rings=3)
  elif name=='amber-deposit':
   self.log(4,.7)
   for i in range(6):a=i*2.4;r=.5+(i%3)*.3;self.ell('Exposed amber resin',(math.cos(a)*1.4,math.sin(a)*.8,.7+r*.4),(r,r*.7,r),self.amber,n=6,rings=3)
  elif name=='supply-crate':
   self.plank('Closed supply chest',(0,0,.6),(1.5,1.2,1.2))
   for x in [-.6,.6]:
    for y in [-.65,.65]:self.plank('Chest corner batten',(x,y,.6),(.15,.13,1.3))
   for x in [-.5,.5]:self.plank('Chest lid strap',(x,0,1.25),(.15,1.35,.1))
  elif name=='rain-barrel':
   self.tube('Wooden rain barrel',[(0,0,0),(0,0,.7),(0,0,1.4)],[.55,.65,.55],self.bark,12)
   for z in [.25,1.15]:self.lash((0,0,z),.61,loops=2)
   self.ell('Dark collected rain',(0,0,1.39),(.47,.47,.012),self.dark,n=12,rings=3)
  elif name=='mushroom-cluster':self.mushrooms()
  elif name=='stone-spring':
   for i in range(8):a=i*math.tau/8;self.rock((math.cos(a)*1.3,math.sin(a)*1.0,.3),(.5,.45,.7),i+30)
   self.ell('Shaded spring pool',(0,0,.08),(1.1,.8,.04),self.mat('Still pool','#364c43'),n=16,rings=3)
  elif name=='leaf-shelter':
   for x in [-1.1,1.1]:self.stick('Shelter fork',(x,0,0),(x,0,1.8),.13)
   self.stick('Shelter ridge',(-1.5,0,1.8),(1.5,0,1.8),.12)
   for i in range(5):
    x=-1.2+i*.6
    for s in [-1,1]:self.leaf('Overlapping dry roof leaf',(x,0,1.9),(x+.1,s*1.5,.55),.43,self.leafmat,(0,0,1),False)
  elif name=='abandoned-camp':
   for i in range(9):a=i*math.tau/9;self.rock((math.cos(a)*.9,math.sin(a)*.9,.09),(.26,.24,.25),i+60)
   self.tube('Extinguished fire log',[(-.6,-.4,.15),(.5,.4,.15)],[.15,.14],self.dark,7)
   self.tube('Extinguished fire log',[(-.5,.5,.22),(.5,-.4,.22)],[.14,.13],self.dark,7)
  elif name=='snapped-root':
   self.tube('Gnarled exposed root',[(-2,0,.05),(-.7,.2,.7),(.1,0,1.2),(1,-.1,.6),(2,.2,.12)],[.15,.5,.48,.3,.06],self.bark,8,True)
  else:raise ValueError(name)
 def export(self):
  self.finish()
  meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
  for o in meshes:
   bpy.context.view_layer.objects.active=o
   for m in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
   o.select_set(True)
  bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
  bpy.ops.export_scene.gltf(filepath=str(self.asset/'geometry.glb'),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False,export_extras=True,export_animations=False,export_yup=True)
def build(asset):
 k=DetailKit(asset);k.detail(asset.name.removeprefix('woodland-'));k.export()
