"""Ant Hunter: shared ant anatomy with spear, scouting armor and distinct thrust/charge clips."""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector, Euler
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Build in a separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples']
scene=bpy.context.scene
scene.render.fps=24
collections={n:bpy.data.collections.new(n) for n in ['Base anatomy','Hunter equipment','Rig','Studio']}
for c in collections.values():scene.collection.children.link(c)

def material(name,color,metal=0,rough=.6):
    if color in P:rgb=P[color]['representative']['linear_rgb']
    else:
        v=[int(color[i:i+2],16)/255 for i in [1,3,5]]
        rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
TEAM=material('TC_TeamColor','#A04B31',.05,.50)
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
    ob=bpy.data.objects.new(name,data);collections[{'base':'Base anatomy','hunter':'Hunter equipment'}[role]].objects.link(ob)
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

# Dedicated Hunter gear: open-faced brow, light cuirass, one broad shoulder and spear.
role='hunter'
ell('Hunter fitted cuirass',(0,-.022,.99),(.25,.157,.185),LEATHER,'spine',12,6)
mesh('Hunter breastplate',[(-.20,-.135,1.13),(0,-.18,1.18),(.20,-.135,1.13),(.18,-.17,.91),(0,-.198,.88),(-.18,-.17,.91)],[(0,1,4,5),(1,2,3,4)],STEEL,'spine')
for side,sign in [('L',1),('R',-1)]:
    ell('Hunter bracer '+side,(sign*.425,-.044,.725),(.087,.075,.115),STEEL,'forearm.'+side,8,5)
    ell('Hunter knee cap '+side,(sign*.17,-.053,.35),(.083,.043,.084),STEEL,'shin.'+side,8,4)
    tube('Hunter shin ridge '+side,[(sign*.18,-.065,.29),(sign*.18,-.075,.16)],[.024,.023],EDGE,'shin.'+side,6)
    tube('Helmet brow '+side,[(sign*.03,-.25,1.64),(sign*.14,-.24,1.65),(sign*.25,-.14,1.61)],[.027,.035,.022],STEEL,'head',6)
pauldron=ell('Hunter left shoulder mantle',(.30,-.012,1.11),(.18,.15,.105),STEEL,'upper_arm.L',8,4)
for f in pauldron.data.polygons:f.use_smooth=False
for i in range(3):
    y=.03+i*.085
    tube('Hunter swept helmet crest',[(0,y,1.68),(0,y+.055,1.83-i*.045),(0,y+.10,1.84-i*.045)],[.04,.026,.002],BRONZE,'head',5)
# Short offhand buckler leaves the long spear as the dominant silhouette.
ell('Hunter oval buckler',(.45,-.14,.73),(.17,.045,.23),STEEL,'socket_hand.L',10,5)
ell('Hunter buckler boss',(.45,-.193,.73),(.06,.024,.065),BRONZE,'socket_hand.L',8,4)
box('Hunter team belt tab',(0,-.147,.65),(.11,.025,.22),TEAM,'hips')
# Spear is upright in bind coordinates, gripped through the right palm; +Z is its axis.
x=-.43;y=-.055
zlo=.10;zhi=1.72
tube('Hunter ash spear haft',[(x,y,zlo),(x,y,zhi)],[.024,.022],WOOD,'socket_hand.R',8)
for z in [.49,.55,.61,.67]:tube('Hunter spear grip',[(x,y,z),(x,y,z+.04)],[.032,.032],LEATHER,'socket_hand.R',8)
tube('Hunter spear socket',[(x,y,1.61),(x,y,1.76)],[.045,.038],BRONZE,'socket_hand.R',8)
mesh('Hunter leaf spearhead',[(x,y,2.08),(x-.115,y,1.83),(x,y-.032,1.72),(x+.115,y,1.83),(x,y+.032,1.72)],[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(1,4,3,2)],BLADE,'socket_hand.R')
tube('Hunter spear butt ferrule',[(x,y,.10),(x,y,.18)],[.032,.032],STEEL,'socket_hand.R',8)

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

# Retain the proven gait, but hold the spear coherently across all locomotion clips.
base_idle,base_walk,base_run=idle,walk,run

def spear_hand(target,tilt):
    arm_ik('R',target,(-1,.2,-.2))
    wrist=rig.pose.bones['hand.R']
    orientation=Euler((tilt,0,0),'XYZ').to_quaternion()
    wrist.rotation_euler=(wrist.rotation_euler.to_quaternion() @ orientation).to_euler()

def hunter_idle(t):
    base_idle(t)
    spear_hand((-.32,-.15,.86),.24+.025*math.sin(t*math.tau))
    rot('forearm.L',-.42)

def hunter_walk(t):
    base_walk(t)
    spear_hand((-.32,-.15+.025*math.sin(t*math.tau),.89),.33)
    rot('forearm.L',-.42)

def hunter_run(t):
    base_run(t)
    spear_hand((-.32,-.20+.015*math.sin(t*math.tau),.98),.85)
    rot('forearm.L',-.72)

def hunter_charge(t):
    base_run(t)
    rot('spine',-.25,0,-.025*math.sin(t*math.tau))
    spear_hand((-.29,-.27,1.02),1.82)
    rot('forearm.L',-.82)

def attack_spear(t):
    hunter_idle(t)
    lift=curve(t,[(0,0),(.25,1),(.80,1),(1,0)])
    # Linear travel through contact at .55, followed by a short overshoot/recovery.
    keys=[(0,0),(.28,-.06),(.43,-.06),(.55,.24),(.62,.28),(.79,.04),(1,0)]
    reach=0
    for (a,x),(b,y) in zip(keys,keys[1:]):
        if t<=b:
            u=max(0,min(1,(t-a)/(b-a)));reach=x+(y-x)*(u if .43<=a and b<=.62 else ease(u));break
    rot('spine',-.025-.06*lift,0,.06*lift)
    spear_hand((-.30,-.15-reach,.86+.14*lift),.24+1.30*lift)
    rot('forearm.L',-.42-.2*lift)
    secondary(t,1.2)

idle_action=make_action('idle',48,hunter_idle)
make_action('walk',24,hunter_walk);make_action('run',18,hunter_run)
make_action('charge',18,hunter_charge);make_action('carry',48,hunter_idle)
make_action('attack_spear',24,attack_spear);make_action('hit',16,hit);make_action('death',32,death)
rig.animation_data.action=idle_action;scene.frame_set(1);scene.frame_end=49
for ob in parts:ob.hide_render=False
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
