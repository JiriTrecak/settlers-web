"""Reproducible, rotationally symmetric two-player forest battlefield."""
import math, random, json, base64, struct
from pathlib import Path
R=Path(__file__).resolve().parents[2]; rng=random.Random(94182)
starts=[dict(player=1,x=210,z=210),dict(player=2,x=46,z=46)]
def river(z): return 128+9*math.sin((z-128)*math.pi/128)
def ford(z): return min(abs(z-v) for v in (64,128,192))
paths=[[(46,46),(73,60),(river(64),64),(168,80),(210,210)],[(46,46),(70,103),(128,128),(186,153),(210,210)],[(46,46),(88,176),(river(192),192),(183,196),(210,210)]]
# Every authored route is paired, too.
paths += [[(256-x,256-z) for x,z in p] for p in paths[:]]
def dist(x,z,p):
 out=999
 for (ax,az),(bx,bz) in zip(p,p[1:]):
  dx,dz=bx-ax,bz-az;t=max(0,min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)))
  out=min(out,math.hypot(x-ax-t*dx,z-az-t*dz))
 return out
def route(x,z):return min(dist(x,z,p) for p in paths)
def clearing(x,z):return min(math.hypot(x-p['x'],z-p['z']) for p in starts)<19 or math.hypot(x-128,z-128)<16
stamps=[]
def pair(asset,x,z,s=1,yaw=0,**kw):
 for px,pz,angle in [(x,z,yaw),(256-x,256-z,yaw+math.pi)]:
  stamps.append(dict(id=f'mosswater-{len(stamps):05d}',asset='ant-'+asset,x=round(px-.5,4),y=round(pz-.5,4),scale=round(s,4),yaw=round(angle,5),**kw))
for z in range(5,128,4):
 for x in range(5,252,4):
  x1=x+rng.uniform(-1.3,1.3);z1=z+rng.uniform(-1.3,1.3)
  if clearing(x1,z1) or route(x1,z1)<4 or abs(x1-river(z1))<7:continue
  patch=.5+.5*math.sin(x1*.12+math.sin(z1*.18))*math.cos(z1*.15)
  if patch<.23 or rng.random()<.13:continue
  pair('pine-'+str(rng.randint(1,3)),x1,z1,rng.uniform(.5,.9),rng.random()*math.tau,heightScale=1.12)
  if rng.random()<.45:pair('fern',x1+1,z1+1,rng.uniform(.7,1.2),rng.random()*math.tau)
# Deliberately equal accessible stone seams just outside each starting clearing.
for x,z in [(66,43),(48,70),(86,104),(100,166)]:
 for i in range(6):pair('stone-deposit',x+rng.uniform(-3,3),z+rng.uniform(-3,3),rng.uniform(.7,1.15),rng.random()*math.tau)
for z in range(10,128,5):
 if ford(z)<10:continue
 for side in [-1,1]:
  x=river(z)+side*rng.uniform(4.7,6.6)
  pair('rock',x,z,rng.uniform(.7,1.4),rng.random()*math.tau,elevation=-.15)
  pair('reeds',x-side*1.3,z+1,.8,rng.random()*math.tau)
  if rng.random()<.35:pair('elephant-leaf',x+side*2,z,1.2,rng.random()*math.tau)
 if z%3==1:pair('lily',river(z)+1,z,.8,0)
for x,z in [(101,35),(144,91),(82,119),(35,92)]:pair('driftwood',x,z,1.2,.7)
# Low moss is generated from map-owned cover patches; trails and water mask it.
cover=[]
for z in range(16,128,24):
 for x in range(16,256,24):
  for px,pz in [(x,z),(256-x,256-z)]:
   cover.append(dict(x=px,z=pz,radius=19,density=2.2,seed=941+x*17+z*31,flowers=.003,grassScale=.65,broadRatio=1,palette='forest',exclusions=[dict(x=p['x'],z=p['z'],radius=7) for p in starts]))
def height(x,z):
 # Even under 180-degree rotation; generous traversable land bridges.
 h=1.3+.24*math.cos((x-128)*.075)*math.cos((z-128)*.063)
 bridge=max(0,min(1,(ford(z)-7)/5))
 h-=2.8*math.exp(-((x-river(z))/4.5)**4)*bridge
 for p in starts:
  t=max(0,min(1,(math.hypot(x-p['x'],z-p['z'])-15)/7));h=h*t+1.3*(1-t)
 return h
samples=[round(height(x,z)*100) for z in range(-16,273) for x in range(-16,273)]
reference=json.loads((R/'assets/maps/showcase/ant-colony-compare.utcmap').read_text())
landscape=dict(rivers=[],strokes=[dict(points=[dict(x=x,z=z) for x,z in p],radius=2.4,layer='sand',opacity=.94) for p in paths],cover=cover,environment=reference['landscape']['environment'],water=reference['landscape']['water'])
# Split river curves around raised fords, so surface masks agree with heights.
for lo,hi in [(0,52),(76,116),(140,180),(204,256)]:
 landscape['rivers'].append(dict(points=[dict(x=river(z),z=z) for z in range(lo,hi+1,4)],radius=4.5,depth=2.8))
map=dict(v=1,name='Mosswater Divide',stamps=stamps,waterLevel=0,height=base64.b64encode(struct.pack('<'+'h'*len(samples),*samples)).decode(),landscape=landscape,playerStarts=starts)
(R/'assets/maps/showcase/mosswater-divide.utcmap').write_text(json.dumps(map,separators=(',',':'))+'\n')
print(f'Mosswater Divide: {len(stamps)} stamps, {len(cover)} moss patches, three land crossings.')
