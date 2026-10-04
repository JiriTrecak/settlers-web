/** CPU-only draw-group synchronization. Run with vite-node --config vitest.config.ts. */
import {Scene,Group,BoxGeometry,MeshStandardMaterial,InstancedMesh} from 'three';
import {VisibleSceneryDraws} from '../../src/render/prop/visibleDraws';
const scene=new Scene(),root=new Group();scene.add(root);
const materials=Array.from({length:261},()=>new MeshStandardMaterial()),geometry=new BoxGeometry();
const batches=Array.from({length:10600},(_,i)=>{const mesh=new InstancedMesh(geometry,materials[i%materials.length],12);mesh.count=8;return mesh;});
const draws=new VisibleSceneryDraws(scene,root),samples:number[]=[];
for(let i=0;i<60;i++){
 // A harvest changes instance count; draw-state identity stays unchanged.
 batches[i*97].count=7;
 const start=performance.now();draws.sync(batches);const ms=performance.now()-start;
 if(i>=10)samples.push(ms);
 if(draws.count!==261)throw Error('Unexpected draw grouping');
}
const sorted=samples.toSorted((a,b)=>a-b);
console.log(JSON.stringify({batches:batches.length,groups:draws.count,samples:samples.length,mean:samples.reduce((a,b)=>a+b,0)/samples.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...samples)}));
draws.dispose();batches.forEach(b=>b.dispose());materials.forEach(m=>m.dispose());geometry.dispose();
