"""Mesh and animation helpers for the two neutral endgame creatures; used in background only."""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
class Creature:
 def __init__(self,path,spec):
  if not bpy.app.background:raise RuntimeError('Use a separate background Blender process')
  bpy.ops.wm.read_factory_settings(use_empty=True)
  self.a=Path(path).parent;self.c=json.loads((self.a/'asset.json').read_text());self.parts=[]
  self.col=bpy.data.collections.new('Creature anatomy');bpy.context.scene.collection.children.link(self.col)
  self.studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(self.studio)
  arm=bpy.data.armatures.new('Articulated insect skeleton');self.rig=bpy.data.objects.new('CreatureRig',arm);self.col.objects.link(self.rig)
  bpy.context.view_layer.objects.active=self.rig;self.rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
  for n,(pos,parent) in spec.items():
   b=arm.edit_bones.new(n);b.head=pos;b.tail=Vector(pos)+Vector((0,.18,0))
   if parent:b.parent=arm.edit_bones[parent]
  bpy.ops.object.mode_set(mode='OBJECT');self.rig.select_set(False)
  for p in self.rig.pose.bones:p.rotation_mode='XYZ'
  self.rig.animation_data_create();bpy.context.scene.render.fps=24
 def mat(self,name,hex,rough=.52,metal=.08):
  def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
  rgb=[linear(int(hex[i:i+2],16)/255) for i in [1,3,5]]
  m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
  bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
  return m
 def mesh(self,name,verts,faces,material,bone,smooth=True,paint=True):
  d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(d);bm.free()
  o=bpy.data.objects.new(name,d);self.col.objects.link(o);d.materials.append(material)
  for f in d.polygons:f.use_smooth=smooth
  if paint:
   colors=d.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER');base=material.diffuse_color
   for loop in d.loops:
    co=d.vertices[loop.vertex_index].co;v=.9+.085*math.sin(co.x*16+co.y*21+co.z*12)+.04*math.sin(co.x*39-co.y*32)
    colors.data[loop.index].color=tuple(min(1,max(0,base[k]*v)) for k in range(3))+(1,)
   if not material.node_tree.nodes.get('Paint'):
    node=material.node_tree.nodes.new('ShaderNodeVertexColor');node.name='Paint';node.layer_name='Paint';material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
  g=o.vertex_groups.new(name=bone);g.add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Skeleton','ARMATURE');mod.object=self.rig;o.parent=self.rig;o['role']='base';self.parts.append(o);return o
 def ell(self,name,c,s,m,b,seg=14,rings=7):
  c=Vector(c);v=[tuple(c+Vector((0,0,s[2])))];f=[]
  for j in range(1,rings):
   t=math.pi*j/rings
   for i in range(seg):
    a=math.tau*i/seg;v.append(tuple(c+Vector((s[0]*math.sin(t)*math.cos(a),s[1]*math.sin(t)*math.sin(a),s[2]*math.cos(t)))))
  v.append(tuple(c-Vector((0,0,s[2]))));bot=len(v)-1
  f +=[(0,1+i,1+(i+1)%seg) for i in range(seg)]
  for j in range(rings-2):
   for i in range(seg):
    a=1+j*seg+i;d=1+j*seg+(i+1)%seg;f.append((a,a+seg,d+seg,d))
  f +=[(bot,1+(rings-2)*seg+(i+1)%seg,1+(rings-2)*seg+i) for i in range(seg)]
  return self.mesh(name,v,f,m,b)
 def tube(self,name,points,radii,m,b,N=8):
  v=[];f=[]
  for j,p in enumerate(points):
   tangent=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)]);q=Vector((0,0,1)).rotation_difference(tangent.normalized())
   for i in range(N):v.append(tuple(Vector(p)+q@Vector((math.cos(i*math.tau/N)*radii[j],math.sin(i*math.tau/N)*radii[j],0))))
  f.append(tuple(range(N-1,-1,-1)))
  for j in range(len(points)-1):
   for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
  f.append(tuple((len(points)-1)*N+i for i in range(N)))
  return self.mesh(name,v,f,m,b)
 def blade(self,name,outline,thickness,m,b):
  # Extrude a convex/concave silhouette in the XZ plane at each supplied Y.
  v=[(x,y+side*thickness/2,z) for side in [-1,1] for x,y,z in outline];n=len(outline)
  f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  return self.mesh(name,v,f,m,b,False)
 def reset(self):
  for p in self.rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
 def rot(self,n,x=0,y=0,z=0):self.rig.pose.bones[n].rotation_euler=(x,y,z)
 def loc(self,n,x=0,y=0,z=0):self.rig.pose.bones[n].location=(x,y,z)
 def action(self,name,length,fn):
  a=bpy.data.actions.new(name);self.rig.animation_data.action=a
  for frame in range(length+1):
   self.reset();fn(frame/length)
   if name=='death':
    bpy.context.view_layer.update()
    lowest=min((self.rig.pose.bones[o.vertex_groups[0].name].matrix @ self.rig.data.bones[o.vertex_groups[0].name].matrix_local.inverted() @ v.co).z for o in self.parts for v in o.data.vertices)
    self.rig.pose.bones['root'].location.z-=lowest
   for p in self.rig.pose.bones:
    p.keyframe_insert('rotation_euler',frame=frame+1,group=p.name);p.keyframe_insert('location',frame=frame+1,group=p.name)
  a.use_fake_user=True;track=self.rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,a);track.mute=True
  return a
 def save(self,idle):
  scene=bpy.context.scene;self.rig.animation_data.action=idle;scene.frame_set(1);scene.frame_end=49
  sys.path.insert(0,str(self.a.parents[2]/'building-studio'));from stage import create_stage
  create_stage(self.c,self.studio)
  for o in self.studio.objects:
   if o.type=='LIGHT':o.location*=.6;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler();o.data.size=3
  im=bpy.data.images.load(str(self.a/'reference.png'));im.pack();im.use_fake_user=True
  scene['character_contract']='Neutral insect. No team color. Z up, -Y forward. In-place six-state rig; rear surfaces inferred.'
  (self.a/'model-stats.json').write_text(json.dumps({'meshes':len(self.parts),'materials':len(bpy.data.materials),'bones':len(self.rig.data.bones)},indent=2))
  bpy.ops.wm.save_as_mainfile(filepath=str(self.a/self.c['blend']))
def ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
