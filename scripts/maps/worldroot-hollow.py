"""Seed the editor-authored endgame duel. Final editor export is the shipped map."""
import json,math,random,struct,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];N=256;rng=random.Random(4719)
starts=[(42,128),(214,128)]
sites=[(65,98,'easy'),(65,158,'easy'),(191,98,'easy'),(191,158,'easy'),(91,62,'medium'),(165,62,'medium'),(91,194,'medium'),(165,194,'medium'),(128,35,'legendary'),(128,221,'legendary')]
roads=[[(42,128),(85,128),(128,128),(171,128),(214,128)],[(42,128),(65,98),(91,62),(128,35),(165,62),(191,98),(214,128)],[(42,128),(65,158),(91,194),(128,221),(165,194),(191,158),(214,128)],[(91,62),(83,92),(85,128),(83,164),(91,194)],[(165,62),(173,92),(171,128),(173,164),(165,194)]]
mines=[(38,112),(218,112),(128,128)]
def segment(x,z,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)));return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def road(x,z):return min(segment(x,z,a,b) for pts in roads for a,b in zip(pts,pts[1:]))
def height(x,z):
 h=2+.15*math.cos((x-128)*.05)*math.cos((z-128)*.07)
 for cz in [83,173]:
  d=math.sqrt(((x-128)/24)**2+((z-cz)/17)**2);h=min(h,max(-1.7,(d-1)*6))
 if road(x,z)<9:h=2
 for a,b in starts+mines+[(x,z) for x,z,t in sites]:
  if math.hypot(x-a,z-b)<13:h=2
 return h
m={'v':2,'size':N,'name':'Worldroot Hollow','description':'Two colonies contest the amber-rich Worldroot between twin pools. Clear nearby T1 nests, raid T2 flank camps, then defeat the Staglord and Matriarch for the map’s two legendary relics. The central root is shared: hold its approaches to secure the amber income.','waterLevel':0,'stamps':[],'entities':[],'camps':[],'playerStarts':[{'player':i+1,'x':x,'z':z,'setup':'setup.ants','mainFort':f'start.player.{i+1}/main-fort'} for i,(x,z) in enumerate(starts)]}
m['height']=base64.b64encode(b''.join(struct.pack('<h',round(height(x,z)*100)) for z in range(-16,N+17) for x in range(-16,N+17))).decode()
def entity(id,d,x,z,appearance=None):
 e={'id':id,'definition':d,'position':{'x':round(x),'y':round(z)},'owner':'none','rotation':0}
 if appearance:e['appearance']=appearance
 m['entities'].append(e);return id
for i,(x,z) in enumerate(mines):entity('worldroot.mine.'+str(i),'building.neutral.amber-mine',x,z)
for i,(x,z,tier) in enumerate(sites):
 kinds={'easy':['wolf','wolf','thornspitter'],'medium':['ogre','thornspitter','thornspitter'],'legendary':['amberjaw-staglord' if z<128 else 'thornblade-matriarch','elder-thornspitter','elder-thornspitter']}[tier]
 members=[entity(f'worldroot.camp.{i}.{j}','unit.neutral.'+k,x+dx,z+dz) for j,(k,(dx,dz)) in enumerate(zip(kinds,[(0,0),(-5,4),(5,4)]))]
 c={'id':f'worldroot.camp.{i}','members':members,'home':{'x':x,'y':z},'aggroRange':9,'leash':16,'aggression':'players','lootPool':'loot.camp.'+('legendary' if tier=='legendary' else tier)}
 if tier=='legendary':c['legendary']=True
 m['camps'].append(c)
def clear(x,z):return road(x,z)<8 or any(math.hypot(x-a,z-b)<r for a,b,r in [(a,b,23) for a,b in starts]+[(a,b,13) for a,b,t in sites]+[(a,b,11) for a,b in mines])
for z in range(8,249,5):
 for x in range(8,127,5):
  if rng.random()>.65:continue
  x+=rng.uniform(-1,1);z1=z+rng.uniform(-1,1)
  for a,b in [(x,z1),(256-x,z1)]:
   if height(a,b)<1 or clear(a,b):continue
   entity(f'worldroot.tree.{len(m["entities"])}','resource.forest.tree',a,b,{'asset':'asset.resource.ant-pine-1','scale':round(rng.uniform(.72,1.1),3)})
for cz in [83,173]:
 for i in range(35):
  a=math.tau*i/35;x=128+25*math.cos(a);z=cz+18*math.sin(a)
  m['stamps'].append({'id':f'worldroot.shore.{cz}.{i}','asset':'ant-rock' if i%3==0 else 'ant-reeds','x':x,'y':z,'yaw':a,'scale':.7 if i%3==0 else .9})
m['landscape']={'rivers':[],'strokes':[],'cover':[],'environment':{'preset':'forest','hour':11,'season':'summer','playing':True}}
(ROOT/'tmp/worldroot-seed.utcmap').write_text(json.dumps(m,separators=(',',':'))+'\n')
(ROOT/'tmp/worldroot-roads.json').write_text(json.dumps(roads))
print(len(m['entities']),'entities',len(m['camps']),'camps')
