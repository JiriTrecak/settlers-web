"""Deterministic two-player rotationally symmetric RTS landscape."""
import math,json,random,struct,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];rng=random.Random(220917)
N=289;O=-16;C=128
starts=[{'player':1,'x':218,'z':218},{'player':2,'x':38,'z':38}]
base=(38,38)
half_routes=[[(38,38),(68,68),(96,96),(128,128)],[(38,38),(80,38),(126,44),(158,66),(174,82)],[(38,38),(38,80),(44,126),(66,158),(82,174)]]
rot=lambda p:(256-p[0],256-p[1])
routes=half_routes+[[rot(p) for p in r] for r in half_routes]
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def segment(x,z,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)))
 return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def road(x,z):return min(segment(x,z,a,b) for points in routes for a,b in zip(points,points[1:]))
def startdist(x,z):return min(math.hypot(x-s['x'],z-s['z']) for s in starts)
def river(x,z):
 u=(x+z-256)/math.sqrt(2);v=(x-z)/math.sqrt(2)
 return abs(u-4*math.sin(v/18)),v
pois=[(74,116),(182,140)]
resources=[(65,48),(48,65),(191,208),(208,191)]
def height(x,z):
 dx,dz=x-128,z-128
 h=2.6+.6*math.sin(dx*.065)*math.sin(dz*.065)+.3*math.cos(dx*.18)*math.cos(dz*.18)
 for px,pz in pois:h+=4.0*math.exp(-((x-px)**2+(z-pz)**2)/230)
 # Soft forested perimeter rises without a sheer enclosing wall.
 border=min(x,z,256-x,256-z);h+=3*(1-smooth((border-2)/14))
 d,v=river(x,z);width=4.0+4.7*math.exp(-((abs(v)-37)/14)**2)
 bed=-1.8+1.55*smooth(d/width)
 bank=smooth((d-width)/3.8);h=bed*(1-bank)+h*bank
 # Three dry, gently sloped crossings, each exactly paired under half-turn.
 crossing=max(math.exp(-(v/8.5)**4),math.exp(-((abs(v)-65)/7.2)**4))
 crossing*=1-smooth((d-10)/9)
 h=h*(1-crossing)+2.3*crossing
 # Wide approaches and home building pads are deliberately level.
 rd=road(x,z);blend=(1-smooth((rd-3.5)/4))*smooth((d-width-1)/3)
 h=h*(1-blend)+2.6*blend
 clear=1-smooth((startdist(x,z)-22)/7);h=h*(1-clear)+2.6*clear
 return h
