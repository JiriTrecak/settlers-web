"""Thornspitter: a grounded four-legged woodland seed artillery creature."""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Use a separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples']
scene=bpy.context.scene;scene.render.fps=24
bodycol=bpy.data.collections.new('Creature anatomy');scene.collection.children.link(bodycol)
studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
def mat(name,key,rough=.7):
 rgb=P[key]['representative']['linear_rgb'] if key in P else tuple(((int(key[i:i+2],16)/255+.055)/1.055)**2.4 for i in [1,3,5])
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Roughness'].default_value=rough
 return m
shell=mat('Olive layered carapace','#7e863c');belly=mat('Ochre soft underside','#9c875c');bark=mat('Dark bark ridges','bark');thorn=mat('Dry thorn tips','#a17b4d');eye=mat('Amber eyes','#a36722',.22);dark=mat('Seedpod interior','#080706');glint=mat('Eye glint','#f3e5c4',.15)
arm=bpy.data.armatures.new('Quadruped skeleton');rig=bpy.data.objects.new('ThornspitterRig',arm);bodycol.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
spec={'root':((0,0,0),None),'body':((0,0,.85),'root'),'head':((0,-.78,1),'body'),'snout':((0,-1.25,.98),'head')}
for side,sign in [('L',1),('R',-1)]:
 for row,y in [('front',-.64),('rear',.68)]:
  spec[f'{row}.{side}']=((sign*.64,y,.77),'body')
  spec[f'foot.{row}.{side}']=((sign*.9,y-.06,.24),f'{row}.{side}')
for n,(p,parent) in spec.items():
 b=arm.edit_bones.new(n);b.head=p;b.tail=Vector(p)+Vector((0,.13,0))
 if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False);parts=[]
def mesh(name,verts,faces,material,bone,smooth=False):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(d);bm.free()
 o=bpy.data.objects.new(name,d);bodycol.objects.link(o);d.materials.append(material)
 for p in d.polygons:p.use_smooth=smooth
 if material in [shell,belly,bark,thorn]:
  colors=d.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER')
  base=material.diffuse_color
  for loop in d.loops:
   co=d.vertices[loop.vertex_index].co
   variation=.82+.16*math.sin(co.x*29+co.y*17+co.z*31)+.10*math.sin(co.x*63-co.y*47+co.z*53)
   colors.data[loop.index].color=tuple(min(1,max(0,base[k]*variation)) for k in range(3))+(1,)
  if not material.node_tree.nodes.get('Paint'):
   node=material.node_tree.nodes.new('ShaderNodeVertexColor');node.name='Paint';node.layer_name='Paint'
   material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(verts))),1,'REPLACE');m=o.modifiers.new('Creature skeleton','ARMATURE');m.object=rig;o.parent=rig;o['role']='base';parts.append(o);return o

def ell(name,c,s,m,b,seg=12,rings=6):
 c=Vector(c);v=[tuple(c+Vector((0,0,s[2])))];f=[]
 for j in range(1,rings):
  t=math.pi*j/rings
  for i in range(seg):
   a=math.tau*i/seg;v.append(tuple(c+Vector((s[0]*math.sin(t)*math.cos(a),s[1]*math.sin(t)*math.sin(a),s[2]*math.cos(t)))))
 v.append(tuple(c-Vector((0,0,s[2]))));bottom=len(v)-1
 f +=[(0,1+i,1+(i+1)%seg) for i in range(seg)]
 for j in range(rings-2):
  for i in range(seg):
   a=1+j*seg+i;d=1+j*seg+(i+1)%seg;f.append((a,a+seg,d+seg,d))
 f +=[(bottom,1+(rings-2)*seg+(i+1)%seg,1+(rings-2)*seg+i) for i in range(seg)]
 return mesh(name,v,f,m,b,True)

def spike(name,start,end,r,m,b):
 a=Vector(start);d=Vector(end)-a;q=Vector((0,0,1)).rotation_difference(d.normalized());v=[];N=7
 for z,radius in [(0,r),(.5,r*.65),(1,0)]:
  for i in range(N):v.append(tuple(a+q@Vector((math.cos(i*math.tau/N)*radius,math.sin(i*math.tau/N)*radius,z*d.length))))
 f=[tuple(range(N-1,-1,-1))]
 for j in range(2):
  for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 return mesh(name,v,f,m,b)

ell('Round segmented abdomen',(0,.15,1),(.91,1.15,.72),belly,'body',16,8)
# Broad overlapping shell lobes, with dark seams between plates.
for j,y in enumerate([.82,.29,-.24,-.66]):
 width=[.76,.91,.87,.67][j]
 for side in [-1,1]:
  o=ell(f'Carapace plate {j} {side}',(side*width*.40,y,1.4),(width*.69,.48,.39),shell,'body',10,5)
  o.rotation_euler.y=side*.17
for side in [-1,1]:
 for j,y in enumerate([.85,.25,-.35]):
  ell(f'Bark ridge {side} {j}',(side*.45,y,1.72),(.14,.4,.13),bark,'body',8,4)
  spike(f'Back thorn {side} {j}',(side*.46,y,1.77),(side*.62,y+.17,2.1 if j==1 else 1.97),.12,thorn,'body')
