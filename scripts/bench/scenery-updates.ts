/** CPU-only production scenery synchronization benchmark; no WebGL or files.
 * Run: npx vite-node --config vitest.config.ts scripts/bench/scenery-updates.ts
 * Compare identical publications with/without immutable change hints. */
import {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {PropField} from '../../src/render/prop/propField';
import {PlacedGrass} from '../../src/render/foliage/placedGrass';
import {SceneryLights} from '../../src/render/prop/sceneryLights';
import {HeightField} from '../../src/shared/map/height';
import {SceneryComposition} from '../../src/presentation/sceneryChanges';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import type {MapStamp} from '../../src/shared/map/utcmap';
const base:MapStamp[]=Array.from({length:90000},(_,i)=>({id:`scatter.${i}`,asset:'tuft',x:i%300*1.7,y:Math.floor(i/300)*1.7}));
const trees:MapStamp[]=Array.from({length:10000},(_,i)=>({id:`tree.${i}`,asset:'pine',x:i%100*5,y:Math.floor(i/100)*5}));
const summarise=(values:number[])=>({mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values.toSorted((a,b)=>a-b)[Math.floor(values.length*.95)],max:Math.max(...values)});
async function run(incremental:boolean){
 const scene=new Scene(),field=new PropField(scene,new Map()),internal=field as any,height=new HeightField(512),grass=new PlacedGrass(scene),lights=new SceneryLights(scene),mini=new MinimapSceneryIndex(),composition=new SceneryComposition();
 Object.defineProperty(internal.referenceGround,'ready',{get:()=>Promise.resolve()});
 for(const asset of ['tuft','pine']){const root=new Group();root.add(new Mesh(new BoxGeometry(.2,asset==='pine'?5:.3,.2),new MeshStandardMaterial()));internal.protos.set(asset+'#base',Promise.resolve(root));}
 const timings:Record<string,number[]>={prop:[],grass:[],lights:[],minimap:[],total:[]};
 const sync=async(stamps:readonly MapStamp[],record:boolean)=>{
  const start=performance.now();let t=start;
  const filtered=grass.sync(stamps,height);const grassMs=performance.now()-t;t=performance.now();
  field.sync(filtered);const propMs=performance.now()-t;t=performance.now();
  lights.sync(stamps,height);const lightsMs=performance.now()-t;t=performance.now();
  mini.update(stamps);const minimapMs=performance.now()-t;
  await field.ready();
  if(record){timings.prop.push(propMs);timings.grass.push(grassMs);timings.lights.push(lightsMs);timings.minimap.push(minimapMs);timings.total.push(performance.now()-start);}
 };
 let remaining=trees;
 await sync(incremental?composition.compose(base,remaining):[...base,...remaining],false);
 for(let i=0;i<30;i++){
  remaining=remaining.filter(s=>s!==trees[i*271]);
  const stamps=incremental?composition.compose(base,remaining):[...base,...remaining];
  await sync(stamps,i>=5);
 }
 const ids=[...internal.placed.keys()].sort(),miniIds=mini.items.map(item=>item.stamp.id);
 const result={timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summarise(v)])),props:ids.length,miniItems:miniIds.length};
 field.destroy();grass.destroy();lights.dispose();return {result,ids,miniIds};
}
const full=await run(false),incremental=await run(true);
if(JSON.stringify(full.ids)!==JSON.stringify(incremental.ids)||JSON.stringify(full.miniIds)!==JSON.stringify(incremental.miniIds))throw Error('Harvested scenery diverged');
console.log(JSON.stringify({full:full.result,incremental:incremental.result,identical:true},null,2));
