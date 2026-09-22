import {sourceHeightGeometry} from './sourceHeightGeometry';
import type {SourceHeight} from '../../shared/map/importedTerrain';
import {TerrainMaterial} from '../terrain/terrainMaterial';
import {perf} from '../../debug/performance';
import {BufferAttribute,BufferGeometry,Group,Mesh,MeshDepthMaterial,RGBADepthPacking,type Scene} from 'three';
import {HEIGHT_ORIGIN,MAP_SIZE,MAP_HALO,type HeightDirty,type HeightField} from '../../shared';

export const DIRT=0x353330;
const PATCH=32;
type Patch={mesh:Mesh;loX:number;loZ:number;width:number;depth:number};

/** Full-resolution terrain in independently culled patches, with shared shading. */
export class HeightMesh {
 readonly mesh=new Group();
 readonly material:TerrainMaterial;
 private readonly patches:Patch[]=[];
 private readonly verts:number;
 private source?:SourceHeight;
 private sourceMeshes:Mesh[]=[];
 private readonly sourceDepth=new MeshDepthMaterial({depthPacking:RGBADepthPacking});
 constructor(scene:Scene,size=MAP_SIZE){
  const span=size+MAP_HALO*2;this.verts=span+1;this.material=new TerrainMaterial(size);this.mesh.name='height';
  for(let z=0;z<span;z+=PATCH)for(let x=0;x<span;x+=PATCH){
   const width=Math.min(PATCH,span-x),depth=Math.min(PATCH,span-z),stride=width+1;
   const positions=new Float32Array(stride*(depth+1)*3),normals=new Float32Array(positions.length);
   for(let dz=0;dz<=depth;dz++)for(let dx=0;dx<=width;dx++){
    const i=(dz*stride+dx)*3;positions[i]=HEIGHT_ORIGIN+x+dx;positions[i+2]=HEIGHT_ORIGIN+z+dz;normals[i+1]=1;
   }
   const indices=new Uint16Array(width*depth*6);let o=0;
   for(let dz=0;dz<depth;dz++)for(let dx=0;dx<width;dx++){
    const a=dz*stride+dx,b=a+1,c=a+stride,d=c+1;indices.set([a,c,b,b,c,d],o);o+=6;
   }
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setAttribute('normal',new BufferAttribute(normals,3));geometry.setIndex(new BufferAttribute(indices,1));
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new Mesh(geometry,this.material);mesh.receiveShadow=true;mesh.castShadow=true;mesh.name=`height.${x}.${z}`;this.mesh.add(mesh);
   mesh.onBeforeRender=()=>{perf.count('Terrain patches (color passes)',1);perf.count('Terrain triangles (color passes)',indices.length/3);};
   this.patches.push({mesh,loX:x,loZ:z,width,depth});
  }
  this.sourceDepth.onBeforeCompile=shader=>this.material.compileImportedDepth(shader);
  this.sourceDepth.customProgramCacheKey=()=>`source-terrain-depth-${this.source?.source.sha256??'none'}`;
  scene.add(this.mesh);
 }
 setFrom(field:HeightField,dirty?:HeightDirty|null):void {
  if(this.source!==field.source){
   this.source=field.source;
   for(const mesh of this.sourceMeshes){this.mesh.remove(mesh);mesh.geometry.dispose();}this.sourceMeshes=[];
   this.material.setImported(field.source?.source);this.sourceDepth.needsUpdate=true;
   for(const p of this.patches)p.mesh.visible=!field.source;
   if(field.source){
    const [nx,nz]=field.source.source.blocks;
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
     const mesh=new Mesh(sourceHeightGeometry(field.source,x,z),this.material);mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=this.sourceDepth;mesh.name=`source-height.${x}.${z}`;
     mesh.onBeforeRender=()=>{perf.count('Terrain patches (color passes)',1);perf.count('Terrain triangles (color passes)',4608);};
     this.mesh.add(mesh);this.sourceMeshes.push(mesh);
    }
   }
  }
  if(field.source)return;
  for(const patch of this.patches)patch.mesh.customDepthMaterial=field.rockCoverage?this.sourceDepth:undefined;
  this.sourceDepth.needsUpdate=true;
  if(field.verts!==this.verts)throw new Error('Terrain height dimensions do not match');
  // Normal dependencies extend one vertex beyond the edited heights. Adjacent
  // patches sample the same global field, so shared boundaries remain seamless.
  const region=dirty?{loX:Math.max(0,dirty.loX-1),hiX:Math.min(this.verts-1,dirty.hiX+1),loZ:Math.max(0,dirty.loZ-1),hiZ:Math.min(this.verts-1,dirty.hiZ+1)}:{loX:0,hiX:this.verts-1,loZ:0,hiZ:this.verts-1};
  for(const patch of this.patches){
   const loX=Math.max(region.loX,patch.loX),hiX=Math.min(region.hiX,patch.loX+patch.width),loZ=Math.max(region.loZ,patch.loZ),hiZ=Math.min(region.hiZ,patch.loZ+patch.depth);
   if(loX>hiX||loZ>hiZ)continue;
   const geometry=patch.mesh.geometry,position=geometry.getAttribute('position') as BufferAttribute,normal=geometry.getAttribute('normal') as BufferAttribute;
   for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
    const h=field.samples[z*this.verts+x]!,left=field.samples[z*this.verts+Math.max(0,x-1)]!,right=field.samples[z*this.verts+Math.min(this.verts-1,x+1)]!,down=field.samples[Math.max(0,z-1)*this.verts+x]!,up=field.samples[Math.min(this.verts-1,z+1)*this.verts+x]!;
    const i=(z-patch.loZ)*(patch.width+1)+x-patch.loX,nx=left-right,nz=down-up,length=Math.hypot(nx,2,nz);
    position.setY(i,h);normal.setXYZ(i,nx/length,2/length,nz/length);
   }
   position.needsUpdate=true;normal.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
   // GPU surface relief also needs room in CPU frustum/shadow bounds.
   if(field.rockCoverage){geometry.boundingBox!.expandByScalar(1);geometry.boundingSphere!.radius+=1;}
  }
 }
 destroy(scene:Scene):void {scene.remove(this.mesh);for(const patch of this.patches)patch.mesh.geometry.dispose();this.patches.length=0;for(const mesh of this.sourceMeshes)mesh.geometry.dispose();this.sourceMeshes=[];this.sourceDepth.dispose();this.material.dispose();}
}
