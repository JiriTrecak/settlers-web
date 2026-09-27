"""Extract an ownership mask from the approved blue albedo; preserve RGB verbatim."""
from pathlib import Path
import json, struct
import numpy as np
from PIL import Image
P=Path(__file__).resolve().parent
raw=(P/'source.glb').read_bytes();size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
material=doc['materials'][0];albedo_index=doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
view=doc['bufferViews'][doc['images'][albedo_index]['bufferView']]
(P/'source-albedo.jpg').write_bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
image=Image.open(P/'source-albedo.jpg').convert('RGB');rgb=np.asarray(image).astype(np.float32)/255
# Grey stone and warm natural materials have no blue chroma. A soft transition
# follows the antialiased painted edge rather than recoloring entire triangles.
blue=rgb[:,:,2];other=np.maximum(rgb[:,:,0],rgb[:,:,1])
a=np.clip((blue-other-.018)/.095,0,1);a=a*a*(3-2*a)
rgba=np.concatenate((rgb,a[:,:,None]),axis=2)
Image.fromarray(np.rint(rgba*255).astype(np.uint8),'RGBA').save(P/'albedo-team.png')
Image.fromarray(np.rint(a*255).astype(np.uint8),'L').save(P/'team-mask.png')
linear=lambda x:np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
source_max=float(np.quantile(linear(blue[a>.99]),.95))
(P/'ownership.json').write_text(json.dumps({'mask':'baseColorAlpha','sourceMax':source_max,'default':[.025,.14,source_max],'coverage':float((a>.5).mean())},indent=2)+'\n')
for slot,ref in [('normal',material.get('normalTexture')),('roughness',material['pbrMetallicRoughness'].get('metallicRoughnessTexture'))]:
 if ref:
  import io
  iv=doc['bufferViews'][doc['images'][doc['textures'][ref['index']]['source']]['bufferView']]
  im=Image.open(io.BytesIO(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')
  if slot=='roughness': im=im.getchannel('G')
  im.save(P/(slot+'.png'))
print('Ownership source brightness',source_max,'coverage',float((a>.5).mean()))
