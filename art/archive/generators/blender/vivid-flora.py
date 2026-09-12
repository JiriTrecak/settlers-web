"""Build original, grounded game flora in an isolated Blender collection."""
import bpy, math, os
from mathutils import Vector
ROOT='/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web'
name='UTC Vivid Flora'
old=bpy.data.collections.get(name)
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(old)
collection=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(collection)
def material(name,hexcolor):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    srgb=[int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=.88
    m.diffuse_color=(*c,1);return m
leaf=[material('UTC Emerald '+str(i),c) for i,c in enumerate(['247f43','2b8d46','38964a','408e3b'])]
bark=material('UTC Warm bark','956146');stem=material('UTC Stem','347a3a');center=material('UTC Pollen','f8cb44')
def mesh(name,vs,fs,mat):
    g=bpy.data.meshes.new(name);g.from_pydata(vs,[],fs);g.update();o=bpy.data.objects.new(name,g);collection.objects.link(o);o.data.materials.append(mat);return o
def move(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    collection.objects.link(o)
def export(stemname,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.context.object.name=stemname
    bpy.ops.export_scene.gltf(filepath=ROOT+'/assets/props/vivid/'+stemname+'.glb',export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
# Every tier is made from broad shield-shaped boughs, with a raised central ridge.
pineUnderside=material('UTC Emerald 4','164e31')
objects=[]
bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.34,radius2=.13,depth=6.3,location=(0,0,3.15));o=bpy.context.object;o.name='Chunky pine trunk';move(o);o.data.materials.append(bark);objects.append(o)
for tier in range(7):
    radius=[2.25,2.04,1.75,1.42,1.06,.70,.36][tier];base=.9+tier*.77;length=1.10 if tier<5 else .95
    count=6 if tier<5 else 5
    for j in range(count):
        angle=j*math.tau/count+tier*.47+.045*math.sin(j*3+tier)
        # Cross sections along the bough: radial distance, half width, height.
        rows=[(.08,0,length),(.36,.28,length*.94),(.66,.40,length*.65),(.91,.36,length*.16),(1.03,.23,-.04),(1.08,0,-.09)]
        vs=[]
        for r,w,h in rows:
            for side in [-1,0,1]:
                x=r*radius;y=side*w*radius;z=base+h+(.10*radius if side==0 and w else 0)
                vs.append((math.cos(angle)*x-math.sin(angle)*y,math.sin(angle)*x+math.cos(angle)*y,z))
        fs=[]
        for k in range(len(rows)-1):
            for side in range(2):a=k*3+side;fs.extend([(a,a+3,a+4),(a,a+4,a+1)])
        o=mesh('Pine bough %d %d'%(tier,j),vs,fs,leaf[(j+tier)%len(leaf)])
        for polygon in o.data.polygons: polygon.use_smooth=True
        o.data.materials.append(pineUnderside)
        solid=o.modifiers.new('Bough thickness','SOLIDIFY');solid.thickness=.065
        solid.material_offset=1;solid.material_offset_rim=1
        objects.append(o)
export('pine-chunky',objects)
# Broad rounded five-petal flowers, each asset is a small three-flower colony.
for color,hexcolor in [('purple','ae66e5'),('blue','71b9ed'),('cream','fff2c0')]:
    petals=material('UTC Petal '+color,hexcolor);objects=[]
    def sphere(name,loc,scale,mat):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,location=loc);o=bpy.context.object;o.name=name;move(o);o.scale=scale;o.data.materials.append(mat)
        for p in o.data.polygons:p.use_smooth=True
        objects.append(o);return o
    for index,(x,y,h,size) in enumerate([(0,0,.5,1),(.58,.35,.36,.7),(-.4,.4,.28,.6)]):
        bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.035,radius2=.022,depth=h,location=(x,y,h/2));o=bpy.context.object;move(o);o.data.materials.append(stem);objects.append(o)
        for k in range(5):
            a=k*math.tau/5+index*.4;r=.23*size
            o=sphere('Petal '+color,(x+math.cos(a)*r,y+math.sin(a)*r,h),(.28*size,.135*size,.065*size),petals);o.rotation_euler.z=a
        sphere('Pollen',(x,y,h+.035),(.115*size,.115*size,.07*size),center)
        for k in range(2):
            a=k*math.pi+index; o=sphere('Basal leaf',(x+.14*math.cos(a),y+.14*math.sin(a),.10),(.22,.075,.035),stem);o.rotation_euler.z=a
        if index==0:
            single=[]
            for source in objects:
                clone=source.copy();clone.data=source.data.copy();collection.objects.link(clone)
                clone.location.z*=.65;clone.scale.z*=.65;single.append(clone)
    export('flower-chunky-'+color,objects)
    export('flower-single-'+color,single)
# Broadleaf canopy: separate spreading branches carrying thick overlapping leaf fans.
objects=[]
broadleaf=[material('UTC Broadleaf '+str(i),c) for i,c in enumerate(['64922e','72a135','83ad3c','4e812b'])]
def branch(a,b,r1,r2):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();move(o);o.data.materials.append(bark);objects.append(o)
# A bent, tapered trunk with alternating buttress roots at the soil line.
vs=[];fs=[];sides=10
for ring,(z,cx,cy,r) in enumerate([(0,0,0,.82),(.4,.03,-.04,.60),(1.2,.18,-.08,.43),(2.6,.38,.02,.36),(3.8,.12,.15,.27),(5.1,.28,.08,.19)]):
    for j in range(sides):
        a=j*math.tau/sides+.06*ring
        radius=r*(1.25 if ring==0 and j%2==0 else .77 if ring==0 else 1)
        vs.append((cx+math.cos(a)*radius,cy+math.sin(a)*radius,z))
for ring in range(5):
    for j in range(sides):
        a=ring*sides+j;b=ring*sides+(j+1)%sides
        fs.extend([(a,b,b+sides),(a,b+sides,a+sides)])
fs.append(tuple(range(sides-1,-1,-1)));fs.append(tuple(range(5*sides,6*sides)))
objects.append(mesh('Broadleaf sculpted trunk',vs,fs,bark))
for idx,(x,y,z,radius) in enumerate([(-1.6,.2,4.0,1.3),(1.5,.5,4.2,1.3),(.2,-1.4,4.3,1.4),(-.5,1.3,4.7,1.3),(0,0,5.1,1.5),(1.4,-.8,4.5,1.05),(-1.5,-1,4.4,1.05)]):
    z+=1.3
    branch((.16,.04,3.0),(x,y,z-.28),.19,.075)
    for j in range(58):
        # A staggered domed crown, with hanging outer foliage and asymmetric lobes.
        a=j*2.39996+idx;r=math.sqrt((j+.5)/58)*radius
        edge=1+.14*math.sin(a*3+idx)+.07*math.cos(a*5-idx)
        cx=x+math.cos(a)*r*edge;cy=y+math.sin(a)*r*edge
        cz=z+1.12*math.sqrt(max(0,1-(r/radius)**2))-.4*(r/radius)**2
        cx+=.13*math.sin(j*7+idx);cy+=.13*math.cos(j*3-idx);cz+=.18*math.sin(j*5)
        yaw=j*1.713+idx*.6;length=.48+.14*math.sin(j);w=.23
        local=[(-length,0,-.06),(-.28,-w,0),(.28,-w,.025),(length,0,-.10),(.28,w,.025),(-.28,w,0),(0,0,.055)]
        tilt=.24*math.sin(j*2.7+idx)+.40*(r/radius)**2
        vs=[]
        for lx,ly,lz in local:
            tx=lx*math.cos(tilt)+lz*math.sin(tilt)
            tz=-lx*math.sin(tilt)+lz*math.cos(tilt)
            vs.append((cx+math.cos(yaw)*tx-math.sin(yaw)*ly,cy+math.sin(yaw)*tx+math.cos(yaw)*ly,cz+tz))
        o=mesh('Broadleaf fan',vs,[(k,(k+1)%6,6) for k in range(6)],broadleaf[(idx+j)%4])
        for polygon in o.data.polygons:polygon.use_smooth=True
        solid=o.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.025
        objects.append(o)
# Preserve the branching skeleton for the finer, drooping crown variant.
skeleton=[]
for source in objects:
    if source.name.startswith('Broadleaf fan'):continue
    clone=source.copy();clone.data=source.data.copy();collection.objects.link(clone);skeleton.append(clone)
export('tree-chunky-broadleaf',objects)
objects=skeleton
# Compound sprays sweep outward and then hang, leaving light between the leaves.
for idx,(x,y,z,radius) in enumerate([(-1.6,.2,5.3,1.3),(1.5,.5,5.5,1.3),(.2,-1.4,5.6,1.4),(-.5,1.3,6.0,1.3),(0,0,6.4,1.5),(1.4,-.8,5.8,1.05),(-1.5,-1,5.7,1.05)]):
    for j in range(18):
        a=j*2.39996+idx*.71;reach=radius*(.80+.40*((j*7)%13)/12)
        radial=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
        for k in range(11):
            t=(k+.25)/11
            c=Vector((x,y,z))+radial*(reach*t)+Vector((0,0,.85*math.sin(t*math.pi)-2.25*t*t))
            for sign in [-1,1]:
                length=.36+.10*math.sin(k+j);width=.095
                direction=(side*sign*.83+radial*.36+Vector((0,0,-.42*t))).normalized()
                across=direction.cross(Vector((0,0,1))).normalized()
                root=c+side*sign*.035;tip=root+direction*length
                mid=root+direction*length*.44
                vs=[tuple(root),tuple(mid+across*width),tuple(tip),tuple(mid-across*width),tuple(mid+Vector((0,0,.045)))]
                o=mesh('Drooping leaflet',vs,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],broadleaf[(idx+j+k//3)%4])
                solid=o.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.018
                objects.append(o)
export('tree-chunky-drooping',objects)
# Upright cream flower heads and red mushrooms provide the woodland's bright accents.
objects=[]
cream=material('UTC Cream bud','fff0b5')
for j,(x,y,h,size) in enumerate([(0,0,.9,1),(.45,.2,.65,.8),(-.35,.25,.5,.7)]):
    bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.028,radius2=.015,depth=h,location=(x,y,h/2))
    o=bpy.context.object;move(o);o.data.materials.append(stem);objects.append(o)
    sphere('Upright cream flower',(x,y,h),(.18*size,.18*size,.25*size),cream)
    for k in range(2):
        a=j+k*math.pi
        o=sphere('Long flower leaf',(x+.18*math.cos(a),y+.18*math.sin(a),.18),(.30,.065,.025),stem)
        o.rotation_euler.z=a;o.rotation_euler.y=-.38
export('flower-bud-cream',objects)
objects=[]
red=material('UTC Mushroom red','e74137');ivory=material('UTC Mushroom ivory','fff0cf')
for j,(x,y,size) in enumerate([(0,0,1),(.4,.2,.7),(-.3,.33,.6)]):
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.045*size,radius2=.03*size,depth=.35*size,location=(x,y,.175*size))
    o=bpy.context.object;move(o);o.data.materials.append(ivory);objects.append(o)
    vs=[];fs=[];n=10
    for z,r in [(.28,.17),(.4,.25),(.56,.21),(.68,.12),(.73,.015)]:
        for k in range(n):
            a=k*math.tau/n;vs.append((x+math.cos(a)*r*size,y+math.sin(a)*r*size,z*size))
    for row in range(4):
        for k in range(n):
            a=row*n+k;b=row*n+(k+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range(n-1,-1,-1)));fs.append(tuple(range(4*n,5*n)))
    o=mesh('Rounded red mushroom cap',vs,fs,red)
    for polygon in o.data.polygons:polygon.use_smooth=True
    objects.append(o)
    for k in range(7):
        a=k*2.39996+j;z=.43+.035*k;r=.24-(z-.43)*.5
        sphere('Cream mushroom spot',(x+math.cos(a)*r*size,y+math.sin(a)*r*size,z*size),(.033*size,.033*size,.026*size),ivory)
