import {Mesh,MeshStandardMaterial,PlaneGeometry,RepeatWrapping,SRGBColorSpace,TextureLoader,type Scene} from 'three';
import woodUrl from '../../../assets/library/asset.models.environment.woodland-hollow-log/albedo.png?url';
import type {EnvironmentState} from '../../shared/landscape/curve';

/** Lowest underside height; shallow wood ribs rise above the authored clearance. */
export function ceilingY(x:number,z:number,height:number):number {
  return height + .55*(1+Math.sin(x*.23+Math.sin(z*.08)*1.4)) + .25*(1+Math.sin(z*.17));
}
export function ceilingGeometry(size:number,height:number):PlaneGeometry {
  const segments=Math.ceil(size/4),geometry=new PlaneGeometry(size,size,segments,segments);
  geometry.rotateX(Math.PI/2);geometry.translate(size/2,0,size/2);
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i);
    positions.setY(i,ceilingY(x,z,height));uv.setXY(i,x*.12,z*.12);
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

/** Presentation-only roof. The RTS cutaway never renders this overhead surface. */
export class InteriorCeiling {
  private mesh:Mesh<PlaneGeometry,MeshStandardMaterial>|null=null;
  private size=0;
  private height:number|undefined;
  constructor(private readonly scene:Scene){}
  configure(size:number,environment:EnvironmentState):void {
    const height=environment.interior?environment.ceilingHeight:undefined;
    if(this.size===size&&this.height===height)return;
    this.dispose();this.size=size;this.height=height;
    if(height===undefined)return;
    const wood=new TextureLoader().load(woodUrl);
    wood.colorSpace=SRGBColorSpace;wood.wrapS=wood.wrapT=RepeatWrapping;wood.anisotropy=4;
    const material=new MeshStandardMaterial({map:wood,bumpMap:wood,bumpScale:.12,color:0x8b765d,roughness:1});
    this.mesh=new Mesh(ceilingGeometry(size,height),material);this.mesh.name='interior-ceiling';
    this.mesh.visible=false;this.scene.add(this.mesh);
  }
  update(closeCamera:boolean):void {if(this.mesh)this.mesh.visible=closeCamera;}
  dispose():void {
    if(!this.mesh)return;
    this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.material.map?.dispose();this.mesh.material.dispose();this.mesh=null;
  }
}
