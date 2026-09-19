"""The approved upright forest ant company, with six equipment variants.

The established contact-timed biped rig is retained. New natural-material gear,
broader anatomy and ownership surfaces follow the forest-warfare reference.
"""
from pathlib import Path
A=Path(__file__).resolve().parent
exec(compile((A/'foundation.py').read_text(),str(A/'foundation.py'),'exec'))

def leaf_plate(name,start,end,width,mat,bone):
    a,b=Vector(start),Vector(end);d=b-a;side=Vector((1,0,0));vs=[]
    for j in range(7):
        t=j/6;w=width*max(.015,math.sin(math.pi*t))**.52
        p=a+d*t;vs.extend([tuple(p-side*w),tuple(p+Vector((0,-.035,0))),tuple(p+side*w)])
    fs=[(j*3+i,j*3+i+1,(j+1)*3+i+1,(j+1)*3+i) for j in range(6) for i in range(2)]
    ob=mesh(name,vs,fs,mat,bone)
    # Ownership leaves have actual thickness, retaining a clean silhouette.
    solid=ob.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.015
    tube(name+' midrib',[start,tuple(a.lerp(b,.5)+Vector((0,-.045,0))),end],[.010,.009,.003],mat,bone,5)
    return ob

def armor(role_name,heavy=False):
    global role
    role=role_name
    ell('Layered acorn cuirass',(0,-.025,1.0),(.30,.191,.225),STEEL,'spine',12,7)
    leaf_plate('Red chest leaf',(0,-.202,1.20),(0,-.213,.79),.235,TEAM,'spine')
    for side,sign in [('L',1),('R',-1)]:
        ell('Acorn shoulder shell '+side,(sign*.31,-.008,1.105),(.20 if heavy else .16,.16,.15),WOOD,'upper_arm.'+side,12,6)
        ell('Red shoulder leaf '+side,(sign*.31,-.04,1.14),(.19 if heavy else .155,.155,.105),TEAM,'upper_arm.'+side,12,6)
        tube('Bound forearm guard '+side,[(sign*.42,-.013,.78),(sign*.43,-.025,.65)],[.102,.078],WOOD,'forearm.'+side,10)
        ell('Acorn knee plate '+side,(sign*.17,-.072,.345),(.10,.053,.10),WOOD,'shin.'+side,10,6)
    if heavy:
        ell('Bark brow helmet',(0,.0,1.61),(.306,.23,.14),STEEL,'head',14,7)
        leaf_plate('Red helmet crest',(0,-.24,1.72),(0,-.28,1.42),.12,TEAM,'head')

def seed_shield():
    # Oval acorn shell with a central red leaf; no heraldic symbol or metal rim.
    ell('Acorn shield shell',(.45,-.14,.76),(.32,.085,.41),WOOD,'socket_hand.L',16,8)
    ell('Acorn shield inset',(.45,-.218,.76),(.264,.035,.35),STEEL,'socket_hand.L',14,7)
    leaf_plate('Shield red leaf',(.45,-.256,1.08),(.45,-.258,.43),.20,TEAM,'socket_hand.L')
    for ob in parts:
        if ob['role']==role and ob.name.startswith(('Acorn shield','Shield red')):
            for v in ob.data.vertices:
                dx=v.co.x-.43;dy=v.co.y+.04
                v.co.x=.43-dy;v.co.y=-.04+dx

def wooden_sword():
    x,y=-.43,-.055
    tube('Bound sword handle',[(x,y,.69),(x,y,.49)],[.043,.043],LEATHER,'socket_hand.R',8)
    box('Wood sword crossguard',(x,y,.49),(.27,.10,.07),WOOD,'socket_hand.R')
    vs=[(x-.105,y-.027,.45),(x+.105,y-.027,.45),(x+.09,y-.027,.08),(x,y-.02,-.05),(x-.09,y-.027,.08),(x,y+.058,.29)]
    ob=mesh('Heavy hardwood sword',vs,[(0,1,2,3,4),(0,5,1),(1,5,2),(2,5,3),(3,5,4),(4,5,0)],BLADE,'socket_hand.R')
    for ob in parts:
        if ob.name.startswith(('Bound sword','Wood sword','Heavy hardwood')):
            for v in ob.data.vertices:
                dy=v.co.y-y;dz=v.co.z-.59;c=math.cos(-.65);s=math.sin(-.65)
                v.co.y=y+dy*c-dz*s;v.co.z=.59+dy*s+dz*c

