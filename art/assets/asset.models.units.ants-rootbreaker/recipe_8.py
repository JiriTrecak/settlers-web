import bpy,sys,math,numpy as np
from pathlib import Path
from mathutils import Vector
assert bpy.app.background
root=Path.cwd();work=root/'.asset-work/ant-army-2026-10-11/rootbreaker'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/library/asset.models.units.ants-rootbreaker/geometry.glb'))
scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE');mesh=next(o for o in scene.objects if o.type=='MESH')
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=bpy.data.actions['idle'];rig.animation_data.action_slot=rig.animation_data.action.slots[0];scene.frame_set(0)
base=mesh.data.materials[0];im=base.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4))
colors=[0xff3038,0x338dff,0x35de53,0xf2cf35,0xed842a,0x9656cf,0x36cbd0,0xffffff]
for i,color in enumerate(colors):
 c=np.array([(color>>16)&255,(color>>8)&255,color&255])/255;c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
 p=pixels.copy();a=p[:,3:4].copy();shade=np.sqrt(np.max(p[:,:3],axis=1))[:,None];p[:,:3]=p[:,:3]*(1-a)+shade*c*a;p[:,3]=1
 tex=bpy.data.images.new('Player '+str(i+1),width=im.size[0],height=im.size[1],alpha=True);tex.pixels.foreach_set(p.ravel());tex.pack()
 for row in range(2):
  r=rig.copy();r.data=rig.data.copy();scene.collection.objects.link(r)
  m=mesh.copy();m.data=mesh.data.copy();scene.collection.objects.link(m);m.parent=r
  for mod in m.modifiers:
   if mod.type=='ARMATURE':mod.object=r
  mat=base.copy();mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image=tex;m.data.materials.clear();m.data.materials.append(mat)
  holder=bpy.data.objects.new('Review transform',None);scene.collection.objects.link(holder);r.parent=holder;holder.location=(i*1.25-4.375,row*1.9-.95,0);holder.rotation_euler.z=row*math.pi
mesh.hide_render=True;rig.hide_render=True
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1800;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Zinc');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.025,.029,1)
for pos,energy,size in [((0,-5,8),1700,8),((-5,1,5),600,6),((4,5,6),1000,6)]:
 d=bpy.data.lights.new('Softbox','AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=10.5
for name,pos in [('overhead',(0,-7,8)),('top',(0,-.01,10))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.3))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(work/('offline-'+name+'-colors.png'));bpy.ops.render.render(write_still=True)
