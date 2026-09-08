"""Editable river showcase shaped around the vivid river reference."""
import json,math,random,struct,base64
from pathlib import Path
root=Path(__file__).resolve().parents[2];rng=random.Random(915)
controls=[(75,88,3),(91,103,3.5),(101,106,4.5),(115,114,8.5),(120,125,8.2),(127.5,132,3.8),(142,133,10.5),(157,127,7.5),(177,124,5)]
samples=[]
for i in range(len(controls)-1):
 a,b,c,d=controls[max(0,i-1)],controls[i],controls[i+1],controls[min(len(controls)-1,i+2)]
 for j in range(20):
  t=j/20;samples.append(tuple(.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t**3) for k in range(3)))
samples.append(controls[-1])
def distance(x,z):return min(math.hypot(x-px,z-pz)/r for px,pz,r in samples)
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def height(x,z):
 d=distance(x,z)
 # Small bank indentations retain the broad authored river silhouette.
 d+=.035*math.sin(x*1.31+z*.23)*math.sin(z*.91)*smooth((d-.65)/.3)
 # A shallow submerged apron meets a short, steeper rock bank below rolling grass.
 poolDepth=1.65+.9*math.exp(-((x-142)/15)**2-((z-133)/9)**2)
 bed=-poolDepth+(poolDepth-.22)*smooth((d-.52)/.43)
 base=bed+smooth((d-.94)/.24)*(2.7+.45*math.sin(x*.15)*math.cos(z*.19))
 # A shallow neck separates the two wider pools; low shelves interrupt high banks.
 ford=math.exp(-((x-127.5)/5.5)**2-((z-132)/5.5)**2)
 base+=(max(-.045,base)-base)*ford*.995
 shelf=max(math.exp(-((x-127)/5.5)**2-((z-125)/3.5)**2),math.exp(-((x-107)/5.5)**2-((z-114)/3.0)**2),math.exp(-((x-151)/6)**2-((z-139)/3.5)**2))
 shelf*=.99*smooth((d-.45)/.35)
 base=base*(1-shelf)+(.10+.3*(d-1))*shelf
 # Gravel shallows interrupt the upper approach before the main pool.
 gravel=math.exp(-((x-100)/6.0)**2-((z-106)/3.5)**2)
 base+=(max(-.70,base)-base)*gravel*.97
 return base
m={'v':1,'name':'Verdant River','stamps':[],'landscape':{'rivers':[{'points':[{'x':x,'z':z,'radius':r} for x,z,r in controls],'radius':6,'depth':1.65}],'strokes':[],'cover':[],'environment':{'hour':8.8,'season':'summer','playing':False},'water':{'rippleScale':.16,'rippleStrength':.14,'cloudStrength':.18,'foamStrength':.9,'causticStrength':.18,'reflectionStrength':.07,'shadowStrength':.25}}}
# Rotate the authored composition into the fixed 45-degree gameplay yaw.
turn=math.pi/4
def world(x,z):
 x-=126;z-=126;return 126+x*math.cos(turn)+z*math.sin(turn),126-x*math.sin(turn)+z*math.cos(turn)
def local(x,z):
 x-=126;z-=126;return 126+x*math.cos(turn)-z*math.sin(turn),126+x*math.sin(turn)+z*math.cos(turn)
h=[round(height(*local(x-16,z-16))*100) for z in range(289) for x in range(289)];m['height']=base64.b64encode(struct.pack('<'+'h'*len(h),*h)).decode()
def stamp(asset,x,z,scale):m['stamps'].append(dict(id='vivid-river-'+str(len(m['stamps'])),asset=asset,x=round(x,3),y=round(z,3),scale=round(scale,3),yaw=rng.random()*math.tau))
for z in range(96,162,5):
 for x in range(88,171,5):
  px,pz=x+rng.uniform(-1.7,1.7),z+rng.uniform(-1.7,1.7)
  if distance(px+.5,pz+.5)<1.5:continue
  dense=z<115 or x<104 or x>155
  if rng.random()>(.8 if dense else .12):continue
  foreground=1.4 if pz>138 and (px<105 or px>155) else .62 if pz<115 else .85
  stamp('pine-chunky' if rng.random()<.7 else 'tree-chunky-broadleaf',px,pz,rng.uniform(.8,1.45)*foreground)
