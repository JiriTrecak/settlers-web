"""Shared articulated ant with base, warrior and archer equipment and reusable actions."""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Build in a separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples']
scene=bpy.context.scene
scene.render.fps=24
collections={n:bpy.data.collections.new(n) for n in ['Base anatomy','Warrior equipment','Archer equipment','Rig','Studio']}
for c in collections.values():scene.collection.children.link(c)

def material(name,color,metal=0,rough=.6):
    if color in P:rgb=P[color]['representative']['linear_rgb']
    else:
        v=[int(color[i:i+2],16)/255 for i in [1,3,5]]
        rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
TEAM=material('TC_TeamColor','chitin',.05,.50)
JOINT=material('Dark flexible joints','#302520',0,.78)
SHELL=material('Warm shell highlights','#84391f',.05,.47)
EYE=material('Obsidian compound eyes','#101416',.25,.19)
STEEL=material('Blue charcoal armor','#354957',.48,.44)
EDGE=material('Armor edge steel','#71838b',.48,.36)
BRONZE=material('Antique bronze trim','#9b7440',.45,.46)
LEATHER=material('Leather harness','#423124',0,.85)
BLADE=material('Blade steel','#b5c6cc',.6,.29)
WOOD=material('Bow golden wood','#865332',0,.62)
STRING=material('Bowstring','#d6c4a4',0,.85)
FEATHER=material('Arrow fletching','#bba681',0,.85)

arm=bpy.data.armatures.new('Ant shared skeleton');rig=bpy.data.objects.new('AntRig',arm);collections['Rig'].objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
spec={'root':((0,0,0),None),'hips':((0,0,.62),'root'),'spine':((0,0,.86),'hips'),'head':((0,0,1.19),'spine')}
for side,sign in [('L',1),('R',-1)]:
    spec.update({f'upper_arm.{side}':((sign*.29,0,1.05),'spine'),f'forearm.{side}':((sign*.39,0,.82),f'upper_arm.{side}'),f'hand.{side}':((sign*.43,-.025,.61),f'forearm.{side}'),f'thigh.{side}':((sign*.135,0,.61),'hips'),f'shin.{side}':((sign*.17,.0,.34),f'thigh.{side}'),f'foot.{side}':((sign*.18,-.01,.10),f'shin.{side}'),f'antenna.{side}':((sign*.13,-.045,1.63),'head')})
    spec[f'socket_hand.{side}']=(spec[f'hand.{side}'][0],f'hand.{side}')
spec['tool_hammer']=(spec['hand.R'][0],'socket_hand.R')
spec['tool_axe']=(spec['hand.R'][0],'socket_hand.R')
spec['arrow']=((.43,-.025,.61),'socket_hand.L')
spec['bow_draw']=((.43,-.025,.61),'socket_hand.L')
spec['socket_back']=((0,.13,.94),'spine')
for name,(pos,parent) in spec.items():
    b=arm.edit_bones.new(name);b.head=pos;b.tail=Vector(pos)+Vector((0,.10,0))
    if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
parts=[];role='base'

