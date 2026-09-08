"""Reference forest: actual layered boughs, fern pinnae and broad leaves, not cones."""
from pathlib import Path
source=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/scripts/ant-colony/models.py').read_text().split('for kind,off in ')[0]
exec(source.replace("name='Ant Colony — reference rebuild'","name='Ant Colony — forest rebuild'"))
needles=[mat('pine needles '+str(i),c) for i,c in enumerate(['414b2b','525d31','647039','778043'])]
def blade(label,a,b,width,m):
 a,b=Vector(a),Vector(b);v=b-a;side=Vector((-v.y,v.x,0)).normalized()*width
 mid=a+v*.48;ridge=mid+Vector((0,0,width*.20))
 return mesh(label,[a,mid-side,b,mid+side,ridge],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],m)
def pine_tree(height,seed):
 random.seed(seed);cyl('Tapered pine trunk',(0,0,-.12),(0,0,height),.24,wood[0],.045,9)
 for level in range(9):
  z=.7+level*(height-.95)/9;radius=(height-z)*.36+.10
  for branch in range(9):
   a=branch*math.tau/9+level*1.72+random.uniform(-.13,.13);L=radius*random.uniform(.82,1.12)
   direction=Vector((math.cos(a),math.sin(a),0));cross=Vector((-math.sin(a),math.cos(a),0));start=Vector((0,0,z+.25));end=direction*L+Vector((0,0,z-.25))
   cyl('Pine branch',start,end,.038,wood[0],.009,5)
   # Scalloped branch has a thin central ridge and hanging side sprays.
   for j in range(6):
    t=.12+j*.14;p=start.lerp(end,t);spread=L*(.22*(1-t)+.02)
    for side in [-1,1]:
     q=p+direction*L*.20+cross*side*spread+Vector((0,0,-.16))
     blade('Individual pine spray',p,q,L*.105*(1-t*.7),needles[(level+branch+j)%4])
   blade('Pointed pine tip',end-direction*.3,end+direction*.18,.12,needles[2])
 for j in range(6):
  a=j*math.tau/6;tube('Pine roots',[(0,0,.35),(.38*math.cos(a),.38*math.sin(a),.09),(.6*math.cos(a),.6*math.sin(a),0)],.075,wood[0])
for i in range(3):pine_tree(6.8+i*.75,82+i);export('pine-'+str(i+1),(i*7,0,0))
for kind in ['fern','broadleaf','grass','rock','lily','reeds']:
 random.seed(32)
 if kind=='fern':
  for j in range(9):
   a=j*math.tau/9;direction=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0));L=random.uniform(.85,1.45)
   points=[direction*(t*L)+Vector((0,0,.05+math.sin(t*math.pi*.8)*L*.55)) for t in [k/9 for k in range(10)]]
   tube('Fern rachis',points,.012,leaf[2])
   for k in range(1,9):
    p=points[k];t=k/9
    for sign in [-1,1]:blade('Fern leaflet',p,p+side*sign*L*.24*math.sin(t*math.pi)+direction*.12-Vector((0,0,.04)),.075*(1-t*.7),leaf[(j+k)%3])
 elif kind=='broadleaf':
  for j in range(8):
   a=j*math.tau/8;L=random.uniform(.75,1.35);p=(math.cos(a)*L,math.sin(a)*L,random.uniform(.22,.7));blade('Broad forest leaf',(0,0,.1),p,.27,leaf[j%4]);beam('Leaf vein',(0,0,.13),p,.014,leaf[2])
 elif kind=='grass':
  for j in range(28):
   a=random.random()*math.tau;r=random.random()*.25;x,y=math.cos(a)*r,math.sin(a)*r;h=random.uniform(.16,.42)
   blade('Fine bent grass',(x,y,0),(x+math.cos(a)*h*.55,y+math.sin(a)*h*.55,h),random.uniform(.012,.028),leaf[j%4])
 elif kind=='rock':
  o=ell('Faceted forest stone',(0,0,.42),(.85,.67,.58),rock[1],9,5)
  for v in o.data.vertices:v.co*=random.uniform(.90,1.10)
  ell('Moss on shoulder',(-.09,.06,.73),(.6,.46,.12),leaf[0],9,4)
 elif kind=='lily':
  for j in range(4):
   x,y=random.uniform(-.6,.6),random.uniform(-.6,.6);r=random.uniform(.18,.30)
   vs=[(x,y,.025)]+[(x+math.cos(.14+i*(math.tau-.28)/12)*r,y+math.sin(.14+i*(math.tau-.28)/12)*r,.025) for i in range(13)]
   mesh('Notched lily pad',vs,[(0,i,i+1) for i in range(1,13)],leaf[1])
 elif kind=='reeds':
  for j in range(14):
   x,y=random.uniform(-.3,.3),random.uniform(-.3,.3);h=random.uniform(.6,1.1)
   blade('Reed blade',(x,y,0),(x+random.uniform(-.2,.2),y,h),.045,leaf[j%3])
   if j%3==0:cyl('Seed head',(x,y,h*.85),(x,y,h),.035,wood[1])
 export(kind,(len(exports)*3,-8,0))
bpy.data.libraries.write(OUT+'/Ant-forest-source.blend',{col},fake_user=True)
open(OUT+'/forest-manifest.json','w').write(json.dumps(exports,indent=2))
result={'assets':exports}
