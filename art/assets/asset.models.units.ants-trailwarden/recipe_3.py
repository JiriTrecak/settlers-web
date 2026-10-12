"""Local equipment correction: moving nock, taut string, held arrow.
Runs in the reference-preserving Archer adapter after the baked arm animation.
"""
import bmesh
from mathutils import Matrix,Vector
# Remove only the inspected static string panels, preserving the painted bow.
parts=json.loads((work/'parts.json').read_text());raw=json.loads((work/'raw-geometry.json').read_text())['vertices']
string_ids={i for n in [163,164,169,170,175,176,178,179,182,183] for i in parts[n]['ids']}
string_points={tuple(round(c,6) for c in raw[i]) for i in string_ids};removed=0
for mesh in meshes:
 if mesh.get('equipment')!='bow':continue
 bm=bmesh.new();bm.from_mesh(mesh.data)
 faces=[f for f in bm.faces if all(tuple(round(c,6) for c in v.co) in string_points for v in f.verts)]
 removed+=len(faces);bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(mesh.data);bm.free()
assert removed>10,f'Unexpected string selection: {removed}'
rest_nock=Vector((-.217,.167,.485));low=Vector((-.153,.17,.246));high=Vector((-.342,.169,.795))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for name in ['bow_nock','held_arrow']:
 b=rig.data.edit_bones.new(name);b.head=rest_nock;b.tail=rest_nock+Vector((0,-.04,0));b.parent=rig.data.edit_bones['mixamorig:RightHand'];b.use_deform=True
bpy.ops.object.mode_set(mode='OBJECT')
# Use a neutral ivory texel from the existing atlas, retaining the one painted
# material and excluding equipment from the ownership mask.
mat=meshes[0].data.materials[0];im=mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
pix=np.asarray(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4)
rgb=pix[:,:,:3];distance=np.sum((rgb-np.array([.55,.40,.23]))**2,axis=2);distance[pix[:,:,3]>.01]=1e6
vv,uu=np.unravel_index(distance.argmin(),distance.shape);uv=((uu+.5)/im.size[0],(vv+.5)/im.size[1])
verts=[];faces=[];weights=[]
def rod(a,b,radius,bone_a,bone_b,sides=6):
 axis=(b-a).normalized();u=axis.cross(Vector((1,0,0)))
 if u.length<.1:u=axis.cross(Vector((0,0,1)))
 u.normalize();v=axis.cross(u);start=len(verts)
 for pos,bone in [(a,bone_a),(b,bone_b)]:
  for i in range(sides):
   theta=2*math.pi*i/sides;verts.append(pos+radius*(math.cos(theta)*u+math.sin(theta)*v));weights.append(bone)
 for i in range(sides):j=(i+1)%sides;faces.append((start+i,start+j,start+sides+j,start+sides+i))
rod(low,rest_nock,.0014,'mixamorig:RightHand','bow_nock')
rod(rest_nock,high,.0014,'bow_nock','mixamorig:RightHand')
# The held shaft points forward from the string; the runtime projectile will
# take over after release, rather than keeping an arrow stuck to the bow.
rod(rest_nock,rest_nock+Vector((-.48,0,0)),.0024,'held_arrow','held_arrow')
base=len(verts);verts.extend([rest_nock+Vector((-.46,-.017,0)),rest_nock+Vector((-.46,.017,0)),rest_nock+Vector((-.525,0,0)),rest_nock+Vector((-.46,0,.011))]);weights.extend(['held_arrow']*4);faces.extend([(base,base+1,base+2),(base,base+3,base+2),(base+1,base+2,base+3)])
data=bpy.data.meshes.new('Bowstring and held arrow');data.from_pydata(verts,[],faces);data.update();obj=bpy.data.objects.new('Trailwarden bowstring and held arrow',data);scene.collection.objects.link(obj);obj.parent=rig;obj.data.materials.append(mat)
layer=data.uv_layers.new(name='UVMap')
for loop in layer.data:loop.uv=uv
for name in set(weights):
 group=obj.vertex_groups.new(name=name);group.add([i for i,w in enumerate(weights) if w==name],1,'REPLACE')
mod=obj.modifiers.new('Equipment skin','ARMATURE');mod.object=rig;meshes.append(obj)
def ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
left=rig.pose.bones['mixamorig:RightHand'];right=rig.pose.bones['mixamorig:LeftHand'];nock=rig.pose.bones['bow_nock'];arrow=rig.pose.bones['held_arrow']
left_rest=rig.data.bones[left.name].matrix_local.copy();nock_rest=nock.bone.matrix_local.copy();arrow_rest=arrow.bone.matrix_local.copy()
for action in list(bpy.data.actions):
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
 start,end=map(int,action.frame_range)
 for frame in range(start,end+1):
  scene.frame_set(frame);bpy.context.view_layer.update()
  carried=left.matrix@left_rest.inverted();neutral=carried@rest_nock
  release=36 if action.name=='attack' else 48
  draw=ease((frame-16)/12)*(1-ease((frame-release)/3)) if action.name in ['attack','cast'] else 0
  position=neutral.lerp(right.matrix.translation+Vector((-.03,.008,-.006)),draw)
  nock.matrix=Matrix.Translation(position)@(carried.to_quaternion()@nock_rest.to_quaternion()).to_matrix().to_4x4()
  for channel in ['location','rotation_quaternion','scale']:nock.keyframe_insert(channel,frame=frame)
  direction=(neutral-position+carried.to_3x3()@Vector((-.09,0,0))).normalized()
  rotation=Vector((-1,0,0)).rotation_difference(direction)@arrow_rest.to_quaternion()
  arrow.matrix=Matrix.Translation(position)@rotation.to_matrix().to_4x4()
  visible=action.name in ['attack','cast'] and 16<=frame<release
  arrow.scale=(1,1,1) if visible else (.00001,)*3
  for channel in ['location','rotation_quaternion','scale']:arrow.keyframe_insert(channel,frame=frame)
(work/'bow-equipment.json').write_text(json.dumps({'removedStringTriangles':removed,'releaseFrame':36,'castReleaseFrame':48,'attackEndFrame':64,'stringAnchors':[list(low),list(high)],'heldArrowVisibleFrames':[16,35]},indent=2))