# Worker: a protective short red leaf apron, not a soldier's full suit.
role='base'
leaf_plate('Worker ownership apron',(0,-.161,1.08),(0,-.16,.69),.19,TEAM,'spine')
tube('Worker root-fibre belt',[(-.17,-.10,.78),(0,-.17,.77),(.17,-.10,.78)],[.025,.025,.025],BRONZE,'spine',6)

armor('warrior',True);seed_shield();wooden_sword()

role='archer'
ell('Archer seed vest',(0,-.02,1.0),(.285,.17,.20),LEATHER,'spine',12,7)
leaf_plate('Archer red mantle',(0,-.191,1.18),(0,-.19,.77),.25,TEAM,'spine')
for side,sign in [('L',1),('R',-1)]:ell('Archer shoulder leaf '+side,(sign*.29,-.02,1.105),(.135,.125,.07),TEAM,'upper_arm.'+side,10,5)
bowpts=[(.43,.12,.18),(.43,.04,.27),(.43,-.025,.42),(.43,-.04,.60),(.43,-.025,.80),(.43,.04,.98),(.43,.12,1.05)]
tube('Bound twig bow',bowpts,[.022,.030,.030,.035,.03,.03,.016],WOOD,'socket_hand.L',10)
string=tube('Bow string',[bowpts[0],(.43,.12,.60),bowpts[-1]],[.004,.004,.004],STRING,'socket_hand.L',4)
string.vertex_groups['socket_hand.L'].remove(list(range(4,8)));string.vertex_groups.new(name='bow_draw').add(list(range(4,8)),1,'REPLACE')
tube('Bark quiver',[(.12,.18,.76),(.16,.23,1.18)],[.08,.10],WOOD,'socket_back',10)
for i in range(3):
    x=.12+i*.035;tube('Quiver thorn arrow',[(x,.245,.98),(x+.025,.25,1.40)],[.009,.009],WOOD,'socket_back',6)
    mesh('Arrow leaf fletching',[(x+.01,.25,1.28),(x-.025,.25,1.35),(x+.025,.25,1.40),(x+.06,.25,1.33)],[(0,1,2,3)],FEATHER,'socket_back')
tube('Held arrow',[(.43,.22,.62),(.43,-.48,.62)],[.008,.006],WOOD,'arrow',5)
tube('Arrow thorn point',[(.43,-.48,.62),(.43,-.56,.62)],[.021,.001],BLADE,'arrow',6)

armor('hunter')
tube('Long hunter twig spear',[(-.43,-.035,.18),(-.43,-.035,.62),(-.43,-.035,2.10)],[.035,.035,.026],WOOD,'socket_hand.R',10)
mesh('Hunter thorn spearhead',[(-.53,-.035,2.07),(-.43,-.09,2.16),(-.33,-.035,2.07),(-.43,.025,2.16),(-.43,-.035,2.57)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],BLADE,'socket_hand.R')
for z in (1.96,2.01,2.06):tube('Spearhead binding',[(-.43,-.035,z),(-.43,-.035,z+.025)],[.046,.046],BRONZE,'socket_hand.R',10)
ell('Hunter acorn buckler',(.46,-.13,.73),(.20,.08,.26),WOOD,'socket_hand.L',12,6)
leaf_plate('Hunter buckler leaf',(.46,-.21,.94),(.46,-.22,.52),.14,TEAM,'socket_hand.L')

