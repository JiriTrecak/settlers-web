idle_action=make_action('idle',48,idle)
make_action('walk',24,walk);make_action('run',18,run);make_action('build',24,lambda t:work(t));make_action('chop',30,lambda t:work(t,True));make_action('carry',48,carry);make_action('attack_unarmed',24,attack_unarmed);make_action('attack_sword',18,attack_sword);make_action('attack_bow',40,attack_bow);make_action('hit',16,hit);make_action('death',32,death)
rig.animation_data.action=idle_action;scene.frame_set(1);scene.frame_end=49
rig.scale=(1.22,1.12,1)
for ob in parts:ob.hide_render=ob['role'] not in ('base','warrior')
create_stage(C,collections['Studio'])
# Character-scale lights retain the same warm/cool art direction at shorter distances.
for ob in collections['Studio'].objects:
    if ob.type=='LIGHT':
        ob.location*=.36
        ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
        ob.data.size=2
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
scene['character_contract']='Shared rig; +Z up in Blender, -Y forward; feet at zero; named animation actions and equipment roles.'
stats={'objects':len(bpy.data.objects),'meshes':len(parts),'materials':len(bpy.data.materials),'blender':bpy.app.version_string,'collections':list(collections)}
(A/'model-stats.json').write_text(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
