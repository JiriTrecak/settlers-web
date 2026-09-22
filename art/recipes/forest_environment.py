"""Matching neutral scenery for the forest-warfare direction. Z-up, metres."""
import math,json,bpy
from pathlib import Path
from mathutils import Vector
from forest_warfare import ForestKit

def canopy(k,name,z,r,height,phase=0):
    n=20;vs=[(0,0,z+height)]
    for j,(radius,dz) in enumerate([(r*.46,height*.57),(r,height*.06),(r*.83,-.12)]):
        for i in range(n):
            a=i*math.tau/n+phase;tooth=1 if i%2==0 else .77
            vs.append((math.cos(a)*radius*tooth,math.sin(a)*radius*tooth,z+dz+(.13 if i%2 else 0)))
    fs=[(0,1+i,1+(i+1)%n) for i in range(n)]
    for j in range(2):
        for i in range(n):fs.append((1+j*n+i,1+(j+1)*n+i,1+(j+1)*n+(i+1)%n,1+j*n+(i+1)%n))
    fs.append(tuple(reversed(range(1+2*n,1+3*n))))
    k.mesh(name,vs,fs,[k.green,k.green2,k.bark],[1 if i%5 in (0,1) else 0 for i in range(len(fs)-1)]+[2])

def tree_actions(k):
    # Rotate a rigid tree in world space. Support it on its lowest branch while
    # falling; decay sinks at full size. There is never a scale animation.
    pivot=bpy.data.objects.new('TreePivot',None);k.current.objects.link(pivot)
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in objects:o.parent=pivot
    points=[v.co for o in objects for v in o.data.vertices]
    pivot.rotation_mode='XYZ';pivot.animation_data_create();bpy.context.scene.render.fps=30
    def key(frame,angle,z):
        pivot.rotation_euler.x=angle;pivot.location.z=z
        pivot.keyframe_insert('rotation_euler',frame=frame);pivot.keyframe_insert('location',frame=frame)
    def support(angle):return max(0,-min(v.y*math.sin(angle)+v.z*math.cos(angle) for v in points))
    decay_depth=max(v.y for v in points)-min(v.y for v in points)+.5
    for name,length in [('hit',18),('fall',54),('decay',180)]:
        action=bpy.data.actions.new(name);pivot.animation_data.action=action;action.use_fake_user=True
        for frame in range(length+1):
            t=frame/length
            if name=='hit':angle=.035*math.sin(t*math.pi*5)*(1-t)**2;z=0
            elif name=='fall':
                angle=math.pi/2*(t*t*(3-2*t));z=support(angle)
            else:angle=math.pi/2;z=support(angle)-t*decay_depth
            key(frame,angle,z)
        track=pivot.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True
    pivot.animation_data.action=None;pivot.rotation_euler=(0,0,0);pivot.location=(0,0,0)

