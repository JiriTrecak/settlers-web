import type {HeightField} from '../../shared/map/height';
import type {SparseWeights} from '../../shared/authoring/sparseWeights';

export type CoveragePaint={weights:Float32Array;color:readonly number[]|null};
/** Ordered coverage blending, preserving Canvas's Uint8Clamped rounding. Read
 * each mask once per pixel instead of once per channel; zero masks do no work. */
export function rasterCoverage(data:Uint8ClampedArray,width:number,height:number,size:number,field:HeightField,grass:readonly number[],forest:readonly number[],paints:readonly CoveragePaint[],index?:SparseWeights):void{
 const xs=Int32Array.from({length:width},(_,x)=>Math.max(0,Math.min(field.verts-1,Math.round((x+.5)/(width/size)-field.origin))));
 for(let y=0;y<height;y++){
  const row=Math.max(0,Math.min(field.verts-1,Math.round((y+.5)/(height/size)-field.origin)))*field.verts;
  for(let x=0;x<width;x++){
   const at=row+xs[x],i=(y*width+x)*4,g=Math.min(1,(field.grassCoverage?.[at]??0)*2),f=field.forestCoverage?.[at]??0;
   let r=data[i]*(1-g)+grass[0]*g,b=data[i+2]*(1-g)+grass[2]*g,green=data[i+1]*(1-g)+grass[1]*g;
   // The optional index belongs to the exact same ordered paint list. Unsupported
   // materials keep a null color/slot so its layer indices never shift.
   const start=index?index.offsets[at]:0,end=index?index.offsets[at+1]:paints.length;
   for(let j=start;j<end;j++){const paint=paints[index?index.layers[j]:j];if(!paint.color)continue;const w=paint.weights[at]??0;if(w===0)continue;
    r=r*(1-w)+paint.color[0]*w;green=green*(1-w)+paint.color[1]*w;b=b*(1-w)+paint.color[2]*w;
   }
   data[i]=r*(1-f)+forest[0]*f;data[i+1]=green*(1-f)+forest[1]*f;data[i+2]=b*(1-f)+forest[2]*f;
  }
 }
}
