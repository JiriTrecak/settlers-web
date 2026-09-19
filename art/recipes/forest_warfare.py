"""Editable forest-warfare kit. Each asset has its own recipe, source and studio.

Geometry is intentionally broad: bound twigs, actual leaf shingles, seed shells.
No heraldry/flags: ownership is carried by functional leaf roofs and armor.
All coordinates are authored in metres, Z up, front -Y.
"""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'experiments/building-studio'))
from stage import create_stage


class ForestKit:
    def __init__(self, asset):
        if not bpy.app.background:
            raise RuntimeError('Use a separate background Blender process')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.asset = Path(asset)
        self.config = json.loads((self.asset/'asset.json').read_text())
        self.rng = random.Random(190926)
        self.palette = json.loads((self.asset/'palette.json').read_text())['samples']
        self.groups = {}
        self.group('Structure')
        self.wood = self.mat('Warm timber', '#9a6a3d', texture='wood')
        self.cut = self.mat('Pale cut wood', '#c59a66')
        self.bark = self.mat('Dark bark', '#61442e', texture='bark')
        self.brown = self.mat('Protective dried leaves', '#936440', texture='leaf')
        self.rope = self.mat('Bound root fibre', '#bca171')
        self.dark = self.mat('Recesses', '#241e17')
        self.stone = self.mat('Slate pebbles', '#76786f')
        self.stone2 = self.mat('Stone shadow', '#555a53')
        self.seed = self.mat('Acorn shell', '#a87841', texture='wood')
        self.edge = self.mat('Acorn cap scales', '#987047')
        self.team = self.mat('TC_TeamColor', '#ad2731', texture='leaf')
        self.green = self.mat('Forest green', '#41602c')
        self.green2 = self.mat('Sunward needles', '#67853d')
        self.amber = self.mat('Warm amber resin', '#e79d25', rough=.4, glow=.18)
        self.amber2 = self.mat('Amber light facets', '#ffc750', rough=.36, glow=.15)
        self.corrupt = self.mat('Corrupted heartwood', '#383036')
        self.sap = self.mat('Violet root sap', '#76539b', rough=.65, glow=.25)

    def group(self, name):
        if name not in self.groups:
            c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c)
            self.groups[name]=c
        self.current=self.groups[name]

    def mat(self, name, color, rough=.86, glow=0, texture=None):
        if color in self.palette: rgb=self.palette[color]['representative']['linear_rgb']
        else:
            raw=[int(color[i:i+2],16)/255 for i in (1,3,5)]
            rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in raw]
        m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
        p=m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
        if glow:
            p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=glow
        # Low-contrast real PNG texture, packed into .blend/GLB. Broad grain only.
        if texture:
            path=ROOT/'art/sources/textures/forest-warfare'/f'{texture}.png'
            if path.exists():
                import numpy as np
                source=bpy.data.images.load(str(path),check_existing=True)
                pixels=np.array(source.pixels[:],dtype=np.float32).reshape(-1,4)
                if name!='TC_TeamColor':pixels[:,:3]*=np.array(rgb,dtype=np.float32)
                im=bpy.data.images.new(name+' · painted grain',width=source.size[0],height=source.size[1])
                im.colorspace_settings.name='Linear Rec.709';im.pixels.foreach_set(pixels.reshape(-1));im.pack();im.use_fake_user=True
                tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
                if name=='TC_TeamColor':
                    m['ownership_texture_neutral']=True
                    tint=m.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
                    tint.inputs[2].default_value=(*rgb,1)
                    m.node_tree.links.new(tex.outputs['Color'],tint.inputs[1]);m.node_tree.links.new(tint.outputs[0],p.inputs['Base Color'])
                else:m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
        return m

    def mesh(self, name, verts, faces, materials, indices=None):
        me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        ob=bpy.data.objects.new(name,me);self.current.objects.link(ob)
        for mat in (materials if isinstance(materials,list) else [materials]): me.materials.append(mat)
        if indices:
            for p in me.polygons:p.material_index=indices[p.index%len(indices)]
        # Stable object-space box projection; textures are subtle and tileable.
        uv=me.uv_layers.new(name='ForestUV')
        for p in me.polygons:
            axis=max(range(3),key=lambda i:abs(p.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for li in p.loop_indices:
                v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[a]*.6,v[b]*.6)
        return ob

    def tube(self, name, pts, radii, mat=None, n=8, cuts=False):
        ps=[Vector(p) for p in pts];vs=[];previous=None
        for j,p in enumerate(ps):
            tangent=(ps[min(j+1,len(ps)-1)]-ps[max(0,j-1)]).normalized()
            if previous is None:
                axis=min((Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))),key=lambda v:abs(v.dot(tangent)))
                u=tangent.cross(axis)
            else:u=previous-tangent*previous.dot(tangent)
            if u.length<.001:u=tangent.cross(Vector((0,1,0)))
            u.normalize();v=tangent.cross(u).normalized()
            previous=u
            for i in range(n):vs.append(tuple(p+radii[j]*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))))
        fs=[tuple(reversed(range(n))),tuple(range(len(vs)-n,len(vs)))]
        fs += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(ps)-1) for i in range(n)]
        ob=self.mesh(name,vs,fs,[mat or self.wood,self.cut] if cuts else mat or self.wood,[1,1]+[0]*(len(fs)-2) if cuts else None)
        for p in ob.data.polygons:
            p.use_smooth=p.index>1
        return ob

    def stick(self, name, a, b, r=.12, mat=None):
        a,b=Vector(a),Vector(b);m=a.lerp(b,.53)
        m.x += self.rng.uniform(-.025,.025);m.y += self.rng.uniform(-.025,.025)
        return self.tube(name,[a,m,b],[r,r*.91,r*.86],mat,8,True)

    def ell(self,name,c,s,mat,n=12,rings=6):
        vs=[(c[0],c[1],c[2]+s[2])]
        for j in range(1,rings):
            t=math.pi*j/rings
            for i in range(n):
                a=i*math.tau/n;vs.append((c[0]+s[0]*math.sin(t)*math.cos(a),c[1]+s[1]*math.sin(t)*math.sin(a),c[2]+s[2]*math.cos(t)))
        vs.append((c[0],c[1],c[2]-s[2]));bot=len(vs)-1
        fs=[(0,1+i,1+(i+1)%n) for i in range(n)]
        fs += [(1+j*n+i,1+(j+1)*n+i,1+(j+1)*n+(i+1)%n,1+j*n+(i+1)%n) for j in range(rings-2) for i in range(n)]
        fs += [(bot,1+(rings-2)*n+(i+1)%n,1+(rings-2)*n+i) for i in range(n)]
        ob=self.mesh(name,vs,fs,mat)
        for p in ob.data.polygons:p.use_smooth=True
        return ob

    def box(self,name,c,s,mat):
        vs=[(c[0]+a*s[0]/2,c[1]+b*s[1]/2,c[2]+d*s[2]/2) for a,b,d in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
        ob=self.mesh(name,vs,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat)
        bevel=ob.modifiers.new('Soft handmade edges','BEVEL');bevel.width=min(s)*.10;bevel.segments=2
        return ob

    def lash(self,c,r=.19,axis='z',loops=3):
        for j in range(loops):
            pts=[]
            for i in range(13):
                a=i*math.tau/12;p=[r*math.cos(a),r*math.sin(a),(j-(loops-1)/2)*.055]
                if axis=='x':p=[p[2],p[0],p[1]]
                elif axis=='y':p=[p[0],p[2],p[1]]
                pts.append(tuple(c[k]+p[k] for k in range(3)))
            self.tube('Root fibre binding',pts,[.032]*len(pts),self.rope,5)

    def leaf(self,name,start,end,width,mat=None,normal=(0,0,1),veins=True):
        a,b=Vector(start),Vector(end);d=b-a;side=d.cross(Vector(normal)).normalized()
        if side.length<.1:side=Vector((1,0,0))
        norm=side.cross(d).normalized();vs=[];sections=13
        for j in range(sections):
            t=j/(sections-1);w=width*max(.005,math.sin(math.pi*t))**.48*(.93 if j%2 else 1)
            center=a+d*t+norm*(math.sin(math.pi*t)*width*.08)
            vs += [tuple(center-side*w),tuple(center+norm*width*.035),tuple(center+side*w)]
        fs=[]
        for j in range(sections-1):
            for k in range(2):fs.append((j*3+k,j*3+k+1,(j+1)*3+k+1,(j+1)*3+k))
        # Actual thin geometry, not a single-sided card.
        old=len(vs);vs += [tuple(Vector(p)-norm*.035) for p in vs]
        fs += [tuple(old+i for i in reversed(f)) for f in fs.copy()]
        for j in range(sections-1):
            for k in (0,2):fs.append((j*3+k,(j+1)*3+k,old+(j+1)*3+k,old+j*3+k))
        obj=self.mesh(name,vs,fs,mat or self.team)
        for face in obj.data.polygons:
            for li in face.loop_indices:
                vi=obj.data.loops[li].vertex_index%old
                obj.data.uv_layers.active.data[li].uv=((vi%3)*.5,(vi//3)/(sections-1))
        if veins:
            pts=[Vector(vs[j*3+1])+norm*.015 for j in range(sections)]
            self.tube(name+' midrib',pts,[.019+width*.016]*sections,mat or self.team,4)
            for j in (2,4,6,8,10):
                for sign in (-1,1):
                    t=(j+1)/(sections-1);tip=a+d*t+side*sign*width*math.sin(math.pi*t)*.8+norm*(math.sin(math.pi*t)*width*.08+.027)
                    self.tube(name+' side vein',[pts[j],tip],[.013,.006],mat or self.team,4)
        return obj

    def roof(self,w,d,eave,peak,center=(0,0),mat=None):
        self.group('Functional team leaf roof')
        # Each hip is a fan of broad overlapping shingles. Thin serrated edges,
        # raised ribs and staggered tips remain readable from the game camera.
        for face in range(4):
            a=face*math.pi/2
            side=Vector((math.cos(a),math.sin(a),0));out=Vector((-math.sin(a),math.cos(a),0))
            span=w if face%2==0 else d;reach=d/2 if face%2==0 else w/2
            for j in range(5):
                u=(j-2)/2
                start=Vector((center[0],center[1],peak+.04))+side*u*.09
                end=Vector((center[0],center[1],eave+.04*(j%2)))+side*(span*.46*u)+out*(reach*(1.03 if j%2 else .96))
                self.leaf('Layered red roof leaf',start,end,span*.16,mat)
        self.group('Bound roof frame')
        for x in (-w*.44,w*.44):
            self.stick('Roof rafter',(center[0],center[1],peak-.08),(center[0]+x,center[1]-d*.47,eave-.07),.095)
            self.stick('Roof rafter',(center[0],center[1],peak-.08),(center[0]+x,center[1]+d*.47,eave-.07),.095)
        self.stick('Roof apex peg',(center[0],center[1],peak-.10),(center[0],center[1],peak+.5),.15)
        self.lash((center[0],center[1],peak+.09),.20)

    def acorn(self,c,r=1,height=1.5,cap=True):
        self.ell('Acorn shell',c,(r,r,height),self.seed,14,8)
        if cap:
            for j in range(10):
                t=-.35+j*.145;radius=r*math.sqrt(max(0,1-t*t));count=max(5,round(18*radius/r))
                for i in range(count):
                    a=(i+j*.5)*math.tau/count
                    self.ell('Overlapping acorn cap scale',(c[0]+radius*math.cos(a),c[1]+radius*math.sin(a),c[2]+height*t),(.135*r,.135*r,.13*r),self.edge,8,5)

    def crystal(self,name,c,r,h):
        vs=[];n=7
        for z,radius in [(0,r*.60),(h*.27,r),(h*.71,r*.78)]:
            for i in range(n):
                a=i*math.tau/n;vs.append((c[0]+radius*math.cos(a),c[1]+radius*math.sin(a),c[2]+z+.07*h*math.sin(i*2.1)))
        vs.append((c[0]+r*.16,c[1],c[2]+h));fs=[tuple(reversed(range(n)))]
        for j in range(2):
            for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        fs += [(2*n+i,2*n+(i+1)%n,3*n) for i in range(n)]
        return self.mesh(name,vs,fs,[self.amber,self.amber2],[0]+[1 if i%4==0 else 0 for i in range(len(fs)-1)])

    def lean_roof(self,w,d,front,back):
        self.group('Functional team leaf roof')
        for i in range(7):
            x=(i-3)*w/7
            self.leaf('Overlapping lean-to leaf',(x,d*.48,back),(x+.07,-d*.55,front),w*.11)
        self.stick('Lean-to ridge',(-w/2,d*.45,back+.02),(w/2,d*.45,back+.02),.11)
        self.stick('Lean-to eave',(-w/2,-d*.48,front-.03),(w/2,-d*.48,front-.03),.10)

    def foundation(self,w,d):
        self.group('Foundation pebbles')
        for i in range(22):
            a=i*math.tau/22;x=math.cos(a)*w*.5;y=math.sin(a)*d*.5
            if y<-d*.38 and abs(x)<w*.16:continue
            self.ell('Footing pebble',(x,y,.16),(.28,.26,.24),self.stone if i%3 else self.stone2,7,4)

    def frame(self,w,d,h,open_front=True,corrupt=False):
        self.group('Bound stick structure')
        for x in (-w/2,w/2):
            for y in (-d/2,d/2):
                self.stick('Structural corner post',(x*1.03,y*1.03,.15),(x,y,h+.35),.23,self.corrupt if corrupt and x<0 else None)
                self.lash((x,y,h-.06),.29)
            self.stick('Side beam',(x,-d/2,h),(x,d/2,h),.14)
        for y in (-d/2,d/2):self.stick('Cross beam',(-w/2,y,h),(w/2,y,h),.16)
        for side in (-1,1):
            for j in range(4):
                y=-d*.36+j*d*.24
                self.stick('Wall bark stave',(side*(w/2-.08),y,.12),(side*w/2,y,h-.12),.16,self.bark)
        self.group('Brown protective leaf walls')
        for side in (-1,1):
            for j in range(5):
                y=-d*.39+j*d*.195
                self.leaf('Side dried leaf cladding',(side*w/2,y,h-.1),(side*(w/2+.13),y-.08,.22),d*.115,self.brown,(side,0,0),True)
        for j in range(5):
            x=-w*.4+j*w*.2
            self.leaf('Rear dried leaf cladding',(x,d/2,h),(x+.08,d/2+.1,.2),w*.15,self.brown,(0,1,0),False)
        if not open_front:
            for x in (-w*.35,w*.35):self.leaf('Entrance leaf cladding',(x,-d/2,h-.1),(x,-d/2-.12,.15),w*.135,self.brown,(0,-1,0),True)

    def shield(self,x,y,z,r=.36):
        self.ell('Acorn shield backing',(x,y,z),(r,.09,r*1.15),self.seed,10,5)
        self.ell('Painted shield ownership face',(x,y-.09,z),(r*.73,.045,r*.89),self.team,10,5)

    def sword(self,x,y,z):
        self.stick('Wooden sword grip',(x,y,z),(x,y,z+.27),.05)
        self.box('Seed sword guard',(x,y,z+.25),(.33,.1,.08),self.seed)
        self.mesh('Heavy hardwood blade',[(x-.12,y-.045,z+.3),(x+.12,y-.045,z+.3),(x+.10,y-.04,z+1),(x,y-.035,z+1.22),(x-.10,y-.04,z+1),(x,y+.055,z+.5)],[(0,1,2,3,4),(0,5,1),(1,5,2),(2,5,3),(3,5,4),(4,5,0)],self.cut)

    def finish(self):
        self.group('Studio');scene=create_stage(self.config,self.current)
        reference=bpy.data.images.load(str(self.asset/'reference.png'),check_existing=True);reference.name='reference.png';reference.pack();reference.use_fake_user=True
        stats={'meshes':sum(o.type=='MESH' for o in scene.objects),'materials':len(bpy.data.materials),'collections':list(self.groups)}
        (self.asset/'model-stats.json').write_text(json.dumps(stats,indent=2))
        bpy.ops.wm.save_as_mainfile(filepath=str(self.asset/self.config['blend']))


def building(asset,kind):
    k=ForestKit(asset)
    if kind in ('mound','great-mound'):
        w,d,h=6.7,6.1,3.4
        k.foundation(w+.7,d+.7);k.frame(w,d,h,False)
        k.group('Great seed heart')
        # Door framed by independent acorn cap, never a solid ellipsoid blocking entrance.
        k.acorn((0,-d/2-.16,h+.13),1.04,.83)
        for x in (-1.13,1.13):
            k.tube('Curving main doorway post',[(x,-d/2-.25,.05),(x*.99,-d/2-.3,h*.45),(x*.77,-d/2-.2,h*.83),(x*.4,-d/2-.1,h)],[.25,.23,.21,.17],k.wood,10,True)
        for j in range(3):k.box('Entrance stone step',(0,-d/2-.5-j*.28,.2-j*.055),(2.25+j*.15,.55,.20),k.stone)
        k.box('Recessed inner floor',(0,0,.055),(w*.88,d*.90,.10),k.bark)
        k.roof(w+1,d+1,h+.10,h+1.7)
        k.roof(3.1,2.9,h+1.32,h+2.04)
        if kind=='great-mound':
            k.group('Raised central hall tier');k.tube('Upper bark drum',[(0,0,h+1.0),(0,0,h+2.05)],[1.32,1.14],k.bark,12)
            k.roof(3.8,3.8,h+1.9,h+3.0)
    elif kind=='house':
        k.foundation(3.3,3)
        # Hollow shell walls with a genuinely open entrance.
        for i in range(12):
            a=i*math.tau/12
            if math.sin(a)<-.70:continue
            p=(math.cos(a)*1.25,math.sin(a)*1.15)
            k.leaf('Acorn husk wall',(p[0]*.63,p[1]*.63,2.05),(p[0],p[1],.12),.40,k.seed,(p[0],p[1],0),False)
        k.roof(3.3,3.1,1.95,2.85)
        for x in (-.6,.6):k.stick('House doorway',(x,-1.15,0),(x,-1.05,1.7),.11)
    elif kind=='watchtower':
        k.foundation(3.7,3.7);k.group('Tripod tower frame')
        for i in range(3):
            a=math.tau*i/3+.5;x,y=math.cos(a),math.sin(a)
            k.stick('Splayed heavy lookout leg',(x*1.7,y*1.7,.1),(x*.82,y*.82,5.3),.18)
            k.lash((x*.97,y*.97,4.3),.22)
            b=a+math.tau/3
            k.stick('Triangulated bracing',(x*1.4,y*1.4,1.0),(math.cos(b)*1.05,math.sin(b)*1.05,3.7),.10)
        k.group('Acorn lookout bowl')
        k.tube('Lookout floor',[(0,0,4.7),(0,0,4.9)],[1.06,1.23],k.seed,16)
        # Bowl is open above the floor; archer feet stand at 4.9 metres.
        for j in range(3):
            for i in range(14):
                a=(i+j*.5)*math.tau/14;r=1.15+j*.04
                k.ell('Acorn cup overlapping scales',(r*math.cos(a),r*math.sin(a),4.94+j*.24),(.28,.24,.22),k.edge,7,4)
        k.tube('Cup rim',[(1.28*math.cos(i*math.tau/24),1.28*math.sin(i*math.tau/24),5.60) for i in range(25)],[.075]*25,k.rope,6)
        for x in (-.95,.95):
            k.stick('Canopy upright',(x,.35,5.3),(x,.35,7.08),.085)
            k.stick('Ladder rail',(x*.45,-1.25,.15),(x*.45,-.95,4.9),.07)
        for j in range(12):k.stick('Ladder rung',(-.44,-1.25+j*.025,.35+j*.36),(.44,-1.25+j*.025,.35+j*.36),.04)
        k.roof(3.05,3.05,7.03,7.6)
        k.group('Gameplay sockets');o=bpy.data.objects.new('socket_garrison',None);k.current.objects.link(o);o.location=(0,0,4.9);o['garrisonCapacity']=1
    elif kind in ('barracks','bombardier-workshop'):
        w=5.4 if kind=='barracks' else 5.8;d=w;h=2.8
        k.foundation(w+.5,d+.5);k.frame(w,d,h);k.roof(w+.65,d+.65,h+.05,h+1.25)
        k.group('Military equipment')
        if kind=='barracks':
            for x in (-1.8,-.9,0,.9,1.8):
                k.stick('Rack upright',(x,-d/2+.05,.1),(x,-d/2+.05,1.5),.055)
                if x<.1:k.shield(x,-d/2-.12,.72)
                else:k.sword(x,-d/2-.1,.18)
            k.stick('Weapon rack beam',(-2.1,-d/2,1.0),(2.1,-d/2,1),.055)
        else:
            for x in (-1.25,1.25):
                # Hollow seedpod barrel points out and up from the open work bay.
                pts=[(x,-.1,.7),(x,-.65,1.15),(x,-1.4,1.75)]
                k.tube('Seedpod mortar outer barrel',pts,[.66,.73,.60],k.seed,12)
                k.ell('Mortar dark bore',(x,-1.78,1.96),(.41,.06,.41),k.dark,12,5)
                for dx in (-.54,.54):k.stick('Mortar assembly cradle',(x+dx,-1.4,.1),(x+dx,.9,1.4),.10)
            for x,y in [(-2.1,-2.4),(-1.8,-2.7),(2,-2.4)]:k.ell('Seed ammunition',(x,y,.28),(.27,.27,.27),k.seed,8,5)
    elif kind=='ironroot-forge':
        k.foundation(5.2,4.8);k.frame(4.7,4.2,2.35)
        k.lean_roof(3.1,4.4,2.5,3.2)
        k.group('Stone kiln')
        k.box('Earthen furnace',(1.3,-.6,1.1),(1.8,1.7,2.2),k.stone2)
        k.box('Kiln opening',(1.3,-1.47,.9),(1.05,.05,1.1),k.dark)
        for i in range(7):
            a=i*math.pi/6;p=(1.3+math.cos(a)*.64,-1.51,.89+math.sin(a)*.70)
            k.box('Kiln arch block',p,(.31,.26,.31),k.stone)
        for i in range(5):k.crystal('Amber kiln coals',(1.06+i*.12,-1.55,.47),.12,.24+(i%2)*.12)
        for j in range(5):k.box('Chimney stone course',(1.3,-.15,2.2+j*.40),(.94-j*.065,.88-j*.055,.36),k.stone)
        k.box('Chimney dark open top',(1.3,-.15,3.985),(.49,.45,.02),k.dark)
        k.box('Anvil block',(1.4,-2.65,.66),(1.25,.64,.28),k.stone2);k.box('Anvil base',(1.4,-2.65,.28),(.65,.65,.60),k.bark)
        for x in (-1.5,-.9,-.3):k.sword(x,-2.18,.12)
    elif kind=='rootworks':
        k.foundation(4.9,4.4);k.frame(4.4,4.0,2.25,corrupt=True);k.lean_roof(5.0,4.6,2.4,3.0)
        k.group('Root processing')
        for x in (-.9,.9):
            k.tube('Root fibre roller',[(x,-1.6,.78),(x,.85,.78)],[.42,.42],k.corrupt,10)
            for y in (-1.45,-.9,-.35,.2):k.lash((x,y,.78),.43,'y',1)
        for i in range(6):
            x=-1.7+i*.57;k.tube('Sorted dark root',[(x,-2.45,.13),(x+.17,-1.3,.32),(x,.5,.3)],[.11,.13,.07],k.corrupt,7)
        k.tube('Living corrupted corner root',[(-2.35,-2.15,0),(-2.2,-2,1.05),(-2.3,-2,2.1),(-1.6,-1.9,2.6)],[.17,.20,.12,.02],k.corrupt,8)
        k.tube('Subtle violet sap seam',[(-2.42,-2.15,.1),(-2.37,-2.1,.95),(-2.44,-2.03,1.55),(-2.29,-2.1,2.15)],[.025,.034,.024,.014],k.sap,5)
        k.leaf('Bruised corner roof leaf',(-1.55,2.15,3.02),(-1.45,-2.4,2.44),.57,k.corrupt)
        for x in (-2.4,2.4):
            k.tube('Invading roots',[(x*1.3,-2.4,.12),(x,-1.7,.35),(x,.2,1.35),(x*.96,1.65,2.8)],[.04,.18,.14,.02],k.corrupt,8)
            k.tube('Root sap glow',[(x*1.27,-2.4,.15),(x*1.01,-1.7,.47),(x*1.02,.2,1.45)],[.012,.018,.01],k.sap,5)
    elif kind=='sanctuary':
        k.group('Round shrine foundation')
        k.tube('Low circular stone step',[(0,0,.05),(0,0,.3)],[2.3,2.2],k.stone2,16)
        k.tube('Inner stone step',[(0,0,.3),(0,0,.55)],[1.7,1.6],k.stone,16)
        k.tube('Seed altar',[(0,0,.55),(0,0,1.05)],[.67,.6],k.seed,12)
        k.crystal('Amber hero heart',(0,0,1.05),.67,1.85)
        for x in (-1.7,1.7):
            k.tube('Twisted shrine root',[(x,0,.15),(x*1.13,0,1.3),(x*.83,.15,2.8),(x*.3,0,3.85)],[.22,.25,.17,.1],k.wood,8)
        for x in (-1,1):
            k.tube('Interwoven shrine root',[(x*1.85,-.15,.2),(x*1.4,-.12,1.6),(x*1.75,.2,2.8),(x*.5,.1,3.85)],[.10,.11,.095,.03],k.wood,8)
        for i in range(12):
            a=i*math.tau/12;k.box('Individual altar stones',(math.cos(a)*1.96,math.sin(a)*1.96,.41),(.57,.49,.32),k.stone)
        for x in (-1,1):k.leaf('Sheltering red shrine leaf',(0,0,4.1),(x*1.86,-.25,3.35),.78)
        k.stick('Shrine canopy peg',(0,0,3.8),(0,0,4.55),.13);k.lash((0,0,4.15),.18)
    elif kind=='forester':
        k.frame(2.6,2.4,1.65);k.roof(3.05,2.85,1.7,2.55)
        k.group('Acorn nursery')
        for x,y in [(-1.3,-1.75),(0,-1.9),(1.25,-1.7)]:
            k.tube('Nursery acorn pot',[(x,y,.05),(x,y,.55)],[.3,.41],k.seed,10)
            k.stick('Young sapling',(x,y,.5),(x,y,1.5),.035)
            for z in (.85,1.2):
                for sign in (-1,1):k.leaf('Nursery seedling leaf',(x,y,z),(x+sign*.40,y-.05,z+.25),.16,k.green,veins=False)
    else:raise ValueError(kind)
    k.finish()