for i in range(180):
 x,z=rng.uniform(90,168),rng.uniform(101,160)
 if height(x+.5,z+.5)<1.0:continue
 if rng.random()<.62:stamp(rng.choice(['flower-single-purple','flower-single-blue','flower-single-cream']),x,z,rng.uniform(1.0,1.65))
 else:stamp('synty-rock-small-01',x,z,rng.uniform(.25,.65))
for x,z in [(105,127),(127,125),(143,120),(117,139),(151,145)]:
 if height(x+.5,z+.5)>0:stamp('rock-rounded-cool' if (x,z)==(117,139) else 'synty-rock-small-01',x,z,1.6 if (x,z)==(117,139) else 1.8)
stamp('rock-rounded-cool',118.7,139.5,.72)
stamp('rock-rounded-cool',125,130,1.3)
# Loose foreground flower groups follow the reference's open meadow clearings.
accentRng=random.Random(2309)
for cx,cz,count in [(118,146,8),(126,144,7),(134,148,9),(150,143,7),(141,116,6),(131,119,6)]:
 for j in range(count):
  a=accentRng.random()*math.tau;r=math.sqrt(accentRng.random())*2.8
  x,z=cx+math.cos(a)*r,cz+math.sin(a)*r*.65
  if height(x+.5,z+.5)<.8:continue
  stamp(accentRng.choice(['flower-single-purple','flower-single-cream','flower-single-cream','flower-single-blue']),x,z,accentRng.uniform(.85,1.5))
 for j in range(2):
  x,z=cx+accentRng.uniform(-3,3),cz+accentRng.uniform(-2,2)
  if height(x+.5,z+.5)>.4:stamp('pebbles-pale',x,z,accentRng.uniform(.9,1.5))

# Shore details occupy low shelves rather than evenly decorating the channel.
for cx,cz in [(127,125),(107,114),(151,139)]:
 for j in range(12):
  x,z=cx+rng.uniform(-3.0,3.0),cz+rng.uniform(-2,2)
  y=height(x+.5,z+.5)
  if -.45<y<.85:stamp('synty-rock-small-01',x,z,rng.uniform(.24,.46))

for i,(x,z) in enumerate([(99,119),(104,141),(127,147),(140,116),(154,117),(152,148)]):m['landscape']['cover'].append(dict(x=x,z=z,radius=7,density=.45,flowers=.0,seed=9600+i,palette='meadow',grassScale=.72,broadRatio=.85))
# A few anchored pads sit in quiet water, away from the shallow crossing.
for x,z in [(117,121),(114,119),(144,136),(149,132),(146,134)]:
 if height(x+.5,z+.5)<-.3:stamp('lily-chunky',x,z,rng.uniform(.85,1.3))
for point in m['landscape']['rivers'][0]['points']:
 point['x'],point['z']=world(point['x'],point['z'])
for item in m['stamps']:
 wx,wz=world(item['x']+.5,item['y']+.5)
 item['x'],item['y']=round(wx-.5,3),round(wz-.5,3)
 item['yaw']-=turn
for patch in m['landscape']['cover']:
 patch['x'],patch['z']=world(patch['x'],patch['z'])
(root/'assets/maps/showcase/Verdant-River.utcmap').write_text(json.dumps(m,separators=(',',':')))
c=[['editor_landscape',{'action':'load','map':m}],['editor_landscape',{'action':'view','grid':False}],['editor_landscape',{'action':'environment','hour':8.8,'season':'summer','playing':False}],['editor_screenshot',{'x':126,'z':126,'gameCam':True,'gameZoom':1,'keep':True,'aspect':16/9,'maxWidth':1280,'animationTime':12,'format':'jpeg'}]]
(root/'tmp/visual-audit/verdant-call.json').write_text(json.dumps(c))
