import broadTuftUrl from '../../../assets/terrain/tuft-broad.png?url';
import tuftUrl from '../../../assets/terrain/tuft.png?url';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, MeshLambertMaterial, DoubleSide, Color, Object3D, type Scene, type IUniform, TextureLoader, SRGBColorSpace } from 'three';
import type { HeightField } from '../../shared';
import { curveDistance, sampleCurve, type Landscape } from '../../shared/landscape/curve';
/** Small ground cover uses three batched draws, independent of blade count. */
export class Meadow {
  private meshes: InstancedMesh[]=[];
  private readonly time:IUniform<number>={value:0};
  private readonly grass=bladeGeometry();
  private readonly flowers=flowerGeometry();
  private readonly tuft=new TextureLoader().load(tuftUrl, t=>{t.colorSpace=SRGBColorSpace;t.anisotropy=8;});
  private readonly broadTuft=new TextureLoader().load(broadTuftUrl,t=>{t.colorSpace=SRGBColorSpace;t.anisotropy=8;});
  private readonly materials=[this.material(true),this.material(true,true),this.material(false)];
  count=0;
  constructor(private readonly scene:Scene){}
  private material(grass:boolean,broad=false):MeshLambertMaterial {
    const m=new MeshLambertMaterial({side:DoubleSide, map:grass?(broad?this.broadTuft:this.tuft):null, alphaTest:grass?.45:0,alphaToCoverage:grass});
    m.onBeforeCompile=s=>{
      s.uniforms.uWind=this.time;
      s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal=normalize(vec3(objectNormal.x*.4,.9,objectNormal.z*.4));').replace('#include <common>','#include <common>\nuniform float uWind;').replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 center=instanceMatrix[3].xyz;
      transformed.x+=sin(uWind*1.6+center.x*.6+center.z*.4)*position.y*position.y*.13;
      transformed.z+=cos(uWind*1.3+center.z*.5)*position.y*position.y*.07;`);
      s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal=normalize(mat3(viewMatrix)*vec3(0.0,1.0,0.0));');
      if(grass)s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=mix(.72,1.08,smoothstep(.0,.8,vMapUv.y));');
    };return m;
  }
  tick(now:number):void{this.time.value=now*.001;}
  rebuild(field:HeightField,landscape:Landscape):void {
    for(const m of this.meshes){this.scene.remove(m);m.dispose();}this.meshes=[];
    const poses:{x:number;y:number;z:number;s:number;r:number;flower:boolean;broad:boolean;c:Color}[]=[];
    const paints=landscape.strokes.map(s=>({s,curve:sampleCurve(s.points,s.radius,1)}));
    const season=landscape.environment.season;
    const occupied=new Set<string>();
    for(const patch of landscape.cover){
      let seed=patch.seed>>>0;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
      const palette=patch.palette??'meadow';
      const hue=palette==='ochre'?.085:palette==='sage'?.17:palette==='straw'?.10:season==='spring'?.19:.13;
      const saturation=palette==='ochre'?.5:palette==='sage'?.23:.5;
      const n=Math.min(40000,Math.round(Math.PI*patch.radius**2*patch.density));
      for(let i=0;i<n && poses.length<90000;i++){
        const a=rand()*Math.PI*2,r=Math.sqrt(rand())*patch.radius,x=patch.x+Math.cos(a)*r,z=patch.z+Math.sin(a)*r;
        const y=field.sample(x,z);if(y<field.waterLevel+.25)continue;
        const edge=1-r/patch.radius;const clump=.5+.5*Math.sin(x*.7+Math.cos(z*.6))*Math.sin(z*.8);
        if(rand()>Math.min(1,edge*6)*(.3+.7*clump))continue;
        if(Math.hypot(field.sample(x+.4,z)-field.sample(x-.4,z),field.sample(x,z+.4)-field.sample(x,z-.4))>.65)continue;
        let blocked=0;
        for(const p of paints){const d=curveDistance(x,z,p.curve);if(d>=1)continue;const t=Math.max(0,Math.min(1,(d-.55)/.45));const w=p.s.opacity*(1-t*t*(3-2*t));blocked=blocked*(1-w)+(p.s.layer==='grass'?0:w);}
        if(rand()<blocked)continue;
        const key=`${Math.floor(x*4)},${Math.floor(z*4)}`;if(occupied.has(key))continue;occupied.add(key);
        const flower=rand()<patch.flowers;
        const c=flower?new Color([0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xfff4d0,0xefc9ef,0xa89be0,0xffe697][Math.floor(rand()*12)]!):new Color().setHSL(hue+rand()*.02,saturation+rand()*.1,(palette==='sage'?.43:palette==='ochre'?.5:.47)+rand()*.09);
        poses.push({x,y:y-.035,z,s:flower?.6+rand()*.5:(1.1+rand()*.7)*(patch.grassScale??1),r:rand()*6.28,flower,broad:rand()<(patch.broadRatio??.55),c});
      }
    }
    for(let idx=0;idx<3;idx++){
      const flower=idx===2;
      const list=poses.filter(p=>flower?p.flower:!p.flower&&p.broad===(idx===1));if(!list.length)continue;
      const mesh=new InstancedMesh(flower?this.flowers:this.grass,this.materials[idx]!,list.length);
      const o=new Object3D();list.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.rotation.y=p.r;o.scale.set(p.s*(p.flower?1:p.broad?.85:.8),p.s*(p.flower?1:1.05),p.s*(p.flower?1:p.broad?.85:.8));o.updateMatrix();mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,p.c);});
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.receiveShadow=true;mesh.castShadow=!flower;mesh.name=flower?'meadow-flowers':'meadow-grass';mesh.computeBoundingSphere();this.scene.add(mesh);this.meshes.push(mesh);
    }
    this.count=poses.length;
  }
  destroy():void{for(const m of this.meshes){this.scene.remove(m);m.dispose();}this.tuft.dispose();this.broadTuft.dispose();this.grass.dispose();this.flowers.dispose();this.materials.forEach(m=>m.dispose());}
}
function bladeGeometry():BufferGeometry {
  const p:number[]=[],uv:number[]=[];
  // Two crossed cutout planes use the pack's broad, bent-blade silhouette.
  for(let i=0;i<2;i++){
    const a=i*Math.PI/2,c=Math.cos(a)*.5,s=Math.sin(a)*.5,h=1.2;
    p.push(-c,0,-s,c,0,s,c,h,s,-c,0,-s,c,h,s,-c,h,-s);
    uv.push(0,0,1,0,1,1,0,0,1,1,0,1);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function flowerGeometry():BufferGeometry {
  const p:number[]=[];
  // A colony of small flower heads, not a single oversized decal.
  for(let j=0;j<7;j++){
    const theta=j*2.399,r=Math.sqrt(j/7)*.9,x=Math.cos(theta)*r,z=Math.sin(theta)*r,y=.22+(j%4)*.08;
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5,dx=Math.cos(a),dz=Math.sin(a);
      // Broad diamond petals retain a readable flower silhouette at game zoom.
      const left=[x+dx*.16-dz*.065,y+.01,z+dz*.16+dx*.065];
      const tip=[x+dx*.22,y,z+dz*.22];
      const right=[x+dx*.16+dz*.065,y+.01,z+dz*.16-dx*.065];
      p.push(x,y,z,...left,...tip,x,y,z,...tip,...right);
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
