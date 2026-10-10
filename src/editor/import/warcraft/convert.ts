import {fitImportedPlacements} from './placements';
import {warcraftCornerGround,warcraftCliffCells,type WarcraftCliffDefinitions} from './ground';
import {startingArea} from '../../../shared/map/startingArea';
import {MAX_FOUNDATION_RELIEF_CM} from '../../../shared/map/tacticalTerrain';
import {z} from 'zod';
import policyJson from '../../../../content/import/warcraft/policy.json';
import sourceJson from '../../../../content/import/warcraft/source.json';
import {MAP_DIMENSIONS} from '../../../content/biomes';
import {content} from '../../../content/builtin';
import {CAMP_LOOT,campComposition,compositionMembers} from '../../../content/campCompositions';
import {validatePlacements} from '../../../content/map';
import type {Placement,Camp} from '../../../content/schema';
import {groundTextures} from '../../../shared/authoring/groundTextures';
import type {AuthoredObject} from '../../../shared/authoring/layers';
import {HeightField,HEIGHT_MIN,HEIGHT_MAX,WADING_DEPTH_CM} from '../../../shared/map/height';
import {encodeBytes,encodeFloats,type TerrainData} from '../../../shared/map/terrainData';
import {emptyUtcMap,readUtcMap,type UtcMap} from '../../../shared/map/utcmap';
import {snapPlacement} from '../../../shared/spatial/placement';
import type {WarcraftMap} from './read';

const policy=z.object({sourceUnitsPerWorldUnit:z.number().positive(),defaultBiome:z.string(),startPadBlend:z.number().positive(),placementSearchRadius:z.number().int().min(1).max(32),playerSetup:z.string(),treeAssets:z.array(z.string()).min(1),treeScale:z.number().positive(),campLinkDistance:z.number().positive(),campMaxDiameter:z.number().positive(),campTiers:z.array(z.object({maxLevel:z.number().positive(),difficulty:z.enum(['small','medium','hard']),compositions:z.array(z.string()).min(1)})).min(1),mineDefinition:z.string(),mineOffsets:z.array(z.tuple([z.number(),z.number()])).min(1),campClassificationSource:z.string()}).parse(policyJson);
const source=sourceJson as {units:Record<string,{level:number;name?:string}>;trees:string[];waterOffsets:Record<string,number>;cliffs:WarcraftCliffDefinitions};
export type ImportReport={name:string;trees:number;starts:number;mines:number;campCounts:{small:number;medium:number;hard:number};camps:{id:string;sourceLevel:number;sourceMembers:string[];difficulty:string;composition:string;position:{x:number;y:number}}[];textures:{source:string;asset:string}[];warnings:string[];placementAdjustments:{id:string;distance:number}[];startingPads:{player:number;height:number;maxAdjustment:number}[]};
export type WarcraftImport={map:UtcMap;report:ImportReport};
/** All conversion runs once in the editor. The resulting document contains only
 * ordinary editable samples, authored objects, entities, starts and camps. */
