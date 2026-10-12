import bpy,sys,math
from pathlib import Path
from mathutils import Vector
p=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(p));scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for t in rig.animation_data.nla_tracks:t.mute=True
clip=sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'idle'
if clip=='rest':
 rig.animation_data.action=None
 for b in rig.pose.bones:b.matrix_basis.identity()
else:
 rig.animation_data.action=bpy.data.actions[clip];rig.animation_data.action_slot=bpy.data.actions[clip].slots[0]
scene.frame_set(int(sys.argv[-1]) if sys.argv[-1].isdigit() else 0)
for o in scene.objects:
 if o.name=='Icosphere':o.hide_render=True
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=700;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Dark studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.025,.029,1)
for name,pos,energy,size in [('Key',(2,-3,3),160,3),('Fill',(-3,-1,2),100,3),('Rim',(0,3,3),180,2)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');o=bpy.data.objects.new('Camera',d);scene.collection.objects.link(o);scene.camera=o;d.type='ORTHO';d.ortho_scale=1.5
frames=[int(x)for x in sys.argv[-1].split(',')] if all(x.isdigit()for x in sys.argv[-1].split(',')) else [scene.frame_current]
for frame in frames:
 scene.frame_set(frame)
 for name,pos in [('front',(1,-3,1.8)),('back',(-1,3,1.8))]:
  o.location=pos;o.rotation_euler=(Vector((0,0,.48))-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(Path(__file__).resolve().parent/('review-'+clip+'-'+str(scene.frame_current)+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
