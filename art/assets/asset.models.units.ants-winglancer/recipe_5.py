# Winglancer leaf helm: ownership surface visible above the orange abdomen.
# Separate editable piece using the existing painted leaf material and UV atlas.
from mathutils import Vector
body=meshes[0];mat=body.data.materials[0]
im=mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
px=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4)
# Find a red leaf texel with a safe surrounding patch, preserving source paint.
candidates=np.argwhere((px[::16,::16,3]>.99)&(px[::16,::16,0]>.55)&(px[::16,::16,1]<.1))
center=None
for yy,xx in candidates:
 yy=int(yy*16);xx=int(xx*16);patch=px[max(0,yy-12):yy+13,max(0,xx-12):xx+13]
 if patch.shape[:2]==(25,25) and patch[:,:,3].min()>.99:center=(xx,yy);break
assert center is not None
# Symmetrical six-edged leaf with raised midrib and thin closed underside.
outline=[(-.025,-.18,.725),(-.075,-.15,.755),(-.10,-.08,.755),(-.075,-.01,.745),(-.025,.04,.72),(.025,-.01,.745),(.05,-.08,.755),(.025,-.15,.755)]
n=len(outline)
verts=outline+[(-.025,-.08,.80)]+[(x,y-.006,z-.008)for x,y,z in outline]+[(-.025,-.08,.792)]
faces=[]
for i in range(n):
 j=(i+1)%n;faces.extend([(n,i,j),(2*n+1,j+n+1,i+n+1),(i,i+n+1,j+n+1,j)])
me=bpy.data.meshes.new('Winglancer leaf helm');me.from_pydata(verts,[],faces);me.materials.append(mat);me.update()
for polygon in me.polygons:polygon.use_smooth=True
uv=me.uv_layers.new(name='UVMap')
for loop in me.loops:
 x,y,z=verts[loop.vertex_index];uv.data[loop.index].uv=((center[0]+(x+.025)*35)/im.size[0],(center[1]+(y+.08)*35)/im.size[1])
o=bpy.data.objects.new('Winglancer leaf helm',me);scene.collection.objects.link(o);o.matrix_world=body.matrix_world.copy();o.parent=rig
vg=o.vertex_groups.new(name='Head');vg.add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Mantle skeleton','ARMATURE');mod.object=rig
# Keep one material primitive at runtime; named geometry remains in vertex group.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
# Broad leaf backplate makes ownership visible between the natural amber wings.
raw_outline=[(-.065,.258,.585),(-.16,.28,.52),(-.205,.27,.405),(-.19,.235,.28),(-.105,.245,.36),(-.015,.255,.49)]
outline=[tuple(transform@Vector(v))for v in raw_outline];ridge=tuple(transform@Vector((-.10,.315,.46)));n=len(outline)
verts=outline+[ridge]+[(x,y-.005,z-.003)for x,y,z in outline]+[(ridge[0],ridge[1]-.005,ridge[2]-.003)];faces=[]
for i in range(n):
 j=(i+1)%n;faces.extend([(n,i,j),(2*n+1,j+n+1,i+n+1),(i,i+n+1,j+n+1,j)])
me=bpy.data.meshes.new('Flight leaf backplate');me.from_pydata(verts,[],faces);me.materials.append(mat);me.update();uv=me.uv_layers.new(name='UVMap')
for loop in me.loops:
 x,y,z=verts[loop.vertex_index];uv.data[loop.index].uv=((center[0]+x*20)/im.size[0],(center[1]+z*12)/im.size[1])
o=bpy.data.objects.new('Flight leaf backplate',me);scene.collection.objects.link(o);o.parent=rig
vg=o.vertex_groups.new(name='Abdomen');vg.add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Flight skeleton','ARMATURE');mod.object=rig
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
