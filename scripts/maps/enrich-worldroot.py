"""Deterministic Worldroot scenery pass. Keeps authored camps, deposits and player starts."""
import json, math, random, struct, base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=ROOT/'assets/maps/skirmish/worldroot-hollow.utcmap'
m=json.loads(p.read_text()); rng=random.Random(91377); N=m['size']
m['entities']=[e for e in m['entities'] if e['definition']!='resource.forest.tree']
m['stamps']=[]
roads=[[(42,128),(62,123),(85,128),(108,123),(128,128),(150,133),(171,128),(194,123),(214,128)],[(42,128),(52,111),(65,98),(76,81),(91,62),(108,44),(128,35),(147,44),(165,62),(179,82),(191,98),(204,113),(214,128)],[(42,128),(53,143),(65,158),(78,179),(91,194),(109,211),(128,221),(147,212),(165,194),(179,176),(191,158),(203,142),(214,128)],[(91,62),(83,92),(85,128),(83,164),(91,194)],[(165,62),(173,92),(171,128),(173,164),(165,194)]]
def seg(x,z,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)));return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def distance(x,z,lines):return min(seg(x,z,a,b) for pts in lines for a,b in zip(pts,pts[1:]))
protected=[(s['x'],s['z'],23) for s in m['playerStarts']]+[(c['home']['x'],c['home']['y'],12) for c in m['camps']]+[(e['position']['x'],e['position']['y'],12) for e in m['entities'] if e['definition'].startswith('building.')]+[(100,57,9),(174,189,9)]
rivers=[[(118,-16),(110,12),(113,38),(123,59),(128,83),(120,103),(112,122),(126,143),(128,173),(139,196),(140,221),(132,272)],[(128,83),(150,88),(168,108),(193,92),(220,78),(241,67),(272,72)],[(128,173),(104,165),(83,181),(63,176),(37,190),(16,196),(-16,191)]]
ponds=[(128,83,18,13),(128,173,17,14),(221,78,11,9),(37,190,11,9)]
def height(x,z):
 h=1.9+.25*math.sin(x*.055)*math.cos(z*.07)
 d=distance(x,z,rivers); h=min(h,-1.55+max(0,d-2)*.49)
 for a,b,rx,rz in ponds:
  q=math.hypot((x-a)/rx,(z-b)/rz);h=min(h,-2.65+max(0,q-.55)*4.4)
 # Roads become broad wading fords, never invisible land bridges.
 rd=distance(x,z,roads)
 if rd<6.5:h=max(h,-.32)
 elif rd<10:h=max(h,-.32-(rd-6.5)*.45)
 # Smooth, dry platforms for spawning, camps, resource access and Rootworks.
 for a,b,r in protected:
  d=math.hypot(x-a,z-b)
  if d<r:h=max(h,1.9)
  elif d<r+7:h=max(h,1.9-(d-r)*.38)
 return h
m['height']=base64.b64encode(b''.join(struct.pack('<h',round(height(x,z)*100)) for z in range(-16,N+17) for x in range(-16,N+17))).decode()
m['waterLevel']=0
# Irregular connected woodland islands, with tight interiors and feathered edges.
clumps=[(28,38,29,27),(65,32,25,16),(53,66,22,24),(27,91,20,21),(108,19,19,12),(148,17,23,12),(199,33,37,24),(223,60,20,22),(230,103,15,18),(111,105,20,16),(149,111,17,20),(107,151,19,18),(147,151,20,17),(28,160,21,21),(53,207,31,21),(29,230,28,19),(103,237,27,15),(160,238,29,16),(208,224,36,22),(224,185,24,24),(205,164,19,15),(65,140,13,12),(191,140,13,12)]
def clear(x,z):return distance(x,z,roads)<5.5 or any(math.hypot(x-a,z-b)<r for a,b,r in protected)
used=set()
for z0 in range(5,252,3):
 for x0 in range(5,252,3):
  x=round(x0+rng.uniform(-.9,.9));z=round(z0+rng.uniform(-.9,.9))
  q=min(math.hypot((x-a)/rx,(z-b)/rz) for a,b,rx,rz in clumps)
  edge=1+.10*math.sin(x*.43)+.08*math.cos(z*.37)
  if q>edge or clear(x,z) or height(x,z)<.65 or rng.random()<.055:continue
  used.add((x,z));m['entities'].append({'id':f'worldroot.tree.{x}.{z}','definition':'resource.forest.tree','position':{'x':x,'y':z},'owner':'none','rotation':rng.randrange(360),'appearance':{'asset':'asset.resource.tree-secondary' if (x+z)%3==0 else 'asset.resource.tree-primary','scale':round(rng.uniform(.99,1.43),3)}})
