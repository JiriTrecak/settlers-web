"""Shared articulated ant with base, warrior and archer equipment and reusable actions."""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector, Euler
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[3]/'experiments/building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Build in a separate background Blender process')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples']
scene=bpy.context.scene
scene.render.fps=24
collections={n:bpy.data.collections.new(n) for n in ['Base anatomy','Warrior equipment','Archer equipment','Hunter equipment','Bombardier equipment','Marshal equipment','Rig','Studio']}
for c in collections.values():scene.collection.children.link(c)

def material(name,color,metal=0,rough=.6):
    if color in P:rgb=P[color]['representative']['linear_rgb']
    else:
        v=[int(color[i:i+2],16)/255 for i in [1,3,5]]
        rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
TEAM=material('TC_TeamColor','#ad2731',0,.68)
CHITIN=material('Natural mahogany chitin','#903c27',0,.52)
JOINT=material('Dark flexible joints','#302520',0,.78)
SHELL=material('Warm shell highlights','#aa4d29',.05,.47)
EYE=material('Obsidian compound eyes','#101416',.25,.19)
STEEL=material('Blue charcoal armor','#765335',0,.78)
EDGE=material('Armor edge steel','#b68a51',0,.75)
BRONZE=material('Antique bronze trim','#b39a70',0,.87)
LEATHER=material('Leather harness','#423124',0,.85)
BLADE=material('Blade steel','#c49452',0,.65)
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
spec['mortar']=((0,.26,1.15),'spine')
spec['socket_muzzle']=((0,-.13,1.72),'mortar')
spec['socket_back']=((0,.13,.94),'spine')
spec['mandible.L']=((.105,-.195,1.30),'head')
spec['mandible.R']=((-.105,-.195,1.30),'head')
rig['speechRig']={'left':'mandible.L','right':'mandible.R','axis':'z','angle':.24}
for name,(pos,parent) in spec.items():
    b=arm.edit_bones.new(name);b.head=pos;b.tail=Vector(pos)+Vector((0,.10,0))
    if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
parts=[];role='base'