def mesh(name,verts,faces,mat,bone,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    ob=bpy.data.objects.new(name,data);collections[{'base':'Base anatomy','warrior':'Warrior equipment','archer':'Archer equipment'}[role]].objects.link(ob)
    data.materials.append(mat)
    for p in data.polygons:p.use_smooth=smooth
    g=ob.vertex_groups.new(name=bone);g.add(list(range(len(verts))),1,'REPLACE')
    mod=ob.modifiers.new('Shared ant rig','ARMATURE');mod.object=rig
    ob.parent=rig;ob['role']=role;parts.append(ob)
    return ob

def ell(name,center,scale,mat,bone,segments=12,rings=7):
    center=Vector(center);verts=[]
    # Single vertices at poles avoid degenerate UV-sphere quads.
    verts.append(tuple(center+Vector((0,0,scale[2]))))
    for j in range(1,rings):
        t=math.pi*j/rings
        for i in range(segments):
            a=math.tau*i/segments
            verts.append(tuple(center+Vector((scale[0]*math.sin(t)*math.cos(a),scale[1]*math.sin(t)*math.sin(a),scale[2]*math.cos(t)))))
    verts.append(tuple(center-Vector((0,0,scale[2]))));bottom=len(verts)-1
    faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
    for j in range(rings-2):
        for i in range(segments):
            a=1+j*segments+i;b=1+j*segments+(i+1)%segments;faces.append((a,a+segments,b+segments,b))
    faces += [(bottom,1+(rings-2)*segments+(i+1)%segments,1+(rings-2)*segments+i) for i in range(segments)]
    return mesh(name,verts,faces,mat,bone,True)

def tube(name,points,radii,mat,bone,sides=8):
    pts=[Vector(p) for p in points];verts=[]
    for j,p in enumerate(pts):
        tangent=(pts[min(j+1,len(pts)-1)]-pts[max(j-1,0)]).normalized();u=tangent.cross(Vector((0,1,0)))
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u).normalized()
        for i in range(sides):verts.append(tuple(p+radii[j]*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))))
    faces=[tuple(reversed(range(sides))),tuple(range(len(verts)-sides,len(verts)))]
    faces += [(j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i) for j in range(len(pts)-1) for i in range(sides)]
    return mesh(name,verts,faces,mat,bone,True)

