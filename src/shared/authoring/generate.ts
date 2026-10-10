import {HEIGHT_MIN,HEIGHT_MAX,DRY_WATER_HEIGHT} from '../map/terrainLimits';
import {Footprints} from './footprints';
import {indexedPaints} from './sparseWeights';
import {updateNearestTrees,type NearestTreeSnapshot} from './nearestTrees';
import {authoringSceneSchema,shapeBounds,type AuthoringScene,type AuthoredObject,type Bounds,type ProceduralLayer,type LayerShape} from './layers';
import {generationStage,resolveRecipe,type LandscapeRecipe} from './recipes';
import {cellRandom,patchNoiseSampler,nearestSpline,regionDistance as unindexedRegionDistance,sampleBezier,type SplineSample} from './shapes';
import {compileMaskDistance} from './maskDistance';
import {distanceBands} from './distanceBands';
import type {BuildProfile} from './buildProfile';
export type TerrainGrid={originX:number;originZ:number;step:number;width:number;height:number;samples:Float32Array};
export type GenerationAssets={recipe:(id:string)=>LandscapeRecipe|undefined;clearance:(id:string)=>number;isTree?:(id:string)=>boolean};
export type GeneratedObject=AuthoredObject&{owner:string;blocksVegetation?:boolean};
export type GenerationIssue={code:'missing-recipe'|'shape-mismatch'|'uphill-river'|'object-water-conflict'|'terrain-range';id:string;message:string};
export type MaterialPaint={owner:string;material:string;weights:Float32Array;variants?:Uint8Array};
export type CompiledRiver={owner:string;profile:string;samples:SplineSample[];width:number;depth:number;flow:number;area?:Extract<LayerShape,{type:'mask'}>};
// Compiled river masks are immutable and shared by generation, ground picking and water meshes.
const riverMasks=new WeakMap<NonNullable<CompiledRiver['area']>,(x:number,z:number)=>number>();
export function riverPoint(x:number,z:number,river:CompiledRiver){
 if(!river.area)return nearestSpline(x,z,river.samples);
 let query=riverMasks.get(river.area);if(!query){query=compileMaskDistance(river.area);riverMasks.set(river.area,query);}
 return {x,z,elevation:river.area.elevation,widthScale:1,depthScale:1,flowScale:0,distance:0,offset:river.width/2-query(x,z),direction:{x:0,z:0}};
}
/** `meadow` is base grass coverage (max of all meadow layers); path/river paint still overrides it. */
export type GeneratedScene={terrain:TerrainGrid;objects:GeneratedObject[];rivers:CompiledRiver[];paint:MaterialPaint[];landformSurface?:{grass:Float32Array;rock:Float32Array};meadow?:Float32Array;scatterLayers:string[];forestLayers?:string[];issues:GenerationIssue[]};
type Prepared={layer:ProceduralLayer;recipe:LandscapeRecipe;bounds:Bounds;spline?:SplineSample[]};
type MeadowRaster={fade:Float64Array;noise?:Float64Array;fray?:Float64Array;torn?:Float64Array};
type PlacementCandidate={object:GeneratedObject;radius:number;riverHeight?:number};
// Candidates and carved grids are immutable compiler snapshots. A terrain edit
// gets its own grid/key; moving an exclusion does not change any sampled slope.
const candidateSlopes=new WeakMap<TerrainGrid,WeakMap<PlacementCandidate[],Float64Array>>();
function slopesFor(terrain:TerrainGrid,placements:PlacementCandidate[]):Float64Array{
 let entries=candidateSlopes.get(terrain);if(!entries)candidateSlopes.set(terrain,entries=new WeakMap());
 let slopes=entries.get(placements);if(slopes)return slopes;
 slopes=new Float64Array(placements.length);
 const d=terrain.step;
 for(let i=0;i<placements.length;i++){
  const {x,z}=placements[i]!.object;
  const dx=(sample(terrain,x+d,z)-sample(terrain,x-d,z))/(2*d),dz=(sample(terrain,x,z+d)-sample(terrain,x,z-d))/(2*d);
  slopes[i]=Math.hypot(dx,dz);
 }
 entries.set(placements,slopes);return slopes;
}
type SurfacePlan=Pick<GeneratedScene,'terrain'|'rivers'|'paint'|'landformSurface'|'issues'>&{baseSamples:Float32Array;prepared:Prepared[];distances:Map<LayerShape,ReturnType<typeof distanceBands>>;candidates:Map<string,PlacementCandidate[]>;meadowRasters:Map<string,MeadowRaster>;nearestTrees?:NearestTreeSnapshot};
const surfacePlans=new WeakMap<TerrainGrid,SurfacePlan>();
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
function padding(r:LandscapeRecipe,layer:ProceduralLayer):number{
 const scale=layer.shape.type==='spline'?Math.max(...layer.shape.knots.map(k=>k.widthScale)):1;
 if(r.type==='river')return r.width*scale/2+r.bankWidth;
 if(r.type==='path')return r.width*scale/2+Math.max(r.shoulder,r.vegetationClearance);
 return r.type==='terrain'?r.falloff:0;
}
/** Pure compiler: the base samples are never mutated, and creation order has no meaning. */
export function generateScene(input:AuthoringScene,base:TerrainGrid,assets:GenerationAssets,profile?:BuildProfile,reuseSurface?:GeneratedScene,reusePlan?:GeneratedScene):GeneratedScene{
 const scene=authoringSceneSchema.parse(input),surface=reuseSurface?surfacePlans.get(reuseSurface.terrain):undefined;
 const candidatePlan=surface??(reusePlan?surfacePlans.get(reusePlan.terrain):undefined);
 const prior=candidatePlan&&['originX','originZ','step','width','height'].every(key=>candidatePlan.terrain[key as keyof TerrainGrid]===base[key as keyof TerrainGrid])?candidatePlan:undefined;
 // Parsed shapes are immutable during a compile; live editor brush shapes are not.
 const distances=new Map<LayerShape,ReturnType<typeof distanceBands>>();
 const distanceQuery=(shape:Exclude<LayerShape,{type:'spline'}>)=>{
  let query=distances.get(shape)??prior?.distances.get(shape);
  if(!query)query=distanceBands(shape.type==='mask'?compileMaskDistance(shape):(x,z)=>unindexedRegionDistance(x,z,shape));
  distances.set(shape,query);
  return query;
 };
 const regionDistance=(x:number,z:number,shape:Exclude<LayerShape,{type:'spline'}>)=>distanceQuery(shape).distance(x,z);
 const noises=new Map<string,ReturnType<typeof patchNoiseSampler>>();
 const noiseFor=(seed:number,id:string,scale:number)=>{const key=JSON.stringify([seed,id,scale]);let noise=noises.get(key);if(!noise){noise=patchNoiseSampler(seed,id,scale);noises.set(key,noise);}return noise;};
 if(!Number.isInteger(base.width)||!Number.isInteger(base.height)||base.width<2||base.height<2||base.width>4097||base.height>4097||!Number.isFinite(base.step)||base.step<=0||!Number.isFinite(base.originX)||!Number.isFinite(base.originZ)||base.samples.length!==base.width*base.height||base.samples.some(v=>!Number.isFinite(v)))throw Error('Invalid base terrain grid');
 const terrain=surface?.terrain??{...base,samples:base.samples.slice()},issues:GenerationIssue[]=[],prepared:Prepared[]=[],objects:GeneratedObject[]=[];
 let rivers:CompiledRiver[]=surface?.rivers??[],paint:MaterialPaint[]=surface?.paint??[];
 let landformSurface=surface?.landformSurface;
 const priorLayers=new Map(prior?.prepared.map(p=>[p.layer.id,p])),unchanged=new Set<string>();
 for(const layer of scene.layers.filter(l=>l.enabled)){
  const defaults=assets.recipe(layer.recipe);
  if(!defaults){issues.push({code:'missing-recipe',id:layer.id,message:`Missing recipe ${layer.recipe}`});continue;}
  const recipe=resolveRecipe(defaults,layer.overrides);
  const needsSpline=recipe.type==='path'||recipe.type==='river';
  if(!(['river','path'].includes(recipe.type)&&layer.shape.type==='mask')&&needsSpline!==(layer.shape.type==='spline')){issues.push({code:'shape-mismatch',id:layer.id,message:`${recipe.type} requires a ${needsSpline?'spline':'region'}`});continue;}
  const old=priorLayers.get(layer.id);
  if(old&&JSON.stringify(old.layer)===JSON.stringify(layer)&&JSON.stringify(old.recipe)===JSON.stringify(recipe)){
   prepared.push(old);unchanged.add(layer.id);
   const query=prior?.distances.get(old.layer.shape);if(query)distances.set(old.layer.shape,query);
  }else prepared.push({layer,recipe,bounds:shapeBounds(layer.shape,padding(recipe,layer)),spline:layer.shape.type==='spline'?sampleBezier(layer.shape.knots):undefined});
 }
 prepared.sort((a,b)=>generationStage[a.recipe.type]-generationStage[b.recipe.type]||a.layer.order-b.layer.order||a.layer.id.localeCompare(b.layer.id));
 profile?.mark('Validate and prepare recipes');
 const surfaceLayers=(items:Prepared[])=>items.filter(p=>['terrain','river','path'].includes(p.recipe.type)).map(p=>({layer:p.layer,recipe:p.recipe}));
 // Carving is point-local. With identical surface recipes, only changed base
 // vertices need replaying; slope-derived masks also include their neighbours.
 const localCarve=!surface&&!!prior&&JSON.stringify(surfaceLayers(prior.prepared))===JSON.stringify(surfaceLayers(prepared));
 let dirty:Bounds|undefined;
 if(localCarve){
  terrain.samples.set(prior!.terrain.samples);rivers=prior!.rivers;paint=prior!.paint;
  const before=new Uint32Array(prior!.baseSamples.buffer,prior!.baseSamples.byteOffset,prior!.baseSamples.length),after=new Uint32Array(base.samples.buffer,base.samples.byteOffset,base.samples.length);
  let minX=base.width,minZ=base.height,maxX=-1,maxZ=-1;
  for(let i=0;i<after.length;i++)if(before[i]!==after[i]){const x=i%base.width,z=Math.floor(i/base.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  if(maxX>=0){
   dirty={minX:base.originX+minX*base.step,maxX:base.originX+maxX*base.step,minZ:base.originZ+minZ*base.step,maxZ:base.originZ+maxZ*base.step};
   for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)terrain.samples[z*base.width+x]=base.samples[z*base.width+x]!;
  }
 }
 const changedVertices=(bounds:Bounds,fn:(i:number,x:number,z:number)=>void,pad=0)=>{
  if(!localCarve){eachVertex(terrain,bounds,fn);return;}
  if(!dirty)return;
  const clipped={minX:Math.max(bounds.minX,dirty.minX-pad),maxX:Math.min(bounds.maxX,dirty.maxX+pad),minZ:Math.max(bounds.minZ,dirty.minZ-pad),maxZ:Math.min(bounds.maxZ,dirty.maxZ+pad)};
  if(clipped.minX<=clipped.maxX&&clipped.minZ<=clipped.maxZ)eachVertex(terrain,clipped,fn);
 };
 if(!surface){
 for(const {layer,recipe,bounds,spline}of prepared){
  if(recipe.type==='terrain'&&layer.shape.type!=='spline'){
   const shape=layer.shape,noiseAt=noiseFor(layer.seed,layer.id+'.height',recipe.noiseScale??12);
   changedVertices(bounds,(i,x,z)=>{const d=regionDistance(x,z,shape);if(d<0)return;const strength=recipe.falloff?smooth(d/recipe.falloff):1;const h=terrain.samples[i]!;const noise=1-(recipe.roughness??0)*(1-noiseAt(x,z));terrain.samples[i]=recipe.operation==='flatten'?h+(recipe.height-h)*strength:h+(recipe.operation==='raise'?1:-1)*Math.abs(recipe.height)*strength*noise;});
  }
  if(recipe.type==='river'&&layer.shape.type==='mask'){
   const area=layer.shape;
   if(!localCarve)rivers.push({owner:layer.id,profile:recipe.water,samples:[],width:recipe.width,depth:recipe.depth,flow:0,area});
   const bank=localCarve?undefined:new Float32Array(base.samples.length),bed=localCarve?undefined:new Float32Array(base.samples.length);
   changedVertices(bounds,(i,x,z)=>{const d=regionDistance(x,z,area),h=terrain.samples[i]!;if(d < -recipe.bankWidth)return;
    if(d>=0){const strength=smooth(d/Math.max(1,recipe.bankWidth));terrain.samples[i]=Math.min(h,area.elevation-recipe.depth*strength);if(bed&&bank){bed[i]=strength;bank[i]=1-strength;}}
    else{const strength=1-smooth(-d/recipe.bankWidth);terrain.samples[i]=Math.min(h,h+(area.elevation-h)*strength);if(bank)bank[i]=strength;}
   });
   if(bank&&recipe.bankMaterial)paint.push({owner:layer.id,material:recipe.bankMaterial,weights:bank});
   if(bed&&recipe.bedMaterial)paint.push({owner:layer.id,material:recipe.bedMaterial,weights:bed});
  }
  if(recipe.type==='river'&&spline){
   if(spline.some((s,i)=>i>0&&s.elevation-spline[i-1]!.elevation>recipe.maxUphillGrade*(s.distance-spline[i-1]!.distance)+.0001))issues.push({code:'uphill-river',id:layer.id,message:'The river height profile rises against its flow direction'});
   if(!localCarve)rivers.push({owner:layer.id,profile:recipe.water,samples:spline,width:recipe.width,depth:recipe.depth,flow:recipe.flow});
   const bank=localCarve?undefined:new Float32Array(base.samples.length),bed=localCarve?undefined:new Float32Array(base.samples.length);
   changedVertices(bounds,(i,x,z)=>{
    const p=nearestSpline(x,z,spline),half=recipe.width*p.widthScale/2,t=p.offset/half,h=terrain.samples[i]!;
    if(p.offset>half+recipe.bankWidth)return;
    if(t<=1){const bowl=Math.sqrt(Math.max(0,1-t*t));terrain.samples[i]=Math.min(h,p.elevation-recipe.depth*p.depthScale*bowl);if(bed&&bank){bed[i]=smooth((1-t)*4);bank[i]=1-bed[i]!;}}
    else{const a=1-smooth((p.offset-half)/recipe.bankWidth);terrain.samples[i]=Math.min(h,h+(p.elevation-h)*a);if(bank)bank[i]=a;}
   });
   if(bank&&recipe.bankMaterial)paint.push({owner:layer.id,material:recipe.bankMaterial,weights:bank});
   if(bed&&recipe.bedMaterial)paint.push({owner:layer.id,material:recipe.bedMaterial,weights:bed});
  }
  if(recipe.type==='path'){
   const weights=localCarve?undefined:new Float32Array(base.samples.length);
   changedVertices(bounds,(i,x,z)=>{const p=spline?nearestSpline(x,z,spline):{offset:recipe.width/2-regionDistance(x,z,layer.shape as Exclude<LayerShape,{type:'spline'}>),widthScale:1,elevation:layer.shape.type==='mask'?layer.shape.elevation:0},half=recipe.width*p.widthScale/2;const a=spline?(p.offset<=half?1:recipe.shoulder?1-smooth((p.offset-half)/recipe.shoulder):0):smooth((half-p.offset)/Math.max(.25,recipe.shoulder));if(a<=0)return;if(weights)weights[i]=a;terrain.samples[i]+= (p.elevation-terrain.samples[i]!)*a*recipe.flatten;});
   if(weights)paint.push({owner:layer.id,material:recipe.material,weights});
  }
 }
 if(terrain.samples.some(h=>h<HEIGHT_MIN||h>HEIGHT_MAX))issues.push({code:'terrain-range',id:'terrain',message:`Terrain exceeds ${HEIGHT_MIN}..${HEIGHT_MAX} metres. Reduce the generator height or depth before applying.`});
 for(const river of rivers){const elevations=river.area?[river.area.elevation]:river.samples.map(p=>p.elevation);if(elevations.some(h=>h<DRY_WATER_HEIGHT||h>HEIGHT_MAX))issues.push({code:'terrain-range',id:river.owner,message:`Water exceeds ${DRY_WATER_HEIGHT}..${HEIGHT_MAX} metres. Adjust its elevation before applying.`});}
 profile?.mark('Terrain, river and path carving');
 // Surface masks follow the final carved terrain, not the original heightfield.
 const landforms=prepared.filter(p=>p.recipe.type==='terrain'&&p.recipe.surface);
 landformSurface=landforms.length?(localCarve&&prior!.landformSurface?{grass:prior!.landformSurface.grass.slice(),rock:prior!.landformSurface.rock.slice()}:{grass:new Float32Array(base.samples.length),rock:new Float32Array(base.samples.length)}):undefined;
 const slopePad=(Math.ceil(.5/base.step)+1)*base.step;
 if(localCarve&&dirty&&landformSurface)changedVertices({minX:terrain.originX,minZ:terrain.originZ,maxX:terrain.originX+(terrain.width-1)*terrain.step,maxZ:terrain.originZ+(terrain.height-1)*terrain.step},i=>{landformSurface!.grass[i]=0;landformSurface!.rock[i]=0;},slopePad);
 for(const {layer,recipe,bounds} of landforms){
  if(recipe.type!=='terrain'||layer.shape.type==='spline')continue;
  const shape=layer.shape;
  changedVertices(bounds,(i,x,z)=>{
   const edge=regionDistance(x,z,shape);if(edge<=0)return;
   const fade=smooth(edge/Math.max(1,Math.min(3,recipe.falloff)));
   const slope=Math.hypot(sample(terrain,x+.5,z)-sample(terrain,x-.5,z),sample(terrain,x,z+.5)-sample(terrain,x,z-.5));
   const rock=fade*(recipe.rockStrength??1)*smooth((slope-.18)/.75);
   const grass=fade*(recipe.grassStrength??.8)*(1-smooth((slope-.25)/.65));
   landformSurface!.rock[i]=Math.max(landformSurface!.rock[i]!,rock);
   landformSurface!.grass[i]=Math.max(landformSurface!.grass[i]!,grass);
  },slopePad);
 }
 profile?.mark('Landform surface masks');
 }else{issues.push(...surface.issues.filter(i=>i.code==='uphill-river'||i.code==='terrain-range'));profile?.mark('Reuse terrain, courses and mask indexes');}
 const exclusionLayers=(items:Prepared[])=>items.filter(p=>p.recipe.type==='river'||p.recipe.type==='path').map(p=>({layer:p.layer,recipe:p.recipe}));
 const sameExclusions=!!prior&&JSON.stringify(exclusionLayers(prior.prepared))===JSON.stringify(exclusionLayers(prepared));
 // Keep one current plan per carved surface. Changed/deleted layer caches are
 // dropped; old compiled outputs stay immutable and undo may refill their plan.
 const surfacePlan:SurfacePlan={terrain,rivers,paint,landformSurface,baseSamples:surface?.baseSamples??base.samples.slice(),issues:[...issues],prepared,distances,
  candidates:new Map(prior?[...prior.candidates].filter(([key])=>unchanged.has(JSON.parse(key)[1])&&(JSON.parse(key)[0]==='river'||sameExclusions)):[]),
  meadowRasters:new Map(prior?[...prior.meadowRasters].filter(([id])=>unchanged.has(id)):[]),nearestTrees:prior?.nearestTrees};
 const riverBounds=new Map(rivers.map(r=>{
  if(r.area)return [r,shapeBounds(r.area)] as const;
  const bounds:Bounds={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};
  for(const s of r.samples){const half=r.width*s.widthScale/2;bounds.minX=Math.min(bounds.minX,s.x-half);bounds.maxX=Math.max(bounds.maxX,s.x+half);bounds.minZ=Math.min(bounds.minZ,s.z-half);bounds.maxZ=Math.max(bounds.maxZ,s.z+half);}
  return [r,bounds] as const;
 }));
 const outside=(x:number,z:number,b:Bounds,pad=0)=>x<b.minX-pad||x>b.maxX+pad||z<b.minZ-pad||z>b.maxZ+pad;
 const inWater=(x:number,z:number,clearance=0)=>rivers.some(r=>{if(outside(x,z,riverBounds.get(r)!,clearance))return false;if(r.area&&!distanceQuery(r.area).intersects(x,z,-clearance))return false;const p=riverPoint(x,z,r);return p.offset<r.width*p.widthScale/2+clearance;});
 const paths=prepared.filter(p=>p.recipe.type==='path');
 const footprints=new Footprints();
 for(const obj of scene.objects){const r=Math.max(0,assets.clearance(obj.asset))*obj.scale;footprints.add(obj.x,obj.z,r);
  if(inWater(obj.x,obj.z)&&obj.heightMode==='terrain')issues.push({code:'object-water-conflict',id:obj.id,message:'A placed object overlaps a river; its authored transform was preserved'});
 }
 // Candidate budget scales with map area: ~30 per cell (two million on a 256² map).
 let candidates=0;const candidateBudget=Math.ceil(30.5*terrain.width*terrain.height*terrain.step*terrain.step);
 // River decoration belongs to the river layer: changing its course regenerates
 // banks and floating leaves deterministically, after structures reserve space.
 for(const {layer,recipe,bounds} of prepared){
  if(recipe.type!=='river'||!recipe.details)continue;
  const course=rivers.find(r=>r.owner===layer.id)!;
  const {shore,...fixed}=recipe.details;
  const passes=[...Object.entries(fixed),...(shore??[]).map(s=>['shore-'+s.id,s] as const)];
  for(const [mode,settings] of passes){
   if(!settings)continue;
   const band='bank'in settings?settings.bank:undefined;
   const density=settings.density??1;if(density===0)continue;
   const spacing=settings.spacing/Math.sqrt(density),separation=new Footprints();
   const loX=Math.max(Math.floor(bounds.minX/spacing),Math.floor(terrain.originX/spacing)),hiX=Math.min(Math.ceil(bounds.maxX/spacing),Math.floor((terrain.originX+(terrain.width-1)*terrain.step)/spacing));
   const loZ=Math.max(Math.floor(bounds.minZ/spacing),Math.floor(terrain.originZ/spacing)),hiZ=Math.min(Math.ceil(bounds.maxZ/spacing),Math.floor((terrain.originZ+(terrain.height-1)*terrain.step)/spacing));
   candidates+=(hiX-loX+1)*(hiZ-loZ+1);if(candidates>candidateBudget)throw Error(`Procedural density exceeds ${candidateBudget} candidate cells at layer ${layer.id} (river ${mode}); increase spacing or reduce the region`);
   const sum=settings.species.reduce((n,s)=>n+s.weight,0);
   const randomLayer=layer.id+'.river.'+mode;
   const noiseAt=settings.patchiness?noiseFor(layer.seed,layer.id,settings.patchiness.scale):undefined;
   const random=(ix:number,iz:number,c:number)=>cellRandom(layer.seed,randomLayer,ix,iz,c);
   const cacheKey=JSON.stringify(['river',layer.id,mode]),cached=surfacePlan.candidates.get(cacheKey),placements=cached??[];
   const areaQuery=course.area?distanceQuery(course.area):undefined;
   const minBank=band?band.min:mode==='water'?-Math.min(3,recipe.width*.4):settings.waterClearance;
   const maxBank=band?band.max:mode==='water'?-.5:recipe.bankWidth;
   // Before hashing/noise, reject cells whose entire jitter envelope misses the
   // bank. Signed distance is 1-Lipschitz; surviving points still use exact tests.
   const jitterReach=Math.abs(settings.jitter*spacing)*Math.SQRT1_2+1e-7;
   if(!cached)for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
    if(areaQuery&&!areaQuery.intersects((ix+.5)*spacing,(iz+.5)*spacing,-maxBank-jitterReach,-minBank+jitterReach))continue;
    const chance=random(ix,iz,2);if(chance>=settings.probability)continue;
    const x=(ix+.5+(random(ix,iz,0)-.5)*settings.jitter)*spacing,z=(iz+.5+(random(ix,iz,1)-.5)*settings.jitter)*spacing;
    const patch=settings.patchiness?1-settings.patchiness.strength+settings.patchiness.strength*noiseAt!(x,z):1;
    if(chance>=settings.probability*patch)continue;
    // Area-river bank distance is the negative signed mask distance. Reject
    // only whole tiles outside the pass's band, then keep the original exact
    // point query and arithmetic for every surviving placement.
    if(areaQuery&&!areaQuery.intersects(x,z,-maxBank,-minBank))continue;
    const p=riverPoint(x,z,course),bank=p.offset-recipe.width*p.widthScale/2;
    if(band){if(bank<band.min||bank>band.max)continue;}
    else if(mode==='water'){
     if(bank>-.5||bank< -Math.min(3,recipe.width*.4))continue;
    }else if(bank<settings.waterClearance||bank>recipe.bankWidth)continue;
    let weight=random(ix,iz,3)*sum,asset=settings.species[0]!.asset;for(const candidate of settings.species){weight-=candidate.weight;if(weight<0){asset=candidate.asset;break;}}
    const scale=settings.scaleMin+random(ix,iz,4)*(settings.scaleMax-settings.scaleMin);
    placements.push({radius:assets.clearance(asset)*scale+settings.objectClearance,riverHeight:p.elevation,object:{id:`generated.${layer.id.slice(0,100)}.river-${mode}.${ix}.${iz}`,asset,x,z,elevation:mode==='water'?p.elevation+.035:0,yaw:random(ix,iz,5)*Math.PI*2,scale,heightMode:mode==='water'?'absolute':'terrain',visible:layer.visible,locked:layer.locked,owner:layer.id}});
   }
   if(!cached)surfacePlan.candidates.set(cacheKey,placements);
   for(const {object,radius,riverHeight} of placements){
    const {x,z}=object;
    if(!band){
     if(mode==='water'){const depth=riverHeight!-sample(terrain,x,z);if(depth<.15||depth>2.5)continue;}
     else if(sample(terrain,x,z)<=riverHeight!+.03)continue;
    }
    if(mode!=='water'){
     const dx=(sample(terrain,x+1,z)-sample(terrain,x-1,z))/2,dz=(sample(terrain,x,z+1)-sample(terrain,x,z-1))/2;
     if(Math.hypot(dx,dz)>settings.maxSlope)continue;
    }
    if(settings.minSpacing&&separation.intersects(x,z,settings.minSpacing/2))continue;
    if(footprints.intersects(x,z,radius))continue;
    objects.push(object);
    if(settings.minSpacing)separation.add(x,z,settings.minSpacing/2);
   }
  }
 }
 profile?.mark('River details and exclusions');
 type Band={min:number;max:number};
 const noBand=undefined as {coverage?:Band;trees?:Band}|undefined;
 const scatterPasses=prepared.flatMap(p=>{
  const stage=generationStage[p.recipe.type];
  if(p.recipe.type==='terrain'&&p.recipe.chunks)return [{...p,recipe:{...p.recipe.chunks,type:'ground-cover' as const},stage,band:noBand,reserve:true,pass:'rock',embed:true,minEdge:0,maxEdge:Math.max(1,p.recipe.falloff*.4)}];
  if(p.recipe.type==='meadow')return (p.recipe.accents??[]).map(a=>({...p,recipe:{...a,type:'grass' as const},stage,band:{coverage:a.coverage,trees:a.trees} as typeof noBand,reserve:false,embed:false,pass:'accent-'+a.id,minEdge:0,maxEdge:Infinity}));
  if(!('species'in p.recipe))return [];
  const core={...p,recipe:p.recipe,stage,band:noBand,reserve:p.recipe.type==='forest',embed:false,pass:'interior',minEdge:p.recipe.type==='forest'?p.recipe.interiorMargin:0,maxEdge:Infinity};
  if(p.recipe.type!=='forest')return [core];
  return [core,...(p.recipe.edge?[{...p,recipe:{...p.recipe.edge,type:'forest' as const,interiorMargin:0},stage,band:noBand,reserve:true,embed:false,pass:'edge',minEdge:0,maxEdge:p.recipe.edge.width}]:[]),...(p.recipe.details??[]).map(d=>({...p,recipe:{...d,type:'forest' as const,interiorMargin:0},stage,band:noBand,reserve:false,embed:false,pass:'detail-'+d.id,minEdge:0,maxEdge:Infinity}))];
 });
 // Meadows use ordinary placed trees and newly previewed trees alike.
 const meadows=prepared.filter(p=>p.recipe.type==='meadow');
 const trees=scene.objects.filter(o=>o.visible&&assets.isTree?.(o.asset)).map(o=>({x:o.x,z:o.z}));
 const meadowCover=new Map<string,Float32Array>();
 let meadow:Float32Array|undefined,nearest:Float32Array|undefined;
 const growMeadows=()=>{
  if(meadow||!meadows.length)return;
  meadow=new Float32Array(base.samples.length);
  // Nearest-trunk distance, stamped per tree out to the widest meadow's influence (accent bands included).
  const range=Math.max(...meadows.map(({recipe:r})=>r.type==='meadow'?Math.max(r.reach+r.falloff,...(r.accents??[]).map(a=>a.trees?.max??0)):0));
  surfacePlan.nearestTrees=updateNearestTrees(terrain,trees,range,surfacePlan.nearestTrees);
  nearest=surfacePlan.nearestTrees.values;
  profile?.mark('Meadow nearest-trunk raster');
  const paintVertices=indexedPaints(paint,base.samples.length);
  profile?.mark('Index nonzero meadow paints');
  for(const {layer,recipe:r,bounds} of meadows){
   if(r.type!=='meadow'||layer.shape.type==='spline')continue;
   const shape=layer.shape,own=new Float32Array(base.samples.length);
   let raster=surfacePlan.meadowRasters.get(layer.id);
   if(!raster){
    // Mask/noise samples are fixed by the immutable layer. Preserve doubles so
    // reuse does not change coverage rounding. Fray is evaluated lazily because
    // its active band depends on the nearest tree, which can change on a move.
    raster={fade:new Float64Array(base.samples.length).fill(NaN),...(r.noise?{noise:new Float64Array(base.samples.length)}:{}),
     ...(r.ragged&&r.ragged.strength>0?{fray:new Float64Array(base.samples.length).fill(NaN),torn:new Float64Array(base.samples.length)}:{})};
    surfacePlan.meadowRasters.set(layer.id,raster);
   }
   const noiseAt=r.noise?noiseFor(layer.seed,layer.id+'.meadow',r.noise.scale):undefined,fineAt=r.noise?noiseFor(layer.seed,layer.id+'.meadow.fine',r.noise.scale*.35):undefined;
   const spanAt=r.ragged?noiseFor(layer.seed,layer.id+'.ragged.span',r.ragged.scale*5):undefined,frayAt=r.ragged?noiseFor(layer.seed,layer.id+'.ragged',r.ragged.scale):undefined,frayFineAt=r.ragged?noiseFor(layer.seed,layer.id+'.ragged.fine',r.ragged.scale*.45):undefined;
   eachVertex(terrain,bounds,(i,x,z)=>{
    if(Number.isNaN(raster.fade[i])){
     const edge=regionDistance(x,z,shape);raster.fade[i]=edge<0?-1:r.edgeFade?smooth(edge/r.edgeFade):1;
     if(edge>=0&&r.noise)raster.noise![i]=(noiseAt!(x,z)*.65+fineAt!(x,z)*.35-.5)*2*r.noise.strength;
    }
    if(raster.fade[i]<0)return;
    const d=nearest![i]!;
    // Shade → lush fringe → open ground. Two noise octaves break the rings into clumps and bald spots.
    let c=d<r.canopy?r.under+(r.peak-r.under)*smooth(d/Math.max(.01,r.canopy)):d<=r.reach?r.peak:r.peak+(r.open-r.peak)*smooth((d-r.reach)/r.falloff);
    if(r.noise)c+=raster.noise![i];
    // Fray: inside a tent band centred on the clean curve's half-coverage line, coverage is pulled toward
    // noise around .5, so grass and dirt interleave as worn holes and stray islands instead of shifting one
    // smooth line. A ~5× coarser noise sets how torn each stretch of rim is.
    if(r.ragged&&r.ragged.strength>0){
     const half=r.falloff/2,b=smooth(clamp(1-Math.abs(d-(r.reach+half))/(half+r.ragged.width)));
     if(b>0){
      if(Number.isNaN(raster.fray![i])){
       raster.torn![i]=.15+.85*smooth(spanAt!(x,z));
       raster.fray![i]=.5+(frayAt!(x,z)*.6+frayFineAt!(x,z)*.4-.5)*2*r.ragged.strength;
      }
      c+=(raster.fray![i]-c)*b*raster.torn![i];
     }
    }
    own[i]=clamp(c)*raster.fade[i];
    meadow![i]=Math.max(meadow![i]!,own[i]!);
   });
   profile?.mark(`Meadow ${layer.id} coverage`);
   // Accent bands see the coverage the terrain will show: landform grass, then paint in order (mirrors authoredTerrain).
   for(let i=0;i<own.length;i++){let c=Math.max(own[i]!,landformSurface?.grass[i]??0);for(let j=paintVertices.offsets[i];j<paintVertices.offsets[i+1];j++){const p=paint[paintVertices.layers[j]],w=p.weights[i];c=c*(1-w)+(p.material===r.material?w:0);}own[i]=c;}
   meadowCover.set(layer.id,own);profile?.mark(`Meadow ${layer.id} material masks`);
  }
 };
 profile?.mark('Prepare vegetation passes');
 for(const {layer,recipe,bounds,pass,minEdge,maxEdge,reserve,embed,stage,band} of scatterPasses){
  if(stage>=generationStage.meadow){growMeadows();profile?.mark('Meadow coverage');}
  if(layer.shape.type==='spline')continue;
  const cover=band?.coverage?{...terrain,samples:meadowCover.get(layer.id)!}:undefined;
  const spacingFootprints=new Footprints();
  const density=recipe.density??1;if(density===0)continue;
  const shape=layer.shape,spacing=recipe.spacing/Math.sqrt(density);
  const minX=Math.max(Math.floor(bounds.minX/spacing),Math.floor(terrain.originX/spacing)),maxX=Math.min(Math.ceil(bounds.maxX/spacing),Math.ceil((terrain.originX+(terrain.width-1)*terrain.step)/spacing));
  const minZ=Math.max(Math.floor(bounds.minZ/spacing),Math.floor(terrain.originZ/spacing)),maxZ=Math.min(Math.ceil(bounds.maxZ/spacing),Math.ceil((terrain.originZ+(terrain.height-1)*terrain.step)/spacing));
  candidates+=(maxX-minX+1)*(maxZ-minZ+1);if(candidates>candidateBudget)throw Error(`Procedural density exceeds ${candidateBudget} candidate cells at layer ${layer.id} (${pass}); increase spacing or reduce the region`);
  const patchSettings=recipe.patchiness??(recipe.pattern==='patches'?{scale:12,strength:.6}:undefined);
  const weight=recipe.species.reduce((s,v)=>s+v.weight,0);
  const randomLayer=layer.id+'.'+pass;
  const random=(ix:number,iz:number,channel:number)=>cellRandom(layer.seed,randomLayer,ix,iz,channel);
  const noiseAt=patchSettings?noiseFor(layer.seed,layer.id,patchSettings.scale):undefined;
  const objectPrefix=`generated.${layer.id.slice(0,100)}.${Math.floor(cellRandom(0,layer.id,0,0,0)*4294967296).toString(16)}.${pass}.`;
  const cacheKey=JSON.stringify(['scatter',layer.id,pass]),cached=surfacePlan.candidates.get(cacheKey),placements=cached??[];
  const shapeQuery=distanceQuery(shape),jitterReach=Math.abs(recipe.jitter*spacing)*Math.SQRT1_2+1e-7;
  if(!cached)for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
   if(!shapeQuery.intersects((ix+.5)*spacing,(iz+.5)*spacing,minEdge-jitterReach,maxEdge+jitterReach))continue;
   // All later probability modifiers are in [0,1]. Reject an impossible draw
   // before position hashes, exact mask queries and noise. Cell channels are
   // stateless, so this reordering does not shift any other random value.
   const chance=random(ix,iz,2);if(chance>=recipe.probability)continue;
   const x=(ix+.5+(random(ix,iz,0)-.5)*recipe.jitter)*spacing,z=(iz+.5+(random(ix,iz,1)-.5)*recipe.jitter)*spacing;
   if(x<terrain.originX||z<terrain.originZ||x>terrain.originX+(terrain.width-1)*terrain.step||z>terrain.originZ+(terrain.height-1)*terrain.step)continue;
   // Unfaded scatter needs membership only. A wholly contained distance tile
   // proves it without another exact brush query; edge fading still samples the
   // original distance, preserving probability and all seeded placements.
   const edge=recipe.edgeFade?shapeQuery.within(x,z,minEdge,maxEdge):shapeQuery.contains(x,z,minEdge,maxEdge)?0:undefined;if(edge===undefined)continue;
   const patch=recipe.pattern!=='scattered'&&patchSettings?1-patchSettings.strength+patchSettings.strength*noiseAt!(x,z):1;
   if(chance>=recipe.probability*(recipe.edgeFade?clamp(edge/recipe.edgeFade):1)*patch)continue;
   if(recipe.riverBank){let bankDistance=Infinity;for(const r of rivers){const p=riverPoint(x,z,r);bankDistance=Math.min(bankDistance,p.offset-r.width*p.widthScale/2);}if(bankDistance<recipe.riverBank.min||bankDistance>recipe.riverBank.max)continue;}
   if(inWater(x,z,recipe.waterClearance)||paths.some(p=>{const r=p.recipe;if(r.type!=='path')return false;if(r.vegetationClearance===0||outside(x,z,p.bounds))return false;const n=p.spline?nearestSpline(x,z,p.spline):{offset:r.width/2-regionDistance(x,z,p.layer.shape as Exclude<LayerShape,{type:'spline'}>),widthScale:1};return n.offset<r.width*n.widthScale/2+r.vegetationClearance;}))continue;
   let w=random(ix,iz,3)*weight,asset=recipe.species[0]!.asset;for(const s of recipe.species){w-=s.weight;if(w<0){asset=s.asset;break;}}
   const scale=recipe.scaleMin+random(ix,iz,4)*(recipe.scaleMax-recipe.scaleMin),radius=Math.max(embed?recipe.spacing*.6:0,assets.clearance(asset))*scale;
   placements.push({radius,object:{id:`${objectPrefix}${ix}.${iz}`,asset,x,z,elevation:0,yaw:random(ix,iz,5)*Math.PI*2,scale,heightMode:'terrain',visible:layer.visible,locked:layer.locked,owner:layer.id,blocksVegetation:reserve}});
  }
  if(!cached)surfacePlan.candidates.set(cacheKey,placements);
  // Candidate positions depend on layer geometry, noise and exclusions. Height,
  // slope, occupancy and meadow bands are checked against the current surface.
  const slopes=slopesFor(terrain,placements);
  for(let candidate=0;candidate<placements.length;candidate++){
   const {object,radius}=placements[candidate]!;
   const {x,z}=object;
   if(slopes[candidate]!>recipe.maxSlope)continue;
   if(cover&&band?.coverage){const c=sample(cover,x,z);if(c<band.coverage.min||c>band.coverage.max)continue;}
   if(band?.trees&&nearest){const gx=Math.round((x-terrain.originX)/terrain.step),gz=Math.round((z-terrain.originZ)/terrain.step),d=nearest[Math.min(terrain.height-1,Math.max(0,gz))*terrain.width+Math.min(terrain.width-1,Math.max(0,gx))]!;if(d<band.trees.min||d>band.trees.max)continue;}
   if(recipe.minSpacing&&spacingFootprints.intersects(x,z,recipe.minSpacing/2))continue;
   if(footprints.intersects(x,z,radius+recipe.objectClearance))continue;
   // Embedding follows the new downhill shoulder, never the cached base height.
   if(embed){let lowest=sample(terrain,x,z);const center=lowest;
    for(let a=0;a<8;a++){const angle=a*Math.PI/4;lowest=Math.min(lowest,sample(terrain,x+Math.cos(angle)*radius,z+Math.sin(angle)*radius));}
    objects.push({...object,elevation:lowest-center-.65*object.scale});
   }else objects.push(object);
   if(recipe.minSpacing)spacingFootprints.add(x,z,recipe.minSpacing/2);
   if(reserve)footprints.add(x,z,radius);
   if(reserve&&recipe.type==='forest')trees.push({x,z});
  }
  profile?.mark(`Scatter ${layer.id}/${pass}`);
 }
 growMeadows();
 profile?.mark('Finish generation');
 const result={terrain,objects,rivers,paint,issues,landformSurface,meadow,forestLayers:prepared.filter(p=>p.recipe.type==='forest').map(p=>p.layer.id),scatterLayers:prepared.filter(p=>'species'in p.recipe).map(p=>p.layer.id)};
 surfacePlans.set(result.terrain,surfacePlan);return result;
}
