"""Pack original ImageGen albedo into the renderer's fixed 1024 RGBA channels."""
from pathlib import Path
from PIL import Image
import gzip,json,shutil
import numpy as np
OUT=Path('/tmp/utc-autumn-models');OUT.mkdir(exist_ok=True)
SOURCE=Path('/Users/jiritrecak/.codex/generated_images/01a07a71-505e-7761-808a-5a1a189bfc6a')
for name,file in [('leaves','exec-811187d2-2c7b-4479-a706-345e582d0f8a.png'),('ground','exec-38785ce2-9c39-455d-a695-8967bda446ea.png')]:
 im=Image.open(SOURCE/file).convert('RGBA');print(name,im.size,'alpha',im.getchannel('A').getextrema())
 im.resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/(name+'.png'))
 if name=='ground':
  # AR alpha stores roughness, never transparency. NH is a deliberately quiet flat normal/height.
  packed=im.resize((1024,1024),Image.Resampling.LANCZOS);pixels=np.array(packed);rgb=pixels[:,:,:3].astype(float)/255
  linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)*.18
  pixels[:,:,:3]=np.round(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)*255).astype('uint8')
  packed=Image.fromarray(pixels);packed.putalpha(240)
  (OUT/'ground.bin').write_bytes(gzip.compress(packed.tobytes(),mtime=0))
  (OUT/'normal.bin').write_bytes(gzip.compress(bytes([128,128,255,128])*1024*1024,mtime=0))
(OUT/'generation.json').write_text(json.dumps({'method':'imagegen','mode':'reference-guided original texture generation','reference':'codex-clipboard-87c028fc-4b72-4255-9756-f756798e1c91.png','sources':{'leaves':'exec-811187d2-2c7b-4479-a706-345e582d0f8a.png','ground':'exec-38785ce2-9c39-455d-a695-8967bda446ea.png'},'brief':'Original stylized RTS autumn biome; ground edited with ImageGen to remove lush green, soften contrast, and blend dry straw/taupe grass into brown soil. Transparent dense maple/oak leaf cluster, copper russet amber gold; seamless top-down forest floor with small fallen leaves, short dry straw-colored grass and brown soil. No baked sunlight. Reference silhouette and color hierarchy; original pixels.','processing':'Lanczos resize to 1024; alpha retained for leaves; ground RGB calibrated by .18 linear reflectance for the shared HDR lighting; roughness 240 in A; flat NH normal (128,128,255) and height128.'},indent=2))