def box(name,c,scale,mat,bone):
    x,y,z=c;a,b,d=[v/2 for v in scale];vv=[(x+u*a,y+v*b,z+w*d) for u,v,w in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    return mesh(name,vv,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat,bone)

# First: common body. Large sculpted head and clear segmented silhouette at RTS distance.
ell('Pelvis shell',(0,.025,.64),(.19,.135,.15),TEAM,'hips')
ell('Petiole waist',(0,.045,.79),(.105,.10,.13),JOINT,'spine')
ell('Thorax',(0,.02,1.0),(.24,.145,.235),TEAM,'spine')
ell('Rear abdomen',(0,.16,.76),(.19,.19,.22),TEAM,'hips')
ell('Neck',(0,0,1.18),(.105,.085,.12),JOINT,'head',10,5)
ell('Head carapace',(0,-.035,1.435),(.265,.22,.285),TEAM,'head',16,10)
# Forehead/clypeus shells have distinct broad planes rather than engraved microdetails.
mesh('Forehead shield',[(-.14,-.23,1.59),(0,-.274,1.65),(.14,-.23,1.59),(.105,-.271,1.44),(0,-.296,1.40),(-.105,-.271,1.44)],[(0,1,2,3,4,5)],TEAM,'head')
for side,sign in [('L',1),('R',-1)]:
    ell('Glossy eye '+side,(sign*.191,-.197,1.46),(.087,.065,.135),EYE,'head',12,8)
    tube('Curved mandible '+side,[(sign*.105,-.195,1.30),(sign*.14,-.28,1.23),(sign*.11,-.34,1.16),(sign*.035,-.34,1.21)],[.052,.048,.029,.003],TEAM,'head')
    tube('Antenna stalk '+side,[(sign*.13,-.045,1.63),(sign*.17,-.025,1.82),(sign*.24,-.065,1.99)],[.025,.023,.027],TEAM,'antenna.'+side)
    tube('Antenna elbow '+side,[(sign*.24,-.065,1.99),(sign*.27,-.15,1.98),(sign*.30,-.28,1.90),(sign*.32,-.36,1.83)],[.031,.029,.025,.017],TEAM,'antenna.'+side)
    ell('Shoulder joint '+side,(sign*.27,0,1.06),(.095,.092,.10),JOINT,'upper_arm.'+side,10,6)
    tube('Upper arm shell '+side,[(sign*.30,0,1.04),(sign*.35,-.01,.92),(sign*.39,0,.83)],[.087,.092,.064],TEAM,'upper_arm.'+side)
    ell('Elbow '+side,(sign*.39,0,.82),(.061,.060,.068),JOINT,'forearm.'+side,10,5)
    tube('Forearm shell '+side,[(sign*.40,0,.80),(sign*.43,-.01,.72),(sign*.43,-.025,.62)],[.075,.08,.047],TEAM,'forearm.'+side)
    ell('Hand '+side,(sign*.43,-.04,.59),(.063,.059,.076),TEAM,'hand.'+side,10,6)
    # Two mitten-like claw digits stay readable without costly fingers.
    for dx in [-.027,.027]:tube('Gripping claw '+side,[(sign*.43+dx,-.078,.61),(sign*.43+dx,-.105,.57),(sign*.43+dx,-.065,.545)],[.023,.023,.013],JOINT,'hand.'+side,6)
    tube('Thigh shell '+side,[(sign*.135,0,.61),(sign*.16,.025,.47),(sign*.17,0,.35)],[.095,.105,.068],TEAM,'thigh.'+side,10)
    ell('Knee '+side,(sign*.17,0,.34),(.069,.064,.07),JOINT,'shin.'+side,10,5)
    tube('Shin shell '+side,[(sign*.17,0,.33),(sign*.18,0,.22),(sign*.18,-.01,.11)],[.073,.071,.05],TEAM,'shin.'+side)
    ell('Broad foot '+side,(sign*.18,-.077,.075),(.095,.153,.075),TEAM,'foot.'+side,12,6)
    # Broad joint cuffs and toe plates add readable construction, not surface noise.
    tube('Wrist cuff '+side,[(sign*.43,-.022,.643),(sign*.43,-.024,.620)],[.052,.054],JOINT,'forearm.'+side,8)
    for j in range(2):
        q=Vector((sign*.27,-.15,1.98)).lerp(Vector((sign*.32,-.36,1.83)),(j+1)/3)
        ell('Antenna sensory segment '+side,tuple(q),(.032,.044,.036),TEAM,'antenna.'+side,8,4)
# Shared simple belt keeps the base useful as a worker.
ell('Waist belt',(0,.015,.75),(.153,.132,.053),LEATHER,'spine',12,4)
box('Belt buckle',(0,-.124,.75),(.085,.025,.064),BRONZE,'spine')

# Worker tools share the right-hand socket and are revealed by their action.
tube('Worker hammer handle',[(-.42,-.04,.63),(-.42,-.04,.28)],[.023,.025],WOOD,'tool_hammer',8)
box('Worker hammer head',(-.42,-.04,.28),(.105,.19,.10),STEEL,'tool_hammer')
box('Worker hammer striking face',(-.42,-.145,.28),(.115,.025,.11),EDGE,'tool_hammer')
tube('Worker axe handle',[(-.42,-.04,.65),(-.42,-.04,.16)],[.025,.032],WOOD,'tool_axe',8)
# Wedge blade is solid and its cutting edge faces along the swing plane.
mesh('Worker axe head',[(-.455,-.04,.24),(-.385,-.04,.24),(-.455,-.04,.09),(-.385,-.04,.09),(-.435,-.22,.29),(-.405,-.22,.29),(-.435,-.22,.04),(-.405,-.22,.04)],[(0,1,3,2),(0,4,5,1),(2,3,7,6),(4,6,7,5),(0,2,6,4),(1,5,7,3)],BLADE,'tool_axe')

# Second: warrior equipment, using the same anatomy and bone names.
role='warrior'
ell('Breastplate',(0,-.025,1.0),(.258,.167,.20),STEEL,'spine',12,7)
mesh('Chest bronze rim',[(-.22,-.142,.90),(0,-.198,.86),(.22,-.142,.90),(.22,-.147,.93),(0,-.205,.90),(-.22,-.147,.93)],[(0,1,4,5),(1,2,3,4)],BRONZE,'spine')
for side,sign in [('L',1),('R',-1)]:
    pauldron=ell('Shoulder pauldron '+side,(sign*.285,-.015,1.105),(.16,.139,.115),STEEL,'upper_arm.'+side,8,4)
    for poly in pauldron.data.polygons:poly.use_smooth=False
    tube('Pauldron bronze rim '+side,[(sign*.16,-.10,1.10),(sign*.29,-.15,1.09),(sign*.41,-.10,1.04)],[.012,.012,.012],BRONZE,'upper_arm.'+side,5)
    ell('Forearm armor '+side,(sign*.427,-.045,.725),(.09,.071,.13),STEEL,'forearm.'+side,10,5)
    ell('Knee guard '+side,(sign*.17,-.057,.35),(.09,.046,.103),STEEL,'shin.'+side,8,5)
    ell('Boot armor '+side,(sign*.18,-.015,.19),(.073,.08,.11),STEEL,'shin.'+side,10,5)
    tube('Bracer raised ridge '+side,[(sign*.427,-.111,.65),(sign*.427,-.120,.73),(sign*.413,-.098,.82)],[.012,.016,.010],EDGE,'forearm.'+side,5)
    for x in [sign*.22,sign*.35]:
        ell('Pauldron rivet '+side,(x,-.137,1.10),(.015,.010,.015),BRONZE,'upper_arm.'+side,6,3)
for j in range(3):
    z=.70-j*.075;w=.13-j*.012
    mesh('Layered groin plate', [(-w,-.14,z+.06),(w,-.14,z+.06),(w,-.165,z),(0,-.19,z-.05),(-w,-.165,z)],[(0,1,2,3,4)],STEEL,'hips')
# Sword held down in right hand; local rest tip clears the ground.
x=-.43;y=-.082
box('Sword grip',(x,y,.59),(.045,.048,.16),LEATHER,'socket_hand.R')
box('Sword bronze guard',(x,y,.51),(.21,.061,.047),BRONZE,'socket_hand.R')
mesh('Sword blade',[(x-.046,y,.49),(x,y-.024,.49),(x+.046,y,.49),(x,y+.024,.49),(x-.039,y,.17),(x,y-.023,.17),(x+.039,y,.17),(x,y+.023,.17),(x,y,.065)],[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4),(0,1,2,3)],BLADE,'socket_hand.R')
# Seat the grip inside the closed palm, with the guard below the fingers.
# Apply in bind coordinates so the corrected placement follows every hand pose.
for ob in parts:
    if ob.name.startswith('Sword '):
        for v in ob.data.vertices:
            v.co.y += .032
            v.co.z -= .025
