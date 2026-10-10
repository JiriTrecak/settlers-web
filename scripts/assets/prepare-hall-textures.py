"""Prepare a reviewed red ownership mask; keep all painted RGB unchanged.
Run with Pillow/numpy Python: prepare-hall-textures.py <hall-slug>.
"""
import io,json,struct,sys
from pathlib import Path
import numpy as np
from PIL import Image
p=Path('.asset-work/build/buildings')/sys.argv[1]
b=(p/'source.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);binary=b[28+n:]
m=doc['materials'][0];texture=doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']];img=doc['images'][texture['source']];v=doc['bufferViews'][img['bufferView']]
im=Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')
rgb=np.asarray(im).astype(np.float32)/255;r,g,b=rgb.transpose(2,0,1)
# Red/maroon roof and armor have B close to G. Orange-brown timber has B well
# below G; ivory and iron lack red chroma. Soft boundaries preserve antialiasing.
smooth=lambda v:np.clip(v,0,1)**2*(3-2*np.clip(v,0,1))
chroma=np.maximum(rgb.max(2)-rgb.min(2),.001)
mask=smooth((r-np.maximum(g,b)-.045)/.12)*smooth((b-.65*g+.006)/.025)
mask*=smooth(((r-g)/chroma-.65)/.2)
rgba=np.concatenate([rgb,mask[:,:,None]],2)
Image.fromarray(np.rint(rgba*255).astype(np.uint8)).save(p/'albedo-team.png')
Image.fromarray(np.rint(mask*255).astype(np.uint8)).save(p/'team-mask.png')
im.save(p/'source-albedo.png')
linear=lambda c:np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
source_max=float(np.quantile(linear(r[mask>.95]),.95))
(p/'ownership.json').write_text(json.dumps({'mask':'baseColorAlpha','sourceMax':source_max,'default':[source_max,.025,.025],'coverage':float((mask>.5).mean())},indent=2))
print(p.name,'team coverage',float((mask>.5).mean()),'sourceMax',source_max)