ell('Neck',(0,-.9,.99),(.58,.49,.46),belly,'head')
for j,y in enumerate([-.86,-1.08]):ell(f'Head shield {j}',(0,y,1.33),(.53,.31,.21),shell,'head',10,5)
ell('Seedpod muzzle',(0,-1.45,.96),(.47,.38,.38),bark,'snout')
ell('Mouth opening',(0,-1.755,.96),(.3,.025,.26),dark,'snout',10,5)
for i in range(6):
 a=i*math.tau/6;x=math.cos(a)*.36;z=.96+math.sin(a)*.31
 spike(f'Muzzle petal {i}',(x,-1.4,z),(x*.65,-1.86,z+math.sin(a)*.05),.19,shell if i%2 else bark,'snout')
for side in [-1,1]:
 ell(f'Eye socket {side}',(side*.46,-1.07,1.12),(.13,.2,.2),bark,'head',10,5)
 ell(f'Amber eye {side}',(side*.54,-1.12,1.14),(.065,.12,.13),eye,'head',10,5)
 ell(f'Eye shine {side}',(side*.593,-1.155,1.2),(.017,.025,.025),glint,'head',6,4)
 for row,y in [('front',-.64),('rear',.68)]:
  bone=f'{row}.'+('L' if side==1 else 'R');foot='foot.'+bone
  ell('Upper leg '+bone,(side*.79,y,.57),(.3,.34,.43),shell,bone,10,5)
  ell('Foot '+bone,(side*.94,y-.10,.18),(.28,.37,.18),shell,foot,10,5)
  for k in [-1,0,1]:spike('Claw '+bone+str(k),(side*.94+k*.15,y-.31,.14),(side*.94+k*.16,y-.49,.04),.09,bark,foot)
rig.animation_data_create()
for p in rig.pose.bones:p.rotation_mode='XYZ'
def reset():
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
def rot(n,x=0,y=0,z=0):rig.pose.bones[n].rotation_euler=(x,y,z)
def ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
def pulse(t):return math.sin(math.pi*t)**2

def idle(t):
 b=math.sin(t*math.tau);rig.pose.bones['body'].location.z=.018*b;rot('head',.025*b,0,.018*math.sin(t*math.tau-.6))
def gait(t,running=False):
 frequency=t*math.tau
 rig.pose.bones['body'].location.z=(.055 if running else .015)*(1-math.cos(frequency*2))
 rot('body',-.07 if running else .01,0,.015*math.sin(frequency))
 for row in ['front','rear']:
  for side,sign in [('L',1),('R',-1)]:
   phase=frequency+(math.pi if (row=='front')==(side=='L') else 0);lift=max(0,math.sin(phase));n=row+'.'+side
   rot(n,(.50 if running else .23)*math.cos(phase),0,sign*.035*lift)
   rot('foot.'+n,-(.50 if running else .23)*math.cos(phase))
   rig.pose.bones[n].location.z=(.1 if running else .035)*lift
 rot('head',.04*math.cos(frequency*2))
def attack(t):
 wind=ease(t/.4)*(1-ease((t-.6)/.2));recoil=math.exp(-((t-.68)/.09)**2)
 rot('head',-.19*wind+.25*recoil);rig.pose.bones['snout'].location.y=.10*wind-.16*recoil
 rig.pose.bones['body'].location.y=.08*wind+.06*recoil
 for n in ['front.L','front.R']:rot(n,-.1*wind)
def hit(t):rot('body',.09*pulse(t),.11*pulse(t),.06*pulse(t));rot('head',-.16*pulse(t))
def death(t):
 k=ease(t/.75);rig.pose.bones['root'].location.z=-.52*k;rot('body',0,.18*k,0)
 for row in ['front','rear']:
  for side,sign in [('L',1),('R',-1)]:rot(row+'.'+side,.25*k,sign*.8*k,0)
 rot('head',.35*k)
def action(name,length,fn):
 a=bpy.data.actions.new(name);rig.animation_data.action=a
 for frame in range(length+1):
  reset();fn(frame/length)
  for p in rig.pose.bones:
   p.keyframe_insert('rotation_euler',frame=frame+1,group=p.name);p.keyframe_insert('location',frame=frame+1,group=p.name)
 a.use_fake_user=True;track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,a);track.mute=True
 return a
idleaction=action('idle',48,idle);action('walk',32,lambda t:gait(t));action('run',20,lambda t:gait(t,True));action('attack_spit',24,attack);action('hit',14,hit);action('death',36,death)
rig.animation_data.action=idleaction;scene.frame_set(1);scene.frame_end=49
create_stage(C,studio)
for o in studio.objects:
 if o.type=='LIGHT':o.location*=.45;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler();o.data.size=2.5
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
scene['character_contract']='Neutral quadruped; no team material; -Y forward; in-place idle/walk/run/spit/hit/death. Rear anatomy inferred.'
(A/'model-stats.json').write_text(json.dumps({'meshes':len(parts),'materials':len(bpy.data.materials)},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
