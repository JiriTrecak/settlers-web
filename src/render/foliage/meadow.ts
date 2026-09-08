import type {Camera} from 'three';
import {perf} from '../../debug/performance';
import mossUrl from '../../../assets/ant-colony/materials/moss-surface.png?url';
import tuftUrl from '../../../assets/terrain/tuft.png?url';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, MeshLambertMaterial, DoubleSide, Color, Object3D, type Scene, type IUniform, TextureLoader, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three';
import type { HeightField } from '../../shared';
import { curveDistance, sampleCurve, type Landscape } from '../../shared/landscape/curve';
/** Stable spatial variation for authored cover; independent of candidate order. */
function coverNoise(x:number,z:number):number {
 const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
 const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
 const hash=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
 const a=hash(ix,iz)*(1-u)+hash(ix+1,iz)*u,b=hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u;
 return a*(1-v)+b*v;
}
/** Ground cover is batched by material and spatial cell for frustum culling. */
export class Meadow {
  private meshes: InstancedMesh[]=[];
  private readonly time:IUniform<number>={value:0};
  private readonly grass=bladeGeometry();
  private readonly broadGrass=broadBladeGeometry();
  private readonly flowers=flowerGeometry();
  private readonly understory=understoryGeometry();
  private readonly understoryFar=understoryGeometry(true);
  updateLOD(camera:Camera):void {
    for(const mesh of this.meshes){
      if(mesh.geometry!==this.understory&&mesh.geometry!==this.understoryFar)continue;
      const distance=camera.position.distanceTo(mesh.boundingSphere!.center);
      const far='isPerspectiveCamera' in camera&&distance>(mesh.geometry===this.understoryFar?50:58);
      mesh.geometry=far?this.understoryFar:this.understory;
    }
  }
  private readonly tuft=new TextureLoader().load(tuftUrl, t=>{t.colorSpace=SRGBColorSpace;t.anisotropy=8;});
  private readonly moss=new TextureLoader().load(mossUrl,t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;});
  private readonly materials=[this.material(true),this.material(true,true),this.material(false),this.material(true,true,true)];
  count=0;
  constructor(private readonly scene:Scene){}
  private material(grass:boolean,broad=false,forest=false):MeshLambertMaterial {
    const m=new MeshLambertMaterial({side:DoubleSide, vertexColors:forest, map:grass&&!broad?this.tuft:null, alphaTest:grass&&!broad?.45:0,alphaToCoverage:grass&&!broad});
    m.customProgramCacheKey=()=>`utc-meadow-4-${grass}-${broad}-${forest}`;
    m.onBeforeCompile=s=>{
      s.uniforms.uWind=this.time;
      if(forest){
        s.uniforms.uMoss={value:this.moss};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vMossWorld;').replace('#include <project_vertex>','#include <project_vertex>\nvMossWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xz;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uMoss; varying vec2 vMossWorld;');
      }
      s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>', broad ? '#include <beginnormal_vertex>' : '#include <beginnormal_vertex>\nobjectNormal=normalize(vec3(objectNormal.x*.4,.9,objectNormal.z*.4));').replace('#include <common>','#include <common>\nuniform float uWind;').replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 center=instanceMatrix[3].xyz;
      transformed.x+=sin(uWind*1.6+center.x*.6+center.z*.4)*position.y*position.y*.13;
      transformed.z+=cos(uWind*1.3+center.z*.5)*position.y*position.y*.07;`);
      if(!broad)s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal=normalize(mat3(viewMatrix)*vec3(0.0,1.0,0.0));');
      if(broad)s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb*=${forest?'.76':'.65'};
        ${forest?`vec3 mossDetail=texture2D(uMoss,vMossWorld*.20).rgb;
        float mossValue=dot(mossDetail,vec3(.3,.59,.11));
        diffuseColor.rgb*=clamp(.6+mossValue*4.,.55,1.6);`:''}`);
      if(grass&&!broad)s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=mix(.72,1.08,smoothstep(.0,.8,vMapUv.y));');
    };return m;
  }
  tick(now:number):void{this.time.value=now*.001;}
  rebuild(field:HeightField,landscape:Landscape):void {
    const timing=perf.start();
    for(const m of this.meshes){this.scene.remove(m);m.dispose();}this.meshes=[];
    const poses:{x:number;y:number;z:number;s:number;r:number;flower:boolean;broad:boolean;forest:boolean;c:Color}[]=[];
    const paints=landscape.strokes.map(s=>({s,curve:sampleCurve(s.points,s.radius,1)}));
    const season=landscape.environment.season;
    const occupied=new Set<string>();
    // Share the candidate budget across the entire map: processing order must
    // not leave later patches bare on larger authored battlefields.
    const requested=landscape.cover.reduce((sum,p)=>sum+Math.min(40000,Math.round(Math.PI*p.radius**2*p.density)),0);
    const budgetScale=Math.min(1,160000/Math.max(1,requested));
    for(const patch of landscape.cover){
      let seed=patch.seed>>>0;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
      const palette=patch.palette??'meadow';
      const hue=palette==='forest'?.175:palette==='ochre'?.085:palette==='sage'?.17:palette==='straw'?.10:season==='autumn'?.13:season==='spring'?.25:.27;
      const saturation=palette==='forest'?.42:palette==='ochre'?.5:palette==='sage'?.23:.58;
      const n=Math.floor(Math.min(40000,Math.round(Math.PI*patch.radius**2*patch.density))*budgetScale*(palette==='forest'?.35:1));
      for(let i=0;i<n && poses.length<90000;i++){
        const a=rand()*Math.PI*2,r=Math.sqrt(rand())*patch.radius,x=patch.x+Math.cos(a)*r,z=patch.z+Math.sin(a)*r;
        const y=field.sample(x,z);if(y<field.waterLevel+.25)continue;
        const edge=1-r/patch.radius;const clump=palette==='forest'?coverNoise(x*.28,z*.28)*.45+coverNoise(x*.91,z*.91)*.35+coverNoise(x*2.1,z*2.1)*.2:.5+.5*Math.sin(x*.7+Math.cos(z*.6))*Math.sin(z*.8);
        // Forest cover grows in connected colonies with bare soil between them.
        // A nonzero floor preserves stray leaves at the edges of each colony.
        const colony=Math.max(0,Math.min(1,(clump-.28)/.34));
        const cover=palette==='forest'?.04+.96*colony*colony*(3-2*colony):.3+.7*clump;
        if(rand()>Math.min(1,edge*6)*cover)continue;
        if(Math.hypot(field.sample(x+.4,z)-field.sample(x-.4,z),field.sample(x,z+.4)-field.sample(x,z-.4))>.65)continue;
        let blocked=0;
        for(const p of paints){const d=curveDistance(x,z,p.curve);if(d>=1)continue;const t=Math.max(0,Math.min(1,(d-.55)/.45));const w=p.s.opacity*(1-t*t*(3-2*t));blocked=blocked*(1-w)+(p.s.layer==='grass'?0:w);}
        if(rand()<blocked)continue;
        const key=`${Math.floor(x*4)},${Math.floor(z*4)}`;if(occupied.has(key))continue;occupied.add(key);
        const flower=rand()<patch.flowers;
        const c=flower?new Color([0xfff4d0,0xfff4d0,0xfff4d0,0xf3a2eb,0xad7cf0,0x7faaf4,0xffe36f,0xfff4d0,0xffe36f,0xe983eb,0x8674ed,0xffdf63][Math.floor(rand()*12)]!):new Color().setHSL(hue+rand()*.02,saturation+rand()*.1,(palette==='forest'?.25+clump*.12:palette==='sage'?.43:palette==='ochre'?.5:.47)+rand()*.09,(palette==='forest'||palette==='meadow'&&season!=='autumn')?SRGBColorSpace:LinearSRGBColorSpace);
        const pose={x,y:y+(palette==='forest'?.006:-.035),z,s:flower?(palette==='forest'?.25+rand()*.18:.6+rand()*.5):(1.1+rand()*.7)*(patch.grassScale??1),r:rand()*6.28,flower,forest:palette==='forest',broad:rand()<(patch.broadRatio??.55),c};
        if (!(patch.exclusions??[]).some(e=>Math.hypot(x-e.x,z-e.z)<e.radius)) poses.push(pose);
      }
    }
    for(let idx=0;idx<4;idx++){
      const flower=idx===2;
      const list=poses.filter(p=>flower?p.flower:!p.flower&&(idx===3?p.forest:!p.forest&&p.broad===(idx===1)));if(!list.length)continue;
      // Keep each batch local so the rest of the map is culled in both passes.
      const chunks=new Map<string,typeof list>();
      for(const pose of list){const key=`${Math.floor(pose.x/16)},${Math.floor(pose.z/16)}`;const chunk=chunks.get(key)??[];chunk.push(pose);chunks.set(key,chunk);}
      for(const list of chunks.values()){
      const mesh=new InstancedMesh(flower?this.flowers:idx===3?this.understory:idx===1?this.broadGrass:this.grass,this.materials[idx]!,list.length);
      const o=new Object3D();list.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.rotation.y=p.r;o.scale.set(p.s*(p.flower?1:p.broad?.85:.8),p.s*(p.flower?1:p.forest?1.0:1.05),p.s*(p.flower?1:p.broad?.85:.8));o.updateMatrix();mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,p.c);});
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      let trianglesBefore=0;
      mesh.onBeforeRender=renderer=>{if(perf.enabled)trianglesBefore=renderer.info.render.triangles;};
      mesh.onAfterRender=renderer=>perf.count(idx===3?'Moss triangles':'Other ground-cover triangles',renderer.info.render.triangles-trianglesBefore);
      mesh.receiveShadow=true;mesh.castShadow=!flower;mesh.name=flower?'meadow-flowers':'meadow-grass';mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=1;this.scene.add(mesh);this.meshes.push(mesh);
    }
    }
    this.count=poses.length;
    perf.value('Cover instances',this.count);perf.value('Cover batches',this.meshes.length);
    perf.end('Foliage rebuild (event)',timing);
  }
  destroy():void{for(const m of this.meshes){this.scene.remove(m);m.dispose();}this.tuft.dispose();this.moss.dispose();this.broadGrass.dispose();this.understory.dispose();this.understoryFar.dispose();this.grass.dispose();this.flowers.dispose();this.materials.forEach(m=>m.dispose());}
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

