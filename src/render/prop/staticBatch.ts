import {BufferAttribute,Mesh,Texture,type Material,type Object3D,type Color} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge sibling static surfaces with identical draw state. Authored linear RGB
 * moves to vertex colors; textures, seasonal tints, rigs and animation stay out.
 * Equal local transforms also preserve object-space procedural grain exactly. */
export function batchStaticMaterials(root:Object3D,animated=false):()=>void {
  if(animated)return ()=>{};
  const oldGeometry=new Set<Mesh['geometry']>(),oldMaterials=new Set<Material>();
  const parents:Object3D[]=[];root.traverse(o=>{if(o.children.some(c=>c instanceof Mesh))parents.push(o);});
  for(const parent of parents){
    const groups=new Map<string,Mesh[]>();
    for(const child of parent.children){
      if(!(child instanceof Mesh)||'isSkinnedMesh' in child||child.children.length||child.morphTargetInfluences||Array.isArray(child.material))continue;
      const m=child.material as Material & {color?:Color},g=child.geometry;
      if(!m.color||m.transparent||m.opacity!==1||g.groups.length||m.name==='TC_TeamColor'||m.userData.foliageBase||m.userData.vividLeaf||m.userData.stonePalette||Object.values(m).some(v=>v instanceof Texture))continue;
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