def environment(asset,kind):
    k=ForestKit(asset)
    if kind in ('tree-primary','tree-secondary'):
        height=6.1 if kind=='tree-primary' else 5.15;r=1.55 if kind=='tree-primary' else 1.45
        k.tube('Exposed harvestable trunk',[(0,0,0),(.04,.02,height*.45),(0,0,height)],[.23,.18,.025],k.wood,9,True)
        for i in range(5):
            a=i*math.tau/5;k.tube('Small grounding root',[(math.cos(a)*.5,math.sin(a)*.5,.04),(math.cos(a)*.20,math.sin(a)*.20,.15),(0,0,.6)],[.035,.10,.13],k.bark,7)
        for i in range(6):
            z=1.28+i*(height-2)/5;radius=r*(1-i*.145)
            canopy(k,'Distinct pine needle tier',z,radius,1.12-i*.07,i*.36)
        tree_actions(k)
    elif kind=='ancient-tree':
        k.group('Ancient fluted trunk')
        k.tube('Great trunk',[(0,0,0),(.3,.2,8),(-.7,0,18),(.5,.8,34)],[5.1,3.6,3.1,2.3],k.bark,14)
        for i in range(12):
            a=i*math.tau/12;d=Vector((math.cos(a),math.sin(a),0));reach=7+(i%3)*1.7
            k.tube('Buttress root',[tuple(d*reach+Vector((0,0,.05))),tuple(d*5.5+Vector((0,0,.65))),tuple(d*3.6+Vector((0,0,3))),tuple(d*3.3+Vector((0,0,8)))],[.08,.55,.9,.42],k.bark,9)
            k.tube('Raised broad bark flute',[tuple(d*4.25+Vector((0,0,.6))),tuple(d*3.4+Vector((.3,.2,8))),tuple(d*3.0+Vector((-.7,0,18))),tuple(d*2.3+Vector((.5,.8,32)))],[.42,.30,.32,.15],k.wood,8)
        for sign in (-1,1):k.tube('Canopy limb',[(0,0,23),(sign*4,1,26),(sign*10,1.5,30),(sign*15,2,31)],[1.4,1.05,.65,.08],k.bark,10)
        # Oversized tree is deliberately a boundary trunk; offscreen crown implied.
        for j in range(5):
            x=4.4-j*.13;y=(-1 if j%2 else 1)*.9;z=2+j*2.3
            k.ell('Bracket mushroom underside',(x,y,z),(1.1,.75,.17),k.cut,12,5)
            k.ell('Bracket mushroom ochre cap',(x,y,z+.12),(1.13,.77,.28),k.seed,12,6)
    elif kind=='amber-outcrop':
        k.foundation(3.9,3.8);k.group('Exposed amber deposit')
        for x,y,r,h in [(0,.15,.9,3.1),(-.85,.12,.61,2.05),(.65,.37,.7,2.45),(.45,-.5,.52,1.5)]:k.crystal('Mineable amber mass',(x,y,.1),r,h)
        for x,y in [(-1.4,-1.1),(.9,-1.2),(1.5,.55)]:k.crystal('Broken amber shard',(x,y,.1),.27,.58)
        for x in (-1.45,1.45):
            k.stick('Amber supporting twig',(x,-.2,.05),(x*.82,.5,1.3),.12);k.lash((x*.87,.4,1.1),.15)
        k.stick('Cradle cross twig',(-1.5,.5,.9),(1.5,.5,.9),.11)
    elif kind=='corrupted-root':
        for i in range(10):
            a=i*math.tau/10;d=Vector((math.cos(a),math.sin(a),0));reach=2.4+(i%3)*.3
            points=[tuple(d*reach+Vector((0,0,.05))),tuple(d*1.5+Vector((0,0,.35))),tuple(d*.8+Vector((0,0,1.4))),tuple(d*1.1+Vector((0,0,2.1+(i%3)*.32)))]
            k.tube('Harvestable corrupted root',points,[.03,.19,.25,.05],k.corrupt,9)
            glow=[tuple(Vector(p)+Vector((.04,-.02,.07))) for p in points]
            k.tube('Violet sap fissure',glow,[.008,.02,.023,.005],k.sap,5)
        k.ell('Blackened root knot',(0,0,.75),(1.1,.9,.85),k.corrupt,12,7)
    elif kind in ('mushroom-cluster','tiny-mushrooms'):
        size=1 if kind=='mushroom-cluster' else .32
        for i,(x,y,h,r) in enumerate([(0,0,1.2,.64),(.73,.17,.8,.42),(-.48,-.31,.63,.35)]):
            x*=size;y*=size;h*=size;r*=size
            k.tube('Cream mushroom stalk',[(x,y,0),(x+.035,y,h)],[r*.19,r*.13],k.cut,8)
            k.ell('Mushroom underside',(x,y,h),(r,r,.10*size),k.cut,12,5)
            k.ell('Ochre mushroom cap',(x,y,h+.09*size),(r,r,.33*size),k.seed,12,6)
    elif kind=='twig-log':
        k.tube('Small fallen twig',[(-1.5,0,.19),(-.3,.04,.2),(.65,-.04,.22),(1.5,0,.19)],[.15,.20,.17,.11],k.bark,9,True)
        k.tube('Snapped offshoot',[(.2,0,.21),(.35,.31,.30),(.60,.50,.32)],[.095,.055,.012],k.wood,7,True)
    elif kind=='pebble-cluster':
        for i,(x,y,s) in enumerate([(0,0,.34),(.48,.14,.25),(-.39,-.10,.22),(.1,-.42,.14)]):k.ell('Small path pebble',(x,y,s*.52),(s,s*.78,s*.61),k.stone if i%2 else k.stone2,7,4)
    elif kind=='forest-leaves':
        for i in range(5):
            a=i*math.tau/5;k.leaf('Small decorative ground leaf',(0,0,.04),(math.cos(a)*.65,math.sin(a)*.65,.15+(i%2)*.18),.17,k.green,veins=False)
    elif kind=='short-grass':
        # Opaque crossed blade ribbons: no alpha-tested rectangle overdraw.
        for i in range(34):
            a=i*2.399;x=math.cos(a)*(.06+.05*math.sqrt(i));y=math.sin(a)*(.06+.05*math.sqrt(i));h=.13+(i%7)*.029
            dx=math.cos(a+.5);dy=math.sin(a+.5);w=.018
            k.mesh('Short olive grass blade',[(x-dy*w,y+dx*w,0),(x+dy*w,y-dx*w,0),(x+dx*h*.32+dy*w*.5,y+dy*h*.32-dx*w*.5,h*.65),(x+dx*h*.56,y+dy*h*.56,h),(x+dx*h*.32-dy*w*.5,y+dy*h*.32+dx*w*.5,h*.65)],[(0,1,2,4),(4,2,3)],k.green2 if i%3 else k.green)
    else:raise ValueError(kind)
    k.finish()