/** Sparse sculpted blades keep a clear silhouette from the perspective game camera. */
function broadBladeGeometry():BufferGeometry {
  const p:number[]=[];
  for(let blade=0;blade<5;blade++){
    const a=blade*2.399,dx=Math.cos(a),dz=Math.sin(a),h=.72+(blade%3)*.22,reach=.36+(blade%2)*.20;
    const rows=[[0,0,.035],[reach*.18,h*.44,.10],[reach*.62,h*.87,.075],[reach,h,0]];
    const points=rows.map(([r,y,w])=>[[-dz*w!+dx*r!,y!,dx*w!+dz*r!],[dz*w!+dx*r!,y!,-dx*w!+dz*r!]]);
    for(let row=0;row<3;row++){
      const [a,b]=points[row]!,[c,d]=points[row+1]!;
      p.push(...a!,...b!,...d!,...a!,...d!,...c!);
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

/** Low curled leaves make continuous forest ground cover without upright lawn spikes. */
function understoryGeometry(flat=false):BufferGeometry {
  const p:number[]=[];
  for(let stem=0;stem<4;stem++){
    const angle=stem*2.399, radius=Math.sqrt((stem+.3)/4)*.69;
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    // Low, staggered shoots. Avoid repeated upright five-point rosettes.
    for(let leaf=0;leaf<3;leaf++){
      const a=angle+(leaf-1)*1.15+(stem%3)*.28,dx=Math.cos(a),dz=Math.sin(a);
      const length=.23+(stem%4)*.027,width=.064+(leaf%2)*.020;
      const root=[x,.018,z],mid=[x+dx*length*.52,.064+(stem%3)*.009,z+dz*length*.52];
      const left=[mid[0]!-dz*width,.042,mid[2]!+dx*width];
      const right=[mid[0]!+dz*width,.042,mid[2]!-dx*width];
      const tip=[x+dx*length,.031,z+dz*length];
      if(flat)p.push(...root,...left,...tip,...root,...tip,...right);
      else p.push(...root,...left,...mid,...root,...mid,...right,...left,...tip,...mid,...mid,...tip,...right);
    }
  }
  // Contact shading at each rooted leaf, with raised folds catching the light.
  // Multiplies instance color, so every colony keeps its authored palette.
  const colors:number[]=[];
  for(let i=0;i<p.length;i+=3){
    const lift=Math.max(0,Math.min(1,(p[i+1]!-.018)/.065));
    const value=.66+.34*lift;
    colors.push(value*.96,value,value*.91);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
