import {BufferAttribute,DataTexture,FloatType,MeshStandardMaterial,NearestFilter,RGBAFormat,SkinnedMesh,type AnimationClip,type Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Consolidate flat untextured materials within a rig group without changing its bones.
 * Team surfaces remain separate. Authored color becomes vertex color; exact PBR
 * factors occupy a nearest-filtered palette. Textured/morphed assets are untouched.
 */
export function batchCharacterMaterials(root:Object3D,clips:readonly AnimationClip[]=[]):()=>void {
 const animatedNames=new Set(clips.flatMap(c=>c.tracks.map(t=>t.name.split('.')[0])));
 root.updateMatrixWorld(true);
 const discardedGeometries=new Set<SkinnedMesh['geometry']>(),discardedMaterials=new Set<MeshStandardMaterial>(),palettes:DataTexture[]=[];
 const parents:Object3D[]=[];root.traverse(o=>{if(o.children.some(c=>c instanceof SkinnedMesh))parents.push(o);});
 for(const parent of parents){
  const groups=new Map<string,SkinnedMesh[]>();
  for(const child of parent.children){
   if(!(child instanceof SkinnedMesh)||!(child.material instanceof MeshStandardMaterial))continue;
   const m=child.material,g=child.geometry;
   if(child.children.length||animatedNames.has(child.name)||m.type!=='MeshStandardMaterial'||m.name==='TC_TeamColor'||m.transparent||m.opacity!==1||m.alphaTest||m.emissive.getHex()||m.map||m.normalMap||m.roughnessMap||m.metalnessMap||m.aoMap||m.emissiveMap||m.bumpMap||m.displacementMap||m.alphaMap||m.envMap||child.morphTargetInfluences||g.groups.length||g.attributes.uv||g.attributes.color)continue;
   const key=[child.skeleton.uuid,child.matrix.elements.join(','),child.bindMatrix.elements.join(','),child.bindMode,m.side,m.flatShading,m.depthTest,m.depthWrite,child.visible,child.renderOrder,child.layers.mask,child.frustumCulled].join('|');
   const list=groups.get(key)??[];list.push(child);groups.set(key,list);
  }
  for(const meshes of groups.values()){
   if(meshes.length<2)continue;
   const data=new Float32Array(meshes.length*4),pieces=meshes.map((mesh,i)=>{
    const m=mesh.material as MeshStandardMaterial,g=mesh.geometry.clone(),n=g.attributes.position.count,colors=new Float32Array(n*3),uv=new Float32Array(n*2);
    for(let v=0;v<n;v++){colors.set([m.color.r,m.color.g,m.color.b],v*3);uv[v*2]=.5;uv[v*2+1]=(i+.5)/meshes.length;}
    data.set([1,m.roughness,m.metalness,1],i*4);g.setAttribute('color',new BufferAttribute(colors,3));g.setAttribute('uv',new BufferAttribute(uv,2));return g;
   });
   const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());if(!geometry)continue;
   const palette=new DataTexture(data,1,meshes.length,RGBAFormat,FloatType);palette.minFilter=palette.magFilter=NearestFilter;palette.generateMipmaps=false;palette.needsUpdate=true;palettes.push(palette);
   const source=meshes[0],material=(source.material as MeshStandardMaterial).clone();material.name='Character PBR palette';material.color.set(0xffffff);material.vertexColors=true;material.roughness=material.metalness=1;material.roughnessMap=material.metalnessMap=palette;
   const merged=new SkinnedMesh(geometry,material);merged.name=`${source.name}_batched`;merged.position.copy(source.position);merged.quaternion.copy(source.quaternion);merged.scale.copy(source.scale);merged.bindMode=source.bindMode;merged.bind(source.skeleton,source.bindMatrix);merged.renderOrder=source.renderOrder;merged.layers.mask=source.layers.mask;merged.frustumCulled=source.frustumCulled;merged.visible=source.visible;merged.castShadow=source.castShadow;merged.receiveShadow=source.receiveShadow;
   parent.add(merged);
   for(const mesh of meshes){discardedGeometries.add(mesh.geometry);discardedMaterials.add(mesh.material as MeshStandardMaterial);mesh.removeFromParent();}
  }
 }
 // Original materials may also remain on an unbatched surface elsewhere.
 root.traverse(o=>{if(o instanceof SkinnedMesh){discardedGeometries.delete(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])discardedMaterials.delete(m as MeshStandardMaterial);}});
 return ()=>{discardedGeometries.forEach(g=>g.dispose());discardedMaterials.forEach(m=>m.dispose());palettes.forEach(t=>t.dispose());};
}
