"""Recover original vertex data before Blender imports Tripo Other-rig bind matrices."""
import json,struct
from pathlib import Path
work=Path(__file__).resolve().parent
raw=(work/'provider.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
for node in d['nodes']:node.pop('skin',None)
for mesh in d['meshes']:
 for primitive in mesh['primitives']:
  for key in list(primitive['attributes']):
   if key.startswith(('JOINTS','WEIGHTS')):del primitive['attributes'][key]
d.pop('skins',None);d.pop('animations',None)
j=json.dumps(d).encode();j+=b' '*(-len(j)%4)
(work/'unskinned-provider.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
