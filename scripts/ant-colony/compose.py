"""Deterministic authored comparison map; no hidden renderer-only scenery."""
import math,random,json,base64,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
random.seed(941)
assets=['house','tower','stonemason','fort','lumberjack','sawmill','forester','worker','worker-carry','guard','item-log','item-plank','item-stone','log-stack','plank-stack','pine-1','pine-2','pine-3','fern','broadleaf','grass','rock','lily','reeds','driftwood','elephant-leaf']
catalog=json.loads((ROOT/'assets/catalog.json').read_text())
catalog['assets']=[a for a in catalog['assets'] if not a['id'].startswith('ant-')]
for a in assets:catalog['assets'].append(dict(id='ant-'+a,name='Ant colony · '+a.replace('-',' ').title(),category='foliage' if a.startswith('pine') or a in ['fern','broadleaf','grass','reeds','elephant-leaf'] else 'water' if a=='lily' else 'other',type='water' if a=='lily' else 'prop',file='ant-colony/'+a+'.glb'))
catalog['assets'].append(dict(id='ant-stone-deposit',name='Ant colony · Harvestable stone deposit',category='resource',type='prop',file='ant-colony/rock.glb'))
(ROOT/'assets/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
stamps=[]
def put(asset,x,z,scale=1,yaw=0,elevation=0):
 stamps.append(dict(id=f'ant-scene-{len(stamps):04d}',asset='ant-'+asset,x=x-.5,y=z-.5,scale=scale,yaw=yaw,elevation=elevation))
buildings=[('fort',125.7,117,1.95,-.3),('lumberjack',115,133,1.45,-.4),('sawmill',141,136,1.5,-.3),('forester',143.5,120,1.4,-.3)]
for a,x,z,s,yaw in buildings:
 put(a,x,z,s,yaw)
 if a=='fort':stamps[-1]['heightScale']=.82
for x,z,yaw in [(123.4,124.2,-.15),(130.8,123.6,.1)]:put('guard',x,z,1.05,yaw)
for i,(x,z,yaw) in enumerate([(128,125,-.5),(140,125,1.2),(143,123,0),(119,128,-.2),(127,132,1.1),(118,136,-.3),(139,131,1),(129,140,-.1)]):
 put('worker-carry' if i in [0,1,4] else 'worker',x,z,1.05,yaw)
 if i in [0,1,4]:put('item-log' if i==1 else 'item-plank',x+math.sin(yaw)*.48,z+math.cos(yaw)*.48,.7,yaw,elevation=1.04)
put('log-stack',116.5,137.7,1.5,-.4)
# Twelve stacked logs plus four loose pieces keep the wood yard within 16 items.
for x,z,yaw in [(112.2,136.7,.9),(112.7,137.2,1.15),(113.1,137.65,.8),(114,138.2,.45)]:put('item-log',x,z,1.25,yaw)
put('plank-stack',140.1,141.0,2.1,-.6)
paths=[[(112,107),(114,115),(122,125),(129,140),(128,151)],[(111,136),(120,132),(133,128),(145,124),(154,121)],[(127,118),(127,124),(133,130),(144,135)]]
def distance(x,z,line):
 best=999
 for a,b in zip(line,line[1:]):
  dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
  best=min(best,math.hypot(x-a[0]-dx*t,z-a[1]-dz*t))
 return best
def river(z):return 103+1.8*math.sin((z-102)*.12)+.55*math.sin(z*.34)
def riverwidth(z):return 2.45+.50*math.sin(z*.19)+.28*math.cos(z*.43)
def blocked(x,z,pad=0):return any(((x-bx)/(4.7*s+pad))**2+((z-bz)/(3.7*s+pad))**2<1 for _,bx,bz,s,_ in buildings)
for row in range(23):
 for column in range(26):
  x=94+column*2.65+random.uniform(-1,1);z=92+row*2.75+random.uniform(-1,1)
  clear=((x-130)/24)**2+((z-128)/20)**2<1
  if clear or abs(x-river(z))<riverwidth(z)+1.8 or min(distance(x,z,p) for p in paths)<2:continue
  species=random.randint(1,3);scale=random.uniform(.55,1.22);yaw=random.random()*math.tau
  # Deterministic gaps break the former continuous curtain of equal-size trees.
  patch=.5+.5*math.sin(x*.49+math.sin(z*.31)*2.2)*math.cos(z*.43)
  if patch<.38:continue
  put('pine-'+str(species),x,z,scale*.82,yaw)
  stamps[-1]['heightScale']=(.86+.25*(.5+.5*math.sin(x*1.7+z*.9)))*1.12
for i in range(3500):
 x=random.uniform(102,159);z=random.uniform(98,153)
 if abs(x-river(z))<riverwidth(z)+.6 or blocked(x,z):continue
 d=min(distance(x,z,p) for p in paths)
 if d<1.6:continue
 edge=((x-130)/23)**2+((z-128)/18)**2
 if edge>.8 and random.random()<.55:put('fern' if random.random()<.65 else 'broadleaf',x,z,random.uniform(.55,1.25),random.random()*math.tau)
 elif random.random()<.75:
  put('grass',x,z,random.uniform(.7,1.3),random.random()*math.tau)
  stamps[-1]['heightScale']=.5
# Overlapping fracture groups with bare bank between them, not evenly spaced stones.
bank_rng=random.Random(817)
for side in [-1,1]:
 for group in range(10):
  z=99+group*5.9+bank_rng.uniform(-1.8,1.8)
  if bank_rng.random()<.16:continue
  bank=river(z)+side*(riverwidth(z)+.2)
  put('rock',bank,z,bank_rng.uniform(1.0,1.55),bank_rng.random()*math.tau,elevation=-.16)
  stamps[-1]['heightScale']=bank_rng.uniform(.75,1.15)
  for small in range(bank_rng.randint(2,4)):
   rz=z+bank_rng.uniform(-1.2,1.3)
   rx=river(rz)+side*(riverwidth(rz)+bank_rng.uniform(-.25,1.4))
   put('rock',rx,rz,bank_rng.uniform(.35,.85),bank_rng.random()*math.tau,elevation=-.12)
   stamps[-1]['heightScale']=bank_rng.uniform(.55,1.0)
  if bank_rng.random()<.6:put('reeds',bank-side*.65,z+1.1,bank_rng.uniform(.65,1),bank_rng.random()*math.tau)
for z in range(104,156,8):put('lily',river(z)+.8,z,.9,0)
# A few tall leaves provide the reference's insect-scale landmarks.
put('elephant-leaf',river(136)+riverwidth(136)+.65,136,1.45,2.4)
put('elephant-leaf',river(113)+riverwidth(113)+.75,113,1.1,.8)
put('elephant-leaf',138,109,1.3,1.5)
put('elephant-leaf',153,129,1.0,3.1)
put('driftwood',river(121)+riverwidth(121)+.9,121,1.4,-.4)
put('driftwood',river(142)+riverwidth(142)+.7,142,1.0,.8)
for i in range(30):
 x=random.uniform(109,155);z=random.uniform(99,152)
 if not blocked(x,z) and min(distance(x,z,p) for p in paths)>2.5:put('rock',x,z,random.uniform(.15,.45),random.random()*6)
# Small partly embedded pebbles interrupt the dry path surface.
pebble_rng=random.Random(381)
for i in range(95):
 x=pebble_rng.uniform(110,149);z=pebble_rng.uniform(110,146)
 if blocked(x,z,-1.2) or min(distance(x,z,p) for p in paths)>2.0:continue
 put('rock',x,z,pebble_rng.uniform(.065,.14),pebble_rng.random()*math.tau)
 stamps[-1]['heightScale']=.42
# Dry, gently rolling clearing, carved continuous river, flat valid distant spawn areas.
samples=[]
for iz in range(289):
 z=iz-16
 for ix in range(289):
  x=ix-16;h=1.3+.16*math.sin(x*.16)*math.cos(z*.12)
  h-=2.5*math.exp(-((x-river(z))/riverwidth(z))**4)
  for _,bx,bz,sc,_ in buildings:
   t=max(0,min(1,(math.hypot(x-bx,z-bz)-3*sc)/(2*sc)));h=h*t+1.3*(1-t)
  samples.append(round(h*100))
landscape=dict(rivers=[dict(points=[dict(x=river(z),z=z) for z in range(88,166,4)],radius=2.7,depth=2.5)],strokes=[dict(points=[dict(x=x,z=z) for x,z in path],radius=1.8,layer='sand',opacity=.95) for path in paths],cover=[dict(x=129,z=125,radius=34,density=10,seed=7123,flowers=.005,grassScale=.65,broadRatio=1,palette='forest',exclusions=[dict(x=x,z=z,radius=3.6*scale) for _,x,z,scale,_ in buildings])],environment=dict(preset='forest',hour=10,season='summer',playing=False),water=dict(rippleScale=.15,rippleStrength=.14,cloudStrength=.012,foamStrength=.22,causticStrength=.03,reflectionStrength=.16,shadowStrength=.45))
doc=dict(v=1,name='Ant Colony — Compare',stamps=stamps,waterLevel=0,height=base64.b64encode(struct.pack('<'+'h'*len(samples),*samples)).decode(),landscape=landscape,playerStarts=[dict(player=1,x=218,z=218),dict(player=2,x=38,z=38)])
(ROOT/'assets/maps/showcase/ant-colony-compare.utcmap').write_text(json.dumps(doc,separators=(',',':'))+'\n')
calls=[['editor_landscape',dict(action='load',map=doc)],['editor_landscape',dict(action='view',grid=False)],['editor_screenshot',dict(x=128,z=127,gameCam=True,gameZoom=.8,pitch=42,yaw=0,keep=True,aspect=1681/937,maxWidth=1681,animationTime=12,format='png')]]
(ROOT/'tmp/ant-colony/load.json').write_text(json.dumps(calls))
print('Authored',len(stamps),'stamps')
