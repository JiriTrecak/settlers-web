"""Original seamless packed-earth and gravel texture, built from periodic noise."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
A=Path(__file__).resolve().parent;rng=np.random.default_rng(91);n=512
y,x=np.mgrid[:n,:n]/n
h=np.zeros((n,n))
for f,amplitude in [(1,.22),(2,.16),(4,.09),(8,.055),(16,.035),(32,.018),(64,.01)]:
 for k in range(3):
  dx,dy=rng.integers(-f,f+1,size=2);h+=np.sin((x*dx+y*dy)*np.pi*2+rng.random()*6.28)*amplitude/3
h+=rng.normal(0,.015,(n,n));h=(h-h.min())/(h.max()-h.min())
base=np.array([137,109,74]);pixels=np.clip(base[None,None,:]*(.79+h[:,:,None]*.36),0,255).astype('uint8')
im=Image.fromarray(pixels);d=ImageDraw.Draw(im)
for _ in range(300):
 cx,cy=rng.integers(0,n,size=2);r=int(rng.integers(1,5));tone=int(rng.integers(90,150));color=(tone+12,tone+5,tone-12)
 for ox in [-n,0,n]:
  for oy in [-n,0,n]:d.polygon([(cx+ox-r,cy+oy),(cx+ox,cy+oy-r),(cx+ox+r+1,cy+oy-1),(cx+ox+r,cy+oy+r),(cx+ox-r+1,cy+oy+r)],fill=color)
im.save(A/'road-albedo.png')
h=np.asarray(im).mean(axis=2)/255;dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))*.8;dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))*.8
normal=np.stack([-dx,-dy,np.ones_like(h)],axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
Image.fromarray(((normal*.5+.5)*255).astype('uint8')).save(A/'road-normal.png')
