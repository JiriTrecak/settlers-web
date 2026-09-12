"""One-time audited layout migration. Plans first; --apply copies without deleting originals.
Final retirement is separate, after consumer tests. Repeat runs verify the original plan.
"""
from pathlib import Path
import json,hashlib,re,sys,shutil,datetime
R=Path(__file__).resolve().parents[2]
def load(p):return json.loads((R/p).read_text())
def save(p,v):
 p=R/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def slug(s):return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def digest(b):return hashlib.sha256(b).hexdigest()
if not (R/'assets/catalog.json').exists():
 print('Migration already applied. See art/migrations/2026-09-11-paths.json.');sys.exit()
content=load('content/game.json');catalog=load('assets/catalog.json')['assets']
bindings=content['assets'];groups={}
def add(p):groups.setdefault(p,{'render':[],'scenery':[]})
for a in bindings:
 p=a.get('image') or a.get('file');add(p);groups[p]['render'].append(a)
 if a.get('harvestAnimation'):add(a['harvestAnimation'])
for a in catalog:
 p='assets/'+a['file'];add(p);groups[p]['scenery'].append(a)
# Runtime textures, current interface, animation metadata and packaged material metadata.
for prefix in ['assets/terrain','assets/ant-colony/materials','assets/environment/wayfarer','assets/environment/coniferous-pack','assets/ui/woodland','assets/ui/main-menu','assets/ui/app-icon','assets/ant-colony/characters','assets/synty/tex']:
 for p in (R/prefix).rglob('*'):
  if p.suffix.lower() in ['.png','.jpg','.svg','.json'] and p.name not in ['generation.json','exports.json','validation.json']:add(str(p.relative_to(R)))
add('assets/synty/looks.json')
# Keep the measured render LOD input even though it is not an editor entry.
add('assets/ant-colony/olive-pine.glb')
units={'settler','worker','warrior','archer','marshal','hunter','bombardier','wolf','ogre','thornspitter','amberjaw-staglord','thornblade-matriarch','worker-carry','guard'}
buildings={'fort','rootbound-hall','great-mound','barracks','player-barracks','lumberjack','lumberjack-workshop','sawmill','forester','stonemason','player-stonemason','house','tower','amber-sanctuary','rootworks','ironroot-forge','bombardier-workshop'}
mapping={}
for old,g in groups.items():
 p=Path(old);stem=p.stem;new='';kind='data'
 if '/icons/' in old:
  a=g['render'][0]['id'];parts=a.split('.');n=parts[-1]
  if parts[1]=='ants':category='unit-ants' if n in units else 'building-ants';n={'settler':'worker','fort':'mound'}.get(n,n)
  elif parts[1]=='neutral':category='unit-neutral'
  elif parts[1]=='action':category='command'
  elif parts[1]=='spell':category='ability-ants'
  elif parts[1]=='armor':category='stat-armor'
  elif parts[1]=='research':category='research-ants'
  else:category='resource' if n in ['wood','amber','root'] else 'item';n='lumber' if n=='wood' else n
  new=f'assets/icons/{category}-{n}.png';kind='icon'
 elif '/ui/' in old:new=old.replace('assets/ui/','assets/interface/');kind='interface' if p.suffix in ['.png','.svg'] else 'data'
 elif p.suffix in ['.glb','.gltf']:
  if '/characters/' in old:folder=f"units/{'neutral' if stem in ['amberjaw-staglord','thornblade-matriarch','thornspitter'] else 'ants'}/{ 'worker' if stem=='base' else stem}"
  elif stem in buildings:folder='buildings/ants/'+stem
  elif stem in ['amber-seam','corrupted-root']:folder='buildings/neutral/'+stem
  elif stem in units:folder=f"units/{'neutral' if stem in ['wolf','ogre'] else 'ants'}/{stem}-static"
  elif 'item-' in stem or stem in ['root-bundle','log-stack','plank-stack']:folder='items/'+stem
  else:
   category='trees' if any(n in stem for n in ['tree','pine']) else 'grass' if any(n in stem for n in ['grass','fern','reeds','broadleaf']) else 'mushrooms' if 'mushroom' in stem else 'rocks' if any(n in stem for n in ['rock','boulder','mountain']) else 'structures'
   folder=f'environment/{category}/{slug(stem)}'
  new=f'assets/models/{folder}/model{p.suffix}';kind='model'
 elif old.startswith('assets/terrain/'):new=old.replace('assets/terrain/','assets/textures/terrain/');kind='texture'
 elif '/materials/' in old:new=old.replace('assets/ant-colony/materials/','assets/textures/materials/ants/');kind='texture' if p.suffix=='.png' else 'data'
 elif '/coniferous-pack/' in old:new=old.replace('assets/environment/coniferous-pack/','assets/textures/vegetation/coniferous/');kind='texture' if p.suffix=='.png' else 'data'
 elif '/wayfarer/' in old:new=old.replace('assets/environment/wayfarer/','assets/textures/roads/');kind='texture'
 elif '/characters/' in old:new=old.replace('assets/ant-colony/characters/','assets/models/units/ants/profiles/');kind='data'
 elif old=='assets/synty/looks.json':new='assets/textures/materials/synty/looks.json'
 elif '/synty/tex/' in old:new=old.replace('assets/synty/tex/','assets/textures/materials/synty/');kind='texture'
 else:raise Exception(old)
 if new.lower() in [v['path'].lower() for v in mapping.values()]:raise Exception('Collision '+new)
 mapping[old]={'path':new,'kind':kind}
