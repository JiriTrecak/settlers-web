"""Extract an ownership mask from the approved blue albedo; preserve RGB verbatim."""
from pathlib import Path
import json, struct
import numpy as np
from PIL import Image, ImageDraw
P=Path(ASSET_DIR).resolve()
raw=(P/'source.glb').read_bytes();size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
material=doc['materials'][0];albedo_index=doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
view=doc['bufferViews'][doc['images'][albedo_index]['bufferView']]
(P/'source-albedo.jpg').write_bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
config=json.loads((P/'asset.json').read_text())
image=Image.open(P/'source-albedo.jpg').convert('RGB');rgb=np.asarray(image).astype(np.float32)/255
# Grey stone and warm natural materials have no blue chroma. A soft transition
# follows the antialiased painted edge rather than recoloring entire triangles.
channel=1 if config.get('ownership_channel')=='green' else 2
blue=rgb[:,:,channel];other=np.maximum(rgb[:,:,(channel+1)%3],rgb[:,:,(channel+2)%3])
a=np.clip((blue-other-.018)/.095,0,1)
if channel==1:
 # Yellow-green painted leaves retain more red than a saturated green swatch.
 # Their green/red ratio still separates them from warm chitin and timber.
 a=np.clip((rgb[:,:,1]-.82*rgb[:,:,0]-.012)/.07,0,1)*np.clip((rgb[:,:,1]-rgb[:,:,2]-.025)/.08,0,1)
a=a*a*(3-2*a)
# Purple root corruption is not ownership; configurable chroma gate.
config=json.loads((P/'asset.json').read_text())
if config.get('exclude_purple_ownership',False):
 # Separate blue/cyan ownership (G > R) from violet corruption (R > G).
 # Normalizing by chroma keeps the decision stable in shadows/highlights.
 chroma=np.maximum(rgb.max(axis=2)-rgb.min(axis=2),.001)
 hue_gate=np.clip(((rgb[:,:,1]-rgb[:,:,0])/chroma-.02)/.16,0,1)
 a*=hue_gate*hue_gate*(3-2*hue_gate)
# Explicitly authored ownership parts also cover desaturated painted shadows.
# Their isolated UV islands prevent recoloring nearby natural materials.
owned_parts=set(config.get('team_color_parts',[]))
if owned_parts:
 mask=Image.new('L',image.size,0);draw=ImageDraw.Draw(mask)
 def accessor(index):
  ac=doc['accessors'][index];bv=doc['bufferViews'][ac['bufferView']]
  dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[ac['componentType']])
  count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[ac['type']]
  return np.ndarray((ac['count'],count),dtype=dtype,buffer=binary,
   offset=bv.get('byteOffset',0)+ac.get('byteOffset',0),
   strides=(bv.get('byteStride',count*dtype.itemsize),dtype.itemsize))
 found=set()
 for node in doc['nodes']:
  if node.get('name') not in owned_parts:continue
  found.add(node['name'])
  for primitive in doc['meshes'][node['mesh']]['primitives']:
   if primitive.get('mode',4)!=4:raise ValueError('Ownership parts require triangle topology')
   uv=accessor(primitive['attributes']['TEXCOORD_0'])*np.array(image.size)
   indices=accessor(primitive['indices']).reshape(-1,3)
   for face in indices:draw.polygon([tuple(v) for v in uv[face]],fill=255)
 if found!=owned_parts:raise ValueError(f'Missing ownership parts: {owned_parts-found}')
 a=np.maximum(a,np.asarray(mask,dtype=np.float32)/255)
has_team_color=config.get('team_color',True)
if not has_team_color:a=np.zeros_like(a)
rgba=np.concatenate((rgb,a[:,:,None]),axis=2)
Image.fromarray(np.rint(rgba*255).astype(np.uint8),'RGBA').save(P/'albedo-team.png')
Image.fromarray(np.rint(a*255).astype(np.uint8),'L').save(P/'team-mask.png')
linear=lambda x:np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
if has_team_color and not np.any(a>.99):raise ValueError('No unambiguous blue ownership pixels; inspect the generated atlas before publishing.')
source_max=float(np.quantile(linear(blue[a>.99]),.95)) if has_team_color else 1.0
(P/'ownership.json').write_text(json.dumps({'mask':'baseColorAlpha','sourceMax':source_max,'default':config.get('team_color_default',[.025,.14,source_max]),'coverage':float((a>.5).mean())},indent=2)+'\n')
for slot,ref in [('normal',material.get('normalTexture')),('roughness',material['pbrMetallicRoughness'].get('metallicRoughnessTexture'))]:
 if ref:
  import io
  iv=doc['bufferViews'][doc['images'][doc['textures'][ref['index']]['source']]['bufferView']]
  im=Image.open(io.BytesIO(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])).convert('RGB')
  if slot=='roughness': im=im.getchannel('G')
  im.save(P/(slot+'.png'))
print('Ownership source brightness',source_max,'coverage',float((a>.5).mean()))
