import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Box3, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector2, Vector3,
  TextureLoader, SRGBColorSpace, RepeatWrapping, type Camera, type Material, type Scene, type Texture, type DirectionalLight,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {forestAnchors,forestRandom,type ForestSurroundings as Profile} from '../../shared/landscape/forestSurroundings';
import {sceneryModels} from '../../shared/assets/models';
import {projectMeshUrl} from '../../shared/assets/project';
import {MAP_HALO,type HeightField} from '../../shared';
import type {CanopyFrame} from '../atmosphere/canopyLayer';
import {referenceMaterialPlugin} from '../prop/referenceMaterial';
import {transformedModel} from '../prop/modelTransform';

type Prototype={geometry:BufferGeometry;material:MeshStandardMaterial;matrix:Matrix4};


/** Folded broad leaf, with a raised midrib and gently lobed silhouette. Actual
 * geometry works from below as well as above; no crossed billboard planes. */
export function canopyLeaf():BufferGeometry {
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],uvs:number[]=[];
  const rows=13;
  for(let i=0;i<rows;i++){
    const t=i/(rows-1),w=Math.pow(Math.sin(t*Math.PI),.7)*(.31+.035*Math.cos(t*Math.PI*10));
    for(let j=-1;j<=1;j++){
      positions.push(j*w,Math.sin(t*Math.PI)*.09-Math.pow(j,2)*w*.22,t-.5);
      uvs.push(j*.5+.5,t);
      const v=1-Math.abs(j)*.045;colors.push(v,v,v);
    }
  }
  for(let i=0;i<rows-1;i++)for(let j=0;j<2;j++){
    const a=i*3+j,b=a+3;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(positions,3));geo.setAttribute('uv',new Float32BufferAttribute(uvs,2));geo.setAttribute('color',new Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

/** A biome's render-only forest extension. Nothing is added to maps, pathing,
 * picking, resource counts, or fog of war. Groups are spatially batched. */
export class ForestSurroundingsLayer {
  private readonly root=new Group();
  private readonly crowns=new Group();
  private readonly limbs=new Group();
  private readonly generated=new Set<BufferGeometry>();
  private originalBackground:Scene['background']=null;
  private readonly background=new Color();
  private readonly bark=new TextureLoader().load(projectMeshUrl('assets/library/asset.textures.forest-giants-bark/albedo.png')!);
  private readonly loader=new GLTFLoader().register(referenceMaterialPlugin);
  private readonly prototypes=new Map<string,Promise<Prototype[]>>();
  private readonly sourceRoots=new Set<Object3D>();
  private readonly floorTextures=new Map<string,Promise<Texture>>();
  private readonly materials=new Set<Material>();
  private readonly leaf=canopyLeaf();
  private key='';
  private revision=0;
  private dead=false;
  ready:Promise<void>=Promise.resolve();
  private profile:Profile|undefined;
  private size=0;
  closeFactor=0;
  private readonly mask={value:null as Texture|null};
  private readonly maskOffset={value:new Vector2()};
  private readonly maskScale={value:240};
  private readonly wind={value:0};
  private readonly viewFade={value:0};
  private readonly haze={value:new Color()};
  private readonly hazeRange={value:new Vector2(110,650)};
  private readonly sunTint={value:new Color()};
  private readonly sunDirection={value:new Vector3(0,1,0)};
  private readonly night={value:1};
  constructor(private readonly scene:Scene){this.bark.colorSpace=SRGBColorSpace;this.bark.wrapS=this.bark.wrapT=RepeatWrapping;this.root.name='Biome forest surroundings';this.crowns.name='Overhead broadleaf crowns';this.root.add(this.crowns,this.limbs);scene.add(this.root);}

  configure(profile:Profile|undefined,field:HeightField|null,frame:CanopyFrame|undefined,interior:boolean){
    this.profile=profile;this.root.visible=!!(profile&&field&&frame&&!interior);
    if(!this.root.visible||!profile||!field||!frame)return;
    this.mask.value=frame.texture;this.maskOffset.value.copy(frame.offset);this.maskScale.value=frame.settings.scale;
    this.haze.value.set(profile.hazeColor);this.hazeRange.value.set(profile.hazeStart,profile.hazeEnd);
    this.size=field.size;
    const boundary=Array.from({length:16},(_,i)=>{const t=(i%4)*field.size/3;return field.sample(i<4?t:i<8?field.size:i<12?t:0,i<4?0:i<8?t:i<12?field.size:t);});
    const key=JSON.stringify([field.size,boundary,frame.settings.seed,frame.settings.height,profile]);
    if(this.key===key)return;
    this.key=key;const revision=++this.revision;
    this.ready=this.build(profile,field,frame,revision).catch(error=>{if(!this.dead&&revision===this.revision){this.key='';console.error('Biome forest could not load',error);}throw error;});
  }

  private async load(id:string):Promise<Prototype[]>{
    let promise=this.prototypes.get(id);if(promise)return promise;
    promise=(async()=>{
      const model=sceneryModels.get(id),url=model&&projectMeshUrl(model.geometry[0]);
      if(!model||!url)throw new Error(`Missing biome scenery: ${id}`);
      const gltf=await this.loader.loadAsync(url),root=transformedModel(gltf.scene,model.transform,0);
      this.sourceRoots.add(root);root.updateMatrixWorld(true);
      const parts:Prototype[]=[];
      root.traverse(o=>{if(o instanceof Mesh){
        if(Array.isArray(o.material))throw new Error(`Biome scenery requires single-material primitives: ${id}`);
        parts.push({geometry:o.geometry,material:o.material,matrix:o.matrixWorld.clone()});
      }});
      return parts;
    })();this.prototypes.set(id,promise);return promise;
  }

  private material(source:MeshStandardMaterial,ceiling=false):MeshStandardMaterial{
    const mat=source.clone();this.materials.add(mat);
    mat.userData.ignoreVisibility=true;mat.fog=false;
    const before=source.onBeforeCompile;
    mat.onBeforeCompile=(shader,renderer)=>{
      before.call(mat,shader,renderer);
      Object.assign(shader.uniforms,{forestMask:this.mask,forestOffset:this.maskOffset,forestScale:this.maskScale,forestWind:this.wind,forestView:this.viewFade,forestHaze:this.haze,forestHazeRange:this.hazeRange,forestSun:this.sunDirection,forestSunTint:this.sunTint,forestDay:this.night});
      shader.vertexShader='varying vec3 forestWorld; varying vec2 forestLeafUv; varying vec2 forestAnchor; uniform float forestWind;\n'+shader.vertexShader;
      if(ceiling)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed.y+=sin(forestWind*.65+instanceMatrix[3].x*.025+instanceMatrix[3].z*.03)*.014*sin(uv.y*3.14159);`);
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        forestLeafUv=uv;
        forestWorld=(modelMatrix * vec4(transformed,1.)).xyz;
        forestAnchor=forestWorld.xz;
        #ifdef USE_INSTANCING
          forestWorld=(modelMatrix * instanceMatrix * vec4(transformed,1.)).xyz;
          forestAnchor=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xz;
        #endif
      `);
      shader.fragmentShader=`varying vec3 forestWorld; varying vec2 forestLeafUv; varying vec2 forestAnchor;
        uniform sampler2D forestMask; uniform vec2 forestOffset,forestHazeRange;
        uniform float forestScale,forestWind,forestView,forestDay;
        uniform vec3 forestHaze,forestSun,forestSunTint;\n`+shader.fragmentShader;
      if(!ceiling)shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        // Fade tall outside trunks before they project over the playable RTS floor.
        if(forestView<1.){
          float outside=max(max(-forestWorld.x,forestWorld.x-${this.size.toFixed(1)}),max(-forestWorld.z,forestWorld.z-${this.size.toFixed(1)}));
          if(outside>24. && forestWorld.y>24.){float d=fract(dot(floor(gl_FragCoord.xy),vec2(.75487766,.56984029)));if(d>forestView)discard;}
        }`);
      if(ceiling){
        // Projected mask and visible openings share world coordinates and sway.
        shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
          float shade=texture2D(forestMask,forestAnchor/forestScale+forestOffset).r;
          float inMap=step(0.,forestAnchor.x)*step(0.,forestAnchor.y)*step(forestAnchor.x,${this.size.toFixed(1)})*step(forestAnchor.y,${this.size.toFixed(1)});
          if((inMap>.5 && shade < .38) || forestView < .01)discard;
          float dither=fract(dot(floor(gl_FragCoord.xy),vec2(.75487766,.56984029)));
          if(dither>forestView)discard;
        `);
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 sight=normalize(forestWorld-cameraPosition);
        float glow=pow(max(0.,dot(sight,forestSun)),6.);
        float distanceHaze=smoothstep(forestHazeRange.x,forestHazeRange.y,length(forestWorld-cameraPosition));
        outgoingLight=mix(outgoingLight,forestHaze*forestDay+forestSunTint*glow*.22,distanceHaze*.82);
        ${ceiling?`float midrib=1.-smoothstep(.008,.017,abs(forestLeafUv.x-.5));
        float vein=1.-smoothstep(.018,.045,abs(fract(forestLeafUv.y*6.-abs(forestLeafUv.x-.5)*3.)-.5));
        outgoingLight*=.83+.09*sin(forestLeafUv.y*3.14159)+midrib*.22+vein*.07;
        outgoingLight+=diffuseColor.rgb*forestSunTint*(.07+.16*glow);`:''}
        #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey=()=>`biome-surroundings-v2-${this.size}-${ceiling}-${source.customProgramCacheKey()}`;
    return mat;
  }

  private clearBatches(){
    this.root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});
    this.root.clear();this.crowns.clear();this.limbs.clear();this.root.add(this.crowns,this.limbs);
    this.generated.forEach(g=>g.dispose());this.generated.clear();
    this.materials.forEach(m=>m.dispose());this.materials.clear();
  }

  private async build(profile:Profile,field:HeightField,frame:CanopyFrame,revision:number){
    const ids=[profile.trunk,...profile.mushroom?[profile.mushroom]:[],...profile.log?[profile.log]:[]];
    let floor=this.floorTextures.get(profile.floorTexture);
    if(!floor){floor=new TextureLoader().loadAsync(projectMeshUrl(`assets/library/${profile.floorTexture}/albedo.png`)!).then(t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;return t;});this.floorTextures.set(profile.floorTexture,floor);}
    const [loaded,floorMap]=await Promise.all([Promise.all(ids.map(id=>this.load(id))),floor]);
    if(this.dead||revision!==this.revision)return;
    this.clearBatches();
    const trunkBounds=new Box3();
    for(const part of loaded[0]){part.geometry.computeBoundingBox();trunkBounds.union(part.geometry.boundingBox!.clone().applyMatrix4(part.matrix));}
    const trunkSize=trunkBounds.getSize(new Vector3()),trunkRadius=Math.max(trunkSize.x,trunkSize.z)*.5;
    const floorSource=new MeshStandardMaterial({map:floorMap,color:profile.floorColor,roughness:1});
    const floorGeometry=this.floorGeometry(field);this.generated.add(floorGeometry);
    this.root.add(new Mesh(floorGeometry,this.material(floorSource)));floorSource.dispose();
    const random=forestRandom(frame.settings.seed+field.size),anchors=forestAnchors(field.size,frame.settings.seed,profile);
    const crownPoints:Vector3[]=[];
    const limbBatches:BufferGeometry[][]=Array.from({length:16},()=>[]);
    const transforms=new Map<string,Matrix4[]>(),dummy=new Object3D();
    const limbSource=new MeshStandardMaterial({map:this.bark,color:0xffffff,roughness:1});
    const limbMaterial=this.material(limbSource);limbSource.dispose();
    const add=(id:string)=>{let list=transforms.get(id);if(!list)transforms.set(id,list=[]);dummy.updateMatrix();list.push(dummy.matrix.clone());};
    for(const a of anchors){
      const y=field.sample(Math.max(0,Math.min(field.size-1,a.x)),Math.max(0,Math.min(field.size-1,a.z)))-6;
      dummy.position.set(a.x,y,a.z);dummy.rotation.set(0,a.yaw,0);dummy.scale.set(a.radius/trunkRadius,a.height*.69/trunkSize.y,a.radius/trunkRadius);add(profile.trunk);
      // Fork above the tall clear bole. Every limb begins inside the trunk, so
      // the authored mesh's cut top is covered and the crown has real structure.
      for(let limb=0;limb<5;limb++){
        const angle=a.yaw+limb*Math.PI*.5+(random()-.5)*.45;
        const reach=limb===4?8:40+random()*38;
        const points=[new Vector3(a.x,y+a.height*(limb===4?.63:.57+random()*.07),a.z),new Vector3(a.x+Math.cos(angle)*reach*.22,y+a.height*.75,a.z+Math.sin(angle)*reach*.22),new Vector3(a.x+Math.cos(angle)*reach*.6,y+a.height*.86,a.z+Math.sin(angle)*reach*.6),new Vector3(a.x+Math.cos(angle)*reach,y+a.height*(limb===4?1.06:.94),a.z+Math.sin(angle)*reach)];
        crownPoints.push(points[3],points[2]);
        const geometry=this.limbGeometry(new CatmullRomCurve3(points).getPoints(9),a.radius*(limb===4?.48:.24));
        const quadrant=(a.x>field.size/2?1:0)+(a.z>field.size/2?2:0);
        limbBatches[quadrant+a.ring*4].push(geometry);
      }
      if(profile.mushroom&&a.ring<2&&random()<.45){
        dummy.position.set(a.x,y,a.z);dummy.scale.setScalar(2+random()*2);add(profile.mushroom);
      }
      if(profile.log&&a.ring===0&&random()<.25){
        dummy.position.set(a.x,y+4,a.z);dummy.rotation.set(0,a.yaw,.08);dummy.scale.set(1.9,1.6,1.9);add(profile.log);
      }
    }
    for(const geometries of limbBatches)if(geometries.length){
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
      this.generated.add(merged);this.limbs.add(new Mesh(merged,limbMaterial));
    }
    for(let k=0;k<ids.length;k++){
      const matrices=transforms.get(ids[k])??[];
      for(const part of loaded[k]){
        const material=this.material(part.material);
        // Per quadrant culling avoids submitting the entire surrounding forest.
        for(let cell=0;cell<4;cell++){
          const subset=matrices.filter(m=>(m.elements[12]>field.size/2?1:0)+(m.elements[14]>field.size/2?2:0)===cell);
          if(!subset.length)continue;
          const mesh=new InstancedMesh(part.geometry,material,subset.length);
          subset.forEach((m,i)=>mesh.setMatrixAt(i,m.clone().multiply(part.matrix)));
          mesh.computeBoundingSphere();this.root.add(mesh);
        }
      }
    }
    const leafSource=new MeshStandardMaterial({color:0xffffff,vertexColors:true,side:DoubleSide,roughness:.94});
    const material=this.material(leafSource,true);leafSource.dispose();
    // A bounded grid gives the canopy a fixed budget even on extra-large maps.
    const margin=340,span=field.size+margin*2,step=Math.max(profile.leafSpacing,span/85),cells=8;
    const leafBatches:Matrix4[][]=Array.from({length:cells*cells},()=>[]);
    const colors:Color[][]=Array.from({length:cells*cells},()=>[]);
    for(let z=-margin;z<field.size+margin;z+=step)for(let x=-margin;x<field.size+margin;x+=step){
      const px=x+random()*step,pz=z+random()*step;
      // Three broad overlapping leaves per crown, with differing tilt and shade.
      for(let l=0;l<3;l++){
        dummy.position.set(px+(random()-.5)*step,frame.settings.height+Math.sin(px*.018)*12+Math.cos(pz*.025)*10+(random()-.5)*7,pz+(random()-.5)*step);
        dummy.rotation.set((random()-.5)*.65,random()*Math.PI*2,(random()-.5)*.7);
        const length=profile.leafLength*(.8+random()*.8);dummy.scale.set(length, length, length);dummy.updateMatrix();
        const cell=Math.min(cells-1,Math.floor((px+margin)/span*cells))+cells*Math.min(cells-1,Math.floor((pz+margin)/span*cells));
        leafBatches[cell].push(dummy.matrix.clone());colors[cell].push(new Color(profile.leafColors[Math.floor(random()*profile.leafColors.length)]));
      }
    }
    // Each fork carries its own clustered foliage, including farther crowns at
    // their actual branch height. The shared transmission mask controls only
    // the overhead sheet above gameplay, not silhouettes beyond its boundary.
    for(const point of crownPoints)for(let l=0;l<22;l++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*22;
      dummy.position.set(point.x+Math.cos(angle)*r,point.y-3+random()*9,point.z+Math.sin(angle)*r);
      dummy.rotation.set((random()-.5)*.7,random()*Math.PI*2,(random()-.5)*.55);
      const length=profile.leafLength*(.6+random()*.7);dummy.scale.setScalar(length);dummy.updateMatrix();
      const cx=Math.max(0,Math.min(cells-1,Math.floor((point.x+margin)/span*cells))),cz=Math.max(0,Math.min(cells-1,Math.floor((point.z+margin)/span*cells))),cell=cx+cz*cells;
      leafBatches[cell].push(dummy.matrix.clone());colors[cell].push(new Color(profile.leafColors[Math.floor(random()*profile.leafColors.length)]));
    }
    leafBatches.forEach((list,cell)=>{
      const mesh=new InstancedMesh(this.leaf,material,list.length);
      list.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,colors[cell][i]);});
      mesh.computeBoundingSphere();this.crowns.add(mesh);
    });
  }

  private floorGeometry(field:HeightField):BufferGeometry {
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[],segments=32;
    const point=(side:number,t:number,d:number)=>{
      const v=-d+(field.size+2*d)*t;
      return side===0?[v,-d]:side===1?[field.size+d,v]:side===2?[field.size-v,field.size+d]:[-d,field.size-v];
    };
    for(let side=0;side<4;side++){
      const base=positions.length/3;
      for(let i=0;i<=segments;i++){
        const [x,z]=point(side,i/segments,MAP_HALO-.1),edge=field.sample(x,z)-.25;
        for(const distance of [MAP_HALO-.1,80,420]){
          const [px,pz]=point(side,i/segments,distance);
          positions.push(px,edge-(distance-MAP_HALO)*.008,pz);uvs.push(px*.06,pz*.06);
        }
      }
      for(let i=0;i<segments;i++)for(let row=0;row<2;row++){
        const a=base+i*3+row,b=a+3;indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }

  private limbGeometry(points:Vector3[],radius:number):BufferGeometry {
    const positions:number[]=[],uv:number[]=[],index:number[]=[];
    for(let i=0;i<points.length;i++){
      const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const u=new Vector3(0,0,1).cross(tangent).normalize(),v=tangent.clone().cross(u).normalize();
      const r=radius*Math.pow(1-i/points.length,1.2);
      for(let j=0;j<=8;j++){const t=j/8*Math.PI*2,p=points[i].clone().addScaledVector(u,Math.cos(t)*r).addScaledVector(v,Math.sin(t)*r);positions.push(p.x,p.y,p.z);uv.push(j/8,i*1.6);}
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<8;j++){const a=i*9+j,b=a+9;index.push(a,a+1,b,b,a+1,b+1);}
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(index);geometry.computeVertexNormals();return geometry;
  }

  update(camera:Camera,frame:CanopyFrame|undefined,sun:DirectionalLight,now:number){
    if(!this.root.visible||!this.profile||!frame){this.closeFactor=0;if(this.scene.background===this.background)this.scene.background=this.originalBackground;return;}
    this.maskOffset.value.copy(frame.offset);this.wind.value=now*.001;
    this.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    this.sunTint.value.copy(sun.color).multiplyScalar(Math.min(1.3,sun.intensity));
    this.night.value=Math.min(1,Math.max(.07,sun.intensity));
    const direction=camera.getWorldDirection(new Vector3());
    // Continuous fade on camera pitch; regular RTS views have no overhead occluders.
    this.viewFade.value=Math.max(0,Math.min(1,(direction.y+.65)/.3));
    this.closeFactor=this.viewFade.value;this.crowns.visible=this.viewFade.value>.001;this.limbs.visible=this.crowns.visible;
    if(this.scene.background!==this.background)this.originalBackground=this.scene.background;
    if(this.originalBackground instanceof Color){
      this.background.copy(this.originalBackground).lerp(new Color(this.profile.hazeColor).multiplyScalar(this.night.value*.68),this.viewFade.value);
      this.scene.background=this.viewFade.value>0?this.background:this.originalBackground;
    }
    // Close cameras previously clipped everything beyond 180 units, including the
    // opposite map boundary. Extend projection only while this biome is present.
    const cam=camera as Camera&{far:number;updateProjectionMatrix():void};
    const far=Math.max(cam.far,this.size+800);if(cam.far!==far){cam.far=far;cam.updateProjectionMatrix();}
  }

  dispose(){
    this.dead=true;this.revision++;this.clearBatches();this.root.removeFromParent();this.leaf.dispose();this.bark.dispose();
    for(const texture of this.floorTextures.values())void texture.then(t=>t.dispose(),()=>{});
    if(this.scene.background===this.background)this.scene.background=this.originalBackground;
    // Pending loads also need disposal, even when navigation happens mid-load.
    void Promise.allSettled(this.prototypes.values()).then(()=>{
      const geometry=new Set<BufferGeometry>(),material=new Set<Material>(),textures=new Set<Texture>();
      for(const root of this.sourceRoots)root.traverse(o=>{if(o instanceof Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){material.add(m);for(const value of Object.values(m))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as Texture);}}});
      geometry.forEach(g=>g.dispose());material.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.sourceRoots.clear();
    });
  }
}
