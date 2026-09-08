"""Deterministic authored comparison map; no hidden renderer-only scenery."""
import math,random,json,base64,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
random.seed(941)
assets=['fort','lumberjack','sawmill','forester','worker','guard','item-log','item-plank','item-stone','log-stack','plank-stack','pine-1','pine-2','pine-3','fern','broadleaf','grass','rock','lily','reeds']
catalog=json.loads((ROOT/'assets/catalog.json').read_text())
catalog['assets']=[a for a in catalog['assets'] if not a['id'].startswith('ant-')]
for a in assets:catalog['assets'].append(dict(id='ant-'+a,name='Ant colony · '+a.replace('-',' ').title(),category='foliage' if a.startswith('pine') or a in ['fern','broadleaf','grass','reeds'] else 'water' if a=='lily' else 'other',type='water' if a=='lily' else 'prop',file='ant-colony/'+a+'.glb'))
(ROOT/'assets/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
stamps=[]
def put(asset,x,z,scale=1,yaw=0,elevation=0):
 stamps.append(dict(id=f'ant-scene-{len(stamps):04d}',asset='ant-'+asset,x=x-.5,y=z-.5,scale=scale,yaw=yaw,elevation=elevation))
buildings=[('fort',125.7,117,1.65,-.3),('lumberjack',115,133,1.3,-.4),('sawmill',141,136,1.4,-.3),('forester',143.5,120,1.25,-.3)]
for a,x,z,s,yaw in buildings:
 put(a,x,z,s,yaw)
 if a=='fort':stamps[-1]['heightScale']=.82
for x,z,yaw in [(123.8,121,-.15),(130,121,.1)]:put('guard',x,z,.85,yaw)
for i,(x,z,yaw) in enumerate([(128,125,-.5),(140,125,1.2),(143,123,0),(119,128,-.2),(127,132,1.1),(118,136,-.3),(139,131,1),(129,140,-.1)]):
 put('worker',x,z,.85,yaw)
 if i in [0,1,4]:put('item-log' if i==1 else 'item-plank',x,z+.2,.75,yaw,elevation=.95)
put('log-stack',117.5,135.6,1.15,-.12);put('log-stack',112.6,134.5,1.05,-.2);put('plank-stack',144,137.5,1.2,.1)
paths=[[(112,107),(114,115),(122,125),(129,140),(128,151)],[(111,136),(120,132),(133,128),(145,124),(154,121)],[(127,118),(127,124),(133,130),(144,135)]]
def distance(x,z,line):
 best=999
 for a,b in zip(line,line[1:]):
  dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
  best=min(best,math.hypot(x-a[0]-dx*t,z-a[1]-dz*t))
 return best
def river(z):return 103+2*math.sin((z-102)*.10)
def blocked(x,z,pad=0):return any(((x-bx)/(4.7*s+pad))**2+((z-bz)/(3.7*s+pad))**2<1 for _,bx,bz,s,_ in buildings)
for row in range(23):
 for column in range(26):
  x=94+column*2.65+random.uniform(-1,1);z=92+row*2.75+random.uniform(-1,1)
  clear=((x-130)/24)**2+((z-128)/20)**2<1
  if clear or abs(x-river(z))<4 or min(distance(x,z,p) for p in paths)<2:continue
  put('pine-'+str(random.randint(1,3)),x,z,random.uniform(.65,1.18),random.random()*math.tau)
for i in range(3500):
 x=random.uniform(102,159);z=random.uniform(98,153)
 if abs(x-river(z))<3 or blocked(x,z):continue
 d=min(distance(x,z,p) for p in paths)
 if d<1.6:continue
 edge=((x-130)/23)**2+((z-128)/18)**2
 if edge>.8 and random.random()<.55:put('fern' if random.random()<.65 else 'broadleaf',x,z,random.uniform(.55,1.25),random.random()*math.tau)
 elif random.random()<.75:put('grass',x,z,random.uniform(.7,1.5),random.random()*math.tau)
for z in range(101,153,3):
 for side in [-1,1]:
  put('rock',river(z)+side*3+random.uniform(-.35,.35),z,random.uniform(.6,1.1),random.random()*6)
  if random.random()<.6:put('reeds',river(z)+side*2.4,z+.9,.9,random.random()*6)
 if z%2==0:put('lily',river(z)+.8,z,.9,0)
for i in range(30):
 x=random.uniform(109,155);z=random.uniform(99,152)
 if not blocked(x,z) and min(distance(x,z,p) for p in paths)>2.5:put('rock',x,z,random.uniform(.15,.45),random.random()*6)
# Dry, gently rolling clearing, carved continuous river, flat valid distant spawn areas.
samples=[]
for iz in range(289):
 z=iz-16
 for ix in range(289):
  x=ix-16;h=1.3+.16*math.sin(x*.16)*math.cos(z*.12)
  h-=2.5*math.exp(-((x-river(z))/2.5)**4)
  for _,bx,bz,sc,_ in buildings:
   t=max(0,min(1,(math.hypot(x-bx,z-bz)-3*sc)/(2*sc)));h=h*t+1.3*(1-t)
  samples.append(round(h*100))
landscape=dict(strokes=[dict(points=[dict(x=x,z=z) for x,z in path],radius=1.8,layer='sand',opacity=.95) for path in paths],cover=[],environment=dict(preset='forest',hour=10,season='summer',playing=False),water=dict(rippleScale=.15,rippleStrength=.035,cloudStrength=.012,foamStrength=.14,causticStrength=.03,reflectionStrength=.16,shadowStrength=.8))
doc=dict(v=1,name='Ant Colony — Compare',stamps=stamps,waterLevel=0,height=base64.b64encode(struct.pack('<'+'h'*len(samples),*samples)).decode(),landscape=landscape,playerStarts=[dict(player=1,x=218,z=218),dict(player=2,x=38,z=38)])
(ROOT/'assets/maps/showcase/ant-colony-compare.utcmap').write_text(json.dumps(doc,separators=(',',':'))+'\n')
calls=[['editor_landscape',dict(action='load',map=doc)],['editor_landscape',dict(action='view',grid=False)],['editor_screenshot',dict(x=128,z=127,gameCam=True,gameZoom=.8,pitch=48,yaw=0,keep=True,aspect=1681/937,maxWidth=1681,animationTime=12,format='png')]]
(ROOT/'tmp/ant-colony/load.json').write_text(json.dumps(calls))
print('Authored',len(stamps),'stamps')