export('mushroom-chunky-red',objects)
# Floating lily pads use the editor's water anchor, with a small notch and thick rim.
objects=[]
padMats=[material('UTC Lily leaf','8da63f'),material('UTC Lily rim','526c30')]
for j,(cx,cy,r) in enumerate([(0,0,.36),(.61,.23,.27),(-.38,.46,.22)]):
    angles=[.22+k*(math.tau-.44)/12 for k in range(13)]
    vs=[(cx,cy,.045)]+[(cx+math.cos(a+j)*r,cy+math.sin(a+j)*r,.032) for a in angles]
    o=mesh('Notched lily pad',vs,[(0,k,k+1) for k in range(1,13)],padMats[0])
    o.data.materials.append(padMats[1])
    solid=o.modifiers.new('Pad rim','SOLIDIFY');solid.thickness=.025;solid.material_offset=1
    objects.append(o)
export('lily-chunky',objects)
# Faceted rounded stones have a flat ground contact and broad readable planes.
def roundedStone(name,cx,cy,size,mat,phase):
    vs=[];fs=[];n=7
    for row,(z,r) in enumerate([(0,.65),(.20,1.0),(.92,.86),(1.38,.42)]):
        for j in range(n):
            a=j*math.tau/n+.08*row
            rr=r*(1+.10*math.sin(j*2.4+phase))
            vs.append((cx+math.cos(a)*rr*size,cy+math.sin(a)*rr*.82*size,z*size))
    for row in range(3):
        for j in range(n):
            a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range(n-1,-1,-1)));fs.append(tuple(range(3*n,4*n)))
    objects.append(mesh(name,vs,fs,mat))
objects=[]
stone=material('UTC Cool stone','9dbbb7')
roundedStone('Rounded cool boulder',0,0,1,stone,.3)
export('rock-rounded-cool',objects)
objects=[]
pebble=material('UTC Pale pebble','c5cd99')
for j,(x,y,size) in enumerate([(0,0,.24),(.58,.22,.16),(-.37,.43,.13),(.30,-.40,.10)]):
    roundedStone('Meadow pebble',x,y,size,pebble,j)
export('pebbles-pale',objects)
bpy.data.libraries.write(ROOT+'/assets/props/vivid/Flora-source.blend',{collection})
result={'status':'ok','collection':collection.name,'objects':len(collection.objects),'exports':['pine-chunky','flower-chunky-purple','flower-chunky-blue','flower-chunky-cream','tree-chunky-broadleaf','lily-chunky','flower-bud-cream','mushroom-chunky-red']}
