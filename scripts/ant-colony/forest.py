"""Reference forest: actual layered boughs, fern pinnae and broad leaves, not cones."""
from pathlib import Path
source=Path('/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/scripts/ant-colony/models.py').read_text().split('for kind,off in ')[0]
exec(source.replace("name='Ant Colony — reference rebuild'","name='Ant Colony — forest rebuild'"))
needles=[mat('pine needles '+str(i),c) for i,c in enumerate(['414b2b','525d31','647039','778043'])]
def blade(label,a,b,width,m):
 a,b=Vector(a),Vector(b);v=b-a;side=Vector((-v.y,v.x,0)).normalized()*width
 mid=a+v*.48;ridge=mid+Vector((0,0,width*.20))
 return mesh(label,[a,mid-side,b,mid+side,ridge],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],m)
def needle_mass(start,end,width,material,seed,primary=False):
 # A closed, lobed bough with a rounded crown and hanging underside. The
 # irregular ring widths break the silhouette without flat alpha cards.
 rng=random.Random(seed);start,end=Vector(start),Vector(end)
 axis=(end-start).normalized();side=Vector((-axis.y,axis.x,0)).normalized()
 up=side.cross(axis).normalized()
 if up.z<0:up=-up
 vs=[];rings=9 if primary else 5;sides=6 if primary else 4
 for j in range(rings):
  t=j/(rings-1);center=start.lerp(end,t)
  center.z+=math.sin(t*math.pi)*width*.23
  envelope=math.sin(math.pi*(.035+t*.965))**.72
  w=max(.012,width*envelope*rng.uniform(.82,1.16))
  for k in range(sides):
   angle=k*math.tau/sides
   q=center+side*math.cos(angle)*w+up*math.sin(angle)*w*.52
   q+=axis*rng.uniform(-.045,.045)*width
   vs.append(q)
 faces=[tuple(range(sides-1,-1,-1))]
 for j in range(rings-1):
  for k in range(sides):faces.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
 faces.append(tuple((rings-1)*sides+k for k in range(sides)))
 o=mesh('Volumetric needle bough',vs,faces,material)
 for f in o.data.polygons:f.use_smooth=True

def pine_tree(height,seed):
 random.seed(seed);cyl('Tapered pine trunk',(0,0,-.12),(0,0,height),.24,wood[0],.045,9)
 for level in range(9):
  z=.60+level*(height-.75)/9+random.uniform(-.14,.14);radius=(height-z)*.39+.10
  phase=random.random()*math.tau
  for branch in range(6):
   a=branch*math.tau/6+phase+random.uniform(-.24,.24);L=radius*random.uniform(.75,1.17)
   direction=Vector((math.cos(a),math.sin(a),0));cross=Vector((-math.sin(a),math.cos(a),0))
   start=Vector((0,0,z+.25));end=direction*L+Vector((0,0,z-.24-random.random()*.22))
   cyl('Pine branch',start,end,.030,wood[0],.006,5)
   tone=random.choice([0,1,1,2,2,3])
   needle_mass(start,end,L*.21,needles[tone],seed+level*100+branch,primary=True)
   # Side shoots give a feathered outline, with real depth in side light.
   for shoot in range(3):
    t=.32+shoot*.19;center=start.lerp(end,t)
    for sign in [-1,1]:
     tip=center+direction*L*.23+cross*sign*L*(.31-t*.16)-Vector((0,0,L*.055))
     needle_mass(center,tip,L*(.095-t*.045),needles[min(3,tone+(shoot==2))],seed+branch*37+shoot*7+sign)
 needle_mass(Vector((0,0,height-.75)),Vector((.05,0,height+.08)),.19,needles[2],seed)
 for j in range(6):
  a=j*math.tau/6;tube('Pine roots',[(0,0,.35),(.38*math.cos(a),.38*math.sin(a),.09),(.6*math.cos(a),.6*math.sin(a),0)],.075,wood[0])
def bank_stone():
 rng=random.Random(148);count=7
 angles=[j*math.tau/count+rng.uniform(-.08,.08) for j in range(count)]
 outline=[(math.cos(a)*rng.uniform(.72,.94),math.sin(a)*rng.uniform(.58,.75)) for a in angles]
 heights=[rng.uniform(.65,.93) for _ in range(count)]
 vs=[]
 for layer in range(3):
  for j,(x,y) in enumerate(outline):
   factor=[.80,1,.77][layer]
   vs.append((x*factor+(0 if layer<2 else .06),y*factor,[-.16,.34,heights[j]][layer]))
 faces=[tuple(range(count-1,-1,-1))]
 for layer in range(2):
  for j in range(count):faces.append((layer*count+j,layer*count+(j+1)%count,(layer+1)*count+(j+1)%count,(layer+1)*count+j))
 faces.append(tuple(range(count*2,count*3)))
 o=mesh('Fractured bank stone',vs,faces,rock[1])
 # Small worn corners preserve the broad planar fracture faces.
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.035,segments=1,affect='EDGES',profile=.5);bm.to_mesh(o.data);bm.free()
 for m in (rock[0],rock[2]):o.data.materials.append(m)
 for f in o.data.polygons:f.material_index=0 if f.normal.z>.5 else (1 if f.index%3 else 2)
 # Vertex tint keeps moss attached to the rock surface and its stone grain,
 # rather than placing an untextured polygon cap over the crown.
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
 o.data.color_attributes.active_color=colors
 for v in o.data.vertices:
  crown=max(0,min(1,(v.co.z-.42)/.32))
  patch=.5+.5*math.sin(v.co.x*4.1+v.co.y*2.7)
  moss=crown*(.25+.55*patch)
  colors.data[v.index].color=(1-moss*.40,1-moss*.21,1-moss*.62,1)

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
  cyl('Grounded plant stem',(0,0,0),(0,0,.15),.04,leaf[3])
  for j in range(8):
   a=j*math.tau/8;L=random.uniform(.75,1.35);p=(math.cos(a)*L,math.sin(a)*L,random.uniform(.22,.7));blade('Broad forest leaf',(0,0,.1),p,.27,leaf[j%4]);beam('Leaf vein',(0,0,.13),p,.014,leaf[2])
 elif kind=='grass':
  for j in range(28):
   a=random.random()*math.tau;r=random.random()*.25;x,y=math.cos(a)*r,math.sin(a)*r;h=random.uniform(.16,.42)
   blade('Fine bent grass',(x,y,0),(x+math.cos(a)*h*.55,y+math.sin(a)*h*.55,h),random.uniform(.012,.028),leaf[j%4])
 elif kind=='rock':
  bank_stone()
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
