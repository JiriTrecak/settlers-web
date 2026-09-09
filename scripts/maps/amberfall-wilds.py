"""Authored 512-square duel: drowned forest, island crossing, outer trails and 23 camps."""
import json,math,random,struct,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];rng=random.Random(91733);N=512
starts=[(72,416),(440,96)];mirror=lambda p:(N-p[0],N-p[1])
roads=[([(72,416),(100,350),(123,290),(138,256),(185,256),(256,256),(327,256),(374,256),(389,222),(412,162),(440,96)],4.2),
 ([(72,416),(150,446),(245,455),(340,430),(420,360),(454,260),(455,150),(440,96)],3.3),
 ([(440,96),(362,66),(267,57),(172,82),(92,152),(58,252),(57,362),(72,416)],3.3),
 ([(58,252),(92,230),(138,256)],2.5), ([(454,260),(420,282),(374,256)],2.5)]
def segment(x,z,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)))
 return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def road_dist(x,z):return min(segment(x,z,a,b)-r for pts,r in roads for a,b in zip(pts,pts[1:]))
def shore(x,z):
 dx,dz=(x-256)/108,(z-256)/147;a=math.atan2(dz,dx)
 return (math.hypot(dx,dz)-(1+.08*math.cos(4*a)))*108
# Tiered sites are paired about the center, with equal rewards and travel opportunities.
sites=[]
for tier,points in [('easy',[(92,365),(47,310),(156,416),(165,356)]),('medium',[(75,230),(142,172),(203,424),(320,425)]),('hard',[(132,256),(260,55),(72,80)])]:
 for p in points:
  for q in [p,mirror(p)]:sites.append((q[0],q[1],tier))
sites.append((256,256,'hard'))
mines=[(72,402),(440,82),(85,256),(427,256),(254,66),(258,446),(247,250)]
def height(x,z):
 h=max(-3.2,min(2,shore(x,z)*.25))
 if shore(x,z)>8:h=2+.30*math.sin(x*.042)*math.sin(z*.042)
 # A root-covered central island and two real traversable causeways.
 h=max(h,min(2,(43-math.hypot(x-256,z-256))*.30))
 if 120<x<392:h=max(h,min(1.6,(7-abs(z-256))*.5))
 for sx,sz in starts:
  d=math.hypot(x-sx,z-sz)
  if d<27:h=2+(h-2)*max(0,(d-22)/5)
 for sx,sz in mines:
  d=math.hypot(x-sx,z-sz)
  if d<9:h=max(h,2)
 for sx,sz,t in sites:
  d=math.hypot(x-sx,z-sz)
  if d<10:h=max(h,2)
 return h
m={'v':2,'size':N,'name':'Amberfall Wilds','waterLevel':0,'stamps':[],'entities':[],'camps':[],
 'playerStarts':[{'player':i+1,'x':x,'z':z,'setup':'setup.ants','mainFort':f'start.player.{i+1}/main-fort'} for i,(x,z) in enumerate(starts)]}
m['height']=base64.b64encode(b''.join(struct.pack('<h',round(height(x,z)*100)) for z in range(-16,N+17) for x in range(-16,N+17))).decode()
occupied=set()
def entity(id,definition,x,z,appearance=None):
 x,z=round(x),round(z);occupied.add((x,z));e={'id':id,'definition':definition,'position':{'x':x,'y':z},'rotation':0,'owner':'none'}
 if appearance:e['appearance']=appearance
 m['entities'].append(e);return id
for i,(x,z) in enumerate(mines):
 entity(f'amber.{i+1}','resource.amber.seam',x,z)
 for dx in range(-5,6):
  for dz in range(-5,6):occupied.add((x+dx,z+dz))
for i,(x,z,tier) in enumerate(sites):
 kinds={'easy':['wolf','wolf','thornspitter'],'medium':['ogre','thornspitter','thornspitter'],'hard':['ogre','ogre','elder-thornspitter','elder-thornspitter']}[tier]
 if (x,z)==(256,256):kinds=['ogre','ogre','ogre','elder-thornspitter','elder-thornspitter']
 offsets=[(-3,0),(3,0),(-3,4),(3,4),(0,-4)];members=[]
 for j,(kind,(dx,dz)) in enumerate(zip(kinds,offsets)):members.append(entity(f'camp.{i+1}.guard.{j+1}','unit.neutral.'+kind,x+dx,z+dz))
 m['camps'].append({'id':f'camp.{i+1}','members':members,'home':{'x':x,'y':z},'aggroRange':10 if tier=='easy' else 12,'leash':22,'aggression':'players','lootPool':'loot.camp.'+tier})
