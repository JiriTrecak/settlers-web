"""Editable Rootbound Hall: original mesh reconstruction from one image, not a billboard.

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
from mathutils import Vector

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
scene.name = 'Rootbound Hall · reference study'


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


COLS = {n: collection(n) for n in ['01 · Masonry', '02 · Timber frame', '03 · Roof planks',
        '04 · Ironwork', '05 · Living roots', '06 · Banners', '07 · Torches', '08 · Studio']}
CURRENT = COLS['01 · Masonry']


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
        ramp.color_ramp.elements[0].color = (*[v*.32 for v in color], 1)
        ramp.color_ramp.elements[1].position = .75
        ramp.color_ramp.elements[1].color = (*[min(1, v*1.05) for v in color], 1)
        links.new(tex.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .25
        bump.inputs['Distance'].default_value = .043
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return m


ROOF = [mat(f'Oxblood roof · {i}', 'roof_red', f, grain=True) for i, f in enumerate([.30, .41, .52, .64, .37, .48])]
WOOD = [mat(f'Golden cut timber · {i}', 'timber', f, grain=True) for i, f in enumerate([.65, .9, 1.18, 1.45])]
STONE = [mat(f'Warm grey masonry · {i}', h, f) for i, (h, f) in enumerate([('stone_light', .95), ('stone_light', .72), ('stone_light', 1.15), ('stone', .73), ('#8b8170', .85)])]
ROOT = [mat(f'Living heartwood · {i}', 'root_gold' if i < 4 else 'root_shadow', f, grain=True) for i, f in enumerate([.64, .78, .91, 1.04, .83, 1.05])]
IRON = mat('Forged charcoal iron', 'iron', .54, .59, .65)
EDGE = mat('Worn steel edges', 'iron_edge', 1.15, .38, .6)
BOLT = mat('Warm steel rivets', 'rivet', .65, .37, .7)
DARK = mat('Deep timber crevices', '#241912')
GRAIN = mat('Carved grain shadow', '#703f2b')
HONEY = mat('Cut edge honey', '#c58a50')
CLOTH = mat('Vermilion banners', 'banner', .45, .92)
ROPE = mat('Hemp lashings', '#ab895d')


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


def catmull(points, steps=6):
    p = [Vector(points[0])] + [Vector(x) for x in points] + [Vector(points[-1])]
    result=[]
    for i in range(1,len(p)-2):
        a,b,c,d=p[i-1:i+3]
        for k in range(steps):
            t=k/steps
            result.append((2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
    return result+[Vector(points[-1])]


def root(name, controls, radii, material, lobes=12):
    points = catmull(controls, 7)
    rr = [max(.012,v[0]) for v in catmull([(r,0,0) for r in radii], 7)]
    verts=[]
    phase=random.random()*4
    for j,(p,r) in enumerate(zip(points,rr)):
        tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        across=tangent.cross(Vector((0,0,1))).normalized()
        if across.length<.1: across=Vector((1,0,0))
        up=across.cross(tangent).normalized()
        for i in range(lobes):
            a=i*math.tau/lobes
            ridge=1+.13*math.sin(a*3+phase)+.06*math.cos(j*.63+a*2)
            v=p+(across*math.cos(a)+up*math.sin(a))*r*ridge
            v.z=max(.015,v.z)
            verts.append(tuple(v))
    faces=[]
    for j in range(len(points)-1):
        for i in range(lobes):
            a=j*lobes+i;b=j*lobes+(i+1)%lobes
            faces.append((a,b,b+lobes,a+lobes))
    faces += [tuple(reversed(range(lobes))),tuple(range((len(points)-1)*lobes,len(points)*lobes))]
    obj=mesh(name,verts,faces,material,True)
    return obj


def rivet(position, normal, size=.054):
    n=Vector(normal).normalized();p=Vector(position)
    return cone('Hand forged rivet',p,p+n*.044,size,size*.76,BOLT,6)


def ribbon(name, path, width, material, normal_fn=None, bolts=False):
    verts=[]
    for i,p in enumerate(path):
        p=Vector(p)
        tangent=Vector(path[min(i+1,len(path)-1)])-Vector(path[max(0,i-1)])
        normal=Vector(normal_fn(p) if normal_fn else (0,-1,0)).normalized()
        side=tangent.cross(normal).normalized()*width/2
        verts += [tuple(p-side),tuple(p+side)]
    obj=mesh(name,verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(path)-1)],material,True)
    solid=obj.modifiers.new('Forged strap thickness','SOLIDIFY');solid.thickness=.055
    bevel=obj.modifiers.new('Steel bevel','BEVEL');bevel.width=.018;bevel.segments=2
    for side in [0,1]:line('Polished strap edge',[verts[i*2+side] for i in range(len(path))],.012,EDGE)
    if bolts:
        for i in range(2,len(path)-2,5):
            p=Vector(path[i]);n=Vector(normal_fn(p) if normal_fn else (0,-1,0)).normalized()
            rivet(p+n*.035,n)
    return obj


# Stone walls are real individual blocks. A walk-in doorway remains open at the front.
for row in range(6):
    z=.29+row*.345
    for side in [-1,1]:
        for j in range(6):
            y=-1.7+(j+.5)*.59
            ob=box('Side ashlar', (side*2.24,y,z),(.52,.57,.329),random.choice(STONE),.072,.051)
            ob.rotation_euler.z=random.uniform(-.035,.035)
        for j in range(3):
            x=side*(1.08+j*.49)
            ob=box('Gate cheek masonry',(x,-1.79,z),(.5,.59,.334),random.choice(STONE),.070,.041)
            ob.rotation_euler.y=random.uniform(-.035,.035)
    for j in range(9):
        box('Rear ashlar',(-2.04+j*.51,1.75,z),(.49,.48,.327),random.choice(STONE),.052,.02)
# Roof support at the lintel avoids a luminous slit above the entrance.
box('Heavy internal lintel',(0,-1.75,2.2),(4.4,.4,.32),DARK)
box('Shadowed interior floor',(0,.1,.14),(4.15,3.6,.18),STONE[1])
box('Unlit interior back wall',(0,1.47,1.1),(4.0,.12,1.9),DARK)
BLACK = mat('Doorway deep occlusion', '#050302')
box('Deep recessed passage',(0,-.78,1.10),(1.7,.18,1.95),BLACK)
box('Passage ceiling',(0,-1.3,2.13),(1.75,1.55,.18),DARK)
for row in range(3):
    for j in range(3):
        box('Worn entrance stair',(-.55+j*.55,-2.66+row*.29,.105+row*.105),(.54,.46,.2+row*.1),STONE[(j+row)%3],.055,.018)

CURRENT=COLS['02 · Timber frame']
for x in [-.82,.82]:
    root('Massive door jamb',[(x,-1.99,.18),(x+.03,-2.0,.87),(x,-1.94,1.8),(x,-1.92,2.16)],[.19,.22,.22,.2],WOOD[1],10)
    for dx in [-.09,.065]:line('Jamb grain',[(x+dx,-2.2,.32),(x+dx+.016,-2.225,.8),(x+dx-.02,-2.2,1.6),(x+dx,-2.13,1.97)],.013,GRAIN)
for side in [-1,1]:
    for z in [1.61,2.19]:
        box('Long side frame',(side*2.49,.05,z),(.23,3.8,.24),WOOD[2],.055,.024)
    for y in [-1.63,-.68,.36,1.42]:
        h=random.uniform(.6,.85)
        box('Split palisade post',(side*2.45,y,2.13),(.25,.28,h),WOOD[2],.028,.033)
        for dz in [-.1,.03]:box('Post iron collar',(side*2.455,y,2.02+dz),(.285,.32,.068),IRON,.018)
        line('Post split',[(side*2.58,y-.12,2.12),(side*2.585,y-.1,2.35),(side*2.59,y-.085,2.46)],.01,GRAIN)
    for x in [side*1.64,side*2.26]:
        box('Front vertical timber',(x,-2.01,2.04),(.26,.25,.88),WOOD[2],.035,.025)
    box('Gate shoulder beam',(side*1.78,-2.05,1.94),(1.25,.23,.22),WOOD[1],.05)
# Preserve the seeded variation of the remaining building after removing five rear stakes.
for _ in range(5): random.uniform(-.12,.15)

CURRENT=COLS['03 · Roof planks']
RX,RY,RZ=2.28,1.60,CONFIG['shape']['roof_height']
ZBASE=2.68


def dome(t,a,offset=0):
    radius=max(0,math.cos(t))**.68
    return Vector(((RX+offset)*radius*math.cos(a),(RY+offset)*radius*math.sin(a),ZBASE+(RZ+offset)*max(0,math.sin(t))**.82))


def dome_normal(p):
    return Vector((p.x/RX**2,p.y/RY**2,(p.z-ZBASE)/RZ**2)).normalized()


for course in range(4):
    lo=course*math.pi/8+.007;hi=(course+1)*math.pi/8-.007
    count=[12,11,9,6][course]
    for j in range(count):
        a0=j*math.tau/count+.009+(course%2)*.12;a1=(j+1)*math.tau/count-.009+(course%2)*.12
        verts=[];nu,nv=7,5
        for v in range(nv):
            t=lo+(hi-lo)*v/(nv-1)
            for u in range(nu):
                a=a0+(a1-a0)*u/(nu-1)
                swell=.018*math.sin(math.pi*u/(nu-1))*math.sin(math.pi*v/(nv-1))
                verts.append(tuple(dome(t,a,swell)))
        obj=mesh('Curved redwood shingle',verts,[(v*nu+u,v*nu+u+1,(v+1)*nu+u+1,(v+1)*nu+u) for v in range(nv-1) for u in range(nu-1)],random.choice(ROOF),True)
        solid=obj.modifiers.new('Thick hewn plank','SOLIDIFY');solid.thickness=.10
        bevel=obj.modifiers.new('Soft cut edges','BEVEL');bevel.width=.027;bevel.segments=2
# A broad lower tier is structurally joined to the upper roof and the wall frame.
# It gives the stepped, heavy silhouette visible beneath the reference's iron hoop.
for j in range(20):
    a0=j*math.tau/20+.008;a1=(j+1)*math.tau/20-.008
    verts=[]
    for k in range(4):
        t=k/3
        for i in range(6):
            a=a0+(a1-a0)*i/5
            r=1.0-.15*t+.025*math.sin(t*math.pi)
            verts.append((2.62*r*math.cos(a),2.00*r*math.sin(a),2.12+t*.63))
    ob=mesh('Lower tier hewn redwood',verts,[(k*6+i,k*6+i+1,(k+1)*6+i+1,(k+1)*6+i) for k in range(3) for i in range(5)],ROOF[j%len(ROOF)],True)
    sol=ob.modifiers.new('Solid lower roof wood','SOLIDIFY');sol.thickness=.18
    bevel=ob.modifiers.new('Broad lower roof cuts','BEVEL');bevel.width=.035;bevel.segments=2

CURRENT=COLS['04 · Ironwork']
# Four straps wrap front-to-back around the roof; a latitudinal belt holds their feet.
for xnorm in [-.78,-.3,.27,.77]:
    a=math.asin(xnorm)
    path=[]
    for i in range(61):
        t=i*math.pi/60
        x=RX*xnorm
        latitude=math.asin(math.sin(t)*math.sin(math.acos(abs(xnorm)**(1/.68))))
        radius=math.cos(latitude)**.68
        yy=math.sqrt(max(0,radius*radius-xnorm*xnorm))*(-1 if t<math.pi/2 else 1)
        path.append((x,(RY+.072)*yy,ZBASE+(RZ+.072)*math.sin(latitude)**.82))
    ribbon('Roof steel arch',path,.185 if abs(xnorm)>.6 else .23,IRON,dome_normal,True)
    for i in [12,31,48]:
        p=Vector(path[i]);n=dome_normal(p)
        cone('Roof spike foot',p,p+n*.075,.16,.125,IRON,6)
        cone('Forged roof spike',p+n*.06,p+n*.36,.102,.005,IRON,5)
path=[tuple(dome(.028,i*math.tau/100,.075)) for i in range(101)]
ribbon('Continuous eave iron belt',path,.185,IRON,dome_normal,True)
path=[tuple(dome(.77,i*math.tau/100,.044)) for i in range(101)]
ribbon('Upper transverse roof hoop',path,.145,IRON,dome_normal,True)

# Rounded projecting porch, with the same heavy iron bands as the upper roof.
CURRENT=COLS['03 · Roof planks']
def porch(x,y,extra=0):
    return (x,y,1.99+.74*max(0,1-(x/1.44)**2)+.17*(y+2.7)+extra)
for j in range(9):
    xa=-1.43+j*2.86/9+.012;xb=-1.43+(j+1)*2.86/9-.012
    for k in range(3):
        ya=-2.66+k*.41+.008;yb=ya+.394
        verts=[porch(xa+(xb-xa)*i/4,y,.025) for y in [ya,yb] for i in range(5)]
        o=mesh('Porch curved red plank',verts,[(i,i+1,i+6,i+5) for i in range(4)],random.choice(ROOF),True)
        sol=o.modifiers.new('Solid carved porch timber','SOLIDIFY');sol.thickness=.14
        bevel=o.modifiers.new('Worn porch edges','BEVEL');bevel.width=.034;bevel.segments=2
CURRENT=COLS['04 · Ironwork']
for y in [-2.7,-1.78]:
    path=[porch(-1.49+i*2.98/40,y,.025) for i in range(41)]
    ribbon('Porch armored brow',path,.21,IRON,lambda p:(p.x*.15,-1,.25),True)
for x in [-1.14,0,1.14]:
    path=[porch(x,-2.7+i*1.32/20,.11) for i in range(21)]
    ribbon('Porch crown strap',path,.17,IRON,lambda p:(p.x*.5,0,1),True)
for x in [-1.13,0,1.13]:
    p=Vector(porch(x,-2.55,.16));cone('Porch defensive spike',p,p+Vector((x*.05,-.07,.32)),.105,.003,IRON,5)

# Integrated roots: asymmetrical buttresses descend from the building's shoulders.
CURRENT=COLS['05 · Living roots']
spread=CONFIG['shape']['root_spread']
for side in [-1,1]:
    for i,y in enumerate([-1.48,-.36,.72,1.48]):
        endy=y+random.uniform(-.8,.35)
        endx=side*(3.35+random.random()*.8)*spread
        controls=[(side*2.05,y+.3,1.96-random.random()*.20),(side*2.6,y+.15,1.38),
                  (side*(2.88+random.uniform(-.1,.15)),y-.06,.8),(endx*.93,endy,.23),(endx,endy-.22,.10)]
        controls.append((endx+side*.18,endy-.38,.06))
        radii=[.53,.43+random.random()*.06,.29,.17,.10,.068]
        root('Ancient spreading buttress',controls,radii,ROOT[i if side>0 else 4+i%2])
        if i%2==0:
            root('Forked root finger',[controls[2],(side*3.43,y+.5,.45),(side*4.1*spread,y+.7,.22),(side*4.35*spread,y+.45,.08)], [.3,.23,.13,.023],ROOT[1 if side>0 else 4])
    # Forward curls frame the foundation without blocking the entrance.
    for j in range(2):
        x=side*(2.03+j*.72)
        root('Gate root knuckle',[(side*2.4,-.86,1.5),(x,-1.7,.8),(x+side*.25,-2.35,.31),(x+side*.08,-2.83,.20),(x-side*.18,-2.94,.06)], [.40,.34,.25,.13,.026],ROOT[1+j])
    root('Long curling lateral root',[(side*2.53,.12,1.65),(side*3.1,-.37,.74),(side*3.3,-1.12,.35),
          (side*3.78,-1.83,.26),(side*3.66,-2.22,.19),(side*3.39,-2.32,.07)],[.34,.31,.23,.17,.11,.025],ROOT[2 if side>0 else 4])
for j in range(3):
    x=-1.4+j*1.4
    root('Rear structural root',[(x,1.5,1.8),(x+.3,2.12,.9),(x+.45,2.95,.13),(x+.75,3.35,.055)],[.38,.48,.24,.015],ROOT[j])

CURRENT=COLS['06 · Banners']
def banner(cx,y,top,width,height,pole_side=1,base_z=None):
    left,right=cx-width*.58,cx+width*.58
    bar_y=y-.20 if pole_side == 0 else y
    for x in [cx if pole_side == 0 else left if pole_side < 0 else right]:
        bottom=top-height-.22 if base_z is None else base_z
        radius=.085 if width>1 else .063
        cone('Banner pole',(x,y,bottom),(x,y,top+.33),radius,radius*.83,WOOD[1],9)
        cone('Banner spear finial',(x,y,top+.33),(x+.016,y,top+.72),.12,.004,IRON,5)
    cone('Banner crossbar',(left-.07,bar_y,top+.06),(right+.07,bar_y,top+.06),.055,.055,WOOD[2],9)
    if pole_side == 0:
        cone('Standard crossbar bracket',(cx,y,top+.06),(cx,bar_y,top+.06),.055,.055,IRON,8)
    for x in [left,right]:
        for i in range(4):
            line('Banner rope lashing',[(x+.078*math.cos(a*math.tau/20),bar_y+.078*math.sin(a*math.tau/20),top+.013+i*.035) for a in range(21)],.016,ROPE)
    def cloth(u,v,front=0):
        wave=.055*math.sin(u*math.pi*4+v*2.7)+.06*v*math.sin(v*8+u*3)
        fray=(.045+.09*(.5+.5*math.sin(u*79)))*max(0,(v-.9)/.1)
        return (cx+(u-.5)*width,bar_y-.047+wave-front,top-v*height+fray)
    nu,nv=29,25
    verts=[cloth(i/(nu-1),j/(nv-1)) for j in range(nv) for i in range(nu)]
    ob=mesh('Tattered crimson cloth',verts,[(j*nu+i,j*nu+i+1,(j+1)*nu+i+1,(j+1)*nu+i) for j in range(nv-1) for i in range(nu-1)],CLOTH,True)
    sol=ob.modifiers.new('Woven cloth thickness','SOLIDIFY');sol.thickness=.012
# Matching banners hang against the masonry below the front fence, one outer pike each.
banner(-1.87,-2.30,1.91,.77,1.25,pole_side=-1)
banner(1.87,-2.30,1.91,.77,1.25,pole_side=1)

# A larger central standard rises from the roof crown, above the two entrance banners.
banner(0,0,6.20,1.40,1.90,pole_side=0,base_z=ZBASE+RZ-.06)
cone('Roof standard iron socket',(0,0,ZBASE+RZ-.07),(0,0,ZBASE+RZ+.18),.15,.12,IRON,10)

CURRENT=COLS['07 · Torches']
FLAME=mat('Flame amber','#ff7007');fbs=FLAME.node_tree.nodes.get('Principled BSDF');fbs.inputs['Emission Color'].default_value=(1,.19,.005,1);fbs.inputs['Emission Strength'].default_value=4
HEART=mat('Flame golden heart','#ffde52');hbs=HEART.node_tree.nodes.get('Principled BSDF');hbs.inputs['Emission Color'].default_value=(1,.72,.06,1);hbs.inputs['Emission Strength'].default_value=6
for x in [-1.15,1.25]:
    y=-2.82
    cone('Torch carved foot',(x,y,.04),(x+.014,y,.96),.08,.063,WOOD[1],10)
    for z in [.36,.42,.5,.65]:
        cone('Torch binding',(x,y,z),(x,y,z+.065),.092,.096,ROPE,9)
    cone('Torch iron bowl',(x,y,.84),(x,y,1.00),.10,.205,IRON,12)
    line('Brazier polished lip',[(x+.208*math.cos(i*math.tau/30),y+.208*math.sin(i*math.tau/30),1.0) for i in range(31)],.027,BOLT)
    for j in range(4):
        a=j*math.pi/2
        line('Torch bowl claw',[(x+.09*math.cos(a),y+.09*math.sin(a),.84),(x+.23*math.cos(a),y+.23*math.sin(a),1.10)],.018,IRON)
    root('Amber flame',[(x,y,1),(x-.03,y,1.12),(x+.025,y,1.27),(x-.035,y,1.46)],[.105,.089,.043,.003],FLAME,10)
    root('Golden flame core',[(x,y-.08,1.01),(x+.024,y-.07,1.15),(x-.017,y-.04,1.31)],[.075,.044,.002],HEART,9)
    light=bpy.data.lights.new('Torch warm spill','POINT');light.energy=28;light.color=(1,.26,.03);light.shadow_soft_size=.2
    ob=bpy.data.objects.new('Torch warm spill',light);CURRENT.objects.link(ob);ob.location=(x,y,1.22)

create_stage(CONFIG,COLS['08 · Studio'])
scene['reference_image']='//reference.png'
scene['asset_workflow']='npm run building:studio — save this .blend to refresh the comparison.'
scene['source_note']='Single-image geometric reconstruction. Hidden sides and interior are artistic inference.'
reference=bpy.data.images.load(str(ASSET/'reference.png'));reference.pack();reference.use_fake_user=True
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.context.view_layer.update()
stats={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'faces':sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),
       'materials':len(bpy.data.materials),'collections':list(COLS),'blender':bpy.app.version_string}
(ASSET/'model-stats.json').write_text(json.dumps(stats,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/CONFIG['blend']))
print('BUILDING_MODEL_READY',json.dumps(stats))
