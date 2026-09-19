"""Merge static parts under the original animated pivot for harvestable trees."""
import bpy
from export_viewer import yup

def export_vegetation(asset,output):
    scene=bpy.context.scene
    originals=[o for o in scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    for source in originals:
        ob=source.copy();ob.data=source.data.copy();scene.collection.objects.link(ob)
        ob.select_set(True);copies.append(ob)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join()
    merged=bpy.context.object;merged.name='HarvestableTree'
    pivot=scene.objects['TreePivot'];pivot.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
        export_extras=True,export_cameras=False,export_lights=False)
    cam=scene.camera;forward=cam.matrix_world.to_quaternion()@__import__('mathutils').Vector((0,0,-1))
    return {'kind':'vegetation','camera':{'position':yup(cam.matrix_world.translation),'target':yup(cam.matrix_world.translation+forward*20),'scale':cam.data.ortho_scale},
        'lights':[{'name':o.name,'type':o.data.type,'position':yup(o.location),'color':list(o.data.color),'energy':o.data.energy} for o in scene.objects if o.type=='LIGHT'],
        'triangles':sum(len(p.vertices)-2 for p in merged.data.polygons),'vertices':len(merged.data.vertices),'animations':['hit','fall','decay'],'note':'Rigid tree with original-scale hit/fall/sink clips at 1x.'}
