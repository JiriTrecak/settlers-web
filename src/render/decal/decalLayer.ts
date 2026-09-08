import { BufferGeometry, Float32BufferAttribute, CanvasTexture, SRGBColorSpace, MeshStandardMaterial, MeshDepthMaterial, Mesh, Group, type Scene } from 'three';
import { HEIGHT_ORIGIN, HEIGHT_SPAN, type HeightField } from '../../shared';
import { DECAL_KINDS, type DecalKind, type GroundDecal } from '../../shared/landscape/decal';

/** Uses the exact terrain grid and diagonal: decals remain flush after sculpting. */
export function decalGeometry(d: GroundDecal, field: HeightField): BufferGeometry {
  const a=d.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),r=d.size*(Math.abs(c)+Math.abs(s))/2;
  const loX=Math.max(HEIGHT_ORIGIN,Math.floor(d.x-r)),hiX=Math.min(HEIGHT_ORIGIN+HEIGHT_SPAN,Math.ceil(d.x+r));
  const loZ=Math.max(HEIGHT_ORIGIN,Math.floor(d.z-r)),hiZ=Math.min(HEIGHT_ORIGIN+HEIGHT_SPAN,Math.ceil(d.z+r));
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
    pos.push(x,field.sample(x,z)+.012,z);
    uv.push(((x-d.x)*c+(z-d.z)*s)/d.size+.5, (-(x-d.x)*s+(z-d.z)*c)/d.size+.5);
  }
  const stride=hiX-loX+1;
  for(let z=0;z<hiZ-loZ;z++)for(let x=0;x<hiX-loX;x++){
    const i=z*stride+x;indices.push(i,i+stride,i+1,i+1,i+stride,i+stride+1);
  }
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(pos,3));geo.setAttribute('uv',new Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}

export class DecalLayer {
  private readonly group=new Group();
  private readonly textures=new Map(DECAL_KINDS.map(kind=>[kind,texture(kind)]));
  private readonly depth=new MeshDepthMaterial();
  constructor(scene: Scene){
    this.group.name='ground-decals';scene.add(this.group);
    // VSM also draws receivers into its depth pass; surface paint must not cast a second shadow.
    this.depth.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\ndiscard;');};
    this.depth.customProgramCacheKey=()=> 'decal-no-shadow';
  }
  rebuild(decals: readonly GroundDecal[], field: HeightField, season='summer'){
    this.clear();
    for(const d of decals){
      const mat=new MeshStandardMaterial({map:this.textures.get(d.kind),transparent:true,opacity:d.opacity,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
      if(d.kind==='leaf-litter')mat.color.set(season==='autumn'?0xe1b35b:season==='spring'?0xc2ec9b:0xffffff);
      const mesh=new Mesh(decalGeometry(d,field),mat);mesh.name=`decal:${d.id}`;mesh.receiveShadow=true;mesh.customDepthMaterial=this.depth;mesh.renderOrder=1+this.group.children.length*.0001;this.group.add(mesh);
    }
  }
  private clear(){for(const child of this.group.children){const m=child as Mesh<BufferGeometry,MeshStandardMaterial>;m.geometry.dispose();m.material.dispose();}this.group.clear();}
  destroy(scene: Scene){this.clear();for(const t of this.textures.values())t.dispose();this.depth.dispose();scene.remove(this.group);}
}

/** Small vector-painted patches with transparent borders; no baked directional shadows. */
function texture(kind: DecalKind): CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  let seed=173;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const ellipse=(x:number,y:number,rx:number,ry:number,a:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,a,0,Math.PI*2);ctx.fill();};
  const count=kind==='pebbles'?36:kind==='tiny-flowers'?85:230;
  for(let i=0;i<count;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*205;
    const x=256+Math.cos(angle)*r,y=256+Math.sin(angle)*r;
    ctx.globalAlpha=Math.min(1,(225-r)/65)*(.6+random()*.4);
    const a=random()*Math.PI*2;
    if(kind==='leaf-litter'){
      const size=3+random()*6;
      ellipse(x,y,size,size*.4,a,['#527b32','#709b3d','#9cb954'][i%3]!);
      ellipse(x-1,y-1,size*.65,size*.14,a,'#a8c666');
    }else if(kind==='tiny-flowers'){
      ellipse(x,y,5,2,a,'#668d35');
      const size=2+random()*2;
      for(let j=0;j<4;j++)ellipse(x+Math.cos(a+j*Math.PI/2)*size,y+Math.sin(a+j*Math.PI/2)*size,size,size*.6,a+j*Math.PI/2,i%4?'#e5d66d':'#f3efd0');
      ellipse(x,y,1.5,1.5,0,'#9c9238');
    }else{
      const size=3+random()*12;
      ellipse(x,y,size+1,size*.7+1,a,'#657a46');
      ellipse(x,y,size,size*.7,a,['#bfc896','#d0d3af','#a4b690'][i%3]!);
      ellipse(x-1,y-1,size*.7,size*.4,a,'#d6dbb4');
    }
  }
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;t.anisotropy=8;return t;
}
