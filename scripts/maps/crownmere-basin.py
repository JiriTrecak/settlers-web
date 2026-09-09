"""Reproducible authoring recipe; gameplay/editor load only the resulting utcmap JSON."""
import base64, json, math, random, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
rng = random.Random(73019)
starts = [(36,128),(220,128)]
roads = [([(36,128),(55,98),(72,66),(105,49),(151,49),(184,66),(201,98),(220,128)],3.4),
         ([(36,128),(55,158),(72,190),(105,207),(151,207),(184,190),(201,158),(220,128)],3.4),
         ([(36,128),(76,128),(107,128),(128,128),(149,128),(180,128),(220,128)],2.4),
         ([(55,98),(38,69),(66,32),(128,22),(190,32),(218,69),(201,98)],1.8),
         ([(55,158),(38,187),(66,224),(128,234),(190,224),(218,187),(201,158)],1.8)]
def segment(x,z,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1]; t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
    return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
def road_dist(x,z):
    return min(segment(x,z,a,b)-r for pts,r in roads for a,b in zip(pts,pts[1:]))
def lake_edge(x,z):
    dx,dz=x-128,z-128; angle=math.atan2(dz/59,dx/70)
    return (math.hypot(dx/70,dz/59)-(1+.07*math.cos(4*angle)+.045*math.sin(6*angle)))*62

def height(x,z):
    edge=lake_edge(x,z)
    # Submerged basin, broad smooth banks and gently undulating dry terrain.
    h=max(-3.4,min(1.8,edge*.42))
    if edge>5: h=1.8+.22*math.sin(x*.065)*math.sin(z*.065)
    # A raised island and two low, dry causeways: no decorative fake bridges.
    island=(19-math.hypot((x-128)*.9,(z-128)*1.12))*.48
    causeway=(4.7-abs(z-128))*.62 if 43<x<213 else -10
    h=max(h,min(2.3,island),min(1.5,causeway))
    for sx,sz in starts:
        d=math.hypot(x-sx,z-sz)
        if d<24: h=1.8+(h-1.8)*max(0,(d-18)/6)
    return h
m={'v':2,'name':'Crownmere Basin','waterLevel':0,'stamps':[],'entities':[],'camps':[],
   'playerStarts':[{'player':i+1,'x':x,'z':z,'setup':'setup.ants','mainFort':f'start.player.{i+1}/main-fort'} for i,(x,z) in enumerate(starts)]}
m['height']=base64.b64encode(b''.join(struct.pack('<h',round(height(x,z)*100)) for z in range(-16,273) for x in range(-16,273))).decode()
occupied=set(); serial=0
def entity(definition,x,z,asset=None,scale=1):
    global serial
    x,z=round(x),round(z)
    if (x,z) in occupied: return None
    occupied.add((x,z)); serial+=1; id=f'crownmere-{serial:04d}'
    e={'id':id,'definition':definition,'position':{'x':x,'y':z},'rotation':round(rng.uniform(0,360),3),'owner':'none'}
    if asset:e['appearance']={'asset':asset,'scale':round(scale,3)}
    m['entities'].append(e);return id
def stamp(asset,x,z,scale=1):
    m['stamps'].append({'id':f'crownmere-prop-{len(m["stamps"]):04d}','asset':asset,'x':round(x,3),'y':round(z,3),'yaw':round(rng.uniform(0,math.tau),4),'scale':round(scale,3)})
def base_dist(x,z):return min(math.hypot(x-sx,z-sz) for sx,sz in starts)
camp_sites=[(128,117,'ogre'),(100,38,'wolf'),(156,218,'wolf'),(173,64,'wolf'),(83,192,'wolf')]
# Camps live beside routes; the central passage itself remains open.
for x,z,kind in camp_sites:
    members=[]
    for dx,dz in ([(0,0)] if kind=='ogre' else [(-2,0),(2,0),(0,3)]):
        members.append(entity('unit.neutral.'+kind,x+dx,z+dz))
    m['camps'].append({'id':f'camp.{x}.{z}','members':members,'home':{'x':x,'y':z},'aggroRange':8,'leash':16,'aggression':'players'})
