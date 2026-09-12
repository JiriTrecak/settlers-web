"""Combine identical baked materials into one instancing-friendly primitive.
Run after studio rebuild: python3 experiments/assets/buildings/olive-pine/export_game.py
Preserves every indexed position, normal and vertex color; does not simplify geometry.
"""
from pathlib import Path
import json,struct,math
A=Path(__file__).resolve().parent
raw=(A/'model.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];src=json.loads(raw[20:20+length]);binary=raw[28+length:]
assert len(src['meshes'])==1 and len(src['nodes'])==1
assert set(src['nodes'][0])<= {'name','mesh'}
materials=[{k:v for k,v in m.items() if k!='name'} for m in src['materials']]
assert all(m==materials[0] for m in materials)
def read(i):
 a=src['accessors'][i];v=src['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
 fmt,size={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[a['componentType']]
 off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',n*size)
 vals=[struct.unpack_from('<'+fmt*n,binary,off+j*stride) for j in range(a['count'])]
 if a.get('normalized'):vals=[tuple(x/((1<<(size*8))-1) for x in row) for row in vals]
 return vals
attrs={k:[] for k in ['POSITION','NORMAL','COLOR_0']};indices=[]
for p in src['meshes'][0]['primitives']:
 assert set(p['attributes'])==set(attrs)
 offset=len(attrs['POSITION'])
 for k in attrs:attrs[k]+=read(p['attributes'][k])
 indices.extend(row[0]+offset for row in read(p['indices']))
assert len(indices)%3==0 and max(indices)<len(attrs['POSITION'])
assert all(math.isfinite(x) for rows in attrs.values() for row in rows for x in row)
dst={'asset':{'version':'2.0','generator':'Olive pine game export'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Olive Pine','mesh':0}], 'meshes':[], 'materials':[dict(materials[0],name='Pine vertex colors')], 'accessors':[], 'bufferViews':[], 'buffers':[]}
buf=bytearray()
def append(rows,typ,fmt,component,target):
 while len(buf)%4:buf.append(0)
 start=len(buf)
 for row in rows:buf.extend(struct.pack('<'+fmt*len(row),*row))
 vi=len(dst['bufferViews']);dst['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(buf)-start,'target':target})
 ac={'bufferView':vi,'componentType':component,'count':len(rows),'type':typ}
 if typ=='VEC3':ac.update(min=[min(r[i] for r in rows) for i in range(3)],max=[max(r[i] for r in rows) for i in range(3)])
 idx=len(dst['accessors']);dst['accessors'].append(ac);return idx
outattrs={k:append(rows,'VEC'+str(len(rows[0])),'f',5126,34962) for k,rows in attrs.items()}
ii=append([(i,) for i in indices],'SCALAR','H',5123,34963)
dst['meshes']=[{'name':'Olive Pine • low poly','primitives':[{'attributes':outattrs,'indices':ii,'material':0}]}]
while len(buf)%4:buf.append(0)
dst['buffers']=[{'byteLength':len(buf)}];j=json.dumps(dst,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
output=struct.pack('<III',0x46546c67,2,28+len(j)+len(buf))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(buf),0x004e4942)+buf
(A/'pine-game.glb').write_bytes(output)
report={'triangles':len(indices)//3,'vertices':len(attrs['POSITION']),'meshes':1,'primitives':1,'materials':1,'bytes':len(output),'geometry':'Same indexed geometry, normals and colors as studio export','textures':0}
(A/'game-stats.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