raw=[round(height(x+O,z+O)*100) for z in range(N) for x in range(N)]
# Quantized height symmetry is exact, not just within a floating-point tolerance.
for i in range(len(raw)//2):raw[i]=raw[-1-i]=round((raw[i]+raw[-1-i])/2)
m={'v':1,'name':'Twinwater Reach','playerStarts':starts,'stamps':[],'height':base64.b64encode(struct.pack('<'+'h'*len(raw),*raw)).decode(),'landscape':{'strokes':[],'cover':[],'decals':[],'rivers':[],'environment':{'hour':8.8,'season':'summer','playing':False,'preset':'forest'},'water':json.loads((ROOT/'assets/maps/showcase/Verdant-River.utcmap').read_text())['landscape']['water']}}
def pair(asset,x,z,scale=1,yaw=None):
 yaw=rng.random()*math.tau if yaw is None else yaw
 for px,pz,a in [(x,z,yaw),(256-x,256-z,yaw+math.pi)]:
  m['stamps'].append({'id':'twinwater-'+str(len(m['stamps'])),'asset':asset,'x':round(px-.5,3),'y':round(pz-.5,3),'yaw':a%math.tau,'scale':round(scale,3)})
# Broad tree belts with open routes; dense crowns cannot overhang either home pad.
for z in range(10,249,6):
 for x in range(10,249,6):
  if x+z>=256:continue
  px,pz=x+rng.uniform(-2,2),z+rng.uniform(-2,2)
  d,v=river(px,pz)
  if startdist(px,pz)<30 or road(px,pz)<9 or height(px,pz)<1.0 or d<11:continue
  if min(math.hypot(px-a,pz-b) for a,b in pois+resources)<9:continue
  chance=.78 if min(px,pz,256-px,256-pz)<20 else .62
  if rng.random()>chance:continue
  pair('pine-chunky' if rng.random()<.78 else 'tree-chunky-broadleaf',px,pz,rng.uniform(.8,1.35))
# Stone reserves at equal distances from each base; visually legible open outcrops.
for cx,cz in resources[:2]:
 for j in range(7):
  a=j*2.399;r=math.sqrt(j)*1.4
  pair('rock-rounded-cool',cx+math.cos(a)*r,cz+math.sin(a)*r,rng.uniform(1.3,2.4))
# Two raised watch groves: ruins, tall stones and broken columns off the main roads.
for asset,x,z,sc in [('synty-prop-pillar-arch-moss-01',74,116,1.2),('synty-prop-pillar-broken-moss-01',70,119,1.0),('rock-rounded-cool',79,117,2.2),('synty-prop-pillar-moss-01',110,124,1.2),('synty-prop-pillar-broken-01',114,124,.9)]:pair(asset,x,z,sc,0)
# Roads remain wide and uninterrupted at the three crossings.
for points in routes:
 m['landscape']['strokes'].append({'points':[{'x':x,'z':z} for x,z in points],'radius':3.5,'layer':'sand','opacity':.42})
# Soft, mirrored vegetation and decal patches outside the build areas.
for j in range(95):
 x,z=rng.uniform(12,242),rng.uniform(12,242)
 if x+z>=256 or height(x,z)<1 or road(x,z)<5 or startdist(x,z)<25:continue
 seed=700+j
 for px,pz in [(x,z),rot((x,z))]:
  # Explicitly paired decals rotate their pattern; cover is kept out of routes.
  m['landscape']['decals'].append({'id':'twin-detail-'+str(len(m['landscape']['decals'])),'kind':['leaf-litter','tiny-flowers','pebbles'][j%3],'x':px,'z':pz,'size':4.5,'rotation':25 if px==x else -155,'opacity':.65})
 for k in range(3):
  px,pz=x+rng.uniform(-2,2),z+rng.uniform(-2,2)
  if height(px,pz)>1:pair(['flower-single-cream','flower-single-purple','flower-single-blue'][k],px,pz,rng.uniform(.85,1.2))
# Banks receive a restrained scatter of pale stones and floating lily pads.
for v in range(-140,0,9):
 u=4*math.sin(v/18)
 x,z=128+(u+v)/math.sqrt(2),128+(u-v)/math.sqrt(2)
 if height(x,z)<-.5:pair('lily-chunky',x+1,z+1,.9)
 for side in [-1,1]:
  bx,bz=x+side*9/math.sqrt(2),z+side*9/math.sqrt(2)
  if height(bx,bz)>.3:pair('pebbles-pale',bx,bz,1.4)
path=ROOT/'assets/maps/showcase/Twinwater-Reach.utcmap';path.write_text(json.dumps(m,separators=(',',':')))
calls=[['editor_landscape',{'action':'load','map':m}],['editor_landscape',{'action':'view','grid':False}],['editor_screenshot',{'x':128,'z':128,'zoom':150,'yaw':0,'pitch':85,'gameCam':False,'keep':True,'aspect':1,'maxWidth':1280,'animationTime':12,'format':'jpeg'}]]
(ROOT/'tmp/visual-audit/twinwater-call.json').write_text(json.dumps(calls))
print(f'{path.name}: {len(m["stamps"])} objects, {len(m["landscape"]["decals"])} decals, 2 clear starts, 3 crossings')
