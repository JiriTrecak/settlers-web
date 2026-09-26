import type {HeightField} from '../../shared/map/height';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AmbientLight,Color,DirectionalLight,DoubleSide,Float32BufferAttribute,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Vector3,type Scene,type Texture,type BufferGeometry} from 'three';
import {sourceHeight,unpackSourceBytes,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {referenceTexture,macroUrl} from '../terrain/referenceTerrain';
import {ReferenceGround} from '../prop/referenceGround';
import {sourceGrassLighting} from './sourceGrassLighting';
import {perf} from '../../debug/performance';
import {assetUrls} from '../../shared/assets/urls.generated';
export type GrassInstance={x:number;z:number;y?:number;yaw:number;scale:number};
export type NativeGrass={field:HeightField;groups:{asset:string;water?:boolean;instances:GrassInstance[]}[]};
/** Stored instances only: no random scatter, density budget, or scale substitution. */
export class ImportedGrass {
 readonly ready:Promise<void>;
 private dead=false;
 private meshes:InstancedMesh[]=[];
 private geometries:BufferGeometry[]=[];
 private materials:MeshStandardMaterial[]=[];
 private textures=new Set<Texture>();
 private macro=referenceTexture(macroUrl,false);
 private time={value:0};
 private ground=new ReferenceGround();
 private sun?:DirectionalLight;
 private ambient?:AmbientLight;
 private sunColor={value:new Color()};
 private sunDirection={value:new Vector3()};
 private ambientColor={value:new Color()};
 private target=new Vector3();
 constructor(private scene:Scene,readonly source:ImportedTerrain|NativeGrass){
  this.sun=scene.children.find((o):o is DirectionalLight=>o instanceof DirectionalLight);
  this.ambient=scene.children.find((o):o is AmbientLight=>o instanceof AmbientLight);
  if('field'in source)this.ground.update(source.field);else this.ground.updateSource(sourceHeight(source));
  this.ready=this.build();
 }
 private async build(){
  await this.ground.ready;
  const source=this.source,field='field'in source?{sample:(x:number,z:number)=>source.field.sample(x,z),normal:(x:number,z:number):[number,number,number]=>{const v=new Vector3(source.field.sample(x-.5,z)-source.field.sample(x+.5,z),1,source.field.sample(x,z-.5)-source.field.sample(x,z+.5)).normalize();return v.toArray();}}:sourceHeight(source),loader=new GLTFLoader();
  const groups='field'in source?source.groups:source.grass.map(g=>{const raw=unpackSourceBytes(g.instances),instances:GrassInstance[]=[];for(let i=0;i<raw.length;i+=8)instances.push({x:source.origin[0]+(raw[i]!+raw[i+2]!/255)*16,z:source.origin[1]+(raw[i+1]!+raw[i+3]!/255)*16,y:g.water?(raw[i+7]!+raw[i+6]!/255)*256/65535*64+source.heightOffset:undefined,yaw:raw[i+4]!/255*Math.PI*2,scale:.25+3.75*raw[i+5]!/255});return {...g,instances};});
  for(const group of groups){
   const url=assetUrls[`assets/library/asset.models.environment.grass.${group.asset}/geometry.glb`];if(!url)throw Error(`Missing imported grass ${group.asset}`);
   const gltf=await loader.loadAsync(url),parts:Mesh[]=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o instanceof Mesh)parts.push(o);});
   for(const part of parts){
    const geometry=part.geometry;geometry.applyMatrix4(part.matrixWorld);
    const material=(Array.isArray(part.material)?part.material[0]:part.material) as MeshStandardMaterial;
    if(this.dead){geometry.dispose();material.map?.dispose();material.dispose();continue;}
    this.geometries.push(geometry);this.materials.push(material);if(material.map)this.textures.add(material.map);
    const laying=material.userData.sourceShaderAttributes?.IsLaying==='true';
    material.side=DoubleSide;material.alphaTest=.5;material.color.setScalar(1);
    if(!laying){const pos=geometry.getAttribute('position'),normals=new Float32Array(pos.count*3),v=new Vector3();for(let i=0;i<pos.count;i++){v.set(pos.getX(i),pos.getY(i)+1,pos.getZ(i)).normalize();v.toArray(normals,i*3);}geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));}
    material.onBeforeCompile=s=>{s.uniforms.uSourceGrassTime=this.time;
     // Source grass is lit per vertex: back faces retain the authored upward normal.
     s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal*=gl_FrontFacing?1.:-1.;');
     s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uSourceGrassTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
     vec3 anchor=instanceMatrix[3].xyz;
     float bend=max(position.y,0.);transformed.x+=sin(uSourceGrassTime+anchor.x*.17+anchor.z*.13)*bend*.04;
    `);};
    material.customProgramCacheKey=()=>`source-grass-v1-${laying}`;
    // Grass.fxs also defines FORCE_LIGHTMAP_OCCLUSION_LEVEL0.
    this.ground.attachColor(material,this.macro,material.userData.sourceShaderAttributes?.IsUseGroundColor==='true',false,true);
    if(laying&&!group.water)this.ground.attach(material);
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=(s,r)=>{
     previous.call(material,s,r);
     Object.assign(s.uniforms,{uGrassSunColor:this.sunColor,uGrassSunDirection:this.sunDirection,uGrassAmbient:this.ambientColor});
     sourceGrassLighting(s,material.userData.sourceShaderAttributes?.IsUseGroundColor==='true',laying&&!group.water);
     s.uniforms.uGrassUnderlay=this.ground.underlay;s.uniforms.uGrassGroundLayout=this.ground.colorLayout;
     s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform sampler2D uGrassUnderlay;uniform vec4 uGrassGroundLayout;')
      .replace('#include <fog_vertex>',`#include <fog_vertex>
       vec2 maskSize=vec2(textureSize(uGrassUnderlay,0));
       vec2 maskUV=(instanceMatrix[3].xz-uGrassGroundLayout.xy)*uGrassGroundLayout.zw;
       if(texture2D(uGrassUnderlay,(maskUV*(maskSize-1.)+.5)/maskSize).r>.5)gl_Position=vec4(2.,2.,2.,1.);
      `);
    };
    const chunks=new Map<string,GrassInstance[]>();
    for(const instance of group.instances){const key=Math.floor(instance.x/16)+':'+Math.floor(instance.z/16),chunk=chunks.get(key)??[];chunk.push(instance);chunks.set(key,chunk);}
    for(const instances of chunks.values()){
     const mesh=new InstancedMesh(geometry,material,instances.length),matrix=new Matrix4(),up=new Vector3(),right=new Vector3(),tangent=new Vector3(),third=new Vector3();
     instances.forEach(({x,z,y,yaw:angle,scale},index)=>{
      up.fromArray(field.normal(x,z)).lerp(new Vector3(0,1,0),.5);
      if(laying||group.water)up.set(0,1,0);
      right.set(Math.sin(angle),0,Math.cos(angle));tangent.crossVectors(up,right).normalize();third.crossVectors(tangent,up);
      matrix.makeBasis(tangent,up,third).scale(new Vector3(scale,scale,scale));matrix.setPosition(x,y??field.sample(x,z),z);mesh.setMatrixAt(index,matrix);
     });
     mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=.5;
     mesh.castShadow=false;mesh.receiveShadow=material.userData.sourceAttributes?.IsDisableShadows!=='true';mesh.name=`source-grass.${group.asset}`;
     mesh.onBeforeRender=()=>perf.count('Source grass triangles',(geometry.index?.count??geometry.getAttribute('position').count)/3*mesh.count);
     this.meshes.push(mesh);this.scene.add(mesh);
    }
   }
  }
  perf.value('Source grass instances',groups.reduce((n,g)=>n+g.instances.length,0));
 }
 updateGround(field:HeightField){this.ground.update(field);}
 tick(now:number){
  this.time.value=now*.001;
  if(this.sun){this.sunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);this.sun.getWorldPosition(this.sunDirection.value);this.sun.target.getWorldPosition(this.target);this.sunDirection.value.sub(this.target).normalize();}
  if(this.ambient)this.ambientColor.value.copy(this.ambient.color).multiplyScalar(this.ambient.intensity);
 }
 dispose(){this.dead=true;for(const m of this.meshes){this.scene.remove(m);m.dispose();}for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();this.ground.dispose();this.macro.dispose();}
}
