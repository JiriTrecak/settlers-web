"""Editable Lumberjack Workshop: original mesh reconstruction from one image, not a billboard.

Run through building-studio/studio.py build so this recipe owns an isolated Blender process.
Named collections retain all parts for manual editing. Back and interior are inferred.
"""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector, Matrix

ASSET = Path(__file__).resolve().parent
sys.path.insert(0, str(ASSET.parents[2] / 'building-studio'))
from stage import create_stage

CONFIG = json.loads((ASSET / 'asset.json').read_text())
PALETTE = json.loads((ASSET / 'palette.json').read_text())['samples']
random.seed(CONFIG['seed'])
# The launcher guarantees a new background process; never run a reset in a user's session.
if not bpy.app.background:
    raise RuntimeError('Build this recipe using the studio CLI, in a separate background Blender process.')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Lumberjack Workshop · reference study'


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


COLS = {n: collection(n) for n in ['01 · Stone feet', '02 · Timber frame', '03 · Roof', '04 · Ironwork', '05 · Axe sign', '06 · Interior', '07 · Lanterns', '08 · Team flag', '09 · Studio']}
CURRENT=COLS['01 · Stone feet']
def rgb(h):
    c = [int(h.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c]


def mat(name, key, factor=1, rough=.72, metal=0, grain=False):
    color = PALETTE[key]['representative']['linear_rgb'] if key in PALETTE else rgb(key)
    color = [min(1, v*factor) for v in color]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    m['reference_sample'] = key
    m['albedo_tuning'] = factor
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if grain:
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 3.8
        tex.inputs['Detail'].default_value = 3
        coord = nodes.new('ShaderNodeTexCoord')
        mapping = nodes.new('ShaderNodeVectorMath')
        mapping.operation = 'MULTIPLY'
        mapping.inputs[1].default_value = (1.0, 3.3, 9)
        links.new(coord.outputs['Generated'], mapping.inputs[0])
        links.new(mapping.outputs[0], tex.inputs['Vector'])
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = .25
        ramp.color_ramp.elements[0].color = (*[v*.62 for v in color], 1)
        ramp.color_ramp.elements[1].position = .75
        ramp.color_ramp.elements[1].color = (*[min(1, v*1.05) for v in color], 1)
        links.new(tex.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .08
        bump.inputs['Distance'].default_value = .043
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return m


def mesh(name, verts, faces, material, smooth=False, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    CURRENT.objects.link(obj)
    if material:
        data.materials.append(material)
    if smooth:
        for face in data.polygons:
            face.use_smooth = True
    if bevel:
        mod = obj.modifiers.new('Hand softened edges', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        mod = obj.modifiers.new('Weighted broad faces', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj


def box(name, loc, size, material, bevel=.045, irregular=0):
    verts = [(x*size[0]/2 + random.uniform(-irregular, irregular),
              y*size[1]/2 + random.uniform(-irregular, irregular),
              z*size[2]/2 + random.uniform(-irregular, irregular))
             for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    obj = mesh(name, verts, [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)], material, bevel=bevel)
    obj.location = loc
    return obj


def cone(name, a, b, radius, top, material, sides=10):
    a,b = Vector(a),Vector(b)
    verts = [(r*math.cos(i*math.tau/sides), r*math.sin(i*math.tau/sides), z)
             for r,z in [(radius,0),(top,(b-a).length)] for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range(sides, sides*2))]
    faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    o = mesh(name, verts, faces, material, bevel=.012 if radius > .06 else 0)
    o.location = a
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o


def line(name, points, radius, material, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 1
    s = data.splines.new('POLY')
    s.points.add(len(points)-1)
    for p,co in zip(s.points, points):
        p.co = (*co,1)
    s.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name,data)
    CURRENT.objects.link(o)
    data.materials.append(material)
    return o



ROOF=[mat('Terracotta plank '+str(i),'roof_red',f,grain=True) for i,f in enumerate([.29,.39,.51,.62,.43])]
WOOD=[mat('Warm structural oak '+str(i),'timber',f,grain=True) for i,f in enumerate([.65,.85,1.1,1.35])]
CUT=mat('Golden end grain','endgrain',.39)
STONE=[mat('Grey foundation '+str(i),'stone',f) for i,f in enumerate([.7,.9,1.1])]
IRON=mat('Forged iron','iron',.65,.48,.65)
EDGE=mat('Steel worn edges','steel',.58,.38,.55)
STEEL=mat('Axe polished cutting steel','steel',1.05,.42,.30)
GOLD=mat('Brass rivets','#c69a57',.8,.35,.65)
DARK=mat('Recessed oak','#332015')
TEAM=mat('TC_TeamColor','#d64b3f',.45,.92)

# Thick squared timbers and stone shoes, with broad bevels instead of fine grain geometry.
def beam(name,a,b,width,depth,material):
    a,b=Vector(a),Vector(b)
    ob=box(name,(a+b)/2,(width,depth,(b-a).length),material,.065,.013)
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return ob

def bolt(p,n=(0,-1,0)):
    p=Vector(p);cone('Brass peg',p,p+Vector(n)*.055,.047,.040,GOLD,8)

for x in [-1.9,1.9]:
    for y in [-1.55,1.55]:
        # Faceted foundation flares outward toward the ground.
        footprint=[(-.40,-.5),(.40,-.5),(.5,-.40),(.5,.40),(.40,.5),(-.40,.5),(-.5,.40),(-.5,-.40)]
        vv=[(x+u*w,y+v*w,z) for w,z in [(1.06,.04),(1.02,.25),(.70,.70)] for u,v in footprint]
        ff=[tuple(reversed(range(8))),tuple(range(16,24))]+[(j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for j in range(2) for i in range(8)]
        mesh('Outward flared stone foot',vv,ff,random.choice(STONE),False,.045)
        CURRENT=COLS['02 · Timber frame']
        box('Oak support post',(x,y,1.66),(.65,.66,2.80),random.choice(WOOD),.07,.025)
        box('Exposed cut post top',(x,y,3.085),(.56,.57,.035),CUT,.025)
        CURRENT=COLS['04 · Ironwork']
        for z in [.69,2.73]:
            box('Square iron post collar',(x,y,z),(.72,.73,.20),IRON,.035)
        CURRENT=COLS['01 · Stone feet']

CURRENT=COLS['02 · Timber frame']
for y in [-1.55,1.55]:
    beam('Long eave beam',(-2.13,y,2.70),(2.13,y,2.70),.52,.54,WOOD[2])
    for x in [-1.9,1.9]:
        beam('Oak corner brace',(x,y,2.06),(x*.57,y,2.72),.32,.34,WOOD[1])
# Raised curved A-frame rafters at both ends and a stout ridge.
def roofz(y):
    t=abs(y)/1.94
    return 4.32-1.54*t-.46*math.sin(math.pi*min(t,1))
for x in [-1.97,1.97]:
    for side in [-1,1]:
        pts=[(x,side*1.94*t/12,roofz(side*1.94*t/12)+.05) for t in range(13)]
        vv=[]
        for px,py,pz in pts:
            vv.extend([(px+dx,py,pz+dz) for dx,dz in [(-.25,-.24),(.25,-.24),(.25,.24),(-.25,.24)]])
        ff=[(3,2,1,0),tuple(range(len(vv)-4,len(vv)))]
        ff.extend((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k) for i in range(len(pts)-1) for k in range(4))
        mesh('Sweeping solid gable rafter',vv,ff,WOOD[2],False,.035)
    beam('Gable tie beam',(x,-1.64,2.81),(x,1.64,2.81),.40,.44,WOOD[1])
    beam('Ridge fork post',(x,0,3.02),(x,0,5.02),.52,.54,WOOD[2])
    box('Ridge post cut',(x,0,5.03),(.44,.46,.028),CUT,.02)
beam('Massive roof ridge',(-2.22,0,4.73),(2.22,0,4.73),.52,.54,WOOD[2])

# Broad endgrain rings on exposed post tops.
for x in [-1.9,1.9]:
    for y in [-1.55,1.55]:
        for r in [.065,.125]:
            vv=[]
            for i in range(20):
                a=i*math.tau/20
                for rr in [r,r+.009]:vv.append((x+rr*math.cos(a),y+rr*math.sin(a),3.105))
            mesh('Post endgrain inlay',vv,[(2*i,2*i+1,2*((i+1)%20)+1,2*((i+1)%20)) for i in range(20)],WOOD[1])

CURRENT=COLS['03 · Roof']
for side in [-1,1]:
    for course in range(3):
        low=course*1.90/3+.018;high=(course+1)*1.90/3-.018
        for j in range(6):
            xa=-1.79+j*.598+.012;xb=xa+.568
            verts=[];nu,nv=5,9
            for v in range(nv):
                yy=side*(low+(high-low)*v/(nv-1))
                for u in range(nu):
                    xx=xa+(xb-xa)*u/(nu-1)
                    verts.append((xx,yy,roofz(yy)+.17+(2-course)*.045+.045*math.sin(math.pi*u/(nu-1))*math.sin(math.pi*v/(nv-1))))
            ob=mesh('Curved red roof plank',verts,[(v*nu+u,v*nu+u+1,(v+1)*nu+u+1,(v+1)*nu+u) for v in range(nv-1) for u in range(nu-1)],random.choice(ROOF),True)
            sol=ob.modifiers.new('Solid roof board','SOLIDIFY');sol.thickness=.22
            bev=ob.modifiers.new('Soft plank edges','BEVEL');bev.width=.040;bev.segments=2

CURRENT=COLS['04 · Ironwork']
for x in [-1.97,0,1.97]:
    verts=[]
    for k in range(41):
        y=-1.98+3.96*k/40;z=roofz(y)+(.39 if x else .36)
        verts.extend([(x-.095,y,z),(x+.095,y,z)])
    ob=mesh('Iron roof band',verts,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(40)],IRON,True)
    mod=ob.modifiers.new('Iron band depth','SOLIDIFY');mod.thickness=.055
    mod=ob.modifiers.new('Rounded iron edge','BEVEL');mod.width=.018;mod.segments=2
    for y in [-1.7,-1.15,-.6,0,.6,1.15,1.7]:
        bolt((x,y,roofz(y)+(.395 if x else .365)),(0,0,1))
for x in [-1.97,1.97]:
    box('Ridge iron clasp',(x,0,4.78),(.63,.64,.22),IRON,.04)
    for y in [-1.55,1.55]:bolt((x,y-.285,2.72))

# Open workshop entrance is on the right gable; broad wall boards define the other sides.
CURRENT=COLS['06 · Interior']
for j in range(8):
    box('Floor plank',(-1.65+j*.47,0,.29),(.45,3.13,.12),WOOD[j%4],.022)
for y in [-1.48,1.48]:
    for row in range(4 if y<0 else 5):
        box('Horizontal wall board',(0,y,.66+row*.34),(3.55,.25,.315),WOOD[row%3],.027)
for row in range(6):
    box('Back wall timber',(-1.81,0,.55+row*.33),(.16,2.96,.31),WOOD[row%3],.025)
# Small recessed side windows between substantial mullions and a deep lintel.
for y in [-1.48,1.48]:
    for x in [-1.10,0,1.10]:box('Window divider',(x,y,2.13),(.30,.35,.85),WOOD[1],.04)
    box('Window head beam',(0,y,2.51),(3.56,.39,.27),WOOD[2],.045)
for side in [-1,1]:
    for row in range(6):box('Entrance shoulder wall',(1.88,side*1.22,.62+row*.31),(.36,.47,.29),WOOD[row%3],.03)
box('Deep entrance head',(1.88,0,2.64),(.36,2.66,.34),WOOD[1],.04)
# Gable infill above doorway.
for row in range(4):
    z=3.01+row*.24; half=1.65*(1-(z-2.8)/1.7)
    box('Front gable infill',(1.88,0,z),(.13,half*2,.22),WOOD[row%3],.025)
for y in [-.83,.83]:
    box('Door jamb',(1.91,y,1.35),(.48,.43,2.1),WOOD[1],.05)
box('Door lintel',(1.92,0,2.35),(.52,2.18,.43),WOOD[2],.05)
for x,z in [(2.11,.23),(2.39,.115)]:
    box('Entry threshold',(x,0,z),(.39,2.12,z*2),STONE[1],.055,.015)
box('Workbench top',(-.92,.72,1.13),(1.10,.62,.15),WOOD[2],.04)
for x in [-1.32,-.52]:
    for y in [.5,.96]:box('Workbench leg',(x,y,.70),(.11,.11,.77),WOOD[1],.015)

# Fixed oversized axe and stump sign. No loose logs or resource piles.
CURRENT=COLS['05 · Axe sign']
sx,sy=-1.05,-3.20
n=18;verts=[]
for ring,z in enumerate([.10,.30,.94,1.04]):
    for i in range(n):
        a=i*math.tau/n;r=[.92,.83,.76,.79][ring]*(1+.055*math.sin(i*4.1))
        verts.append((sx+r*math.cos(a),sy+r*math.sin(a),z+.035*math.sin(i*2.1)))
faces=[tuple(reversed(range(n)))]
for j in range(3):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
stump=mesh('Broad carved chopping stump',verts,faces,WOOD[1]);stump.data.materials.append(WOOD[2])
for p in stump.data.polygons:p.material_index=p.index%2
mesh('Golden stump cross section',verts[-n:], [tuple(range(n))],CUT)
# Endgrain rings are flat broad colored inlays, not freestanding noodles.
for r in [.24,.42,.61]:
    vv=[]
    for i in range(40):
        a=i*math.tau/40
        for rr in [r,r+.016]:vv.append((sx+rr*math.cos(a),sy+rr*math.sin(a),1.066))
    mesh('Stump growth ring',vv,[(2*i,2*i+1,2*((i+1)%40)+1,2*((i+1)%40)) for i in range(40)],WOOD[2])
for i in range(8):
    a=i*math.tau/8
    beam('Stump root flare',(sx+.67*math.cos(a),sy+.67*math.sin(a),.55),(sx+1.0*math.cos(a),sy+1.0*math.sin(a),.12),.22,.24,WOOD[i%3])
# Axe shaft runs out from the workshop to the sign; head's broad silver face points toward camera.
beam('Oversized axe handle',(sx,sy,1.78),(-.82,-1.17,2.73),.21,.25,WOOD[2])
# Broad axe blade faces the reference camera, with a narrow eye and curved cutting edge.
axe_origin=Vector((sx,sy,1.78))
face_axis=(Vector((-.82,-1.17,2.73))-axe_origin).normalized()
blade_up=(Vector((0,0,1))-face_axis*face_axis.z).normalized()
normal=blade_up.cross(face_axis).normalized()
axe_frame=Matrix((face_axis,normal,blade_up)).transposed()
outline=[(-.30,2.10),(.10,2.10),(.11,1.80),(.23,1.57),(.48,1.38),(.73,1.30),(.61,1.12),(.34,1.01),(0,.97),(-.36,1.02),(-.61,1.12),(-.43,1.40),(-.31,1.77)]
verts=[tuple(axe_origin+blade_up*(z-2.04)+face_axis*u+normal*depth) for depth in [-.13,.13] for u,z in outline];n=len(outline)
faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh('Broad flared axe blade',verts,faces,STEEL,False,.025)
# Contrasting forged shoulder and eye; cutting edge remains broad and silver.
eye=box('Axe forged eye',axe_origin,(.48,.37,.36),IRON,.06)
eye.rotation_euler=axe_frame.to_euler()
bolt(axe_origin+normal*.22,normal)

CURRENT=COLS['07 · Lanterns']
GLASS=mat('Warm lantern glass','#ffaf35',.8,.35)
bs=GLASS.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.34,.035,1);bs.inputs['Emission Strength'].default_value=2.5
for x,y,z in [(2.14,-1.65,2.34),(2.15,1.85,2.60)]:
    beam('Lantern hanging bracket',(x-.22,y,2.86),(x+.18,y,2.86),.10,.12,IRON)
    cone('Lantern hanger',(x,y,z+.26),(x,y,2.86),.025,.025,IRON,8)
    box('Lantern amber panes',(x,y,z-.13),(.29,.29,.41),GLASS,.015)
    for zz in [z-.38,z+.10]:box('Lantern iron rim',(x,y,zz),(.39,.39,.08),IRON,.028)
    cone('Lantern peaked cap',(x,y,z+.10),(x,y,z+.27),.29,.10,IRON,4)
    for dx in [-.16,.16]:
        for dy in [-.16,.16]:beam('Lantern corner bar',(x+dx,y+dy,z-.36),(x+dx,y+dy,z+.08),.035,.035,IRON)
    for dy in [-.17,.17]:
        for sign in [-1,1]:beam('Lantern cross brace',(x-.15,y+dy,z-.34 if sign>0 else z+.06),(x+.15,y+dy,z+.06 if sign>0 else z-.34),.022,.023,IRON)
    data=bpy.data.lights.new('Lantern glow','POINT');data.energy=18;data.color=(1,.32,.05);data.shadow_soft_size=.3
    ob=bpy.data.objects.new('Lantern glow',data);CURRENT.objects.link(ob);ob.location=(x+.1,y,z-.10)

# Keep the workshop's fixed sign substantial enough to read at game camera distance.
for ob in list(COLS['05 · Axe sign'].objects):
    if ob.type=='MESH':
        world=ob.matrix_world.copy()
        for vert in ob.data.vertices:
            q=world @ vert.co
            q.x=sx+(q.x-sx)*1.23; q.y=sy+(q.y-sy)*1.10
            vert.co=world.inverted() @ q

# Ownership banner above the gable entrance: visible, moderate size, faction-recolorable.
CURRENT=COLS['08 · Team flag']
cone('Entrance flag mast',(2.12,0,3.80),(2.12,0,5.28),.055,.047,WOOD[1],9)
cone('Flag spear finial',(2.12,0,5.28),(2.12,0,5.55),.09,.003,IRON,5)
beam('Banner crossbar',(2.43,-.54,5.13),(2.43,.54,5.13),.075,.075,WOOD[2])
beam('Flag crossbar bracket',(2.12,0,5.13),(2.43,0,5.13),.07,.07,IRON)
nu,nv=17,17;verts=[]
for j in range(nv):
    v=j/(nv-1)
    for i in range(nu):
        u=i/(nu-1);verts.append((2.45+.04*math.sin(u*math.pi*4+v*3), (u-.5)*.92,5.09-v*.91+.035*math.sin(u*20)*v**8))
flag=mesh('Entrance ownership flag',verts,[(j*nu+i,j*nu+i+1,(j+1)*nu+i+1,(j+1)*nu+i) for j in range(nv-1) for i in range(nu-1)],TEAM,True)
sol=flag.modifiers.new('Cloth thickness','SOLIDIFY');sol.thickness=.012

create_stage(CONFIG,COLS['09 · Studio'])
scene['source_note']='Reference-based lumberjack workshop; hidden back and interior inferred. Loose logs are runtime items, excluded.'
reference=bpy.data.images.load(str(ASSET/'reference.png'));reference.pack();reference.use_fake_user=True
bpy.context.view_layer.update()
stats={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'faces':sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'collections':list(COLS),'blender':bpy.app.version_string}
(ASSET/'model-stats.json').write_text(json.dumps(stats,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/CONFIG['blend']))
print('BUILDING_MODEL_READY',json.dumps(stats))
