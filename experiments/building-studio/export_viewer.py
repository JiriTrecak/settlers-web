"""Export evaluated Blender geometry and baked procedural albedo for the live WebGL viewer.

Runs only in the disposable render process. The editable .blend is never modified.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def yup(v):
    return [float(v[0]), float(v[2]), float(-v[1])]


def export_viewer(asset, output):
    scene=bpy.context.scene
    camera=scene.camera
    position=camera.matrix_world.translation
    forward=camera.matrix_world.to_quaternion() @ Vector((0,0,-1))
    metadata={'camera':{'position':yup(position),'target':yup(position+forward*20),
                        'up':yup(camera.matrix_world.to_quaternion() @ Vector((0,1,0))),
                        'scale':camera.data.ortho_scale},'lights':[]}
    for obj in scene.objects:
        if obj.type=='LIGHT':
            metadata['lights'].append({'name':obj.name,'type':obj.data.type,'position':yup(obj.matrix_world.translation),
                                       'color':list(obj.data.color),'energy':obj.data.energy})
    originals=[o for o in scene.objects if o.type in ('MESH','CURVE') and not o.hide_render]
    depsgraph=bpy.context.evaluated_depsgraph_get()
    collection=bpy.data.collections.new('Temporary viewer export')
    scene.collection.children.link(collection)
    materials={}
    copies=[]
    for original in originals:
        data=bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
        if not data or not len(data.polygons):continue
        obj=bpy.data.objects.new(original.name+' · viewer',data)
        collection.objects.link(obj)
        obj.matrix_world=original.matrix_world.copy()
        # Preserve each object's Generated coordinates when joining, so procedural grain stays put.
        coords=data.attributes.new('studio_generated','FLOAT_VECTOR','POINT')
        low=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)))
        high=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
        size=high-low
        coords.data.foreach_set('vector',[float((v.co[i]-low[i])/size[i]) if size[i]>1e-8 else 0 for v in data.vertices for i in range(3)])
        for index,source in enumerate(list(data.materials)):
            if source is None:continue
            if source.name not in materials:
                copied=source.copy()
                copied.name=source.name+' · baked viewer'
                nodes,links=copied.node_tree.nodes,copied.node_tree.links
                bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
                properties={'roughness':bsdf.inputs['Roughness'].default_value,'metallic':bsdf.inputs['Metallic'].default_value,
                            'emission':list(bsdf.inputs['Emission Color'].default_value),'emission_strength':bsdf.inputs['Emission Strength'].default_value}
                for coordinate in [n for n in nodes if n.type=='TEX_COORD']:
                    attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='studio_generated'
                    for link in list(coordinate.outputs['Generated'].links):
                        socket=link.to_socket;links.remove(link);links.new(attr.outputs['Vector'],socket)
                emission=nodes.new('ShaderNodeEmission')
                if bsdf.inputs['Base Color'].is_linked:links.new(bsdf.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
                else:emission.inputs['Color'].default_value=bsdf.inputs['Base Color'].default_value
                output_node=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
                links.new(emission.outputs[0],output_node.inputs['Surface'])
                materials[source.name]=(copied,properties)
            data.materials[index]=materials[source.name][0]
        copies.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join()
    merged=bpy.context.object
    merged.name='Rootbound Hall · evaluated preview mesh'
    color=merged.data.color_attributes.new(name='StudioAlbedo',type='FLOAT_COLOR',domain='CORNER')
    merged.data.color_attributes.active_color=color
    scene.render.engine='CYCLES'
    scene.cycles.samples=1
    bpy.ops.object.bake(type='EMIT',target='VERTEX_COLORS',use_clear=True)
    for copied,properties in materials.values():
        nodes,links=copied.node_tree.nodes,copied.node_tree.links
        nodes.clear()
        bsdf=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial')
        bsdf.inputs['Base Color'].default_value=(1,1,1,1)
        bsdf.inputs['Roughness'].default_value=properties['roughness']
        bsdf.inputs['Metallic'].default_value=properties['metallic']
        bsdf.inputs['Emission Color'].default_value=properties['emission']
        bsdf.inputs['Emission Strength'].default_value=properties['emission_strength']
        links.new(bsdf.outputs[0],out.inputs['Surface'])
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,
                              export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,
                              export_animations=False,export_cameras=False,export_lights=False)
    metadata['vertices']=len(merged.data.vertices)
    metadata['triangles']=sum(len(p.vertices)-2 for p in merged.data.polygons)
    metadata['note']='Evaluated geometry with vertex-baked procedural albedo. Realtime lights approximate the Cycles studio.'
    return metadata