def stamp(asset,x,z,scale=1):
 m['stamps'].append({'id':f'worldroot.scenery.{len(m["stamps"])}','asset':asset,'x':round(x,2),'y':round(z,2),'yaw':round(rng.random()*math.tau,3),'scale':round(scale,3)})
# Shore boulder groupings, reeds and lilies follow the actual new waterline.
for z in range(5,251,4):
 for x in range(5,251,4):
  h=height(x,z)
  if -.12<h<.85 and distance(x,z,roads)>5 and rng.random()<.65:
   stamp('ant-reeds',x+rng.random(),z,.65+rng.random()*.5)
   if rng.random()<.3:stamp('ant-rock',x+1,z+1,.6+rng.random()*.8)
  if -2.2<h<-.65 and rng.random()<.055:stamp('ant-lily',x,z,.6+rng.random()*.5)
# Forest-floor vignettes: flowers at sunny edges, mushrooms under canopy, fallen timber.
for a,b,rx,rz in clumps:
 for i in range(25):
  t=rng.random()*math.tau;r=rng.uniform(.5,1.12);x=a+math.cos(t)*rx*r;z=b+math.sin(t)*rz*r
  if not(3<x<253 and 3<z<253) or height(x,z)<.8 or distance(x,z,roads)<3:continue
  asset=rng.choice(['ant-fern','ant-broadleaf','synty-plant-flowerpatch-01','lowpolymushroom_01','ant-rock'])
  stamp(asset,x,z,rng.uniform(.65,1.15))
 for i in range(2):
  x=a+rng.uniform(-rx*.7,rx*.7);z=b+rng.uniform(-rz*.7,rz*.7)
  if height(x,z)>.5 and not clear(x,z):stamp('ant-driftwood',x,z,rng.uniform(.7,1.2))
for c in m['camps']:
 x,z=c['home']['x'],c['home']['y']
 for dx,dz in [(-9,-5),(9,-5),(-7,-9),(7,-9)]:
  if height(x+dx,z+dz)>.6:stamp('ant-rock',x+dx,z+dz,rng.uniform(.8,1.5));stamp('lowpolymushroom_01',x+dx+1,z+dz+1,.9)
# Sunny clearing edges have little fern/flower gardens rather than bare empty disks.
for a,b,r in protected:
 for i in range(12):
  t=rng.random()*math.tau;x=a+math.cos(t)*(r-1);z=b+math.sin(t)*(r-1)
  if height(x,z)>.7 and distance(x,z,roads)>4:
   stamp('ant-fern' if i%3==0 else 'synty-plant-flowerpatch-01',x,z,rng.uniform(.8,1.25))
m['landscape']['strokes']=[{'points':[{'x':x,'z':z} for x,z in pts],'radius':3.2,'layer':'road','opacity':.64} for pts in roads]
m['landscape']['rivers']=[{'points':[{'x':x,'z':z} for x,z in pts],'radius':7,'depth':1.55} for pts in rivers]
m['landscape']['water']={'rippleScale':.13,'rippleStrength':.065,'cloudStrength':.025,'foamStrength':.5,'causticStrength':.35,'reflectionStrength':.15,'shadowStrength':.5}
for c in m['landscape']['cover']:c.update(density=.65,flowers=.055,grassScale=.65,broadRatio=.75)
m['description']='Ancient woodland islands hide guarded clearings beside winding streams. Wade across pale shallows, skirt deep pools, and contest two corrupted roots. Both colonies have sheltered amber and timber; the northern Staglord and southern Matriarch guard legendary relics.'
p.write_text(json.dumps(m,separators=(',',':'))+'\n')
print(len(used),'harvestable trees;',len(m['stamps']),'scenery props;',len(m['camps']),'guarded clearings')

# Reapply authored environment furniture after regenerating natural scenery.
import runpy
runpy.run_path(str(ROOT/'scripts/maps/decorate-worldroot.py'))
