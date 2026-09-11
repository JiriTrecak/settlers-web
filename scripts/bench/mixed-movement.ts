/** Mixed-speed transit and replacement orders, with real declarations and collision. */
import {game,placed} from '../../tests/game/helpers';
import {precise} from '../../src/sim/game/motion';
const roles=['hunter','warrior','marshal','archer','bombardier','bombardier'];
const maxTicks=Number(process.argv.find(a=>a.startsWith('--ticks='))?.split('=')[1]??2400);
if(!Number.isInteger(maxTicks)||maxTicks<1||maxTicks>12000)throw new Error('Invalid --ticks');
for(const count of [12,24])for(const gap of [0,1,3])for(const reverse of [false,true]){
 const placements=Array.from({length:count},(_,i)=>({...placed(`mixed-${i}`,`unit.ants.${roles[i%6]}`,110+i%6,122+Math.floor(i/6)),rotation:90}));
 const g=game(placements),army=g.entities.filter(e=>e.placement?.startsWith('mixed-'));
 if(gap)for(let y=0;y<256;y++)if(y<123||y>=123+gap)g.spatial.terrain[y*256+128]=0;
 const command=(destination:{x:number;y:number})=>g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination});
 command({x:143,y:124});let elapsed=0,phaseStart=0,maxTickMs=0;
 const first=new Map<number,number>(),arrived=new Map<number,number>(),lastMoved=new Map<number,number>(),maxStall=new Map<number,number>();
 const started=performance.now();
 for(;elapsed<maxTicks;elapsed++){
  if(reverse&&elapsed===100){command({x:103,y:124});first.clear();arrived.clear();lastMoved.clear();phaseStart=elapsed;}
  const before=army.map(e=>precise(e)),t=performance.now();g.tick();maxTickMs=Math.max(maxTickMs,performance.now()-t);
  for(const [i,e] of army.entries()){
   const p=precise(e);if(Math.hypot(p.x-before[i].x,p.y-before[i].y)>.0001){
    if(!first.has(e.id))first.set(e.id,elapsed-phaseStart+1);
    lastMoved.set(e.id,g.state.tick);
   }
   if(!e.unit!.order){if(!arrived.has(e.id))arrived.set(e.id,elapsed-phaseStart+1);}
   else maxStall.set(e.id,Math.max(maxStall.get(e.id)??0,g.state.tick-(lastMoved.get(e.id)??phaseStart)));
  }
  if(arrived.size===count&&(!reverse||elapsed>=100)){elapsed++;break;}
 }
 console.log(JSON.stringify({count,gap,reverse,ticks:elapsed,arrived:arrived.size,firstMoveMaxTicks:Math.max(...first.values()),maxStallTicks:Math.max(...maxStall.values()),cpuMs:Math.round(performance.now()-started),maxTickMs:Math.round(maxTickMs*10)/10,checksum:g.checksum(),unfinished:army.filter(e=>e.unit!.order).map(e=>({id:e.id,definition:e.definition,position:precise(e),goal:e.unit!.goal,route:e.unit!.route,detour:e.unit!.detour}))}));
}
