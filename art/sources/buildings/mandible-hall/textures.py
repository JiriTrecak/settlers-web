"""Deterministic painted material sheets, not sampled/copied reference pixels."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math, random
P=Path(__file__).parent
N=512

def sheet(name,base,kind):
 r=random.Random(72+len(name)); im=Image.new('RGB',(N,N));pix=im.load()
 for y in range(N):
  for x in range(N):
   u=x/N;v=y/N
   f=1+.045*math.sin(u*19+math.sin(v*8))+.028*math.sin(u*57+v*3)
   if kind=='leaf': f=.74+.26*math.sin(math.pi*u)+.10*(1-v)
   if kind=='chitin': f=.76+.22*math.sin(math.pi*u)+.08*math.cos(v*5)
   pix[x,y]=tuple(max(0,min(255,int(c*f))) for c in base)
 d=ImageDraw.Draw(im)
 if kind=='wood':
  for i in range(42):
   x=r.randrange(N); start=r.randrange(-150,400);length=r.randrange(75,350)
   points=[(x+3*math.sin(t/50+i)+1.5*math.sin(t/13),t) for t in range(start,start+length,5)]
   d.line(points,fill=tuple(int(c*.59) for c in base),width=1 if i%3 else 2)
   if i%3==0:d.line([(a+2,b) for a,b in points],fill=tuple(min(255,int(c*1.25)) for c in base),width=1)
 elif kind=='leaf':
  vein=tuple(min(255,int(c*1.65)) for c in base)
  d.line([(256,0),(256,511)],fill=vein,width=3)
  for y in range(90,460,78):
   d.line([(256,y),(92,y+85),(8,y+133)],fill=vein,width=3)
   d.line([(256,y),(420,y+85),(504,y+133)],fill=vein,width=3)
 elif kind=='chitin':
  # A few broad plates, deliberately restrained: no noisy polygon microtexture.
  for row in range(-1,9):
   for col in range(-1,9):
    x=col*72+(row%2)*36;y=row*64
    points=[(x+18,y),(x+54,y),(x+72,y+31),(x+54,y+64),(x+18,y+64),(x,y+31),(x+18,y)]
    d.line(points,fill=tuple(int(c*.66) for c in base),width=2)
    d.line([(x+19,y+2),(x+53,y+2),(x+69,y+31)],fill=tuple(min(255,int(c*1.15)) for c in base),width=1)
 im.save(P/name)

sheet('wood.png',(104,64,34),'wood')
sheet('dome.png',(191,135,73),'wood')
sheet('leaf.png',(75,100,28),'leaf')
sheet('chitin.png',(187,67,42),'chitin')
sheet('team.png',(230,230,230),'chitin')

# Shallow grain relief in tangent space; retains simple silhouette and modest cost.
import numpy as np
for name in ['wood','dome']:
 im=Image.open(P/(name+'.png')).convert('L');a=np.array(im,dtype=float)/255
 dy,dx=np.gradient(a);n=np.stack([-dx*3.5,-dy*3.5,np.ones_like(a)],axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
 Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))).save(P/(name+'-normal.png'))
