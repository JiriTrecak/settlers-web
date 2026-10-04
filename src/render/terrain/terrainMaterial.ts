import {sampleSurfaceRaster,updateSurfaceRaster,type SurfaceRaster} from './surfaceRaster';
import {authoredTerrain} from './authoredTerrain';
import {ImportedTerrainMaterial} from './importedTerrainMaterial';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import type {CoverPatch} from '../../shared/landscape/curve';
import { MeshStandardMaterial } from 'three';
import type { HeightField } from '../../shared';
import type { TerrainStroke } from '../../shared/landscape/curve';
export class TerrainMaterial extends MeshStandardMaterial {
  private native?:ImportedTerrainMaterial;
  private field?:HeightField;
  private strokes:readonly TerrainStroke[]=[];
  private cover:readonly CoverPatch[]=[];
  private nativeDirty=false;
  private surfaceRaster?:SurfaceRaster;
  private readonly colorPrograms=new Set<import('three').WebGLProgramParametersWithUniforms>();
  private readonly depthPrograms=new Set<import('three').WebGLProgramParametersWithUniforms>();
  private refreshNative(){if(this.imported||!this.field||!this.nativeDirty)return;this.nativeDirty=false;
    if(!this.surfaceRaster){const coords=Float64Array.from({length:this.field.verts},(_,i)=>this.field!.origin+i);this.surfaceRaster=sampleSurfaceRaster(this.field,coords,coords,.5);}
    const source=authoredTerrain(this.field,this.strokes,this.cover,this.surfaceRaster);
    if(!this.native?.update(source)){this.native?.dispose();this.native=new ImportedTerrainMaterial(source);}
    for(const shader of this.colorPrograms)this.native.bindUniforms(shader);
    for(const shader of this.depthPrograms)this.native.bindUniforms(shader,true);
    this.needsUpdate=true;}
  private imported?:ImportedTerrainMaterial;
  compileImportedDepth(shader:import('three').WebGLProgramParametersWithUniforms){this.refreshNative();this.depthPrograms.add(shader);(this.imported??this.native)?.compileDepth(shader);}
  get ready():Promise<void>{this.refreshNative();return (this.imported??this.native)?.ready??Promise.resolve();}
  setImported(source?:ImportedTerrain){if(this.imported?.source===source)return;this.imported?.dispose();this.imported=source?new ImportedTerrainMaterial(source):undefined;this.needsUpdate=true;}
  constructor() {
    super({color:0xffffff,roughness:0.95});
    this.onBeforeCompile=shader=>{
      this.refreshNative();this.colorPrograms.add(shader);
      (this.imported??this.native)?.compile(shader);
    };
    this.customProgramCacheKey=()=> `landscape-terrain-reference-v3-${this.imported?.source.sha256??"native"}`;
  }
  setCover(patches:readonly CoverPatch[]):void {
    if(this.cover===patches)return;
    this.cover=patches;this.nativeDirty=true;this.needsUpdate=true;this.refreshNative();
  }
  update(field:HeightField,strokes:readonly TerrainStroke[],sameSurface=false):void {
    this.surfaceRaster=updateSurfaceRaster(this.surfaceRaster,field,sameSurface);
    this.field=field;this.strokes=strokes;this.nativeDirty=true;this.needsUpdate=true;this.refreshNative();
  }
  override dispose():void{ this.colorPrograms.clear();this.depthPrograms.clear();this.imported?.dispose();this.native?.dispose();super.dispose(); }
}