armor('bombardier',True)
for x in (-.19,.19):tube('Mortar carrier harness',[(x,-.17,.90),(x,-.13,1.18),(x,.22,1.15)],[.035,.035,.035],LEATHER,'spine',7)
# A hollow seed shell. The front aperture is real geometry with an interior.
pts=[(0,.34,.87),(0,.26,1.15),(0,.12,1.46),(0,-.13,1.72)]
barrel=tube('Back mounted seed mortar',pts,[.25,.34,.32,.23],WOOD,'mortar',14)
# Remove its muzzle cap so the opening stays dark at every angle.
bm=bmesh.new();bm.from_mesh(barrel.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[1]],context='FACES');bm.to_mesh(barrel.data);bm.free()
tube('Mortar inner bore',[(0,-.129,1.721),(0,.09,1.45)],[.175,.12],JOINT,'mortar',14)
for x in (-.30,.30):tube('Mortar cradle strut',[(x,.25,.8),(x,.18,1.42)],[.04,.04],WOOD,'spine',8)
for i in range(3):ell('Seed ammunition belt',(-.18+i*.18,.18,.64),(.09,.085,.105),WOOD,'hips',8,5)

armor('marshal',True)
for side,sign in [('L',1),('R',-1)]:
    ell('Marshal broad shoulder guard '+side,(sign*.34,.005,1.14),(.225,.18,.155),TEAM,'upper_arm.'+side,12,7)
    for j in range(3):tube('Marshal shoulder thorn '+side,[(sign*(.22+j*.09),.03,1.23),(sign*(.20+j*.11),.06,1.40)],[.05,.002],BLADE,'upper_arm.'+side,6)
leaf_plate('Marshal short leaf cloak',(0,.18,1.20),(0,.27,.53),.32,TEAM,'spine')
tube('Marshal mace handle',[(-.43,-.05,.63),(-.43,-.20,.95),(-.43,-.29,1.22)],[.044,.044,.04],WOOD,'socket_hand.R',10)
ell('Marshal seed mace head',(-.43,-.29,1.27),(.22,.22,.25),WOOD,'socket_hand.R',12,8)
for i in range(8):
    a=i*math.tau/8;tube('Mace thorn',[(-.43+math.cos(a)*.18,-.29+math.sin(a)*.18,1.29),(-.43+math.cos(a)*.33,-.29+math.sin(a)*.33,1.32)],[.057,.001],BLADE,'socket_hand.R',7)
seed_shield()

exec(compile((A/'animation.py').read_text(),str(A/'animation.py'),'exec'))

def carry_walk(t):
    walk(t)
    for side,sign in [('L',1),('R',-1)]:arm_ik(side,(sign*.18,-.31,.88),(sign,0,-.2))
def carry_run(t):
    run(t)
    for side,sign in [('L',1),('R',-1)]:arm_ik(side,(sign*.18,-.31,.88),(sign,0,-.2))
def attack_spear(t):
    idle(t);v=curve(t,[(0,0),(.33,-.2),(.47,-.2),(.55,1),(.65,.8),(1,0)])
    rot('upper_arm.R',-.1-1.45*v,0,-.08);rot('forearm.R',-.15-.35*v)
    rot('spine',-.03-.07*v,0,.1*v);secondary(t,1.5)
def attack_mortar(t):
    idle(t);load=math.sin(math.pi*t);kick=math.sin((t-.65)*32)*math.exp(-(t-.65)*15) if t>.65 else 0
    rig.pose.bones['mortar'].location=(0,.12*kick,-.17*kick)
    rot('spine',-.06*load+.17*kick);rot('upper_arm.L',-.38*load);rot('upper_arm.R',-.38*load)
    rot('forearm.L',-.65*load);rot('forearm.R',-.65*load);secondary(t,1.5)
def charge(t):
    run(t);rot('spine',-.30,0,-.04*math.sin(t*math.tau));rot('upper_arm.R',-1.20);rot('forearm.R',-.45)
def cast(t):
    idle(t);v=curve(t,[(0,0),(.35,.7),(.68,1),(.82,.55),(1,0)])
    rot('upper_arm.L',-1.5*v,0,.20*v);rot('forearm.L',-.5*v);rot('head',-.12*v);secondary(t,1.4)

make_action('carry_walk',24,carry_walk);make_action('carry_run',18,carry_run)
make_action('attack_spear',24,attack_spear);make_action('attack_mortar',36,attack_mortar)
make_action('attack_mace',24,attack_sword);make_action('charge',18,charge);make_action('cast',40,cast)
exec(compile((A/'finish.py').read_text(),str(A/'finish.py'),'exec'))