# Quarter-turn the grip around the wrist/handle axis: fingers close from the
# side and the sword's cutting plane matches that sideways grip.
# The hand anatomy is shared; the bow's left-hand grip remains unchanged.
for ob in parts:
    if ob.name.startswith(('Hand R','Gripping claw R','Sword ')):
        for v in ob.data.vertices:
            dx=v.co.x-(-.43);dy=v.co.y-(-.04)
            v.co.x=-.43-dy
            v.co.y=-.04+dx
# Shield faces forward and moves with left forearm.
outline=[(-.22,.22),(.0,.30),(.22,.22),(.20,-.17),(0,-.34),(-.20,-.17)]
vv=[(.43+u,-.145,.68+v) for u,v in outline]+[(.43,-.215,.68)]
mesh('Shield steel face',vv,[(i,(i+1)%6,6) for i in range(6)],STEEL,'socket_hand.L')
for i in range(6):tube('Shield bronze border',[vv[i],vv[(i+1)%6]],[.018,.018],BRONZE,'socket_hand.L',6)
box('Shield team inset',(.43,-.22,.70),(.10,.018,.25),TEAM,'socket_hand.L')

# Quarter-turn the shield grip so the shield lies along the outer arm.
for ob in parts:
    if ob.name.startswith(('Hand L','Gripping claw L','Shield ')):
        for v in ob.data.vertices:
            dx=v.co.x-.43;dy=v.co.y-(-.04)
            v.co.x=.43-dy
            v.co.y=-.04+dx

