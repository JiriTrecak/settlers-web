"""Idempotent wayfarer kit dressing; preserves authored terrain and gameplay entities."""
import json, math, base64, struct
from pathlib import Path
root=Path(__file__).resolve().parents[2];path=root/'assets/maps/skirmish/worldroot-hollow.utcmap'
m=json.loads(path.read_text());size=m['size'];verts=size+33
raw=base64.b64decode(m['height']);height=struct.unpack('<'+'h'*(len(raw)//2),raw)
def ground(x,z):return height[(round(z)+16)*verts+round(x)+16]/100
m['stamps']=[s for s in m['stamps'] if not s['id'].startswith('worldroot.wayfarer.')]
def put(asset,x,z,yaw=0,scale=1):
 m['stamps'].append(dict(id=f'worldroot.wayfarer.{len(m["stamps"])}',asset=asset,x=round(x,2),y=round(z,2),yaw=round(yaw,4),scale=scale))
# Occasional paired roadside furniture. Leave entrances and camp arenas open.
for stroke in m['landscape']['strokes'][:3]:
 points=stroke['points']
 for i in range(1,len(points)-1,2):
  p=points[i];a=points[i-1];b=points[i+1];dx=b['x']-a['x'];dz=b['z']-a['z'];length=math.hypot(dx,dz);nx=-dz/length;nz=dx/length
  x=p['x']+nx*5;z=p['z']+nz*5
  if ground(x,z)<.8:continue
  put('lantern-post',x,z,math.atan2(nx,nz))
  # Fence follows the road, offset behind the lantern. Gaps every section.
  for offset in [-3.8,3.8]:
   fx=x+dx/length*offset+nx;fz=z+dz/length*offset+nz
   if ground(fx,fz)>.8:put('splitrail-fence',fx,fz,-math.atan2(dz,dx))
# Shore silhouettes away from established crossing routes and resource pads.
for x,z,yaw,scale in [(116,77,.4,1),(138,89,2.2,.8),(118,178,1.1,1),(140,169,.3,.9),(225,72,1.7,.85),(33,195,.8,.85),(22,53,.2,1.1),(235,215,2.4,1.1)]:
 put('waystone-outcrop',x,z,yaw,scale)
# Deck ends meet the dry shoulders of the western main-road ford.
put('timber-bridge',110,123,math.pi/2)
m['stamps'][-1].update(depthScale=1.75,elevation=1.62)
path.write_text(json.dumps(m,separators=(',',':'))+'\n')
print('Placed',sum(s['id'].startswith('worldroot.wayfarer.') for s in m['stamps']),'wayfarer props')
