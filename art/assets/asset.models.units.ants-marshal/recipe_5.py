import bpy,json,sys,numpy as np
from pathlib import Path
p=Path(sys.argv[-1]);bpy.ops.wm.open_mainfile(filepath=str(p/'inspection.blend'));m=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)>100);im=m.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image;pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);cols={}
for l in m.data.loops:
 u,v=m.data.uv_layers.active.data[l.index].uv;cols[l.vertex_index]=pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3].tolist()
parts=json.loads((p/'parts.json').read_text())
for i,part in enumerate(parts):
 c=np.asarray([cols[j]for j in part['ids']]);r,g,b=c[:,0],c[:,1],c[:,2];red=(r>.055)&(g<r*.34)&(b>g*.85)&(b<r*.65);part['redFraction']=float(red.mean())
 if red.mean()>.2:print(i,len(c),round(float(red.mean()),2),part['min'],part['max'])
(p/'parts-colors.json').write_text(json.dumps(parts));(p/'vertex-colors.json').write_text(json.dumps(cols))
