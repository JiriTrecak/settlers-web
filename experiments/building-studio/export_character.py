"""Export skinned character roles and actions without flattening the editable rig."""
import json
from pathlib import Path
import bpy
from mathutils import Vector
from export_viewer import yup


def export_character(asset,output):
    scene=bpy.context.scene;cam=scene.camera
    forward=cam.matrix_world.to_quaternion() @ Vector((0,0,-1))
    meta={'kind':'character','camera':{'position':yup(cam.matrix_world.translation),'target':yup(cam.matrix_world.translation+forward*20),'scale':cam.data.ortho_scale},'lights':[]}
    for o in scene.objects:
        if o.type=='LIGHT':meta['lights'].append({'name':o.name,'type':o.data.type,'position':yup(o.location),'color':list(o.data.color),'energy':o.data.energy*7})
    meshes=[o for o in scene.objects if o.type=='MESH' and 'role' in o]
    rigs=[o for o in scene.objects if o.type=='ARMATURE']
    meta['variants']=['base','warrior','archer'];meta['variantTriangles']={}
    for role in meta['variants']:
        selected=[o for o in meshes if o['role'] in ('base',role)]
        meta['variantTriangles'][role]=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in selected)
    meta['triangles']=meta['variantTriangles']['base'];meta['vertices']=sum(len(o.data.vertices) for o in meshes)
    meta['animations']=[a.name for a in bpy.data.actions]
    meta['height']=2.03;meta['forward']='+Z';meta['note']='Shared skeleton; rigidly weighted exoskeleton; in-place named animation clips. Scale matches workshop units.'
    # Merge only disposable export copies per role; the .blend retains editable named parts.
    merged=[]
    for role in meta['variants']:
        bpy.ops.object.select_all(action='DESELECT')
        copies=[]
        for source in meshes:
            if source['role']!=role:continue
            ob=source.copy();ob.data=source.data.copy();scene.collection.objects.link(ob)
            ob.hide_render=False;ob.hide_set(False);ob.select_set(True);copies.append(ob)
        bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join()
        ob=bpy.context.object;ob.name='Ant_'+role;ob['role']=role;merged.append(ob)
    meshes=merged
    def write(path,role=None):
        rigs[0]['variant']=role or 'base'
        bpy.ops.object.select_all(action='DESELECT')
        for o in rigs+meshes:
            o.hide_set(False)
            o.select_set(o.type=='ARMATURE' or role is None or o['role'] in ('base',role))
        bpy.context.view_layer.objects.active=rigs[0]
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
            export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
            export_skins=True,export_def_bones=False,export_extras=True,export_cameras=False,export_lights=False)
    for role in meta['variants']:
        temp=asset/f'.{role}-export.glb';write(temp,role);temp.replace(asset/f'{role}.glb')
    write(output)
    (asset/'character.json').write_text(json.dumps({'variants':{r:{'file':r+'.glb','triangles':meta['variantTriangles'][r],'states':{**({'build':'build','chop':'chop'} if r=='base' else {}),'idle':'idle','walk':'walk','run':'run','carry':'carry','attack':{'base':'attack_unarmed','warrior':'attack_sword','archer':'attack_bow'}[r],'hit':'hit','death':'death'}} for r in meta['variants']},'attackEvents':{'warrior':{'normalizedTime':.55,'event':'hit'},'archer':{'normalizedTime':.65,'event':'release'}},'teamMaterial':'TC_TeamColor','metersPerUnit':1,'height':2.03},indent=2))
    return meta
