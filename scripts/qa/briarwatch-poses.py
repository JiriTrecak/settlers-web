"""Render contact, movement, rear, and death poses from the saved character source; never resave it."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(bpy.data.filepath).parents[4]
out=root/'artifacts/briarwatch/poses';out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;rig=bpy.data.objects['AntRig'];cam=scene.camera
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.cycles.samples=24
shots=[('civilian-walk','civilian','walk',13,18,1.03,2.7),('raider-contact','warrior','attack_sword',11,18,1.03,2.7),('poacher-release','archer','attack_bow',27,80,1.03,2.7),('captain-back','captain','idle',1,170,1.03,2.7),('raider-death','warrior','death',33,18,.3,3.2)]
for name,role,clip,frame,azimuth,z,scale in shots:
 for ob in scene.objects:
  if 'role' in ob:ob.hide_render=ob['role'] not in ('base',role)
 rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame)
 target=Vector((0,0,z));az=math.radians(azimuth);cam.location=target+Vector((math.sin(az)*6,-math.cos(az)*6,2));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
