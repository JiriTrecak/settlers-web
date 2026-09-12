"""Lossless GLTF container conversion; no geometry simplification or texture re-encoding."""
from pathlib import Path
import json,base64,struct,hashlib
R=Path(__file__).resolve().parents[2];replacements={};converted=0
for record in (R/'art/records').glob('*/asset.json'):
 r=json.loads(record.read_text())
 for output in r['outputs']:
  old=output['path']
  if not old.endswith('.gltf'):continue
  p=R/old;doc=json.loads(p.read_text());parts=[];offset=0;bases=[]
  def append(data):
   global offset
   start=offset;data+=b'\0'*((-len(data))%4);parts.append(data);offset+=len(data);return start
  for b in doc.get('buffers',[]):
   uri=b.get('uri','');assert uri.startswith('data:'),'External buffer must be resolved first'
   data=base64.b64decode(uri.split(',',1)[1]);assert len(data)>=b['byteLength'];bases.append(append(data[:b['byteLength']]))
  for v in doc.get('bufferViews',[]):v['byteOffset']=bases[v['buffer']]+v.get('byteOffset',0);v['buffer']=0
  for image in doc.get('images',[]):
   if 'uri' not in image:continue
   uri=image.pop('uri');assert uri.startswith('data:'),'External image must be resolved first'
   header,encoded=uri.split(',',1);data=base64.b64decode(encoded);start=append(data)
   image['mimeType']=header[5:].split(';')[0];image['bufferView']=len(doc.setdefault('bufferViews',[]));doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(data)})
  binary=b''.join(parts);doc['buffers']=[{'byteLength':len(binary)}]
  text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
  result=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
  # Bufferview payloads are byte-for-byte identical after container conversion.
  original=json.loads(p.read_text())
  for i,v in enumerate(original.get('bufferViews',[])):
   raw=base64.b64decode(original['buffers'][v['buffer']]['uri'].split(',',1)[1]);start=v.get('byteOffset',0);newview=doc['bufferViews'][i];assert raw[start:start+v['byteLength']]==binary[newview['byteOffset']:newview['byteOffset']+newview['byteLength']]
  new=old.removesuffix('.gltf')+'.glb';target=R/new;assert not target.exists();target.write_bytes(result);p.unlink();replacements[old]=new
  output.update(path=new,sha256=hashlib.sha256(result).hexdigest(),bytes=len(result));converted+=1
  for a in r['render']:
   for key in ['file','harvestAnimation']:
    if a.get(key)==old:a[key]=new
  for a in r['scenery']:
   if a['file']=='/'.join(old.split('/')[1:]):a['file']='assets/'.join(new.split('assets/')[1:])
 record.write_text(json.dumps(r,indent=2)+'\n')
for root in ['src','tests','scripts','tooling','mcp']:
 for p in (R/root).rglob('*'):
  if p.suffix not in ['.ts','.js','.mjs','.json','.css','.html'] or 'dist' in p.parts:continue
  s=p.read_text();n=s
  for old,new in replacements.items():n=n.replace(old,new)
  if s!=n:p.write_text(n)
print('Packed',converted,'models; verified all original buffer-view payloads unchanged.')
