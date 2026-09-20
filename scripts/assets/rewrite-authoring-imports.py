"""Rewrite verified static source imports to their canonical publication paths."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
audit=json.loads((root/'art/references/authoring-migration-audit.json').read_text())
changed=[]
for file in [*(root/'src').rglob('*'),*(root/'tests').rglob('*')]:
 if file.suffix not in ('.ts','.css') or file.name=='urls.generated.ts': continue
 before=file.read_text(); after=before
 for old,ref in audit['mapping'].items():
  if old.startswith('assets/maps/'): continue  # map document migration is a separate operation
  definition=json.loads((root/'art/assets'/ref['asset']/'asset.json').read_text())
  if definition['status']!='published':continue
  resource=next(r for r in definition['resources'] if (r['role'],r['index'])==(ref['role'],ref['index']))
  suffix='' if resource['index']==1 else '_'+str(resource['index'])
  new=f"assets/library/{definition['id']}/{resource['role']}{suffix}.{resource['format']}"
  # Only replace a complete literal path (including a possible Vite query).
  for tail in ('"',"'",'?'):
   after=after.replace(old+tail,new+tail)
 if after!=before:file.write_text(after);changed.append(str(file.relative_to(root)))
print('\n'.join(changed))
