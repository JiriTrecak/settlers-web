"""Paint the stylized fir-sprig atlas for the woodland pines (3x2 cells, RGBA).

Each cell is one bough seen from above: attachment end at the top, hanging tip at
the bottom. The silhouette is a serrated spade (four teeth per side pointing to
the tip) so the alpha cutout reads as a broad painted fir bough, like the
reference, instead of fuzzy needle noise. Color runs dark at the attachment
(interior shade) to sunlit yellow-green at the tip; needle strokes angle from the
midrib toward the tip. Albedo only; the midrib fold in the mesh supplies the
light/shadow split.

Usage: python stylized_pine_atlas.py out.png [cell=512]
"""
import sys,math,random
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

out=sys.argv[1];C=int(sys.argv[2]) if len(sys.argv)>2 else 512
rng=random.Random(7)
# (attach, mid, tip) sRGB per variant: slight hue/value spread between boughs.
VARIANTS=[((20,44,22),(46,92,30),(112,152,52)),((18,40,24),(40,84,32),(96,140,50)),((24,48,20),(54,98,28),(124,160,56)),
          ((16,38,22),(38,80,30),(90,134,48)),((22,46,24),(50,96,34),(118,156,60)),((20,42,20),(44,88,26),(104,146,46))]

def lerp(a,b,t):return tuple(a[i]+(b[i]-a[i])*t for i in range(3))
def ramp(v,t):
 a,m,b=v
 return lerp(a,m,t/.35) if t<.35 else lerp(m,b,(t-.35)/.65)

def outline(teeth=4):
 # Half-width profile along t (0 attach .. 1 tip), serrated with forward teeth.
 pts=[]
 for i in range(121):
  t=i/120
  w=t*((1-t)**1.2)*2.05
  saw=(t*teeth)%1
  w*=1-.3*(1-saw) if t>.14 else 1
  pts.append((t,w))
 return pts

def cell(v,seed):
 r=random.Random(seed);S=C*2
 img=Image.new('RGBA',(S,S),(0,0,0,0));d=ImageDraw.Draw(img)
 prof=outline(4+r.randint(0,1))
 y0,y1=S*.04,S*.97
 def P(t,x):return (S/2+x*S,y0+t*(y1-y0))
 poly=[P(t,-w) for t,w in prof]+[P(t,w) for t,w in reversed(prof)]
 mask=Image.new('L',(S,S),0);ImageDraw.Draw(mask).polygon(poly,fill=255)
 # Base fill: along-bough ramp, darker edges.
 a=np.zeros((S,S,3),np.float32)
 ys=(np.arange(S)[:,None]-y0)/(y1-y0);xs=np.abs(np.arange(S)[None,:]-S/2)/(S*.46)
 t=np.clip(ys,0,1)
 for k in range(3):
  lo,mi,hi=v[0][k],v[1][k],v[2][k]
  a[...,k]=np.where(t<.35,lo+(mi-lo)*t/.35,mi+(hi-mi)*(t-.35)/.65)
 a*=(1-.28*np.clip(xs,0,1)**1.5)[...,None]
 base=Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGB').convert('RGBA')
 sd=ImageDraw.Draw(base)
 # Needle strokes: from midrib forward-outward, alternating light/dark.
 for i in range(260):
  tt=r.uniform(.06,.96);side=r.choice((-1,1));wmax=prof[int(tt*120)][1]
  L=wmax*r.uniform(.5,1.0);ang=math.radians(r.uniform(28,48))
  x0,yA=P(tt,side*r.uniform(0,.03))
  x1=x0+side*L*S*math.cos(ang)*1.0;y1b=yA+L*S*math.sin(ang)*1.1
  c=ramp(v,min(1,tt+.08*r.random()));f=r.choice((1.22,1.12,.82,.9))
  sd.line([(x0,yA),(x1,y1b)],fill=tuple(int(min(255,ch*f)) for ch in c)+(255,),width=max(2,int(S*.006)))
 # Midrib: a light stem line.
 sd.line([P(.02,0),P(.9,0)],fill=tuple(int(min(255,ch*1.08)) for ch in ramp(v,.6))+(255,),width=int(S*.007))
 base.putalpha(mask.filter(ImageFilter.GaussianBlur(S*.002)))
 return base.resize((C,C),Image.LANCZOS)

atlas=Image.new('RGBA',(C*3,C*2),(0,0,0,0))
for i,v in enumerate(VARIANTS):atlas.paste(cell(v,100+i),((i%3)*C,(i//3)*C))
# Bleed RGB under transparent texels so mip levels keep bough colors at the rim.
arr=np.array(atlas).astype(np.float32);alpha=arr[...,3]>8
from scipy.ndimage import distance_transform_edt
_,(iy,ix)=distance_transform_edt(~alpha,return_indices=True)
arr[...,:3]=arr[iy,ix,:3];Image.fromarray(arr.astype(np.uint8),'RGBA').save(out)
print('atlas',out,atlas.size)
