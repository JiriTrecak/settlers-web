import {describe,it,expect} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,Box3,Vector3,Texture} from 'three';
import {batchStaticMaterials} from '../../src/render/prop/staticBatch';
describe('static scenery draw batching',()=>{
 it('preserves geometry, linear vertex colors and custom surface shaders',()=>{
  const root=new Group();
  const colors=[0xa04b31,0x2878df,0xeeeeee];
  const materials=colors.map(color=>new MeshStandardMaterial({color,roughness:.8}));
  const shader=()=>{};for(const m of materials){m.onBeforeCompile=shader;m.customProgramCacheKey=()=> 'same-surface';}
  materials.forEach((m,i)=>{const g=new BoxGeometry();g.clearGroups();g.translate(i*2,0,0);root.add(new Mesh(g,m));});
  const before=new Box3().setFromObject(root),dispose=batchStaticMaterials(root);
  expect(root.children).toHaveLength(1);const mesh=root.children[0] as Mesh;
  expect(new Box3().setFromObject(root).equals(before)).toBe(true);
  const material=mesh.material as MeshStandardMaterial;
  expect(material.color.getHex()).toBe(0xffffff);expect(material.vertexColors).toBe(true);expect(material.onBeforeCompile).toBe(shader);
  const color=mesh.geometry.getAttribute('color');
  materials.forEach((m,i)=>{const rgb=new Vector3().fromBufferAttribute(color,i*24);expect(rgb.x).toBeCloseTo(m.color.r,6);expect(rgb.y).toBeCloseTo(m.color.g,6);expect(rgb.z).toBeCloseTo(m.color.b,6);});
  dispose();
 });
 it('keeps ownership, seasonal, textured, transparent and animated surfaces separate',()=>{
  for(const mode of ['team','season','texture','transparent','animated']){
   const root=new Group();for(let i=0;i<2;i++){
    const m=new MeshStandardMaterial();if(mode==='team')m.name='TC_TeamColor';if(mode==='season')m.userData.vividLeaf={base:[1,1,1]};if(mode==='texture')m.map=new Texture();if(mode==='transparent')m.transparent=true;
    const g=new BoxGeometry();g.clearGroups();root.add(new Mesh(g,m));
   }
   batchStaticMaterials(root,mode==='animated');expect(root.children).toHaveLength(2);
  }
 });
});
