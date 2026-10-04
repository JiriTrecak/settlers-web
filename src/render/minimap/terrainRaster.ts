import type {SurfaceRaster} from '../terrain/surfaceRaster';

type TerrainLighting={shade:Float64Array;shore:Float64Array;water:Uint8ClampedArray};
const lighting=new WeakMap<SurfaceRaster,{width:number;value:TerrainLighting}>();
/** Geometry-dependent cartographic shading. Keep the original operation order
 * and double precision so coverage-only edits produce identical pixel bytes. */
function terrainLighting(surface:SurfaceRaster,width:number):TerrainLighting{
 const cached=lighting.get(surface);if(cached?.width===width)return cached.value;
 const count=surface.heights.length,shade=new Float64Array(count),shore=new Float64Array(count),water=new Uint8ClampedArray(count*3);
 for(let i=0;i<count;i++){
  const x=i%width,y=Math.floor(i/width),h=surface.heights[i],w=surface.water[i];
  const hash=((Math.imul(x+19,374761393)^Math.imul(y+73,668265263))>>>0);
  const grain=((hash^(hash>>>13))>>>0)%101/100-.5;
  if(h<w){
   const depth=Math.min(1,(w-h)/5),ripple=Math.sin(x*.58+y*.37)*Math.cos(y*.23-x*.11)*2;
   water[i*3]=Math.round(100+(36-100)*depth+grain*5+ripple);
   water[i*3+1]=Math.round(139+(69-139)*depth+grain*5+ripple);
   water[i*3+2]=Math.round(131+(83-131)*depth+grain*5+ripple);
  }else{
   shade[i]=Math.min(1.24,Math.max(.58,1+(h-w)*.008-(surface.dx[i]+surface.dz[i])*.09))+grain*.065;
   shore[i]=Math.max(0,1-(h-w)/.75)*.2;
  }
 }
 const value={shade,shore,water};lighting.set(surface,{width,value});return value;
}

export function rasterTerrainLighting(data:Uint8ClampedArray,surface:SurfaceRaster,width:number):void{
 const light=terrainLighting(surface,width);
 for(let i=0;i<surface.heights.length;i++){
  const at=i*4;
  if(surface.heights[i]<surface.water[i]){
   data[at]=light.water[i*3];data[at+1]=light.water[i*3+1];data[at+2]=light.water[i*3+2];
  }else{
   const s=light.shore[i],shade=light.shade[i];
   data[at]=Math.round((data[at]*(1-s)+153*s)*shade);
   data[at+1]=Math.round((data[at+1]*(1-s)+146*s)*shade);
   data[at+2]=Math.round((data[at+2]*(1-s)+107*s)*shade);
  }
 }
}
