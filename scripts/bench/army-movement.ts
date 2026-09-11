/** Ordinary orders on open terrain; records response, transit and unnecessary travel. */
import {game,placed} from '../../tests/game/helpers';
import {precise} from '../../src/sim/game/motion';
const maxTicks=1600;
for(const count of [12,24,48])for(const offset of [{x:6,y:0},{x:24,y:0},{x:0,y:24},{x:17,y:17},{x:-24,y:0}])for(const reverse of [false,true]){
 const width=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/width);
 const actors=Array.from({length:count},(_,i)=>placed(`army-${String(i).padStart(2,'0')}`,'unit.ants.warrior',120+i%width,120+Math.floor(i/width)));
 for(const p of actors)p.rotation=90;
 const g=game(actors),army=g.entities.filter(e=>e.placement?.startsWith('army-'));
 const center={x:120+Math.floor(width/2),y:120+Math.floor(rows/2)};
 const destination={x:center.x+offset.x,y:center.y+offset.y};
 const commandCosts:number[]=[];
 const command=(p:typeof destination)=>{const t=performance.now();const receipt=g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination:p});commandCosts.push(performance.now()-t);return receipt;};
 command(destination);
 const first=new Map<number,number>(),arrival=new Map<number,number>(),travel=new Map<number,number>();
 let elapsed=0,phaseStart=0,maxTickMs=0;
 const started=performance.now();
 for(;elapsed<maxTicks;elapsed++){
  if(reverse&&elapsed===40){command({x:center.x-offset.x,y:center.y-offset.y});first.clear();arrival.clear();phaseStart=elapsed;}
  const before=army.map(e=>precise(e)),t=performance.now();g.tick();maxTickMs=Math.max(maxTickMs,performance.now()-t);
  army.forEach((e,i)=>{
   const p=precise(e),distance=Math.hypot(p.x-before[i].x,p.y-before[i].y);
   travel.set(e.id,(travel.get(e.id)??0)+distance);
   if(distance>.0001&&!first.has(e.id))first.set(e.id,elapsed-phaseStart+1);
   if(!e.unit!.order&&!arrival.has(e.id))arrival.set(e.id,elapsed-phaseStart+1);
  });
  if(arrival.size===count&&(!reverse||elapsed>=40)){elapsed++;break;}
 }
 const values=[...arrival.values()].sort((a,b)=>a-b);
 console.log(JSON.stringify({count,offset,reverse,ticks:elapsed,arrived:arrival.size,firstMoveMaxTicks:Math.max(...first.values()),medianArrivalTicks:values[Math.floor(values.length/2)],lastArrivalTicks:values.at(-1),meanTravel:Number(([...travel.values()].reduce((a,b)=>a+b,0)/count).toFixed(2)),cpuMs:Math.round(performance.now()-started),commandMaxMs:Math.round(Math.max(...commandCosts)*100)/100,maxTickMs:Math.round(maxTickMs*10)/10,checksum:g.checksum()}));
}
