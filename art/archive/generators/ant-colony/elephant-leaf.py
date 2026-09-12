from pathlib import Path
ANT_ASSETS={'elephant-leaf'}
source=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/scripts/ant-colony/models.py').read_text().split('for kind,off in ')[0]
exec(source)
for index,(angle,height,length) in enumerate([(.2,1.65,1.7),(2.4,1.2,1.4),(4.4,.85,1.15)]):
 direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-math.sin(angle),math.cos(angle),0))
 root=direction*.32+Vector((0,0,height))
 tube('Bent broadleaf stalk',[(0,0,0),direction*.12+Vector((0,0,height*.55)),root],.047,leaf[0])
 vs=[];centers=[]
 for j in range(10):
  t=j/9;center=root+direction*length*(t-.10)
  center.z+=.17*math.sin(t*math.pi)-.33*t*t
  centers.append(center.copy())
  width=length*.48*math.sin(math.pi*(.18+.82*t))**.7 if j<9 else .004
  for k in range(5):
   u=(k-2)/2;q=center+side*u*width
   q.z-=abs(u)*(.12+.07*t)
   if j==0 and k==2:q+=direction*.23
   vs.append(q)
 faces=[(j*5+k,(j+1)*5+k,(j+1)*5+k+1,j*5+k+1) for j in range(9) for k in range(4)]
 o=mesh('Large cupped heart leaf',vs,faces,leaf[1 if index==0 else 0])
 for f in o.data.polygons:f.use_smooth=True
 # Raised pale midrib and subtle arcing lateral veins are actual mesh details.
 tube('Broadleaf central vein',[p+Vector((0,0,.012)) for p in centers],.014,leaf[2])
 for j in [2,4,6]:
  for k in [0,4]:tube('Broadleaf side vein',[centers[j-1]+Vector((0,0,.015)),vs[j*5+k]+Vector((0,0,.015))],.007,leaf[2])
export('elephant-leaf',(16,-8,0))
bpy.data.libraries.write(OUT+'/Ant-colony-source.blend',{col},fake_user=True)
open(OUT+'/model-manifest.json','w').write(json.dumps(exports,indent=2))
result={'asset':'elephant-leaf','source':OUT+'/Ant-colony-source.blend'}
