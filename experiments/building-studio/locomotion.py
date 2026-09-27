"""Reference-relative torso pitch correction without changing planted leg motion."""
import bpy,math
from mathutils import Matrix,Quaternion

VERSION=1

def soften_running_lean(rig,scene,factor=.2):
    """Keep only factor of the run's extra lean relative to its relaxed posture.

    Bake the correction into Spine in armature space, preserving yaw, roll,
    pelvis/leg tracks, equipment attachment, timing and the original provider GLB.
    Sampling precedes writing so interpolated keys never feed into later samples.
    """
    previous=rig.animation_data.action
    previous_frame=scene.frame_current+scene.frame_subframe
    previous_pose={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
    for track in rig.animation_data.nla_tracks:track.mute=True
    spine=rig.pose.bones['mixamorig:Spine'];head=rig.pose.bones['mixamorig:Head']
    def activate(action):
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    def frame(value):
        scene.frame_set(math.floor(value),subframe=value%1);bpy.context.view_layer.update()
    def pitch():
        direction=head.head-spine.head
        return math.atan2(-direction.y,direction.z)
    results={}
    for name,reference in [('run','idle'),('carry_run','carry')]:
        action=bpy.data.actions.get(name);neutral=bpy.data.actions.get(reference)
        if not action or not neutral:continue
        if action.get('runningLeanVersion')==VERSION:continue
        activate(neutral);lo,hi=neutral.frame_range
        relaxed=[]
        for i in range(32):frame(lo+(hi-lo)*i/32);relaxed.append(pitch())
        baseline=sum(relaxed)/len(relaxed)
        activate(action);lo,hi=map(int,action.frame_range);samples=[];before=[];after=[]
        for f in range(lo,hi+1):
            frame(f);original=pitch();delta=(baseline+factor*(original-baseline))-original
            position=spine.head.copy()
            matrix=Matrix.Translation(position)@Quaternion((1,0,0),delta).to_matrix().to_4x4()@Matrix.Translation(-position)@spine.matrix
            # Convert while the unmodified parent pose for this frame is active.
            spine.matrix=matrix;bpy.context.view_layer.update()
            samples.append((f,spine.rotation_quaternion.copy()))
            before.append(math.degrees(original));after.append(math.degrees(pitch()))
        for f,q in samples:
            spine.rotation_quaternion=q;spine.keyframe_insert('rotation_quaternion',frame=f,group=spine.name)
        action['runningLeanVersion']=VERSION;action['runningLeanFactor']=factor
        results[name]={'factor':factor,'relaxedPitchDegrees':math.degrees(baseline),'before':[min(before),max(before)],'after':[min(after),max(after)]}
    rig.animation_data.action=previous
    if previous:rig.animation_data.action_slot=previous.slots[0]
    frame(previous_frame)
    for bone in rig.pose.bones:bone.matrix_basis=previous_pose[bone.name]
    return results
