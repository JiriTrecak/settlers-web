"""Extract supplied prebuild rules and summarize baked spatial patterns; never invent source algorithms."""
import hashlib,json,math,statistics,re,xml.etree.ElementTree as ET
from collections import Counter,defaultdict
from pathlib import Path
SOURCE=Path.home()/'Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/The Scouring/Media/classes'
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'art/references/procedural-authoring';out.mkdir(parents=True,exist_ok=True)
def read_class(p,seen=()):
 if p in seen:raise ValueError('Cyclic class inheritance: '+str(p))
 raw=p.read_bytes();document=ET.fromstring('<source>'+re.sub(r'<\?xml.*?\?>','',raw.decode('utf-8-sig'))+'</source>')
 parent=document.find('_parent');xml=next(e for e in document if e.tag!='_parent');pre=xml.find('_prebuild');game=xml.find('GameData')
 own={'attributes':xml.attrib,'prebuild':pre.attrib if pre is not None else {},'gameData':game.attrib if game is not None else {}}
 inherited=read_class(p.with_name(parent.attrib['File']+'.xml'),seen+(p,))['resolved'] if parent is not None else {}
 return {'source':f'classes/{p.parent.name}/{p.name}','sha256':hashlib.sha256(raw).hexdigest(),'parent':parent.attrib['File'] if parent is not None else None,**own,'resolved':{k:{**inherited.get(k,{}),**v} for k,v in own.items()}}
classes=[]
for group in ['plants','grass','terraintypes','watertypes']:
 for p in sorted((SOURCE/group).glob('*.xml')):
  if group=='plants' and p.stem not in ['fir_a','fir_b','fir_small_a','bush_a','bush_b','lying_snag_a','small_rock_a','stump_fir_a']:continue
  classes.append(read_class(p))
terrain=json.loads((ROOT/'art/references/scouring-maps/eldenvale/terrain.json').read_text());plants=terrain['plants'];names=terrain['plantTypes']
by_type=defaultdict(list)
for p in plants:by_type[names[p['type']]].append(p)
fir=[p for name in ['fir_a','fir_b'] for p in by_type[name]];buckets=defaultdict(list)
for p in fir:
 x,y,z=p['position'];buckets[(math.floor(x/16),math.floor(z/16))].append((x,z))
def occupancy(p):
 x,y,z=p['position'];cx,cz=math.floor(x/16),math.floor(z/16);near=[];sectors=set()
 for dz in [-1,0,1]:
  for dx in [-1,0,1]:
   for xx,zz in buckets[(cx+dx,cz+dz)]:
    distance=math.hypot(x-xx,z-zz)
    if .001<distance<=8:
     near.append(distance);sectors.add(math.floor((math.atan2(zz-z,xx-x)+math.pi)/(math.pi/4))%8)
 return len(near),len(sectors),min(near) if near else None
stats={}
for name in ['fir_a','fir_b','fir_small_a','bush_a','bush_b','lying_snag_a','small_rock_a']:
 values=[occupancy(p) for p in by_type[name]];n=len(values);distances=[v[2] for v in values if v[2] is not None]
 stats[name]={'count':n,'meanMatureFirsWithin8':round(statistics.mean(v[0] for v in values),3) if n else None,'directionalCoverageHistogram':dict(sorted(Counter(v[1] for v in values).items())),'meanNearestMatureFirWithin8':round(statistics.mean(distances),3) if distances else None}
report={'sourceMap':terrain['sourceSha256'],'confirmedClassRules':classes,'bakedMapObservations':stats,'limitations':['No generation brush definitions or river generator code found in supplied Media files or Media.zip.','Baked placements cannot prove which original tool, seed, region or rule created them.','Eight-direction mature-tree occupancy is a measured neighborhood proxy, not the original forest boundary.','Our edge/interior and riverbank recipes will be authored interpretations unless source editor generation code becomes available.']}
(out/'scouring-generation-study.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(stats,indent=2))
