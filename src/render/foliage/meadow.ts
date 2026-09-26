import type {Scene,Camera} from 'three';
import {ImportedGrass,type NativeGrass} from './importedGrass';
import type {HeightField} from '../../shared/map/height';
import {sampleCurve,type Landscape} from '../../shared/landscape/curve';
import {CurveIndex} from '../../shared/landscape/curveIndex';
import {cellRandom,patchNoise} from '../../shared/authoring/shapes';
/** The brush and imported instances now share source meshes, lighting and wind. */
export class Meadow{
 private grass?:ImportedGrass;
 count=0;
 constructor(private readonly scene:Scene){}
 get ready(){return this.grass?.ready??Promise.resolve();}
 updateLOD(_camera:Camera){} // Ten-triangle clumps; sector batches provide culling.
 updateGround(field:HeightField){this.grass?.updateGround(field);}
 tick(now:number){this.grass?.tick(now);}
 rebuild(field:HeightField,landscape:Landscape){
  this.grass?.dispose();this.grass=undefined;this.count=0;
  if(landscape.importedTerrain){this.grass=new ImportedGrass(this.scene,landscape.importedTerrain);return;}
  const groups:NativeGrass['groups']=['reference-grass-low','reference-grass-messy','reference-grass-daisy'].map(asset=>({asset,instances:[]}));
  const paint=landscape.strokes.filter(s=>s.layer!=='grass').map(s=>({s,curve:new CurveIndex(sampleCurve(s.points,s.radius,1))}));
  const occupied=new Set<string>();let candidates=0;
  for(const p of landscape.cover){
   if(p.density===0)continue;
   const step=.85/Math.sqrt(p.density);
   for(let iz=Math.floor((p.z-p.radius)/step);iz<=Math.ceil((p.z+p.radius)/step);iz++)for(let ix=Math.floor((p.x-p.radius)/step);ix<=Math.ceil((p.x+p.radius)/step);ix++){
    if(++candidates>2000000)break;
    const rand=(c:number)=>cellRandom(p.seed,'cover',ix,iz,c),x=(ix+.5+(rand(0)-.5)*.8)*step,z=(iz+.5+(rand(1)-.5)*.8)*step;
    const edge=1-Math.hypot(x-p.x,z-p.z)/p.radius;if(edge<=0||field.sample(x,z)<field.waterAt(x,z)+.15)continue;
    if(rand(2)>Math.min(1,edge*5)*(.2+.8*patchNoise(p.seed,'cover',x,z,6)))continue;
    if(p.exclusions?.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius)||paint.some(({s,curve})=>curve.distance(x,z)<1&&s.opacity>.4))continue;
    const key=Math.floor(x*4)+':'+Math.floor(z*4);if(occupied.has(key)||this.count>=90000)continue;occupied.add(key);
    groups[rand(3)<p.flowers?2:rand(4)<.65?0:1]!.instances.push({x,z,yaw:rand(5)*Math.PI*2,scale:(p.grassScale??1)*(.7+rand(6)*.5)});this.count++;
   }
  }
  if(this.count)this.grass=new ImportedGrass(this.scene,{field,groups:groups.filter(g=>g.instances.length)});
 }
 destroy(){this.grass?.dispose();}
}
