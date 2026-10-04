import {expect,it} from 'vitest';
import {sparseWeights} from '../../src/shared/authoring/sparseWeights';
import {HeightField} from '../../src/shared/map/height';
import {rasterCoverage,type CoveragePaint} from '../../src/render/minimap/coverageRaster';

it('matches the ordered per-channel raster exactly, including empty masks, edges and clamped rounding',()=>{
 const field=new HeightField(32),width=38,height=29,size=40,grass=[112,148,82],forest=[49,66,33];
 field.grassCoverage=Float32Array.from(field.samples,(_,i)=>i%17/11);
 field.forestCoverage=Float32Array.from(field.samples,(_,i)=>i%13/12);
 const paints:CoveragePaint[]=Array.from({length:30},(_,p)=>({weights:Float32Array.from(field.samples,(_,i)=>i%(p+2)?0:i%7/6),color:[32+p*3,187-p*2,92+p]}));
 const reference=Uint8ClampedArray.from({length:width*height*4},(_,i)=>i*13%256),actual=reference.slice();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const ix=Math.max(0,Math.min(field.verts-1,Math.round((x+.5)/(width/size)-field.origin))),iz=Math.max(0,Math.min(field.verts-1,Math.round((y+.5)/(height/size)-field.origin)));
  const at=iz*field.verts+ix,i=(y*width+x)*4,g=Math.min(1,(field.grassCoverage[at]??0)*2),f=field.forestCoverage[at]??0;
  for(let c=0;c<3;c++){let value=reference[i+c]*(1-g)+grass[c]*g;for(const p of paints){const w=p.weights[at]??0;value=value*(1-w)+p.color![c]*w;}reference[i+c]=value*(1-f)+forest[c]*f;}
 }
 rasterCoverage(actual,width,height,size,field,grass,forest,paints);
 expect(actual).toEqual(reference);
});


it('sparse painted coverage matches dense blending with unsupported materials and overlapping paints',()=>{
 const field=new HeightField(48),width=61,height=29,size=59,grass=[110,144,75],forest=[43,69,31];
 field.grassCoverage=Float32Array.from(field.samples,(_,i)=>i%17/11);
 field.forestCoverage=Float32Array.from(field.samples,(_,i)=>i%13/12);
 const paints:CoveragePaint[]=Array.from({length:60},(_,p)=>({weights:Float32Array.from(field.samples,(_,i)=>i%(p+2)?0:i%7/6),color:p%4===1?null:[32+p*3,187-p*2,92+p]}));
 const original=Uint8ClampedArray.from({length:width*height*4},(_,i)=>i*13%256),dense=original.slice(),sparse=original.slice();
 rasterCoverage(dense,width,height,size,field,grass,forest,paints);
 rasterCoverage(sparse,width,height,size,field,grass,forest,paints,sparseWeights(paints.map(p=>p.weights),field.samples.length));
 expect(sparse).toEqual(dense);
});
