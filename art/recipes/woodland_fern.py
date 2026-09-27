"""Original arched fern, 7 fronds with folded paired leaflets. Blender -b -P ... -- output-dir.
World dimensions: 3.6 wide, 1.65 high. All visible detail is reusable low-cost mesh.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector

out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
materials=[]
for name,color in [('Fern cool folds',(65,96,38)),('Fern leaf faces',(89,119,45)),('Fern sun tips',(125,148,60)),('Fern stems',(71,88,32))]:
 m=bpy.data.materials.new(name);m.use_nodes=True
 m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*[linear(c/255)*.55 for c in color],1)
 m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9
 m.diffuse_color=(*[linear(c/255)*.55 for c in color],1)
 m['referenceEnvironment']=True;m['sourceShader']='plant';m['foliage']=True;m['backsideLighting']=.15
 m['sourceShaderAttributes']={'IsUseGroundColor':'false'}
 materials.append(m)
verts=[];faces=[];slots=[]
def face(points,indices,material):
 start=len(verts);verts.extend([tuple(p) for p in points]);faces.extend([tuple(start+i for i in f) for f in indices]);slots.extend([material]*len(indices))
for frond in range(7):
 angle=frond*math.tau/7+.13;direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-math.sin(angle),math.cos(angle),0))
 reach=1.45+.18*math.sin(frond*2.3);height=1.2+.3*math.cos(frond*1.7)
 def stem(t):return direction*(reach*t)+Vector((0,0,.08+height*math.sin(t*math.pi*.7)))
 for j in range(9):
  a=stem(j/9);b=stem((j+1)/9);face([a-side*.018,a+side*.018,b+side*.01,b-side*.01],[(0,1,2,3)],3)
 for pair in range(8):
  t=.2+pair*.098;width=.53*(1-t)**.45
  for sign in [-1,1]:
   root=stem(t+(.018 if sign<0 else 0));tip=root+side*sign*width+direction*(.18+.14*t)+Vector((0,0,-.12+.1*t))
   axis=tip-root;cross=Vector((-axis.y,axis.x,0)).normalized()*(.095*(1-t)+.022)
   middle=root+axis*.55;ridge=middle+Vector((0,0,.052))
   face([root,middle+cross,ridge,middle-cross,tip],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],(pair+frond)%2)
   # A broad, brighter tip facet gives depth without drawn veins or noise.
   slots[-2]=2 if pair>3 else 1
 tip=stem(1)+direction*.18
 face([stem(.89),stem(.96)+side*.07,tip,stem(.96)-side*.07],[(0,1,2),(0,2,3)],2)
mesh=bpy.data.meshes.new('Arched paired fern leaflets');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Woodland fern',mesh);bpy.context.collection.objects.link(obj)
for m in materials:mesh.materials.append(m)
for p,index in zip(mesh.polygons,slots):p.material_index=index
obj['referenceEnvironment']=True
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'),compress=False)
bpy.ops.export_scene.gltf(filepath=str(out/'geometry.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
print('Fern triangles:',sum(len(p.vertices)-2 for p in mesh.polygons))