def clear(x,z):return any(math.hypot(x-a,z-b)<20 for a,b in starts) or any(math.hypot(x-a,z-b)<12 for a,b,t in sites) or any(math.hypot(x-a,z-b)<8 for a,b in mines)
def stamp(asset,x,z,scale=1):m['stamps'].append({'id':f'wilds.prop.{len(m["stamps"])+1}','asset':asset,'x':round(x,2),'y':round(z,2),'yaw':round(rng.random()*math.tau,3),'scale':round(scale,3)})
# Two-cell candidate lattice with larger openings for roads and camp clearings.
for z in range(6,N-6,4):
 for x in range(6,N//2,4):
  x0=x+rng.uniform(-1,1);z0=z+rng.uniform(-1,1)
  density=.45+.25*math.sin(x*.055)*math.cos(z*.051)
  if rng.random()>density:continue
  for tx,tz in [(x0,z0),(N-x0,N-z0)]:
   if height(tx,tz)<1.2 or road_dist(tx,tz)<3 or clear(tx,tz) or (round(tx),round(tz)) in occupied:continue
   entity(f'wilds.tree.{len(m["entities"])}','resource.forest.tree',tx,tz,{'asset':'asset.resource.ant-pine-1','scale':round(rng.uniform(.68,1.05),3)})
   if rng.random()<.15:stamp('ant-fern',tx+1.2,tz+.6,rng.uniform(.55,.9))
# Equal readily accessible wood stands just outside each starting clearing.
for sx,sz in starts:
 for dx,dz in [(-19,0),(-19,3),(-22,0),(-22,3),(18,3),(18,6),(21,3),(21,6)]:
  x,z=sx+dx,sz+dz
  if (x,z) not in occupied:entity(f'home.tree.{x}.{z}','resource.forest.tree',x,z,{'asset':'asset.resource.ant-pine-1','scale':.85})
for i in range(300):
 a=i*math.tau/300;r=1+.08*math.cos(4*a);x,z=256+108*r*math.cos(a),256+147*r*math.sin(a)
 if road_dist(x,z)<8:continue
 if i%2==0:stamp('ant-rock',x+2*math.cos(a),z+2*math.sin(a),rng.uniform(.6,1.4))
 if i%3==0:stamp('ant-reeds',x,z,rng.uniform(.6,1))
 if i%9==0:stamp('ant-lily',x-4*math.cos(a),z-4*math.sin(a),rng.uniform(.7,1.2))
 if i%23==0:stamp('ant-driftwood',x+3*math.cos(a),z+3*math.sin(a),.9)
 if i%19==0:stamp('ant-elephant-leaf',x+6*math.cos(a),z+6*math.sin(a),.8)
cover=[]
for z in range(8,N,24):
 for x in range(8,N,24):
  if height(x,z)<.5:continue
  exclusions=[{'x':sx,'z':sz,'radius':11} for sx,sz in starts if math.hypot(x-sx,z-sz)<35]
  for pts,r in roads:
   for a,b in zip(pts,pts[1:]):
    steps=math.ceil(math.dist(a,b)/6)
    for j in range(steps+1):
     xx=a[0]+(b[0]-a[0])*j/steps;zz=a[1]+(b[1]-a[1])*j/steps
     if math.hypot(xx-x,zz-z)<22:exclusions.append({'x':round(xx,2),'z':round(zz,2),'radius':r+1})
  cover.append({'x':x,'z':z,'radius':17,'density':1.1,'seed':x*173+z,'flowers':.006,'grassScale':.58,'broadRatio':1,'palette':'forest','exclusions':exclusions})
water=json.loads((ROOT/'assets/maps/showcase/mosswater-divide.utcmap').read_text())['landscape']['water']
m['landscape']={'rivers':[],'strokes':[{'points':[{'x':x,'z':z} for x,z in pts],'radius':r,'layer':'sand','opacity':.9} for pts,r in roads],'cover':cover,'environment':{'preset':'forest','hour':11,'season':'summer','playing':True},'water':water}
p=ROOT/'assets/maps/skirmish/amberfall-wilds.utcmap';p.write_text(json.dumps(m,separators=(',',':'))+'\n')
print(len(m['entities']),'entities',len(m['stamps']),'props',len(cover),'cover patches',len(sites),'camps')