# Rotationally paired harvestable woodland, with generous road and base clearances.
for z in range(6,251,5):
 for x in range(6,128,5):
    xx,zz=x+rng.uniform(-1.6,1.6),z+rng.uniform(-1.6,1.6)
    if height(xx,zz)<1.2 or road_dist(xx,zz)<3 or base_dist(xx,zz)<18:continue
    if any(math.hypot(xx-cx,zz-cz)<10 or math.hypot(256-xx-cx,256-zz-cz)<10 for cx,cz,_ in camp_sites):continue
    patch=.55+.25*math.sin(xx*.08)*math.cos(zz*.09)
    if rng.random()>patch:continue
    scale=rng.uniform(.68,.96)
    for tx,tz in [(xx,zz),(256-xx,256-zz)]:
        entity('resource.forest.tree',tx,tz,'asset.resource.ant-pine-1',scale)
        if rng.random()<.52:stamp('ant-fern',tx+1.2,tz+.8,rng.uniform(.6,1))
# Equal stone reserves at home and on the outer expansion terraces.
for cx,cz in [(29,101),(67,72),(102,222)]:
 for dx,dz in [(-2,0),(1,0),(0,3)]:
    for x,z in [(cx+dx,cz+dz),(256-cx-dx,256-cz-dz)]:
        entity('resource.stone.deposit',x,z,'asset.resource.ant-stone-deposit',.85)
# Detailed shoreline: rock shelves, reeds, water lilies and occasional driftwood.
for i in range(170):
    a=i*math.tau/170; r=1+.07*math.cos(4*a)+.045*math.sin(6*a)
    x,z=128+70*r*math.cos(a),128+59*r*math.sin(a)
    if abs(z-128)<8:continue
    if i%3==0:stamp('ant-rock',x+2*math.cos(a),z+2*math.sin(a),rng.uniform(.65,1.15))
    if i%2==0:stamp('ant-reeds',x+math.cos(a),z+math.sin(a),rng.uniform(.6,.9))
    if i%7==0:stamp('ant-lily',x-5*math.cos(a),z-5*math.sin(a),rng.uniform(.65,1))
    if i%19==0:stamp('ant-driftwood',x+3*math.cos(a),z+3*math.sin(a),.85)
    if i%11==0:stamp('ant-elephant-leaf',x+5*math.cos(a),z+5*math.sin(a),.75)
cover=[]
for z in range(10,256,18):
 for x in range(10,256,18):
    if height(x,z)<.5:continue
    exclusions=[{'x':sx,'z':sz,'radius':10} for sx,sz in starts]
    # Explicit meadow exclusions keep the sandy roads readable.
    for pts,r in roads:
      for a,b in zip(pts,pts[1:]):
       steps=math.ceil(math.dist(a,b)/5)
       for i in range(steps+1):
        xx=a[0]+(b[0]-a[0])*i/steps;zz=a[1]+(b[1]-a[1])*i/steps
        if math.hypot(xx-x,zz-z)<16:exclusions.append({'x':round(xx,2),'z':round(zz,2),'radius':r+.9})
    cover.append({'x':x,'z':z,'radius':13,'density':1.5,'seed':x*173+z,'flowers':.006,'grassScale':.62,'broadRatio':1,'palette':'forest','exclusions':exclusions})
water=json.loads((ROOT/'assets/maps/tutorial/mosswater-divide.utcmap').read_text())['landscape']['water']
m['landscape']={'rivers':[],'strokes':[{'points':[{'x':x,'z':z} for x,z in pts],'radius':r,'layer':'sand','opacity':.92} for pts,r in roads], 'cover':cover,'environment':{'preset':'forest','hour':11,'season':'summer','playing':True},'water':water}
p=ROOT/'assets/maps/skirmish/crownmere-basin.utcmap';p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(m,indent=2)+'\n')
print(p, len(m['entities']), 'entities;',len(m['stamps']),'props;',len(cover),'cover patches')
