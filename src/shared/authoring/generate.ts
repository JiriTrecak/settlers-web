import {authoringSceneSchema,shapeBounds,type AuthoringScene,type AuthoredObject,type Bounds,type ProceduralLayer} from './layers';
import {generationStage,resolveRecipe,type LandscapeRecipe} from './recipes';
import {cellRandom,patchNoise,nearestSpline,regionDistance,sampleBezier,type SplineSample} from './shapes';
export type TerrainGrid={originX:number;originZ:number;step:number;width:number;height:number;samples:Float32Array};
export type GenerationAssets={recipe:(id:string)=>LandscapeRecipe|undefined;clearance:(id:string)=>number};
export type GeneratedObject=AuthoredObject&{owner:string};
export type GenerationIssue={code:'missing-recipe'|'shape-mismatch'|'uphill-river'|'object-water-conflict';id:string;message:string};
export type MaterialPaint={owner:string;material:string;weights:Float32Array};
export type CompiledRiver={owner:string;profile:string;samples:SplineSample[];width:number;depth:number;flow:number};
export type GeneratedScene={terrain:TerrainGrid;objects:GeneratedObject[];rivers:CompiledRiver[];paint:MaterialPaint[];scatterLayers:string[];issues:GenerationIssue[]};
type Prepared={layer:ProceduralLayer;recipe:LandscapeRecipe;bounds:Bounds;spline?:SplineSample[]};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
function sample(grid:TerrainGrid,x:number,z:number):number{
 const fx=Math.max(0,Math.min(grid.width-1,(x-grid.originX)/grid.step)),fz=Math.max(0,Math.min(grid.height-1,(z-grid.originZ)/grid.step));
 const ix=Math.floor(fx),iz=Math.floor(fz),nx=Math.min(ix+1,grid.width-1),nz=Math.min(iz+1,grid.height-1),tx=fx-ix,tz=fz-iz;
 return grid.samples[iz*grid.width+ix]!*(1-tx)*(1-tz)+grid.samples[iz*grid.width+nx]!*tx*(1-tz)+grid.samples[nz*grid.width+ix]!*(1-tx)*tz+grid.samples[nz*grid.width+nx]!*tx*tz;
}
function eachVertex(grid:TerrainGrid,b:Bounds,fn:(i:number,x:number,z:number)=>void){
 const x0=Math.max(0,Math.floor((b.minX-grid.originX)/grid.step)),x1=Math.min(grid.width-1,Math.ceil((b.maxX-grid.originX)/grid.step));
 const z0=Math.max(0,Math.floor((b.minZ-grid.originZ)/grid.step)),z1=Math.min(grid.height-1,Math.ceil((b.maxZ-grid.originZ)/grid.step));
 for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)fn(z*grid.width+x,grid.originX+x*grid.step,grid.originZ+z*grid.step);
}
class Footprints{
 private cells=new Map<string,{x:number;z:number;r:number}[]>();
 add(x:number,z:number,r:number){for(let iz=Math.floor((z-r)/16);iz<=Math.floor((z+r)/16);iz++)for(let ix=Math.floor((x-r)/16);ix<=Math.floor((x+r)/16);ix++){const k=ix+':'+iz;const bucket=this.cells.get(k)??[];bucket.push({x,z,r});this.cells.set(k,bucket);}}
 intersects(x:number,z:number,r:number):boolean{
  for(let iz=Math.floor((z-r)/16);iz<=Math.floor((z+r)/16);iz++)for(let ix=Math.floor((x-r)/16);ix<=Math.floor((x+r)/16);ix++)for(const p of this.cells.get(ix+':'+iz)??[])if(Math.hypot(x-p.x,z-p.z)<r+p.r)return true;
  return false;
 }
}
function padding(r:LandscapeRecipe,layer:ProceduralLayer):number{
 const scale=layer.shape.type==='spline'?Math.max(...layer.shape.knots.map(k=>k.widthScale)):1;
 if(r.type==='river')return r.width*scale/2+r.bankWidth;
 if(r.type==='path')return r.width*scale/2+Math.max(r.shoulder,r.vegetationClearance);
 return r.type==='terrain'?r.falloff:0;
}
/** Pure compiler: the base samples are never mutated, and creation order has no meaning. */
export function generateScene(input:AuthoringScene,base:TerrainGrid,assets:GenerationAssets):GeneratedScene{
 const scene=authoringSceneSchema.parse(input);
 if(!Number.isInteger(base.width)||!Number.isInteger(base.height)||base.width<2||base.height<2||base.width>4097||base.height>4097||!Number.isFinite(base.step)||base.step<=0||!Number.isFinite(base.originX)||!Number.isFinite(base.originZ)||base.samples.length!==base.width*base.height||base.samples.some(v=>!Number.isFinite(v)))throw Error('Invalid base terrain grid');
 const terrain={...base,samples:base.samples.slice()},issues:GenerationIssue[]=[],prepared:Prepared[]=[],rivers:CompiledRiver[]=[],paint:MaterialPaint[]=[],objects:GeneratedObject[]=[];
 for(const layer of scene.layers.filter(l=>l.enabled)){
  const defaults=assets.recipe(layer.recipe);
  if(!defaults){issues.push({code:'missing-recipe',id:layer.id,message:`Missing recipe ${layer.recipe}`});continue;}
  const recipe=resolveRecipe(defaults,layer.overrides);
  const needsSpline=recipe.type==='river'||recipe.type==='path';
  if(needsSpline!==(layer.shape.type==='spline')){issues.push({code:'shape-mismatch',id:layer.id,message:`${recipe.type} requires a ${needsSpline?'spline':'region'}`});continue;}
  prepared.push({layer,recipe,bounds:shapeBounds(layer.shape,padding(recipe,layer)),spline:layer.shape.type==='spline'?sampleBezier(layer.shape.knots):undefined});
 }
 prepared.sort((a,b)=>generationStage[a.recipe.type]-generationStage[b.recipe.type]||a.layer.order-b.layer.order||a.layer.id.localeCompare(b.layer.id));
 for(const {layer,recipe,bounds,spline}of prepared){
  if(recipe.type==='terrain'&&layer.shape.type==='region'){
   const shape=layer.shape;
   eachVertex(terrain,bounds,(i,x,z)=>{const d=regionDistance(x,z,shape);if(d<0)return;const strength=recipe.falloff?smooth(d/recipe.falloff):1;const h=terrain.samples[i]!;terrain.samples[i]=recipe.operation==='flatten'?h+(recipe.height-h)*strength:h+(recipe.operation==='raise'?1:-1)*Math.abs(recipe.height)*strength;});
  }
  if(recipe.type==='river'&&spline){
   if(spline.some((s,i)=>i>0&&s.elevation-spline[i-1]!.elevation>recipe.maxUphillGrade*(s.distance-spline[i-1]!.distance)+.0001))issues.push({code:'uphill-river',id:layer.id,message:'The river height profile rises against its flow direction'});
   rivers.push({owner:layer.id,profile:recipe.water,samples:spline,width:recipe.width,depth:recipe.depth,flow:recipe.flow});
   const bank=new Float32Array(base.samples.length),bed=new Float32Array(base.samples.length);
   eachVertex(terrain,bounds,(i,x,z)=>{
    const p=nearestSpline(x,z,spline),half=recipe.width*p.widthScale/2,t=p.offset/half,h=terrain.samples[i]!;
    if(p.offset>half+recipe.bankWidth)return;
    if(t<=1){const bowl=Math.sqrt(Math.max(0,1-t*t));terrain.samples[i]=Math.min(h,p.elevation-recipe.depth*p.depthScale*bowl);bed[i]=smooth((1-t)*4);bank[i]=1-bed[i]!;}
    else{const a=1-smooth((p.offset-half)/recipe.bankWidth);terrain.samples[i]=Math.min(h,h+(p.elevation-h)*a);bank[i]=a;}
   });
   if(recipe.bankMaterial)paint.push({owner:layer.id,material:recipe.bankMaterial,weights:bank});
   if(recipe.bedMaterial)paint.push({owner:layer.id,material:recipe.bedMaterial,weights:bed});
  }
  if(recipe.type==='path'&&spline){
   const weights=new Float32Array(base.samples.length);
   eachVertex(terrain,bounds,(i,x,z)=>{const p=nearestSpline(x,z,spline),half=recipe.width*p.widthScale/2;const a=p.offset<=half?1:recipe.shoulder?1-smooth((p.offset-half)/recipe.shoulder):0;if(a<=0)return;weights[i]=a;terrain.samples[i]+= (p.elevation-terrain.samples[i]!)*a*recipe.flatten;});
   paint.push({owner:layer.id,material:recipe.material,weights});
  }
 }
 const inWater=(x:number,z:number,clearance=0)=>rivers.some(r=>{const p=nearestSpline(x,z,r.samples);return p.offset<r.width*p.widthScale/2+clearance;});
 const paths=prepared.filter(p=>p.recipe.type==='path');
 const footprints=new Footprints();
 for(const obj of scene.objects){const r=Math.max(0,assets.clearance(obj.asset))*obj.scale;footprints.add(obj.x,obj.z,r);
  if(inWater(obj.x,obj.z)&&obj.heightMode==='terrain')issues.push({code:'object-water-conflict',id:obj.id,message:'A placed object overlaps a river; its authored transform was preserved'});
 }
 let candidates=0;
 // River decoration belongs to the river layer: changing its course regenerates
 // banks and floating leaves deterministically, after structures reserve space.
 for(const {layer,recipe,bounds,spline} of prepared){
  if(recipe.type!=='river'||!recipe.details||!spline)continue;
  for(const [mode,settings] of Object.entries(recipe.details)){
   if(!settings)continue;
   const density=settings.density??1;if(density===0)continue;
   const spacing=settings.spacing/Math.sqrt(density),separation=new Footprints();
   const loX=Math.max(Math.floor(bounds.minX/spacing),Math.floor(terrain.originX/spacing)),hiX=Math.min(Math.ceil(bounds.maxX/spacing),Math.floor((terrain.originX+(terrain.width-1)*terrain.step)/spacing));
   const loZ=Math.max(Math.floor(bounds.minZ/spacing),Math.floor(terrain.originZ/spacing)),hiZ=Math.min(Math.ceil(bounds.maxZ/spacing),Math.floor((terrain.originZ+(terrain.height-1)*terrain.step)/spacing));
   candidates+=(hiX-loX+1)*(hiZ-loZ+1);if(candidates>2000000)throw Error('Procedural density exceeds two million candidate cells');
   const sum=settings.species.reduce((n,s)=>n+s.weight,0);
   for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
    const random=(c:number)=>cellRandom(layer.seed,layer.id+'.river.'+mode,ix,iz,c);
    const x=(ix+.5+(random(0)-.5)*settings.jitter)*spacing,z=(iz+.5+(random(1)-.5)*settings.jitter)*spacing;
    const p=nearestSpline(x,z,spline),bank=p.offset-recipe.width*p.widthScale/2;
    const patch=settings.patchiness?1-settings.patchiness.strength+settings.patchiness.strength*patchNoise(layer.seed,layer.id,x,z,settings.patchiness.scale):1;
    if(random(2)>=settings.probability*patch)continue;
    if(mode==='water'){
     const depth=p.elevation-sample(terrain,x,z);
     if(bank>-.5||bank< -Math.min(3,recipe.width*.4)||depth<.15||depth>2.5)continue;
    }else if(bank<settings.waterClearance||bank>recipe.bankWidth||sample(terrain,x,z)<=p.elevation+.03)continue;
    if(settings.minSpacing&&separation.intersects(x,z,settings.minSpacing/2))continue;
    const dx=(sample(terrain,x+1,z)-sample(terrain,x-1,z))/2,dz=(sample(terrain,x,z+1)-sample(terrain,x,z-1))/2;
    if(mode!=='water'&&Math.hypot(dx,dz)>settings.maxSlope)continue;
    let weight=random(3)*sum,asset=settings.species[0]!.asset;for(const candidate of settings.species){weight-=candidate.weight;if(weight<0){asset=candidate.asset;break;}}
    const scale=settings.scaleMin+random(4)*(settings.scaleMax-settings.scaleMin);
    if(footprints.intersects(x,z,assets.clearance(asset)*scale+settings.objectClearance))continue;
    objects.push({id:`generated.${layer.id.slice(0,100)}.river-${mode}.${ix}.${iz}`,asset,x,z,elevation:mode==='water'?p.elevation+.035:0,yaw:random(5)*Math.PI*2,scale,heightMode:mode==='water'?'absolute':'terrain',visible:layer.visible,locked:layer.locked,owner:layer.id});
    if(settings.minSpacing)separation.add(x,z,settings.minSpacing/2);
   }
  }
 }
 const scatterPasses=prepared.flatMap(p=>{
  if(!('species'in p.recipe))return [];
  const core={...p,recipe:p.recipe,pass:'interior',minEdge:p.recipe.type==='forest'?p.recipe.interiorMargin:0,maxEdge:Infinity};
  if(p.recipe.type!=='forest'||!p.recipe.edge)return [core];
  return [core,{...p,recipe:{...p.recipe.edge,type:'forest' as const,interiorMargin:0},pass:'edge',minEdge:0,maxEdge:p.recipe.edge.width}];
 });
 for(const {layer,recipe,bounds,pass,minEdge,maxEdge} of scatterPasses){
  if(layer.shape.type!=='region')continue;
  const spacingFootprints=new Footprints();
  const density=recipe.density??1;if(density===0)continue;
  const shape=layer.shape,spacing=recipe.spacing/Math.sqrt(density);
  const minX=Math.max(Math.floor(bounds.minX/spacing),Math.floor(terrain.originX/spacing)),maxX=Math.min(Math.ceil(bounds.maxX/spacing),Math.ceil((terrain.originX+(terrain.width-1)*terrain.step)/spacing));
  const minZ=Math.max(Math.floor(bounds.minZ/spacing),Math.floor(terrain.originZ/spacing)),maxZ=Math.min(Math.ceil(bounds.maxZ/spacing),Math.ceil((terrain.originZ+(terrain.height-1)*terrain.step)/spacing));
  candidates+=(maxX-minX+1)*(maxZ-minZ+1);if(candidates>2000000)throw Error('Procedural density exceeds two million candidate cells; increase spacing or reduce the region');
  const patchSettings=recipe.patchiness??(recipe.pattern==='patches'?{scale:12,strength:.6}:undefined);
  const weight=recipe.species.reduce((s,v)=>s+v.weight,0);
  for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
   const random=(channel:number)=>cellRandom(layer.seed,layer.id+'.'+pass,ix,iz,channel);
   const x=(ix+.5+(random(0)-.5)*recipe.jitter)*spacing,z=(iz+.5+(random(1)-.5)*recipe.jitter)*spacing;
   if(x<terrain.originX||z<terrain.originZ||x>terrain.originX+(terrain.width-1)*terrain.step||z>terrain.originZ+(terrain.height-1)*terrain.step)continue;
   const edge=regionDistance(x,z,shape);if(edge<minEdge||edge>maxEdge)continue;
   const patch=recipe.pattern!=='scattered'&&patchSettings?1-patchSettings.strength+patchSettings.strength*patchNoise(layer.seed,layer.id,x,z,patchSettings.scale):1;
   if(random(2)>=recipe.probability*(recipe.edgeFade?clamp(edge/recipe.edgeFade):1)*patch)continue;
   if(recipe.riverBank){let bankDistance=Infinity;for(const r of rivers){const p=nearestSpline(x,z,r.samples);bankDistance=Math.min(bankDistance,p.offset-r.width*p.widthScale/2);}if(bankDistance<recipe.riverBank.min||bankDistance>recipe.riverBank.max)continue;}
   if(recipe.minSpacing&&spacingFootprints.intersects(x,z,recipe.minSpacing/2))continue;
   if(inWater(x,z,recipe.waterClearance)||paths.some(p=>{const r=p.recipe;if(r.type!=='path')return false;const n=nearestSpline(x,z,p.spline!);return n.offset<r.width*n.widthScale/2+r.vegetationClearance;}))continue;
   const d=terrain.step,dx=(sample(terrain,x+d,z)-sample(terrain,x-d,z))/(2*d),dz=(sample(terrain,x,z+d)-sample(terrain,x,z-d))/(2*d);
   if(Math.hypot(dx,dz)>recipe.maxSlope)continue;
   let w=random(3)*weight,asset=recipe.species[0]!.asset;for(const s of recipe.species){w-=s.weight;if(w<0){asset=s.asset;break;}}
   const scale=recipe.scaleMin+random(4)*(recipe.scaleMax-recipe.scaleMin),radius=Math.max(0,assets.clearance(asset))*scale;
   if(footprints.intersects(x,z,radius+recipe.objectClearance))continue;
   objects.push({id:`generated.${layer.id.slice(0,100)}.${Math.floor(cellRandom(0,layer.id,0,0,0)*4294967296).toString(16)}.${pass}.${ix}.${iz}`,asset,x,z,elevation:0,yaw:random(5)*Math.PI*2,scale,heightMode:'terrain',visible:layer.visible,locked:layer.locked,owner:layer.id});
   if(recipe.minSpacing)spacingFootprints.add(x,z,recipe.minSpacing/2);
   // Vegetation remains batchable; only trees create exclusions for subsequent layers.
   if(recipe.type==='forest')footprints.add(x,z,radius);
  }
 }
 return {terrain,objects,rivers,paint,issues,scatterLayers:prepared.filter(p=>'species'in p.recipe).map(p=>p.layer.id)};
}
/** Baking is a document operation; callers record this entire result as one undo step. */
export function bakeLayer(scene:AuthoringScene,layerId:string,compiled:GeneratedScene):AuthoringScene{
 const layer=scene.layers.find(l=>l.id===layerId);if(!layer)throw Error('Layer does not exist');if(layer.locked)throw Error('Layer is locked');
 // Terrain/river/path bakes need the map's terrain and water transaction, never silently discard them.
 if(!compiled.scatterLayers.includes(layerId))throw Error('This layer must be baked with its terrain and water output');
 const generated=compiled.objects.filter(o=>o.owner===layerId).map(({owner,...o})=>({...o,bakedFrom:owner}));
 return authoringSceneSchema.parse({...scene,layers:scene.layers.filter(l=>l.id!==layerId),objects:[...scene.objects,...generated]});
}
