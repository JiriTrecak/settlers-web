"""Original ant warrior. Editable rigid-shell rig, modular equipment, in-place actions.
Coordinates: Z up, -Y forward. All source meshes remain separate in the .blend.
Only the disposable character exporter joins them. No external artwork dependencies.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P.parents[3]/'experiments/building-studio'))
from stage import create_stage
if not bpy.app.background: raise RuntimeError('Background Blender only; never reset an artist document.')
bpy.ops.wm.read_factory_settings(use_empty=True)
CFG=json.loads((P/'asset.json').read_text()); SC=bpy.context.scene; SC.render.fps=30

def collection(name):
 c=bpy.data.collections.new(name);SC.collection.children.link(c);return c
BODY=collection('01 Orange shell and face');KIT=collection('02 Acorn shield and ivory sword');CLOTH=collection('03 Ownership leaves and tabards');RIG=collection('04 Deformation rig');STAGE=collection('05 Studio')
C=BODY;bindings=[]
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4

def material(name,h,rough=.62,metal=0):
 rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)];m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*map(linear,rgb),1)
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=m.diffuse_color;b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 return m
SHELL=material('Chitin_Orange','#b74b2d',.52);SHELL_LIGHT=material('Chitin_Highlight','#c85832',.54)
EYE=material('Eyes_Obsidian','#11191b',.17);b=EYE.node_tree.nodes.get('Principled BSDF');b.inputs['Coat Weight'].default_value=.20
DARK=material('Vest_Brown','#4d3224',.82);WOOD=material('Acorn_Wood','#b88449',.74);CAP=material('Acorn_Cap','#714b31',.78)
MOUTH=material('Mouth_Shadow','#211411',.95)
IVORY=material('Ivory','#e7cba1',.48);BRONZE=material('Bronze','#bd903e',.35,.35);TEAM=material('TC_TeamColor','#c43d38',.7)

def finish(ob,name,mat,bone,smooth=True):
 ob.name=name
 for c in list(ob.users_collection):c.objects.unlink(ob)
 C.objects.link(ob);ob.data.materials.append(mat)
 bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in ob.data.polygons:f.use_smooth=smooth
 ob['role']='warrior';bindings.append((ob,bone));return ob

def ellipsoid(name,center,scale,mat,bone,segments=12,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=center)
 ob=bpy.context.object;ob.scale=scale;return finish(ob,name,mat,bone)

def tube(name,a,b,r1,r2,mat,bone,n=10):
 a,b=Vector(a),Vector(b);d=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
 ob=bpy.context.object;ob.rotation_euler=d.to_track_quat('Z','Y').to_euler();return finish(ob,name,mat,bone)

def mesh(name,vs,fs,mat,bone,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);C.objects.link(ob);me.materials.append(mat)
 for f in me.polygons:f.use_smooth=smooth
 ob['role']='warrior';bindings.append((ob,bone));return ob

def band(name,points,r,mat,bone,n=6):
 vs=[];fs=[]
 for i,p in enumerate(points):
  p=Vector(p);d=Vector(points[min(len(points)-1,i+1)])-Vector(points[max(0,i-1)]);q=d.to_track_quat('Z','Y')
  vs.extend(p+q@Vector((r*math.cos(j*math.tau/n),r*math.sin(j*math.tau/n),0)) for j in range(n))
 for i in range(len(points)-1):
  for j in range(n):fs.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 fs.extend([tuple(range(n-1,-1,-1)),tuple((len(points)-1)*n+j for j in range(n))]);return mesh(name,vs,fs,mat,bone,True)

def leaf(name,a,b,width,mat,bone,bend=.025):
 a,b=Vector(a),Vector(b);d=b-a;side=Vector((1,0,0)) if abs(d.normalized().x)<.6 else Vector((0,1,0));side=(side-d.normalized()*side.dot(d.normalized())).normalized()
 vs=[]
 for i in range(6):
  t=i/5;p=a+d*t+Vector((0,-bend*math.sin(math.pi*t),0));w=width*(math.sin(math.pi*t)**.7)
  vs.extend([p-side*w,p+Vector((0,-.014,0)),p+side*w])
 fs=[]
 for i in range(5):
  for j in range(2):fs.append((i*3+j,i*3+j+1,(i+1)*3+j+1,(i+1)*3+j))
 # Back face makes the leaves readable from either side without runtime double-sided cost.
 return mesh(name,vs,fs+[tuple(reversed(f)) for f in fs],mat,bone,True)

# Heads and body proportions are authored in world/rest coordinates.
J={'root':(0,0,.72),'spine':(0,0,.92),'head':(0,-.035,1.42),'abdomen':(0,.18,.75),'jaw':(0,-.11,1.335)}
parents={'root':None,'spine':'root','head':'spine','abdomen':'root','jaw':'head'}
for label,s in [('R',-1),('L',1)]:
 J.update({f'arm.{label}':(s*.255,0,1.16),f'forearm.{label}':(s*.355,-.055,.925),f'hand.{label}':(s*.43,-.18,.80),f'thigh.{label}':(s*.155,0,.72),f'shin.{label}':(s*.21,-.055,.41),f'foot.{label}':(s*.245,0,.115),f'antenna.{label}':(s*.17,-.005,1.70),f'tip.{label}':(s*.29,.005,2.025)})
 parents.update({f'arm.{label}':'spine',f'forearm.{label}':f'arm.{label}',f'hand.{label}':f'forearm.{label}',f'thigh.{label}':'root',f'shin.{label}':f'thigh.{label}',f'foot.{label}':f'shin.{label}',f'antenna.{label}':'head',f'tip.{label}':f'antenna.{label}'})
 J[f'socket_hand.{label}']=J[f'hand.{label}'];parents[f'socket_hand.{label}']=f'hand.{label}'
# Natural shield hold: upper arm down, forearm bent forward across the shield's back.
J['forearm.L']=(.385,.01,.967);J['hand.L']=(.39,-.198,1.01);J['socket_hand.L']=J['hand.L']
J['socket_back']=(0,.2,1.03);parents['socket_back']='spine'
J['socket_blade_base']=(-.43,-.18,.93);J['socket_blade_tip']=(-.53,-.18,1.53)
parents['socket_blade_base']=parents['socket_blade_tip']='hand.R'
# Vest fully encloses the torso; omit the invisible inner shell.
ellipsoid('Vest',(0,.012,1.035),(.268,.205,.265),DARK,'spine')
ellipsoid('Neck',(0,-.012,1.265),(.108,.10,.13),SHELL,'head',12,8)
ellipsoid('Head',(0,-.035,1.465),(.307,.268,.298),SHELL,'head',20,12)
def acorn_scale(name,center,width,length,normal,bone,compact=False):
 # Scalloped low convex shell flake. 27 triangles; explicitly supported silhouette.
 outline=[(0,-.55),(-.40,-.35),(-.51,-.06),(-.46,.32),(-.23,.49),(.23,.49),(.46,.32),(.51,-.06),(.40,-.35)]
 q=Vector(normal).to_track_quat('Z','Y');c=Vector(center)
 vs=[c+q@Vector((0,0,.023))]+[c+q@Vector((x*width,y*length,0)) for x,y in outline]
 vs+=[c+q@Vector((x*width*.92,y*length*.92,-.012)) for x,y in outline]
 fs=[(0,i+1,(i+1)%9+1) for i in range(9)]+[(i+1,i+10,(i+1)%9+10,(i+1)%9+1) for i in range(9)]
 if compact:
  vs=vs[:10]+[c+q@Vector((0,0,-.004))]
  fs=[(0,i+1,(i+1)%9+1) for i in range(9)]+[(10,(i+1)%9+1,i+1) for i in range(9)]
 return mesh(name,vs,[tuple(reversed(f)) for f in fs],CAP,bone,True)
# Tight, low acorn cap: staggered flakes follow the head's dome.
vs=[];fs=[]
for j in range(5):
 th=.08+j*.245
 for i in range(20):
  a=i*math.tau/20;vs.append((.313*math.sin(th)*math.cos(a),-.035+.28*math.sin(th)*math.sin(a),1.465+.302*math.cos(th)))
for j in range(4):
 for i in range(20):fs.append((j*20+i,j*20+(i+1)%20,(j+1)*20+(i+1)%20,(j+1)*20+i))
mesh('Acorn helmet under-shell',vs,fs,CAP,'head',True)
for row,(theta,count) in enumerate([(.98,14),(.66,11),(.34,7)]):
 for i in range(count):
  a=math.tau*(i+.5*(row%2))/count;n=Vector((math.sin(theta)*math.cos(a),math.sin(theta)*math.sin(a),math.cos(theta)))
  center=(.321*n.x,-.035+.29*n.y,1.465+.315*n.z)
  acorn_scale('Helmet overlapping scale',center,.143 if row<2 else .131,.161,n,'head')
tube('Helmet stem',(0,-.035,1.774),(.007,-.033,1.844),.025,.023,WOOD,'head',8)
# Glossy oval insets conform to the face rather than protruding as eyeballs.
for label,s in [('R',-1),('L',1)]:
 vs=[];fs=[]
 def eye_point(rad,a):
  x=s*.167+math.cos(a)*.084*rad;z=1.474+math.sin(a)*.124*rad
  y=-.035-.268*math.sqrt(max(.035,1-(x/.307)**2-((z-1.465)/.298)**2))-.012-.026*(1-rad*rad)
  return (x,y,z)
 vs.append(eye_point(0,0))
 for row in range(1,5):
  for i in range(20):vs.append(eye_point(row/4,math.tau*i/20))
 for i in range(20):fs.append((0,1+(i+1)%20,1+i))
 for row in range(3):
  for i in range(20):fs.append((1+row*20+i,1+row*20+(i+1)%20,1+(row+1)*20+(i+1)%20,1+(row+1)*20+i))
 mesh('Eye inset '+label,vs,[tuple(reversed(f)) for f in fs],EYE,'head',True)
 # A tiny stylized catchlight remains readable at the RTS camera, like the sheet.
 x=s*.153-.019;z=1.54;y=-.035-.268*math.sqrt(1-(x/.307)**2-((z-1.465)/.298)**2)-.040
 ellipsoid('Eye catchlight '+label,(x,y,z),(.008,.003,.010),IVORY,'head',8,4)
 # Tapered nostril slits, wider toward the outside, with a raised orange rim.
 nose=[(s*.021,-.298,1.365),(s*.036,-.295,1.369),(s*.044,-.292,1.356),(s*.034,-.295,1.347)]
 mesh('Shaped nostril '+label,nose,[(0,1,2,3)],MOUTH,'head')
 band('Nostril rim '+label,[nose[0],(s*.035,-.298,1.372),nose[1]],.0035,SHELL_LIGHT,'head',4)
 a=Vector(J[f'antenna.{label}']);b=Vector(J[f'tip.{label}']);c=Vector((s*.42,-.047,1.902))
 tube('Antenna stalk '+label,a,b,.025,.042,SHELL,f'antenna.{label}')
 ellipsoid('Antenna elbow '+label,b,(.048,.045,.043),SHELL_LIGHT,f'tip.{label}',10,8)
 tube('Antenna outer '+label,b,c,.045,.014,SHELL,f'tip.{label}')
 ellipsoid('Antenna tip '+label,c,(.017,.016,.027),SHELL_LIGHT,f'tip.{label}',8,6)
 for upper,lower,end,r1,r2 in [('arm','forearm','hand',.092,.07),('thigh','shin','foot',.105,.073)]:
  a=J[f'{upper}.{label}'];b=J[f'{lower}.{label}'];c=J[f'{end}.{label}']
  ellipsoid(upper+' ball '+label,a,(r1,r1,r1),SHELL,f'{upper}.{label}',12,8)
  tube(upper+' shell '+label,a,b,r1*.90,r2*.84,SHELL,f'{upper}.{label}')
  ellipsoid(lower+' joint '+label,b,(r2,r2,r2),SHELL_LIGHT,f'{lower}.{label}',12,8)
  tube(lower+' shell '+label,b,c,r2,r2*.70,SHELL,f'{lower}.{label}')
 foot=J[f'foot.{label}'];outline=[(-.105,-.15),(-.075,-.215),(.075,-.215),(.123,-.155),(.104,.07),(-.090,.07)]
 vs=[(foot[0]+x,y,0) for x,y in outline]+[(foot[0]+x*.9,y,.055) for x,y in outline]+[(foot[0],.015,.16)]
 fs=[tuple(range(5,-1,-1))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]+[(i+6,(i+1)%6+6,12) for i in range(6)]
 mesh('Broad planted foot '+label,vs,fs,SHELL_LIGHT,f'foot.{label}',True)
 # The broad feet keep their clean silhouette; toe grooves need no extra geometry.
 hand=J[f'hand.{label}'];ellipsoid('Grip '+label,hand,(.078,.072,.093),SHELL,f'hand.{label}',12,8)
 for dz in [-.045,-.01,.025]:band('Finger '+label,[(hand[0]-.055,hand[1]-.057,hand[2]+dz),(hand[0]+.052,hand[1]-.057,hand[2]+dz)],.015,SHELL_LIGHT,f'hand.{label}',6)
# Closed smile stretches into a dark opening as the lower jaw moves.
upper=[(-.066,-.276,1.329),(-.035,-.284,1.317),(0,-.289,1.312),(.035,-.284,1.317),(.066,-.276,1.329)]
lower=[(x,y-.002,z-.005) for x,y,z in upper]
ob=mesh('Speech mouth opening',upper+lower,[(i,i+1,i+6,i+5) for i in range(4)],MOUTH,'jaw');ob['head_vertices']=list(range(5))
mesh('Lower chin plate',lower+[(0,-.261,1.267)],[(i,i+1,5) for i in range(4)],SHELL,'jaw',True)
band('Smile lower edge',lower,.003,SHELL_LIGHT,'jaw',4)
# Cloth covers the hips. No protruding rear gaster on this equipped warrior.
ellipsoid('Cloth covered hips',(0,.012,.744),(.205,.15,.12),DARK,'root',12,6)
# Belts and broad diagonal straps have actual volume, no painted light tricks.
for z in [.818]:band('Waist belt',[(math.cos(i*math.tau/24)*.208,math.sin(i*math.tau/24)*.15,z) for i in range(25)],.033,WOOD,'root',6)
for side in [-1,1]:
 points=[Vector((side*.19,-.114,1.177)),Vector((side*.095,-.211,1.072)),Vector((-side*.025,-.214,.948)),Vector((-side*.126,-.14,.863))];vs=[]
 for i,p in enumerate(points):
  d=(points[min(3,i+1)]-points[max(0,i-1)]).normalized();across=Vector((-d.z,0,d.x)).normalized()*.038
  vs.extend([p-across,p+across])
 mesh('Flat crossed leather strap',vs,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(3)],CAP,'spine',True)
ellipsoid('Belt buckle',(0,-.179,.817),(.056,.018,.050),BRONZE,'root',12,8)
C=CLOTH
for label,s in [('R',-1),('L',1)]:
 for i in range(3):leaf('Shoulder leaf '+label+str(i),(s*(.16+i*.035),-.040,1.252),(s*(.24+i*.05),-.16+i*.10,1.050-i*.014),.043,TEAM,'spine')
# Front and rear ownership tabards, distinct from the natural shell.
def tabard(name,y,bone,back=False):
 sign=1 if back else -1
 # Broad tailored cloth, with a shallow central fold and a clean pointed hem.
 rows=[(.814,.145,0),(.71,.143,.015),(.575,.129,.027),(.495,.064,.035),(.452,.003,.038)]
 vs=[];fs=[]
 for z,w,depth in rows:
  for u in [-1,-.5,0,.5,1]:
   vs.append((u*w,y+sign*(depth+.011*(1-abs(u))),z))
 for j in range(len(rows)-1):
  for i in range(4):
   f=(j*5+i,j*5+i+1,(j+1)*5+i+1,(j+1)*5+i)
   fs.append(tuple(reversed(f)) if back else f)
 ob=mesh(name,vs,fs,TEAM,bone,True)
 # Thin closed hem: orbiting must show cloth, not disappear through its back.
 mod=ob.modifiers.new('Cloth thickness','SOLIDIFY');mod.thickness=.006
 bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
tabard('Front cloth tabard',-.176,'root')
tabard('Back cloth tabard',.167,'root',True)

C=KIT
# Acorn shield: a solid curved shell, broad rounded shoulders and a soft tip.
# All surfaces share one profile so the inset sits on the wood, not in front of it.
SX=.445;SY=-.277;SZ=.785
shield_profile=[(-.432,.008),(-.402,.040),(-.34,.092),(-.24,.157),(-.12,.207),(.02,.240),(.15,.247),(.25,.226),(.32,.165),(.356,.080)]
def shield_width(z):
 for (a,wa),(b,wb) in zip(shield_profile,shield_profile[1:]):
  if a<=z<=b:return wa+(wb-wa)*(z-a)/(b-a)
 return shield_profile[0][1] if z<shield_profile[0][0] else shield_profile[-1][1]
def shield_depth(x,z):
 w=shield_width(z);u=min(1,abs(x)/max(.001,w))
 # Dome fades gently into the narrow tip and neck.
 bulge=.097*(max(0,1-u*u)**.65)*min(1,(z+.452)/.22)
 return SY-.027-bulge
vs=[];fs=[];cols=11
for back in [False,True]:
 for z,w in shield_profile:
  for i in range(cols):
   u=(i-(cols-1)/2)/((cols-1)/2);x=w*u
   y=SY+.013-.025*(1-u*u) if back else shield_depth(x,z)
   vs.append((SX+x,y,SZ+z))
 count=len(shield_profile)*cols
 for j in range(len(shield_profile)-1):
  for i in range(cols-1):
   f=(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i)
   fs.append(tuple(v+count for v in reversed(f)) if back else f)
# Close the perimeter; smooth brown end grain, no hollow paper edge.
perimeter=list(range(cols))+[j*cols+cols-1 for j in range(1,len(shield_profile))]+list(range(count-2,count-cols-1,-1))+[j*cols for j in range(len(shield_profile)-2,0,-1)]
for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):fs.append((a,a+count,b+count,b))
mesh('Solid acorn shield shell',vs,fs,WOOD,'hand.L',True)
# Thin tonal seams sit flush with the shell: no raised, black wire-like grooves.
for u in [-.76,-.52,.52,.76]:
 vs=[];fs=[]
 for z,w in shield_profile[1:-1]:
  for dx in [-.0012,.0012]:
   x=w*u+dx;vs.append((SX+x,shield_depth(x,z)-.0007,SZ+z))
 for j in range(len(shield_profile)-3):fs.append((j*2,j*2+1,j*2+3,j*2+2))
 mesh('Acorn shell grain',vs,fs,CAP,'hand.L',True)
# Plain team-color insert follows the SAME curvature, leaving a clean wooden border.
vs=[];fs=[]
for z,w in [(-.354,.005),(-.31,.039),(-.23,.077),(-.12,.108),(.02,.125),(.165,.129),(.22,.112)]:
 for i in range(7):
  u=(i-3)/3;x=w*u;vs.append((SX+x,shield_depth(x,z)-.004,SZ+z))
for row in range(6):
 for i in range(6):fs.append((row*7+i,row*7+i+1,(row+1)*7+i+1,(row+1)*7+i))
mesh('Fitted shield ownership panel',vs,fs,TEAM,'hand.L',True)
# Rounded acorn cup, with continuous backing beneath staggered overlapping scales.
# Half-ellipsoid has a flat interior and a convex exterior. The scales sit on that
# surface; their backs never form exposed spikes around the edge.
cap_center=Vector((SX,SY+.008,SZ+.246));rx=.259;ry=.154;rz=.17
vs=[];fs=[]
for j in range(6):
 theta=.04+j*(math.pi/2-.04)/5
 for i in range(20):
  a=i*math.tau/20
  vs.append(cap_center+Vector((rx*math.sin(theta)*math.cos(a),-ry*math.sin(theta)*math.sin(a),rz*math.cos(theta))))
for j in range(5):
 for i in range(20):fs.append((j*20+i,j*20+(i+1)%20,(j+1)*20+(i+1)%20,(j+1)*20+i))
# Full dome includes a shallow back; interior stays brown and smooth.
fs.append(tuple(range(19,-1,-1)))
mesh('Shield acorn cup',vs,fs,CAP,'hand.L',True)
for row,(theta,n) in enumerate([(1.38,7),(.97,5),(.55,3)]):
 for i in range(n):
  # Only exterior half gets flakes; back is the engineered grip surface.
  a=.10+(math.pi-.20)*(i+.5*(row%2))/(n-1+.5*(row%2))
  center=cap_center+Vector((rx*math.sin(theta)*math.cos(a),-ry*math.sin(theta)*math.sin(a),rz*math.cos(theta)))
  normal=Vector((math.sin(theta)*math.cos(a)/rx,-math.sin(theta)*math.sin(a)/ry,math.cos(theta)/rz)).normalized()
  acorn_scale('Shield cap scale',center+normal*.008,.132 if row<2 else .145,.155,normal,'hand.L',compact=True)
tube('Acorn stem',(SX,SY+.005,SZ+.410),(SX-.004,SY+.011,SZ+.495),.026,.023,WOOD,'hand.L',8)
# Turn the shield outward exactly 90 degrees about its long axis. Gear remains
# skinned to the hand; local grip/forearm placement is authored, not a visual offset.
old_center=Vector((SX,SY,SZ));new_center=Vector((.495,-.12,.79));turn=Matrix.Rotation(math.pi/2,4,'Z')
for ob,bone in bindings:
 if bone=='hand.L' and ob in KIT.objects[:]:
  ob.matrix_world=Matrix.Translation(new_center)@turn@Matrix.Translation(-old_center)@ob.matrix_world
# Inner vertical grip under the palm plus a broad forearm cuff; neither is metal.
tube('Shield inside grip',(.39,-.198,.92),(.39,-.198,1.09),.025,.025,WOOD,'hand.L',8)
for z in [.92,1.09]:tube('Shield grip bracket',(.39,-.198,z),(.465,-.198,z),.018,.018,CAP,'hand.L',6)
# Hand fingers wrap the grip on the body-facing side, instead of the visible front.
center=Vector(J['hand.L'])
for ob,bone in bindings:
 if bone=='hand.L' and ob.name.startswith(('Grip','Finger')):
  ob.matrix_world=Matrix.Translation(center)@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation(-center)@ob.matrix_world
# Sword is linked to the right hand; blade sockets drive the runtime slash ribbon.
G=Vector(J['hand.R']);a=G+Vector((0,0,-.11));b=G+Vector((0,0,.145))
tube('Sword grip',a,b,.027,.028,CAP,'hand.R',10)
for z in [-.085,-.04,.005,.05]:tube('Grip ring',G+Vector((0,0,z)),G+Vector((0,0,z+.012)),.03,.03,WOOD,'hand.R',8)
ellipsoid('Sword pommel',a,(.040,.038,.035),BRONZE,'hand.R',10,6)
band('Sword guard',[G+Vector((-.145,0,.135)),G+Vector((0,0,.15)),G+Vector((.145,0,.135))],.027,BRONZE,'hand.R',8)
vs=[]
for z,w in [(.17,.055),(.66,.076)]:
 for x,y in [(-w,0),(0,-.029),(w,0),(0,.025)]:vs.append(G+Vector((x-.10*(z-.17),y,z)))
vs.append(G+Vector((-.067,0,.80)))
mesh('Ivory sword blade',vs,[(0,3,2,1)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]+[(i+4,(i+1)%4+4,8) for i in range(4)],IVORY,'hand.R')
J['socket_blade_tip']=tuple(G+Vector((-.067,0,.80)))
# Protect small silhouette features; spend the budget on the head, helmet and shield.
# Simplification happens before binding and is deterministic, leaving editable named parts.
def triangles(ob):return sum(len(f.vertices)-2 for f in ob.data.polygons)
total=sum(triangles(o) for o,_ in bindings)
protected=sum(triangles(o) for o,_ in bindings if triangles(o)<20 or 'head_vertices' in o or o.name=='Head' or o.name.startswith(('Eye','Helmet overlapping','Shield cap','Shield acorn cup','Solid acorn','Fitted shield','Front cloth','Back cloth','Broad planted foot','Shoulder leaf','Antenna stalk','Antenna outer')))
ratio=min(1,(4800-protected)/max(1,total-protected))
for ob,_ in bindings:
 if triangles(ob)<20 or 'head_vertices' in ob or ob.name=='Head' or ob.name.startswith(('Eye','Helmet overlapping','Shield cap','Shield acorn cup','Solid acorn','Fitted shield','Front cloth','Back cloth','Broad planted foot','Shoulder leaf','Antenna stalk','Antenna outer')):continue
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 dec=ob.modifiers.new('RTS surface budget','DECIMATE');dec.ratio=max(.12,ratio);dec.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=dec.name)
assert sum(triangles(o) for o,_ in bindings)<5000,'Warrior exceeds 5k runtime triangle budget'
# Bones use consistent world axes in rest; anatomy is rigid weighted, no rubber armor.
bpy.ops.object.select_all(action='DESELECT');arm=bpy.data.armatures.new('Ant warrior skeleton');rig=bpy.data.objects.new('Ant_Warrior_Rig',arm);RIG.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,p in J.items():
 b=arm.edit_bones.new(name);b.head=p;b.tail=Vector(p)+Vector((0,0,.10));b.use_deform=not name.startswith('socket')
 if parents[name]:b.parent=arm.edit_bones[parents[name]]
bpy.ops.object.mode_set(mode='OBJECT')
for ob,bone in bindings:
 group=ob.vertex_groups.new(name=bone);group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
 if 'head_vertices' in ob:
  indices=list(ob['head_vertices']);group.remove(indices);ob.vertex_groups.new(name='head').add(indices,1,'REPLACE')
 mod=ob.modifiers.new('Rigid shell skin','ARMATURE');mod.object=rig;ob.parent=rig
rig.show_in_front=True
rig['speechRig']={'bones':[{'name':'jaw','axis':[1,0,0],'angle':.34}]}
REST={n:rig.data.bones[n].matrix_local.copy() for n in J};V={n:Vector(p) for n,p in J.items()}

def rotation(x=0,y=0,z=0):return Euler(tuple(math.radians(a) for a in (x,y,z)),'XYZ').to_quaternion()
def ik(a,target,l1,l2,pole):
 d=target-a;length=min(l1+l2-.0001,max(.0001,d.length));axis=d.normalized();along=(length*length+l1*l1-l2*l2)/(2*length);h=math.sqrt(max(0,l1*l1-along*along));perp=(pole-axis*pole.dot(axis)).normalized();return a+axis*along+perp*h,a+axis*length

def animate(name,frames,pose):
 rig.animation_data_create();act=bpy.data.actions.new(name);rig.animation_data.action=act;act.use_fake_user=True
 for f in range(frames+1):
  p=pose(f/frames);root=Vector(p.get('root',(0,0,0)));torso=rotation(*p.get('torso',(0,0,0)));rootRot=rotation(*p.get('body',(0,0,0)));world={}
  def put(n,pos,q):world[n]=(Vector(pos),q)
  put('root',V['root']+root,rootRot);sp=world['root'][0]+rootRot@(V['spine']-V['root']);put('spine',sp,rootRot@torso)
  def from_parent(n,q=Quaternion()):
   par=parents[n];pos,pr=world[par];put(n,pos+pr@(V[n]-V[par]),pr@q)
  from_parent('head',rotation(*p.get('head',(0,0,0))));from_parent('jaw');from_parent('abdomen',rotation(p.get('tail',0),0,0))
  for label,s in [('R',-1),('L',1)]:
   for upper,lower,end,pole in [('thigh','shin','foot',Vector((0,-1,0))),('arm','forearm','hand',Vector((s*.7,.3,-.3)))]:
    n=f'{upper}.{label}';par=parents[n];base,qr=world[par];a=base+qr@(V[n]-V[par]);target=V[f'{end}.{label}']+Vector(p.get(f'{end}.{label}',(0,0,0)))
    if upper=='arm':target=sp+rootRot@torso@(target-V['spine'])
    else:target+=Vector(p.get('feetOffset',(0,0,0)))
    l1=(V[f'{lower}.{label}']-V[n]).length;l2=(V[f'{end}.{label}']-V[f'{lower}.{label}']).length
    b,c=ik(a,target,l1,l2,rootRot@pole)
    q1=(V[f'{lower}.{label}']-V[n]).rotation_difference(b-a);q2=(V[f'{end}.{label}']-V[f'{lower}.{label}']).rotation_difference(c-b)
    put(n,a,q1);put(f'{lower}.{label}',b,q2)
    er=rotation(*p.get(f'{end}Rot.{label}',(0,0,0)));put(f'{end}.{label}',c,rootRot@torso@er if upper=='arm' else er)
   from_parent(f'antenna.{label}',rotation(p.get('antenna',0),0,s*p.get('antennaSpread',0)))
   from_parent(f'tip.{label}',rotation(p.get('antennaTip',0),0,0));from_parent(f'socket_hand.{label}')
  from_parent('socket_back');from_parent('socket_blade_base');from_parent('socket_blade_tip')
  for n in J:
   pos,q=world[n];m=Matrix.Translation(pos)@q.to_matrix().to_4x4()@REST[n].to_quaternion().to_matrix().to_4x4()
   par=parents[n];local=(worldMatrices[par].inverted()@m) if par else m
   restLocal=(REST[par].inverted()@REST[n]) if par else REST[n]
   pb=rig.pose.bones[n];pb.matrix_basis=restLocal.inverted()@local;pb.rotation_mode='QUATERNION'
   pb.keyframe_insert('location',frame=f);pb.keyframe_insert('rotation_quaternion',frame=f);pb.keyframe_insert('scale',frame=f)
   worldMatrices[n]=m
 # Dense sampled poses use linear interpolation: no surprise bezier overshoot on contact.
 for slot in act.slots:
  for layer in act.layers:
   for strip in layer.strips:
    bag=strip.channelbag(slot)
    if bag:
     for fc in bag.fcurves:
      for key in fc.keyframe_points:key.interpolation='LINEAR'
 return act
worldMatrices={}
def idle(t):
 a=math.sin(t*math.tau);return {'root':(0,0,.008*a),'head':(0,0,a*1.2),'antenna':a*3,'antennaTip':-a*4,'tail':a*2,'hand.R':(0,-.012*a,0),'hand.L':(0,-.008*a,0)}
def locomotion(t,run=False):
 # Constant backward motion during stance cancels the game's 4-unit/s run.
 # In-place clip: the simulation still owns translation and collision.
 a=t*math.tau;stride=.35 if run else .22;lift=.14 if run else .075
 p={'root':(0,0,(-.10 if run else -.045)+.012*math.cos(a*2)),'torso':(11 if run else 3,0,3*math.sin(a)),'antenna':-7+6*math.sin(a),'antennaTip':-5*math.cos(a),'tail':-5+4*math.sin(a)}
 for label,offset in [('R',0),('L',.5)]:
  u=(t+offset)%1
  if u<.5:y=-stride+4*stride*u;z=0;pitch=0
  else:
   v=(u-.5)*2;ease=v*v*(3-2*v);y=stride-2*stride*ease;z=lift*math.sin(math.pi*v);pitch=-18*math.sin(math.pi*v)
  p['foot.'+label]=(0,y,z);p['footRot.'+label]=(pitch,0,0)
  phase=a+offset*math.tau;p['hand.'+label]=(0,.07*math.cos(phase),.018*math.sin(phase));p['handRot.'+label]=(9*math.cos(phase),0,0)
 return p
# Explicit strike poses: planted anticipation -> compact windup -> swift contact -> followthrough.
keys=[(0,{}),(.22,{'root':(0,.025,-.025),'torso':(-8,0,-16),'hand.R':(-.035,.13,.24),'handRot.R':(-62,-12,-18),'hand.L':(-.025,-.075,.045),'handRot.L':(5,0,-65),'head':(3,0,12),'antenna':-8}),(.43,{'root':(0,.035,-.038),'torso':(-9,0,-24),'hand.R':(-.02,.15,.27),'handRot.R':(-72,-8,-15),'hand.L':(-.025,-.08,.06),'handRot.L':(5,0,-65),'head':(3,0,15),'antenna':-12}),(.55,{'root':(0,-.115,-.06),'torso':(17,0,22),'hand.R':(.14,-.24,.17),'handRot.R':(102,8,-25),'hand.L':(-.025,-.10,.04),'handRot.L':(12,0,-55),'head':(-8,0,-18),'antenna':15,'antennaTip':12,'tail':-10}),(.66,{'root':(0,-.11,-.063),'torso':(20,0,28),'hand.R':(.23,-.17,-.035),'handRot.R':(132,10,-32),'hand.L':(-.025,-.08,.04),'handRot.L':(12,0,-55),'head':(-9,0,-18),'antenna':19,'antennaTip':-9,'tail':-13}),(.82,{'root':(0,-.02,-.02),'torso':(6,0,8),'hand.R':(.10,-.06,.01),'handRot.R':(40,0,-12),'antenna':-6}), (1,{})]
def keyed(t,keys):
 a,b=next(((a,b) for a,b in zip(keys,keys[1:]) if a[0]<=t<=b[0]),(keys[-2],keys[-1]));f=(t-a[0])/(b[0]-a[0]);f=f*f*(3-2*f);out={}
 for k in set(a[1])|set(b[1]):
  v=a[1].get(k,b[1].get(k));zero=(0,)*len(v) if isinstance(v,tuple) else 0;v1=a[1].get(k,zero);v2=b[1].get(k,zero)
  out[k]=tuple(x+(y-x)*f for x,y in zip(v1,v2)) if isinstance(v,tuple) else v1+(v2-v1)*f
 return out
idleAct=animate('idle',60,idle);animate('walk',20,lambda t:locomotion(t));animate('run',16,lambda t:locomotion(t,True));animate('carry',60,lambda t:{**idle(t),'hand.L':(0,-.065,.045)})
animate('attack_sword',60,lambda t:keyed(t,keys))
animate('hit',18,lambda t:keyed(t,[(0,{}),(.18,{'root':(0,.035,-.045),'torso':(-14,0,-9),'head':(-9,0,5),'hand.L':(-.04,-.075,.11),'handRot.L':(-12,0,-75),'antenna':-19,'tail':10}),(.40,{'root':(0,.045,-.025),'torso':(-9,0,-4),'antenna':10}),(1,{})]))
# Death settles on the back; shell/gear remain attached and never scale out of sight.
animate('death',42,lambda t:keyed(t,[(0,{}),(.15,{'root':(0,.02,-.06),'torso':(-12,0,5),'head':(-12,0,0),'antenna':-20}),(.42,{'root':(0,.12,-.28),'body':(-28,0,12),'feetOffset':(0,0,.02),'hand.R':(0,.1,-.1),'handRot.R':(-25,0,15),'hand.L':(.06,0,-.10)}),(.72,{'root':(.09,.24,-.50),'body':(-78,0,8),'feetOffset':(0,-.28,.11),'hand.R':(-.13,.05,-.08),'handRot.R':(10,0,-40),'hand.L':(.11,.09,-.09),'head':(0,-8,5),'antenna':-18}), (1,{'root':(.09,.24,-.51),'body':(-82,0,8),'feetOffset':(0,-.27,.08),'hand.R':(-.13,.05,-.08),'handRot.R':(10,0,-40),'hand.L':(.11,.09,-.09),'head':(0,-8,5),'antenna':-15})]))
rig.animation_data.action=idleAct;SC.frame_start=0;SC.frame_end=60;SC.frame_set(0)
create_stage(CFG,STAGE)
bpy.data.lights['Warm key'].size=.85
bpy.data.lights['Soft front fill'].size=2.8
bpy.data.lights['Amber right rim'].size=1.6
img=bpy.data.images.load(str(P/'reference.png'));img.name='reference.png';img.pack();img.use_fake_user=True
for name in ['model.py','asset.json','samples.json']:
 txt=bpy.data.texts.load(str(P/name));txt.use_fake_user=True
stats={'parts':len(bindings),'triangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o,_ in bindings),'bones':len(J),'clips':[a.name for a in bpy.data.actions]}
(P/'model-stats.json').write_text(json.dumps(stats,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(P/CFG['blend']));print('WARRIOR_READY',stats)