def mesh(name,verts,faces,mat,bone,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    ob=bpy.data.objects.new(name,data);collections[{'base':'Base anatomy','warrior':'Warrior equipment','archer':'Archer equipment','hunter':'Hunter equipment','bombardier':'Bombardier equipment','marshal':'Marshal equipment'}[role]].objects.link(ob)
    data.materials.append(mat)
    # Quiet painted occlusion on each shell/tool, independent of player tint.
    # Vertex albedo avoids additional texture samplers on every animated unit.
    color=data.color_attributes.new(name='ForestPaint',type='FLOAT_COLOR',domain='CORNER')
    data.color_attributes.active_color=color
    low=min(v.co.z for v in data.vertices);span=max(.001,max(v.co.z for v in data.vertices)-low)
    for loop in data.loops:
        v=data.vertices[loop.vertex_index].co
        tone=.80+.20*min(1,(v.z-low)/span*1.4)
        if mat in (WOOD,STEEL,BLADE):tone*=.96+.04*math.sin(v.x*15+v.z*2)
        color.data[loop.index].color=(tone,tone,tone,1)
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
ell('Pelvis shell',(0,.025,.64),(.19,.135,.15),CHITIN,'hips')
ell('Petiole waist',(0,.045,.79),(.105,.10,.13),JOINT,'spine')
ell('Thorax',(0,.02,1.0),(.28,.17,.235),CHITIN,'spine')
ell('Rear abdomen',(0,.16,.76),(.19,.19,.22),CHITIN,'hips')
ell('Neck',(0,0,1.18),(.105,.085,.12),JOINT,'head',10,5)
ell('Head carapace',(0,-.035,1.435),(.295,.235,.285),CHITIN,'head',16,10)
# Forehead/clypeus shells have distinct broad planes rather than engraved microdetails.
mesh('Forehead shield',[(-.14,-.23,1.59),(0,-.274,1.65),(.14,-.23,1.59),(.105,-.271,1.44),(0,-.296,1.40),(-.105,-.271,1.44)],[(0,1,2,3,4,5)],TEAM,'head')
for side,sign in [('L',1),('R',-1)]:
    ell('Glossy eye '+side,(sign*.191,-.197,1.46),(.095,.072,.14),EYE,'head',12,8)
    tube('Curved mandible '+side,[(sign*.105,-.195,1.30),(sign*.14,-.28,1.23),(sign*.11,-.34,1.16),(sign*.035,-.34,1.21)],[.052,.048,.029,.003],CHITIN,'mandible.'+side)
    tube('Antenna stalk '+side,[(sign*.13,-.045,1.63),(sign*.17,-.025,1.82),(sign*.24,-.065,1.99)],[.025,.023,.027],CHITIN,'antenna.'+side)
    tube('Antenna elbow '+side,[(sign*.24,-.065,1.99),(sign*.27,-.15,1.98),(sign*.30,-.28,1.90),(sign*.32,-.36,1.83)],[.031,.029,.025,.017],CHITIN,'antenna.'+side)
    ell('Shoulder joint '+side,(sign*.27,0,1.06),(.095,.092,.10),JOINT,'upper_arm.'+side,10,6)
    tube('Upper arm shell '+side,[(sign*.30,0,1.04),(sign*.35,-.01,.92),(sign*.39,0,.83)],[.105,.108,.075],CHITIN,'upper_arm.'+side)
    ell('Elbow '+side,(sign*.39,0,.82),(.061,.060,.068),JOINT,'forearm.'+side,10,5)
    tube('Forearm shell '+side,[(sign*.40,0,.80),(sign*.43,-.01,.72),(sign*.43,-.025,.62)],[.090,.093,.058],CHITIN,'forearm.'+side)
    ell('Hand '+side,(sign*.43,-.04,.59),(.063,.059,.076),CHITIN,'hand.'+side,10,6)
    # Two mitten-like claw digits stay readable without costly fingers.
    for dx in [-.027,.027]:tube('Gripping claw '+side,[(sign*.43+dx,-.078,.61),(sign*.43+dx,-.105,.57),(sign*.43+dx,-.065,.545)],[.023,.023,.013],JOINT,'hand.'+side,6)
    tube('Thigh shell '+side,[(sign*.135,0,.61),(sign*.16,.025,.47),(sign*.17,0,.35)],[.095,.105,.068],CHITIN,'thigh.'+side,10)
    ell('Knee '+side,(sign*.17,0,.34),(.069,.064,.07),JOINT,'shin.'+side,10,5)
    tube('Shin shell '+side,[(sign*.17,0,.33),(sign*.18,0,.22),(sign*.18,-.01,.11)],[.073,.071,.05],CHITIN,'shin.'+side)
    ell('Broad foot '+side,(sign*.18,-.077,.075),(.108,.17,.075),CHITIN,'foot.'+side,12,6)
    # Broad joint cuffs and toe plates add readable construction, not surface noise.
    tube('Wrist cuff '+side,[(sign*.43,-.022,.643),(sign*.43,-.024,.620)],[.052,.054],JOINT,'forearm.'+side,8)
    for j in range(2):
        q=Vector((sign*.27,-.15,1.98)).lerp(Vector((sign*.32,-.36,1.83)),(j+1)/3)
        ell('Antenna sensory segment '+side,tuple(q),(.032,.044,.036),CHITIN,'antenna.'+side,8,4)
# Shared simple belt keeps the base useful as a worker.
ell('Waist belt',(0,.015,.75),(.153,.132,.053),LEATHER,'spine',12,4)
box('Belt buckle',(0,-.124,.75),(.085,.025,.064),BRONZE,'spine')

# Worker tools share the right-hand socket and are revealed by their action.
tube('Worker hammer handle',[(-.42,-.04,.63),(-.42,-.04,.28)],[.023,.025],WOOD,'tool_hammer',8)
box('Worker hammer head',(-.42,-.04,.28),(.105,.19,.10),STEEL,'tool_hammer')
box('Worker hammer striking face',(-.42,-.145,.28),(.115,.025,.11),EDGE,'tool_hammer')
# Long timber haft, dark iron socket, and two flared crescent cutting blades.
tube('Worker axe handle',[(-.43,-.025,.69),(-.43,-.025,.40),(-.43,-.025,-.10)],[.032,.029,.035],WOOD,'tool_axe',10)
for z in [.60,.55,.48,.43]:
    tube('Worker axe grip band',[(-.43,-.025,z+.018),(-.43,-.025,z-.018)],[.035,.035],LEATHER,'tool_axe',8)
box('Worker axe iron eye',(-.43,-.025,-.01),(.12,.10,.17),STEEL,'tool_axe')
# Each blade broadens toward a curved edge and narrows into the central eye.
profile=[(.045,.055),(.12,.09),(.24,.16),(.30,.20),(.33,.10),(.345,0),(.33,-.10),(.30,-.20),(.24,-.16),(.12,-.09),(.045,-.055)]
for sign in [-1,1]:
    vv=[(-.43+sign*x,-.025+y,-.01+z) for y in [-.033,.033] for x,z in profile]
    n=len(profile)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('Worker axe crescent blade',vv,faces,STEEL,'tool_axe')
    # Broad polished bevel follows the outer cutting arc on both faces.
    for y in [-.034,.034]:
        vv=[]
        for i in range(3,8):
            x,z=profile[i];vv.extend([(-.43+sign*x,-.025+y,-.01+z),(-.43+sign*(x-.025),-.025+y*1.12,-.01+z*.90)])
        mesh('Worker axe honed edge',vv,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(4)],BLADE,'tool_axe')
# Align the cutting blades with the horizontal swing rather than their flats.
for ob in parts:
    if ob.name.startswith(('Worker axe crescent blade','Worker axe honed edge','Worker axe iron eye')):
        for v in ob.data.vertices:
            dx=v.co.x+.43;dy=v.co.y+.025
            v.co.x=-.43-dy;v.co.y=-.025+dx
# Upright hammer head for striking a wall.
for ob in parts:
    if ob.name.startswith('Worker hammer'):
        for v in ob.data.vertices:
            v.co.x=-.42-(v.co.x+.42)
            v.co.z=.60-(v.co.z-.60)