save('tmp/asset-studio-migration.json',mapping)
print('Planned',len(mapping),'runtime files')
if '--apply' not in sys.argv:sys.exit()
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
records=[]
for old,m in mapping.items():
 g=groups[old];p=R/old;data=p.read_bytes();new=m['path'];dest=R/new;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 id='asset.'+new.removeprefix('assets/').rsplit('.',1)[0].replace('/','.').removesuffix('.model')
 author=f'art/records/{id}';source=f'{author}/source{p.suffix}'
 (R/author).mkdir(parents=True,exist_ok=True);(R/source).write_bytes(data)
 render=[]
 for a in g['render']:
  a=dict(a)
  for key in ['image','file','harvestAnimation']:
   if a.get(key):a[key]=mapping[a[key]]['path']
  render.append(a)
 scenery=[{**a,'file':new.removeprefix('assets/')} for a in g['scenery']]
 out={'role':'model' if m['kind']=='model' else 'image' if m['kind'] in ['icon','interface'] else 'data','path':new,'sha256':digest(data),'bytes':len(data)}
 if p.suffix=='.png':out.update(width=int.from_bytes(data[16:20],'big'),height=int.from_bytes(data[20:24],'big'))
 rec={'version':1,'id':id,'name':scenery[0]['name'] if scenery else p.stem.replace('-',' ').replace('_',' ').title(),'kind':m['kind'],'tags':[p.parent.name,'migrated'],'status':'published','revision':1,'profile':'icon' if m['kind']=='icon' else 'interface-image' if m['kind']=='interface' else m['kind'],'outputs':[out],'render':render,'scenery':scenery,'source':{'path':source,'sha256':digest(data),'quality':'runtime-only'},'origin':{'method':'migration','previousPath':old},'validation':{'checkedAt':now,'warnings':['Editable master has not yet been linked. Exact runtime original retained.']}}
 save(author+'/asset.json',rec);records.append(rec)
save('assets/manifest.json',{'version':1,'records':[{k:v for k,v in r.items() if k not in ['version','source','origin','validation','status']} for r in records]})
# Literal references only. Dynamic expressions and generated code are verified separately.
for root in ['src','tests','scripts','tooling','content','mcp']:
 for p in (R/root).rglob('*'):
  if p.suffix not in ['.ts','.js','.mjs','.json','.css','.html'] or 'dist' in p.parts or 'asset-studio' in p.parts:continue
  text=p.read_text();updated=text
  for old,m in sorted(mapping.items(),key=lambda a:-len(a[0])):updated=updated.replace(old,m['path'])
  if updated!=text:p.write_text(updated)
print('Copied and rewrote literal consumers; originals retained for verified retirement.')