# Larger equipment keeps the hand attachment fixed. The shield reaches the
# shoulder; the sword gains reach without dropping its resting tip underground.
for ob in parts:
    if ob.name.startswith('Shield '):
        for v in ob.data.vertices:
            v.co.y=-.04+(v.co.y+.04)*1.22
            v.co.z=.61+(v.co.z-.61)*1.42
    elif ob.name.startswith('Sword '):
        for v in ob.data.vertices:
            if ob.name.startswith('Sword blade'):
                v.co.z=.465+(v.co.z-.465)*1.35
                v.co.y=-.04+(v.co.y+.04)*1.30
            elif ob.name.startswith('Sword bronze guard'):
                v.co.y=-.04+(v.co.y+.04)*1.20
            # Rake the complete straight sword forward about the grip.
            dy=v.co.y+.04;dz=v.co.z-.565;c=math.cos(-.60);q=math.sin(-.60)
            v.co.y=-.04+dy*c-dz*q
            v.co.z=.565+dy*q+dz*c

# Third: archer equipment. A separate bow and quiver, without changing the rig.
role='archer'
ell('Archer leather vest',(0,-.016,.99),(.246,.155,.175),LEATHER,'spine',12,6)
box('Archer team tabard',(0,-.175,.98),(.12,.025,.26),TEAM,'spine')
# Bow extends vertically from left hand in rest pose; attack animates the whole grip.
bowpts=[(.43,.12,.22),(.43,.04,.29),(.43,-.025,.42),(.43,-.04,.60),(.43,-.025,.78),(.43,.04,.91),(.43,.12,.98)]
tube('Recurve bow',bowpts,[.015,.023,.025,.029,.025,.023,.015],WOOD,'socket_hand.L',8)
string=tube('Bow string',[bowpts[0],(.43,.12,.60),bowpts[-1]],[.004,.004,.004],STRING,'socket_hand.L',4)
string.vertex_groups['socket_hand.L'].remove(list(range(4,8)))
string.vertex_groups.new(name='bow_draw').add(list(range(4,8)),1,'REPLACE')
box('Bow grip',(.43,-.04,.60),(.057,.063,.12),LEATHER,'socket_hand.L')
tube('Back quiver',[(.12,.17,.77),(.16,.21,1.12)],[.073,.084],LEATHER,'socket_back',10)
for i in range(3):
    x=.12+i*.035;tube('Quiver arrow',[(x,.215,.94),(x+.025,.22,1.30)],[.007,.007],WOOD,'socket_back',5)
    mesh('Arrow feathers',[(x+.01,.22,1.20),(x-.017,.22,1.27),(x+.025,.22,1.30),(x+.05,.22,1.24)],[(0,1,2,3)],FEATHER,'socket_back')
# A nocked arrow is attached to the draw hand; released projectiles belong to the game.
tube('Held arrow',[(.43,.22,.62),(.43,-.48,.62)],[.007,.006],WOOD,'arrow',5)
tube('Arrow point',[(.43,-.48,.62),(.43,-.54,.62)],[.017,.001],BLADE,'arrow',5)

# Independent animation clips. All keyed bones use the same rest-axis convention (+Y).
rig.animation_data_create()
for p in rig.pose.bones:p.rotation_mode='XYZ'
def pose(name,frame,angles):
    p=rig.pose.bones[name];p.rotation_euler=angles;p.keyframe_insert('rotation_euler',frame=frame,group=name)
def reset_pose():
    for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(.001,.001,.001) if p.name.startswith('tool_') else (1,1,1)

