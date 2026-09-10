import bpy,json,sys
from pathlib import Path
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import camera_view
scene=bpy.context.scene
cfg=json.loads((A/'asset.json').read_text());cfg['camera'].update(target=[0,-1.6,2.4],scale=10.5)
camera_view(scene,cfg)
scene.cycles.samples=32
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001));ground=bpy.context.object;mat=bpy.data.materials.new('Preview ground');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(0,0,0,1);bsdf.inputs['Roughness'].default_value=1;bsdf.inputs['Specular IOR Level'].default_value=0;ground.data.materials.append(mat)
keys=json.loads((A/'animation-keys.json').read_text())
for label,clip,index in [('upright','hit',0),('fallen','fall',54),('decaying','decay',105)]:
 row=keys[clip]['keys'][index];ob=bpy.data.objects['FallPivot'];ob.rotation_euler=(row['angle'],0,0);ob.location=(0,-row['depth'],row['height']);ob.scale=(row['scale'],)*3;bpy.data.objects['StumpPivot'].location.z=row['stumpHeight']
 bpy.context.view_layer.update();scene.render.filepath=str(A/('animation-'+label+'.png'));bpy.ops.render.render(write_still=True)
