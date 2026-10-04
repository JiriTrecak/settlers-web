import {BufferAttribute,Mesh,Texture,type Material,type Object3D,type Color} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge sibling static surfaces with identical draw state. Shared materials
 * retain textures/tints verbatim. Different compatible untextured colors move
 * to vertex colors; rigs and animation stay out.
 * Equal local transforms also preserve object-space procedural grain exactly. */
export function batchStaticMaterials(root:Object3D,animated=false):()=>void {
  if(animated)return ()=>{};
  const oldGeometry=new Set<Mesh['geometry']>(),oldMaterials=new Set<Material>();
  const parents:Object3D[]=[];root.traverse(o=>{if(o.children.some(c=>c instanceof Mesh))parents.push(o);});
  for(const parent of parents){
    // Exporters often emit hundreds of leaf fans as separate primitives even
    // though their UVs and positions are already in one shared coordinate space.
    // Exact material identity allows concatenation without rebaking any color,
    // texture, shader or seasonal state. Do not flatten different transforms:
    // that would change object-space wind and procedural material coordinates.
    const shared=new Map<string,Mesh[]>();
    for(const child of parent.children){
      if(!(child instanceof Mesh)||'isSkinnedMesh' in child||child.children.length||child.morphTargetInfluences||Array.isArray(child.material))continue;
      const m=child.material,g=child.geometry;
      if(m.transparent||g.groups.length||g.drawRange.start!==0||g.drawRange.count!==Infinity)continue;
      child.updateMatrix();
      const attributes=Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k]!;return [k,a.itemSize,a.normalized,a.array.constructor.name];});
      const {name:_label,...renderData}=child.userData; // GLTFLoader stores the display name in extras too.
      const key=JSON.stringify([m.uuid,child.matrix.elements,child.visible,child.renderOrder,child.layers.mask,child.castShadow,child.receiveShadow,child.frustumCulled,child.customDepthMaterial?.uuid,child.customDistanceMaterial?.uuid,renderData,!!g.index,attributes]);
      const list=shared.get(key)??[];list.push(child);shared.set(key,list);
    }
    for(const meshes of shared.values()){
      if(meshes.length<2)continue;
      const source=meshes[0]!;
      // Hooks may depend on a specific object. Keep those draws independent.
      if(meshes.some(m=>m.onBeforeRender!==source.onBeforeRender||m.onAfterRender!==source.onAfterRender))continue;
      const geometry=mergeGeometries(meshes.map(m=>m.geometry));if(!geometry)continue;
      const merged=source.clone(false);merged.geometry=geometry;merged.name=`${source.name}_shared`;
      merged.customDepthMaterial=source.customDepthMaterial;merged.customDistanceMaterial=source.customDistanceMaterial;
      merged.onBeforeRender=source.onBeforeRender;merged.onAfterRender=source.onAfterRender;
      parent.add(merged);
      for(const mesh of meshes){oldGeometry.add(mesh.geometry);mesh.removeFromParent();}
    }
    const groups=new Map<string,Mesh[]>();
    for(const child of parent.children){
      if(!(child instanceof Mesh)||'isSkinnedMesh' in child||child.children.length||child.morphTargetInfluences||Array.isArray(child.material))continue;
      const m=child.material as Material & {color?:Color},g=child.geometry;
      // Source shaders reserve vertex color for occlusion; baking albedo there would darken ambient twice.
      if(m.userData.referenceEnvironment||!m.color||m.transparent||m.opacity!==1||g.groups.length||g.getAttribute('color')?.itemSize===4||m.name==='TC_TeamColor'||m.userData.foliageBase||m.userData.vividLeaf||m.userData.stonePalette||Object.values(m).some(v=>v instanceof Texture))continue;
      child.updateMatrix();
      const {uuid,name,color,...drawState}=m.toJSON();
      const key=JSON.stringify([drawState,m.customProgramCacheKey(),child.matrix.elements,child.visible,child.renderOrder,child.layers.mask,child.castShadow,child.receiveShadow,child.frustumCulled,Object.keys(g.attributes).filter(k=>k!=='color').sort()]);
      const list=groups.get(key)??[];list.push(child);groups.set(key,list);
    }
    for(const meshes of groups.values()){
      if(meshes.length<2)continue;
      const pieces=meshes.map(mesh=>{
        const geometry=mesh.geometry.clone(),m=mesh.material as Material & {color:Color};
        const old=geometry.getAttribute('color'),n=geometry.getAttribute('position').count,colors=new Float32Array(n*3);
        for(let i=0;i<n;i++)colors.set([m.color.r*(old?.getX(i)??1),m.color.g*(old?.getY(i)??1),m.color.b*(old?.getZ(i)??1)],i*3);
        geometry.setAttribute('color',new BufferAttribute(colors,3));return geometry;
      });
      const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());if(!geometry)continue;
      const source=meshes[0]!,original=source.material as Material & {color:Color};
      const material=original.clone() as typeof original;
      material.name='Static surface palette';material.color.set(0xffffff);material.vertexColors=true;
      material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;
      const merged=new Mesh(geometry,material);merged.name=`${source.name}_batched`;
      merged.position.copy(source.position);merged.quaternion.copy(source.quaternion);merged.scale.copy(source.scale);
      merged.visible=source.visible;merged.renderOrder=source.renderOrder;merged.layers.mask=source.layers.mask;
      merged.castShadow=source.castShadow;merged.receiveShadow=source.receiveShadow;merged.frustumCulled=source.frustumCulled;
      parent.add(merged);
      for(const mesh of meshes){oldGeometry.add(mesh.geometry);oldMaterials.add(mesh.material as Material);mesh.removeFromParent();}
    }
  }
  root.traverse(o=>{if(o instanceof Mesh){oldGeometry.delete(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])oldMaterials.delete(m);}});
  return ()=>{oldGeometry.forEach(g=>g.dispose());oldMaterials.forEach(m=>m.dispose());};
}