def make_action(name,length,fn):
    reset_pose();action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame in range(1,length+2):
        t=(frame-1)/length;reset_pose();fn(t)
        for p in rig.pose.bones:
            p.keyframe_insert('rotation_euler',frame=frame,group=p.name)
            if p.name=='arrow' or p.name.startswith('tool_'):p.keyframe_insert('scale',frame=frame,group=p.name)
            if p.name in ('hips','root','bow_draw'):p.keyframe_insert('location',frame=frame,group=p.name)
    action.use_fake_user=True
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);track.mute=True
    return action

def ease(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
def curve(t,keys):
    for (a,x),(b,y) in zip(keys,keys[1:]):
        if t<=b:return x+(y-x)*ease((t-a)/(b-a))
    return keys[-1][1]
def rot(name,x=0,y=0,z=0):rig.pose.bones[name].rotation_euler=(x,y,z)
def secondary(t,amount=1):
    for side,sign in [('L',1),('R',-1)]:
        rot('antenna.'+side,.055*amount*math.sin(t*math.tau-.7+sign*.45),0,sign*.025*math.sin(t*math.tau-1))

def idle(t):
    breath=math.sin(t*math.tau)
    rot('spine',-.025+.018*breath,0,.014*breath)
    rot('head',.02-.009*breath,0,.022*math.sin(t*math.tau-.5))
    for side,sign in [('L',1),('R',-1)]:
        rot('upper_arm.'+side,-.07+.014*math.sin(t*math.tau+sign*.3),0,sign*.025)
        rot('forearm.'+side,-.16-.018*breath)
    secondary(t)

def leg_ik(side,target):
    hip=Vector(spec['thigh.'+side][0])+rig.pose.bones['hips'].location
    knee=Vector(spec['shin.'+side][0]);ankle=Vector(spec['foot.'+side][0])
    resthip=Vector(spec['thigh.'+side][0]);a=(knee-resthip).length;b=(ankle-knee).length
    v=Vector(target)-hip;d=min(v.length,a+b-.001);direction=v.normalized()
    pole=Vector((0,-1,0));bend=(pole-direction*pole.dot(direction)).normalized()
    along=(a*a-b*b+d*d)/(2*d)
    joint=hip+direction*along+bend*math.sqrt(max(0,a*a-along*along))
    upper=(knee-resthip).rotation_difference(joint-hip)
    lower=(ankle-knee).rotation_difference(hip+direction*d-joint)
    rig.pose.bones['thigh.'+side].rotation_euler=upper.to_euler()
    rig.pose.bones['shin.'+side].rotation_euler=(upper.inverted()@lower).to_euler()
    rig.pose.bones['foot.'+side].rotation_euler=lower.inverted().to_euler()

def walk(t):
    wave=math.sin(t*math.tau)
    rig.pose.bones['hips'].location=(.018*wave,0,-.025+.012*math.cos(t*math.tau*2))
    for side,sign in [('L',1),('R',-1)]:
        phase=(t+(0 if sign==1 else .5))%1
        # Grounded stance travels backward; swing clears the floor and eases into contact.
        if phase<.6:y=-.115+.23*phase/.6;lift=0
        else:
            u=(phase-.6)/.4;y=.115-.23*ease(u);lift=.070*math.sin(math.pi*u)**1.5
        leg_ik(side,(sign*.18,-.01+y,.10+lift))
        rot('upper_arm.'+side,-.07-sign*.27*wave,0,sign*.035)
        rot('forearm.'+side,-.22+.10*math.sin(t*math.tau+sign*.7))
    rot('spine',-.055,0,-.045*wave)
    rot('head',.04,0,.025*wave)
    secondary(t,1.6)

def run(t):
    wave=math.sin(t*math.tau)
    rig.pose.bones['hips'].location=(.022*wave,0,-.045+.035*(1-math.cos(t*math.tau*2)))
    for side,sign in [('L',1),('R',-1)]:
        phase=(t+(0 if sign==1 else .5))%1
        # Short ground contact and a longer high-knee swing give a flight phase.
        if phase<.40:y=-.17+.34*phase/.40;lift=0
        else:
            u=(phase-.40)/.60;y=.17-.34*ease(u);lift=.135*math.sin(math.pi*u)**1.3
        leg_ik(side,(sign*.18,-.01+y,.10+lift))
        rot('upper_arm.'+side,-.30-sign*.32*wave,0,sign*.06)
        rot('forearm.'+side,-.62+.16*math.sin(t*math.tau+sign*.65))
    rot('spine',-.17,0,-.075*wave)
    rot('head',.12,0,.04*wave)
    secondary(t,2.0)

def carry(t):
    idle(t)
    for side,sign in [('L',1),('R',-1)]:
        arm_ik(side,(sign*.18,-.31,.88+.004*math.sin(t*math.tau)),(sign,0,-.2))

def attack_sword(t):
    idle(t)
    def strike_curve(t,keys):
        for (a,x),(b,y) in zip(keys,keys[1:]):
            if t<=b:
                u=max(0,min(1,(t-a)/(b-a)))
                # Carry velocity through impact rather than easing to a stop.
                return x+(y-x)*(u if a>=.44 and b<=.66 else ease(u))
        return keys[-1][1]
    # Cock the hand above the shoulder with a folded elbow. The shoulder leads
    # the downstroke, then the elbow opens through the existing .55 hit event.
    shoulder=strike_curve(t,[(0,-.07),(.24,-1.45),(.36,-1.60),(.48,-1.58),(.55,-.95),(.62,-.20),(1,-.07)])
    elbow=strike_curve(t,[(0,-.16),(.24,-1.48),(.36,-1.62),(.48,-1.62),(.55,-.12),(.62,-.25),(1,-.16)])
    twist=strike_curve(t,[(0,0),(.30,-.22),(.46,-.24),(.55,.20),(.62,.24),(1,0)])
    lean=strike_curve(t,[(0,-.025),(.34,.035),(.57,-.12),(.64,-.06),(1,-.025)])
    spread=strike_curve(t,[(0,0),(.27,-.25),(.40,-.25),(.58,-.09),(1,0)])
    rot('upper_arm.R',shoulder,spread,-.035)
    rot('forearm.R',elbow)
    rot('hand.R',strike_curve(t,[(0,0),(.34,-.12),(.55,.08),(.62,.09),(1,0)]))
    rot('spine',lean,0,twist)
    rot('head',-lean*.45,0,-twist*.55)
    rot('upper_arm.L',-.07-.30*math.sin(math.pi*t),0,.06)
    rot('forearm.L',-.16-.18*math.sin(math.pi*t))
    secondary(t,1.8)

def attack_unarmed(t):
    idle(t)
    reach=curve(t,[(0,0),(.30,-.12),(.55,1),(.65,.8),(1,0)])
    rot('upper_arm.R',-.07-1.30*reach,0,-.12*reach)
    rot('forearm.R',-.16-.35*math.sin(math.pi*t))
    rot('spine',-.025-.08*reach,0,.14*reach)
    rot('upper_arm.L',-.35*math.sin(math.pi*t))

def arm_ik(side,target,pole):
    shoulder=Vector(spec['upper_arm.'+side][0]);elbow=Vector(spec['forearm.'+side][0]);hand=Vector(spec['hand.'+side][0])
    a=(elbow-shoulder).length;b=(hand-elbow).length;v=Vector(target)-shoulder
    distance=max(.025,min(v.length,a+b-.001));direction=v.normalized()
    bend=Vector(pole)-direction*Vector(pole).dot(direction);bend.normalize()
    along=(a*a-b*b+distance*distance)/(2*distance)
    joint=shoulder+direction*along+bend*math.sqrt(max(0,a*a-along*along))
    end=shoulder+direction*distance
    upper=(elbow-shoulder).rotation_difference(joint-shoulder)
    lower=(hand-elbow).rotation_difference(end-joint)
    rig.pose.bones['upper_arm.'+side].rotation_euler=upper.to_euler()
    rig.pose.bones['forearm.'+side].rotation_euler=(upper.inverted() @ lower).to_euler()
    rig.pose.bones['hand.'+side].rotation_euler=lower.inverted().to_euler()

def attack_bow(t):
    lift=ease(min(t/.23,1,(1-t)/.20))
    draw=ease((t-.18)/.36) if t<.65 else 1-ease((t-.65)/.075)
    left=Vector(spec['hand.L'][0]).lerp(Vector((.14,-.38,1.10)),lift)
    right=Vector(spec['hand.R'][0]).lerp(Vector((.14,-.22+.11*draw,1.10)),lift)
    arm_ik('L',left,(1,.3,0));arm_ik('R',right,(-1,.8,0))
    rig.pose.bones['bow_draw'].location.y=.12*draw
    if .65<t<.93:rig.pose.bones['arrow'].scale=(.001,.001,.001)
    rig.pose.bones['head'].rotation_euler.z=.10*lift
    secondary(t,.7)
    recoil=math.sin((t-.65)*45)*math.exp(-(t-.65)*20) if t>.65 else 0
    rig.pose.bones['upper_arm.L'].rotation_euler.x+=.06*recoil

def work(t,chopping=False):
    idle(t)
    rig.pose.bones['tool_axe' if chopping else 'tool_hammer'].scale=(1,1,1)
    # Repeating work cycle: lift, drive into the target in front, then recoil.
    shoulder=curve(t,[(0,-.55),(.32,-1.50 if chopping else -1.15),(.44,-1.50 if chopping else -1.15),(.56,-.92),(.64,-.70),(1,-.55)])
    elbow=curve(t,[(0,-.60),(.35,-1.25 if chopping else -.95),(.45,-1.25 if chopping else -.95),(.56,-.10),(.65,-.30),(1,-.60)])
    rot('upper_arm.R',shoulder,-.10,-.06)
    rot('forearm.R',elbow)
    rot('hand.R',-.10*math.sin(math.pi*t)**2)
    twist=math.sin(t*math.tau)*(.14 if chopping else .05)
    rot('spine',-.06-.08*math.sin(math.pi*t)**2,0,-twist)
    rot('head',.09,0,twist*.5)
    rot('upper_arm.L',-.22,0,.08)
    rot('forearm.L',-.48)
    secondary(t,1.4)

def hit(t):
    idle(t)
    recoil=curve(t,[(0,0),(.18,1),(.42,.65),(1,0)])
    rot('spine',.28*recoil,0,-.08*recoil)
    rot('head',-.16*recoil)
    rot('upper_arm.R',.18*recoil)
    rot('upper_arm.L',.18*recoil)
def death(t):
    rig.pose.bones['root'].rotation_euler.x=ease(t/.72)*1.45
    rig.pose.bones['hips'].location.z=-.02*min(t*2,1)

idle_action=make_action('idle',48,idle)
make_action('walk',24,walk);make_action('run',18,run);make_action('build',24,lambda t:work(t));make_action('chop',30,lambda t:work(t,True));make_action('carry',48,carry);make_action('attack_unarmed',24,attack_unarmed);make_action('attack_sword',18,attack_sword);make_action('attack_bow',40,attack_bow);make_action('hit',16,hit);make_action('death',32,death)
rig.animation_data.action=idle_action;scene.frame_set(1);scene.frame_end=49
for ob in parts:ob.hide_render=ob['role'] not in ('base','warrior')
create_stage(C,collections['Studio'])
# Character-scale lights retain the same warm/cool art direction at shorter distances.
for ob in collections['Studio'].objects:
    if ob.type=='LIGHT':
        ob.location*=.36
        ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
        ob.data.size=2
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
scene['character_contract']='Shared rig; +Z up in Blender, -Y forward; feet at zero; named animation actions and equipment roles.'
stats={'objects':len(bpy.data.objects),'meshes':len(parts),'materials':len(bpy.data.materials),'blender':bpy.app.version_string,'collections':list(collections)}
(A/'model-stats.json').write_text(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
