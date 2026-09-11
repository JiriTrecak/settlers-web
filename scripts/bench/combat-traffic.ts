import {writeFileSync} from 'node:fs';
import {TrafficRecoveryTrace} from './traffic-recovery';
import {inspectTraffic} from './traffic-report';
/** Isolated deterministic traffic fixture; never opens or changes a user map. */
import {game,placed} from '../../tests/game/helpers';
import {precise} from '../../src/sim/game/motion';

function option(name:string,fallback:number[],limit:number,minimum=1){
 const raw=process.argv.find(a=>a.startsWith(`--${name}=`));
 const values=raw?raw.slice(name.length+3).split(',').map(Number):fallback;
 if(values.some(v=>!Number.isInteger(v)||v<minimum||v>limit))throw new Error(`Invalid --${name}`);
 return values;
}
const reportPath=process.argv.find(a=>a.startsWith('--report='))?.slice('--report='.length);
const reports:unknown[]=[];
const mixed=process.argv.includes('--mixed');
const definition=(i:number)=>mixed?`unit.ants.${['hunter','warrior','marshal','archer','bombardier','bombardier'][i%6]}`:'unit.ants.warrior';
const gaps=option('gaps',[1,2,3,5],8),counts=option('units',[8,24,48],96),[ticks]=option('ticks',[1600],12000);
const rotations=option('rotations',[0],3,0);
const opponents=process.argv.some(a=>a.startsWith('--opponents='))?option('opponents',[8],96)[0]:null;
for(const rotation of rotations)for(const gap of gaps)for(const count of counts){
 const turn=(p:{x:number;y:number},n=rotation)=>{let {x,y}=p;for(let i=0;i<n;i++)[x,y]=[255-y,x];return {x,y};};
 const canonical=(e:Parameters<typeof precise>[0])=>turn(precise(e),(4-rotation)%4);
 const opposingCount=opponents??count;
 const placements=[];
 for(let i=0;i<Math.max(count,opposingCount);i++){
  if(i<count)placements.push(placed(`left-${i}`,definition(i),106+i%6,118+Math.floor(i/6)));
  if(i<opposingCount)placements.push(placed(`right-${i}`,definition(i),145+i%6,118+Math.floor(i/6)));
 }
 for(const p of placements)p.position=turn(p.position);
 const g=game(placements);
 for(let y=0;y<256;y++)if(y<121||y>=121+gap)g.spatial.terrain[g.spatial.cell(turn({x:128,y}))]=0;
 const left=g.entities.filter(e=>e.placement?.startsWith('left-')),right=g.entities.filter(e=>e.placement?.startsWith('right-'));
 g.command('player.1',{type:'move',actors:left.map(e=>e.id),destination:turn({x:148,y:121})});
 g.command('player.1',{type:'move',actors:right.map(e=>e.id),destination:turn({x:108,y:121})});
 const progress:{tick:number;east:number;west:number}[]=[];
 const recovery=reportPath?new TrafficRecoveryTrace(g,[...left,...right]):null;
 recovery?.sample();
 const start=performance.now();let maxTickMs=0;
 for(let i=0;i<ticks;i++){const before=performance.now();g.tick();recovery?.sample();maxTickMs=Math.max(maxTickMs,performance.now()-before);if(reportPath&&(i+1)%40===0)progress.push({tick:i+1,east:left.filter(e=>canonical(e).x>130).length,west:right.filter(e=>canonical(e).x<126).length});}
 if(reportPath)reports.push({rotation,gap,unitsPerSide:count,opposingCount,ticks,progress,recovery:recovery?.report(),diagnosis:inspectTraffic(g,[...left,...right])});
 console.log(JSON.stringify({mixed,rotation,gap,unitsPerSide:count,opposingCount,ticks,arrived:left.concat(right).filter(e=>!e.unit!.route.length&&!e.unit!.order&&e.unit!.goal===null).length,east:left.filter(e=>canonical(e).x>130).length,west:right.filter(e=>canonical(e).x<126).length,elapsedMs:Math.round(performance.now()-start),maxTickMs:Math.round(maxTickMs*10)/10,checksum:g.checksum()}));
}

if(reportPath)writeFileSync(reportPath,JSON.stringify(reports,null,2)+'\n');
