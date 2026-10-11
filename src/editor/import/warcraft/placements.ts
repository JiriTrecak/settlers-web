import {placementGeometryError} from '../../../shared/spatial/placement';
import {content} from '../../../content/builtin';
import type {Placement} from '../../../content/schema';
import {expandDeclaredMap} from '../../../content/map';
import {projectScene} from '../../../shared/authoring/project';
import {footprintBounds,navigationBodyOverlapsBounds} from '../../../shared/spatial/footprint';
import {resourceCenterSeparation,resourceCollisionCells} from '../../../shared/map/resourceClearance';
import {WADING_DEPTH_CM} from '../../../shared/map/height';
import type {UtcMap} from '../../../shared/map/utcmap';

/** Substitute footprints differ from Warcraft. Resolve only actual conflicts,
 * keeping the source camp home and gold-site centre unless clearance requires it. */
export function fitImportedPlacements(map:UtcMap,searchRadius:number,fixedSites:ReadonlySet<string>=new Set()){
 const originalScene=projectScene(map),clearedTrees:string[]=[];
 const primary=map.entities.filter(p=>fixedSites.has(p.id.slice(0,p.id.lastIndexOf('.'))));
 // A five-node line is wider than the source mine. Clear only trees whose
 // collision cells occupy a node or its two-unit working apron, rather than
 // shifting that race-independent economy layout sideways into another lane.
 for(const tree of originalScene.resources){
  const d=content.get(tree.definition),cells=resourceCollisionCells(tree.position,d.footprint,d.collisionRadius,tree.appearance?.scale??1,tree.rotation);
  if(primary.some(p=>{const b=footprintBounds(p.position,content.get(p.definition).footprint,p.rotation);return cells.some(c=>c.x>=b.minX-2&&c.x<=b.maxX+2&&c.y>=b.minY-2&&c.y<=b.maxY+2);}))clearedTrees.push(tree.id);
 }
 if(clearedTrees.length){const removed=new Set(clearedTrees);map={...map,authoring:{...map.authoring,objects:map.authoring.objects.filter(o=>!removed.has(o.id))}};}
 const scene=clearedTrees.length?projectScene(map):originalScene,field=scene.field,adjusted:{id:string;distance:number}[]=[],warnings:string[]=[];
 const placements=map.entities.map(p=>({...p,position:{...p.position}}));
 const starts=expandDeclaredMap(map,content).filter(p=>p.id.startsWith('start.player.'));
 const trees=scene.resources;
 const solid=(p:Placement)=>content.get(p.definition).kind!=='unit';
 const bounds=(p:Placement)=>footprintBounds(p.position,content.get(p.definition).footprint,p.rotation);
 const overlaps=(a:Placement,b:Placement)=>{
  const x=bounds(a),y=bounds(b);return x.minX<y.maxX&&x.maxX>y.minX&&x.minY<y.maxY&&x.maxY>y.minY;
 };
 const candidates=[{x:0,y:0,distance:0}];
 for(let y=-searchRadius;y<=searchRadius;y++)for(let x=-searchRadius;x<=searchRadius;x++)if(x||y)candidates.push({x,y,distance:Math.hypot(x,y)});
 candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);
 const dry=(p:Placement)=>{
  const b=bounds(p);for(let y=Math.ceil(b.minY);y<b.maxY;y++)for(let x=Math.ceil(b.minX);x<b.maxX;x++)if(x<0||y<0||x>=map.size||y>=map.size||field.sample(x,y)<=field.waterAt(x,y)+.1)return false;
  return true;
 };
 const mines=placements.filter(p=>solid(p));
 // Move each mineral site together so its authored shape remains intact.
 const groups=new Map<string,Placement[]>();
 for(const mine of mines){const key=mine.id.slice(0,mine.id.lastIndexOf('.'));groups.set(key,[...(groups.get(key)??[]),mine]);}
 for(const group of groups.values()){
  const original=group.map(p=>({...p.position}));
  const fits=()=>{
   const formation=expandDeclaredMap({...map,entities:placements},content).filter(p=>p.id.startsWith('start.player.')&&!solid(p));
   return group.every(p=>{
   const d=content.get(p.definition);
   return !placementGeometryError(d,p.position,p.rotation)&&dry(p)&&formation.every(u=>!navigationBodyOverlapsBounds(u.position,content.get(u.definition).dimensions!.radius,bounds(p)))&&[...trees,...starts.filter(solid),...mines.filter(q=>!group.includes(q))].every(q=>!overlaps(p,q))&&map.playerStarts.every(s=>{
    const minimum=resourceCenterSeparation(content.get(content.rules.startingSetup.fort).footprint!,d.footprint!,d.constructionClearance??0,s.rotation??0);
    return Math.abs(s.x-p.position.x)>=minimum.x||Math.abs(s.z-p.position.y)>=minimum.y;
   });
  });
  };
  const options=fixedSites.has(group[0].id.slice(0,group[0].id.lastIndexOf('.')))?candidates.slice(0,1):candidates;
  const found=options.find(delta=>{group.forEach((p,i)=>p.position={x:original[i].x+delta.x,y:original[i].y+delta.y});return fits();});
  if(found){if(found.distance)adjusted.push({id:group[0].id.slice(0,group[0].id.lastIndexOf('.')),distance:found.distance});}
  else{group.forEach((p,i)=>p.position=original[i]);warnings.push(`${group[0].id}: no nearby clear position for the substitute amber site.`);}
 }
 const units:Placement[]=expandDeclaredMap({...map,entities:placements},content).filter(p=>p.id.startsWith('start.player.')&&!solid(p)),solids=[...trees,...mines,...starts.filter(solid)];
 for(const unit of placements.filter(p=>!solid(p))){
  const d=content.get(unit.definition),radius=d.dimensions!.radius,air=d.behaviors.movement?.locomotion==='air',original={...unit.position};
  const fits=()=>{
   const p=unit.position;if(p.x-radius<-.5||p.y-radius<-.5||p.x+radius>=map.size-.5||p.y+radius>=map.size-.5)return false;
   if(!air){
    for(let y=Math.floor(p.y-radius+.5);y<=Math.floor(p.y+radius+.5);y++)for(let x=Math.floor(p.x-radius+.5);x<=Math.floor(p.x+radius+.5);x++)if(Math.round((field.waterAt(x,y)-field.sample(x,y))*100)>WADING_DEPTH_CM)return false;
    if(solids.some(s=>navigationBodyOverlapsBounds(p,radius,bounds(s))))return false;
   }
   return units.every(u=>{const other=content.get(u.definition);return (other.behaviors.movement?.locomotion==='air')!==air||Math.hypot(u.position.x-p.x,u.position.y-p.y)>=radius+other.dimensions!.radius;});
  };
  const found=candidates.find(delta=>{unit.position={x:original.x+delta.x,y:original.y+delta.y};return fits();});
  if(found){if(found.distance)adjusted.push({id:unit.id,distance:found.distance});}
  else{unit.position=original;warnings.push(`${unit.id}: no nearby clear position for the substitute neutral.`);}
  units.push(unit);
 }
 return {map:{...map,entities:placements},adjusted,warnings,clearedTrees};
}
