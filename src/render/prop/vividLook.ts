import { Color, Mesh, MeshStandardMaterial, type Object3D, type Material } from 'three';

type VividLeaf = { base: number[]; evergreen: boolean; slot: number };
/** Tag only authored tree leaves; bark, flower petals and stems retain their palette. */
export function prepareVividFoliage(root:Object3D):void {
  root.traverse(node=>{
    if(!(node instanceof Mesh))return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(!(mat instanceof MeshStandardMaterial))continue;
      const match=/^UTC (Emerald|Broadleaf) (\d+)$/.exec(mat.name);
      if(match)mat.userData.vividLeaf={base:mat.color.toArray(),evergreen:match[1]==='Emerald',slot:Number(match[2])} satisfies VividLeaf;
    }
  });
}
/** Recompute from the original linear color so repeated season changes never accumulate. */
export function tintVividFoliage(mat:Material,season:string,variant?:string):boolean {
  const leaf=mat.userData.vividLeaf as VividLeaf|undefined;
  if(!leaf||!(mat instanceof MeshStandardMaterial))return false;
  const base=new Color().fromArray(leaf.base);
  mat.color.copy(base);
  if(!leaf.evergreen){
    if(season==='spring')mat.color.lerp(new Color(0x9fd866),.30);
    if(season==='autumn')mat.color.set([0xd49a32,0xbd6e2c,0xe0b944,0xbb8130][leaf.slot%4]!);
  }
  const colors:Record<string,number>={pink:0xf6a6b8,snow:0xdce7ed,gold:0xe5b93c,red:0xcd6843};
  if(variant==='green')mat.color.copy(base);
  else if(variant&&colors[variant]!==undefined){
    mat.color.set(colors[variant]!);
    mat.color.multiplyScalar(.86+leaf.slot*.045);
  }
  return true;
}