export function convertWarcraftMap(input:WarcraftMap,textureOverrides:Record<string,string>={}):WarcraftImport{
 const t=input.terrain,scale=policy.sourceUnitsPerWorldUnit,cell=128/scale;
 if(cell!==4)throw Error('Warcraft import scale must match the four-unit terrain grid');
 const width=(t.width-1)*cell,height=(t.height-1)*cell,size=MAP_DIMENSIONS.find(d=>d.size>=Math.max(width,height))?.size;
 if(!size)throw Error('Warcraft map exceeds supported map dimensions');
 const padX=Math.floor((size-width)/8)*4,padZ=Math.floor((size-height)/8)*4;
 const position=(x:number,y:number)=>({x:(x-t.offsetX)/scale+padX-.5,y:height-(y-t.offsetY)/scale+padZ-.5});
 const report:ImportReport={name:input.info.name,trees:0,starts:0,mines:0,campCounts:{small:0,medium:0,hard:0},camps:[],textures:[],warnings:[],startingPads:[],placementAdjustments:[]};
 const units={...source.units},trees=new Set(source.trees);
 for(const change of input.unitChanges){
  const base=units[change.base],level=change.fields.ulev;
  if(base||typeof level==='number')units[change.id]={...base,level:typeof level==='number'?Math.max(1,level):base.level};
 }
 for(const change of input.treeChanges){
  const target=change.fields.btar;
  if(typeof target==='string'?target.split(',').includes('tree'):trees.has(change.base))trees.add(change.id);
  else trees.delete(change.id);
 }
 const materials=t.groundTiles.map(id=>{
  const asset=textureOverrides[id]??[...groundTextures.values()].find(a=>a.terrain?.sourceIds.includes(id))?.id;
  if(!asset||!groundTextures.get(asset)?.terrain?.runtime||groundTextures.get(asset)?.terrain?.projection)throw Error(`Ground texture ${id} is unavailable. Import its source asset or choose a substitute.`);
  report.textures.push({source:id,asset});return asset;
 });
 const cornerGround=warcraftCornerGround(t,source.cliffs),cliffCells=warcraftCliffCells(t);
 const cliffMaterials=new Map([...new Set(cliffCells)].filter(i=>i>=0).map(index=>{
  const id=t.cliffTiles[index],asset=textureOverrides[id]??[...groundTextures.values()].find(a=>a.terrain?.projection?.type==='cliff'&&a.terrain.sourceIds.includes(id))?.id;
  if(!asset||groundTextures.get(asset)?.terrain?.projection?.type!=='cliff')throw Error(`Cliff face ${id??index} is unavailable. Import its source asset or choose a cliff material substitute.`);
  report.textures.push({source:id,asset});return [index,asset];
 }));
 const field=new HeightField(size),n=field.samples.length,flow=new Uint8Array(field.span**2*4),water=new Float32Array(n),zero=new Float32Array(n);
 for(let i=0;i<flow.length;i+=4)flow[i]=flow[i+1]=128;
 // Preserve relative heights while centering the source's absolute elevation in
 // the engine's editable range. A translated zero does not alter map topology.
 const sourceHeights=t.corners.map(c=>(c.ground+c.level-2)*cell),min=sourceHeights.reduce((a,b)=>Math.min(a,b),Infinity),max=sourceHeights.reduce((a,b)=>Math.max(a,b),-Infinity);
 if(max-min>HEIGHT_MAX-HEIGHT_MIN)throw Error('Source terrain exceeds the supported elevation span');
 // The editable range is asymmetric (-16..24). Centering around zero alone
 // rejects maps that fit: a 0..40 source must translate by 16, not by 20.
 const preferredOffset=Math.round((min+max)/2/cell)*cell;
 const elevationOffset=Math.max(max-HEIGHT_MAX,Math.min(min-HEIGHT_MIN,preferredOffset));
 const paints=[...new Set(materials)].map(material=>({material,weights:new Float32Array(n),variants:new Uint8Array((field.span/cell)**2)}));
 const paintByIndex=materials.map(id=>paints.find(p=>p.material===id)!);
 const cliffPaints=[...new Set(cliffMaterials.values())].map(material=>({material,weights:new Float32Array(n),variants:new Uint8Array((field.span/cell)**2)}));
 const cliffPaintByIndex=new Map([...cliffMaterials].map(([index,id])=>[index,cliffPaints.find(p=>p.material===id)!]));
 const waterOffset=source.waterOffsets[t.tileset];if(waterOffset===undefined&&t.corners.some(c=>c.water))throw Error(`Missing water definition for tileset ${t.tileset}`);
 const at=(x:number,y:number)=>t.corners[Math.max(0,Math.min(t.height-1,y))*t.width+Math.max(0,Math.min(t.width-1,x))];
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++){
  const sx=Math.max(0,Math.min(t.width-1,(x+field.origin+.5-padX)/cell)),sy=Math.max(0,Math.min(t.height-1,(height-(z+field.origin+.5-padZ))/cell));
  const ix=Math.min(t.width-2,Math.floor(sx)),iy=Math.min(t.height-2,Math.floor(sy)),u=sx-ix,v=sy-iy;
  const corners=[at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  const blend=(get:(c:typeof corners[number])=>number)=>corners.reduce((sum,c,i)=>sum+get(c)*weights[i],0);
  const level=blend(c=>c.level),sameLevel=corners.every(c=>c.level===corners[0].level),ramp=corners.some(c=>c.ramp);
  const sourceHeight=blend(c=>c.ground)+(sameLevel||ramp?level:Math.round(level))-2;
  let ground=sourceHeight*cell-elevationOffset;
  const surface=corners.some(c=>c.water)?(blend(c=>c.waterHeight)+(waterOffset??0))*cell-elevationOffset:HEIGHT_MIN-1;
  if(surface>ground){
   // Warcraft shallow water is <= half a source tile deep. Preserve the ford
   // category using this game's wading depth; deeper beds retain their slope.
   const depth=(surface-ground)/cell,fordLimit=WADING_DEPTH_CM/100;
   ground=surface-(depth<=.5?depth/.5*fordLimit:fordLimit+(depth-.5)*cell);
  }
  const i=z*field.verts+x;field.samples[i]=ground;water[i]=surface;
  // Nearest corner ownership leaves exact grid corners unambiguous after the
  // one-unit editable raster is sampled by the automatic atlas resolver.
  paintByIndex[cornerGround[Math.round(sy)*t.width+Math.round(sx)]].weights[i]=1;
  const cliff=cliffPaintByIndex.get(cliffCells[iy*(t.width-1)+ix]);if(cliff)cliff.weights[i]=1;
 }
 const cells=field.span/cell;
 for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){
  const sx=Math.floor((field.origin+x*cell-padX)/cell),sy=Math.floor((height-(field.origin+z*cell-padZ))/cell)-1;
  const variation=at(sx,sy).variation;
  for(const paint of paints){const count=groundTextures.get(paint.material)!.terrain!.atlas.fullTiles.length;paint.variants[z*cells+x]=Math.min(count-1,variation);}
 }

 const objects:AuthoredObject[]=[];
 for(const [i,d] of input.doodads.entries())if(trees.has(d.id)&&d.life>0){
  const p=position(d.location[0],d.location[1]);if(p.x<field.origin||p.y<field.origin||p.x>=size-field.origin||p.y>=size-field.origin)continue;
  objects.push({id:`warcraft.tree.${i}`,asset:policy.treeAssets[Math.abs(d.variation)%policy.treeAssets.length],x:p.x,z:p.y,elevation:0,yaw:-d.angle,scale:Math.max(.1,Math.min(10,d.scale[0]*policy.treeScale)),heightMode:'terrain',visible:true,locked:false});
 }
 report.trees=objects.length;
 const starts=input.info.players.filter(p=>p.type===1||p.type===2).map((p,i)=>{
  const xy=snapPlacement(content.get(content.rules.startingSetup.fort),position(p.x,p.y));return {player:i+1,x:Math.round(xy.x*2)/2,z:Math.round(xy.y*2)/2,setup:policy.playerSetup,mainFort:`start.player.${i+1}/main-fort`};
 });
 if(starts.length<2||starts.length>8)throw Error('Import requires between two and eight playable starting positions');report.starts=starts.length;
 // Warcraft town halls flatten their foundations. Commit that edit once during
 // import, covering our declared worker formation as well as the larger hall.
 for(const start of starts){
  const area=startingArea(start),hs:number[]=[],waters:number[]=[];
  for(let z=area.minZ;z<=area.maxZ;z++)for(let x=area.minX;x<=area.maxX;x++){
   const i=(z-field.origin)*field.verts+x-field.origin;hs.push(field.samples[i]);waters.push(water[i]);
  }
  if(Math.max(...hs)-Math.min(...hs)<=MAX_FOUNDATION_RELIEF_CM/100)continue;
  if(hs.some((h,i)=>h<=waters[i]+.1)){report.warnings.push(`Player ${start.player}: starting formation touches water. Review its placement.`);continue;}
  const target=hs.reduce((a,b)=>a+b,0)/hs.length,blend=policy.startPadBlend;
  let maxAdjustment=0;
  for(let z=Math.max(field.origin,Math.floor(area.minZ-blend));z<=Math.min(field.origin+field.span,Math.ceil(area.maxZ+blend));z++)
   for(let x=Math.max(field.origin,Math.floor(area.minX-blend));x<=Math.min(field.origin+field.span,Math.ceil(area.maxX+blend));x++){
    const distance=Math.max(0,area.minX-x,x-area.maxX,area.minZ-z,z-area.maxZ),weight=Math.max(0,1-distance/blend);
    const i=(z-field.origin)*field.verts+x-field.origin,delta=(target-field.samples[i])*weight;
    field.samples[i]+=delta;maxAdjustment=Math.max(maxAdjustment,Math.abs(delta));
   }
  report.startingPads.push({player:start.player,height:target,maxAdjustment});
 }
 const terrain:TerrainData={version:1,size,heights:encodeFloats(field.samples),waterHeights:encodeFloats(water),waterFlow:encodeBytes(flow),waterProfiles:[],grass:encodeFloats(zero),rock:encodeFloats(zero),paint:[...paints,...cliffPaints].filter(p=>p.weights.some(w=>w>0)).map(p=>({material:p.material,weights:encodeFloats(p.weights),variants:encodeBytes(p.variants)}))};

 const entities:Placement[]=[],camps:Camp[]=[];
 const mine=content.get(policy.mineDefinition);
 for(const [i,u] of input.units.entries())if(u.id==='ngol'){
  const p=position(u.location[0],u.location[1]);report.mines++;
  let remaining=Math.max(0,u.goldAmount),capacity=mine.yield??0;
  if(remaining>capacity*policy.mineOffsets.length)report.warnings.push(`Gold mine ${report.mines}: source amount ${remaining} exceeds the substitute site's ${capacity*policy.mineOffsets.length} capacity.`);
  for(const [j,[dx,dz]] of policy.mineOffsets.entries()){
   const amount=Math.min(capacity,Math.ceil(remaining/(policy.mineOffsets.length-j)));remaining-=amount;
   entities.push({id:`warcraft.mine.${i}.${j}`,definition:mine.id,position:snapPlacement(mine,{x:p.x+dx,y:p.y+dz}),rotation:0,owner:'none',initialState:{construction:'complete',amount}});
  }
 }
 const neutralOwner=input.info.build>=132?24:12;
 const remaining=input.units.filter(u=>u.player===neutralOwner);
 let unknown=0;
 while(remaining.length){
  const group=[remaining.shift()!];
  for(let j=0;j<group.length;j++)for(let k=remaining.length-1;k>=0;k--){
   const candidate=remaining[k],distance=(u:typeof candidate)=>Math.hypot(candidate.location[0]-u.location[0],candidate.location[1]-u.location[1]);
   if(distance(group[j])<=policy.campLinkDistance&&group.every(u=>distance(u)<=policy.campMaxDiameter))group.push(...remaining.splice(k,1));
  }
  const total=group.reduce((n,u)=>{const level=units[u.id]?.level;if(!level)unknown++;return n+Math.max(1,level??u.heroLevel??1);},0);
  const tier=policy.campTiers.find(tier=>total<=tier.maxLevel)!;
  const index=camps.length,composition=campComposition(tier.compositions[index%tier.compositions.length]);
  const center=position(group.reduce((n,u)=>n+u.location[0],0)/group.length,group.reduce((n,u)=>n+u.location[1],0)/group.length);
  const home={x:Math.round(center.x),y:Math.round(center.y)},id=`camp/warcraft-${index+1}`;
  const members=compositionMembers(composition,d=>(content.get(d).level??1)*1e5+(content.get(d).body?.maxHp??0));
  const sourcePositions=[...group].sort((a,b)=>(units[b.id]?.level??0)-(units[a.id]?.level??0)).map(u=>position(u.location[0],u.location[1]));
  const ids=members.map((definition,j)=>{
   const p=sourcePositions[j]??{x:home.x+Math.cos(j*2.39996)*3,y:home.y+Math.sin(j*2.39996)*3},member=`${id}/${j+1}`;
   entities.push({id:member,definition,position:{x:Math.round(p.x),y:Math.round(p.y)},rotation:0,owner:'none'});return member;
  });
  camps.push({id,members:ids,home,aggroRange:8,leash:18,aggression:'players',lootPool:CAMP_LOOT[tier.difficulty]});
  report.campCounts[tier.difficulty]++;report.camps.push({id,sourceLevel:total,sourceMembers:group.map(u=>u.id),difficulty:tier.difficulty,composition:composition.id,position:home});
 }
 if(unknown)report.warnings.push(`${unknown} neutral units have no known source level; their placed level was used. Review the affected camps.`);
 const map:UtcMap={...emptyUtcMap(size),name:input.info.name,description:input.info.description,biome:policy.defaultBiome,authoring:{version:1,terrain,objects},playerStarts:starts,entities,camps};
 const fitted=fitImportedPlacements(map,policy.placementSearchRadius);report.placementAdjustments=fitted.adjusted;report.warnings.push(...fitted.warnings);
 const checked=readUtcMap(fitted.map);if('error'in checked)throw Error(checked.error);validatePlacements(checked.map,content);
 return {map:checked.map,report};
}
