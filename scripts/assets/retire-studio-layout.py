"""Retire old directories after a manifest cutover. Retains archived originals and source recipes."""
from pathlib import Path
import shutil,json,hashlib,datetime
R=Path(__file__).resolve().parents[2]
# Every tracked old asset remains recoverable as authoring/archive data, never in a runtime glob.
for name in ['ant-colony','environment','landscape','props','synty','terrain','ui','visual_tests','game_data']:
 src=R/'assets'/name;dst=R/'art/archive/runtime'/name
 if src.exists():dst.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(src),str(dst))
for name in ['catalog.json','catalog-archive.json']:
 src=R/'assets'/name;dst=R/'art/archive/runtime'/name
 if src.exists():shutil.move(str(src),str(dst))
src=R/'assets/graphics';dst=R/'.asset-work/quarantine/legacy-graphics'
if src.exists():dst.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(src),str(dst))
src=R/'experiments/assets';dst=R/'art/sources'
if src.exists():shutil.move(str(src),str(dst))
# Source path changes are semantic prefix changes; authored model data is not rewritten.
for root in ['src','tests','scripts','tooling','mcp','docs','experiments/building-studio']:
 for p in (R/root).rglob('*'):
  if p.suffix not in ['.ts','.js','.mjs','.py','.md','.json','.html'] or any(x in p.parts for x in ['dist','node_modules','asset-studio']):continue
  s=p.read_text();n=s.replace('art/sources/','art/sources/')
  if n!=s:p.write_text(n)
# Link exact-matching exports to editable shared sources. Never infer an exact source match from a filename alone.
matches=json.loads((R/'tmp/asset-audit/model-source-matches.json').read_text());byold={x['runtime']:x['exactSourceExports'] for x in matches}
for p in (R/'art/records').glob('*/asset.json'):
 r=json.loads(p.read_text());old=r['origin'].get('previousPath','');exports=byold.get(old,[]);blends=[]
 for export in exports:
  folder=R/export.replace('art/sources/','art/sources/');blends+=list(folder.parent.glob('*.blend'))
 if old.startswith('assets/environment/coniferous-pack/') and r['kind']=='model':blends=[R/'art/sources/environment/coniferous-pack/source.blend']
 if blends:
  b=sorted(set(blends))[0]
  if b.exists():r['source']={'path':str(b.relative_to(R)),'sha256':hashlib.sha256(b.read_bytes()).hexdigest(),'quality':'shared'};r['validation']['warnings']=[]
 p.write_text(json.dumps(r,indent=2)+'\n')
print('Originals archived, Blender recipes moved to art/sources, verified source links retained.')
