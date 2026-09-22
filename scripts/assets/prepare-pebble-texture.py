"""Pack the original pebble albedo for the shared terrain shader (no added geometry)."""
from pathlib import Path
from PIL import Image
import numpy as np, gzip,json
out=Path('/tmp/utc-pebble');out.mkdir(exist_ok=True)
im=Image.open('art/explorations/pebble-trail/source.png').convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
im.save(out/'albedo.png')
rgb=np.array(im).astype(float)/255
linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)*.18
packed=np.empty((1024,1024,4),dtype='uint8');packed[:,:,:3]=np.round(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)*255);packed[:,:,3]=240
(out/'albedo.bin').write_bytes(gzip.compress(packed.tobytes(),mtime=0))
(out/'normal.bin').write_bytes(gzip.compress(bytes([128,128,255,128])*1024*1024,mtime=0))
(out/'generation.json').write_text(json.dumps({'method':'imagegen','prompt':'Original seamless top-down stylized RTS forest-floor texture: many small irregular rounded taupe, warm grey, brown and beige pebbles embedded in compact brown earth; varied sizes, natural distribution, worn dirt gaps. Soft neutral ambient light, no directional shadows, no perspective, no path borders, no arranged paving, no vegetation, no text.','processing':'1024 RGBA. Albedo calibrated at .18 linear reflectance for shared source-style lighting; roughness 240. Deliberately flat normal and neutral height; detail is texture-only to keep paths cheap.'},indent=2))
