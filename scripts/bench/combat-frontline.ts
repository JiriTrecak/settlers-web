/** Headless mixed armies using actual commands, fog, movement and combat. */
import {game,placed} from '../../tests/game/helpers';
import {precise} from '../../src/sim/game/motion';
import {writeFileSync} from 'node:fs';
import {inspectTraffic} from './traffic-report';

const ticks=Number(process.argv.find(a=>a.startsWith('--ticks='))?.split('=')[1]??4800);
if(!Number.isInteger(ticks)||ticks<1||ticks>12000)throw new Error('Invalid --ticks');
const report=process.argv.find(a=>a.startsWith('--report='))?.slice('--report='.length),reports:unknown[]=[];
for(const size of [12,24])for(const advanced of [false,true])for(const gap of [0,3]){
  const roles=advanced?['marshal','warrior','hunter','archer','bombardier','warrior']:['warrior','warrior','archer'];
  const placements=[];
  for(const side of [0,1])for(let i=0;i<size;i++){
    const p=placed(`${side}.${i}`,`unit.ants.${roles[i%roles.length]}`,side?135+i%4:121-i%4,122+Math.floor(i/4)*2);
    p.owner=side?'player.2':'player.1';p.rotation=side?270:90;placements.push(p);
  }
  const g=game(placements),actors=g.entities.filter(e=>e.placement?.match(/^[01]\./));
  if(gap)for(let y=0;y<256;y++)if(y<125||y>=125+gap)g.spatial.terrain[y*256+128]=0;
  for(const side of [0,1])g.command(side?'player.2':'player.1',{
    type:'move',actors:actors.filter(e=>e.owner===(side?'player.2':'player.1')).map(e=>e.id),
    destination:{x:side?116:140,y:126},attackMove:true,
  });
  const firstStrike=new Map<number,number>(),lastStrike=new Map<number,number>();
  let attacks=0,nearbyIgnored=0,elapsed=0;
  const start=performance.now();
  for(;elapsed<ticks;elapsed++){
    g.tick();
    const live=actors.filter(e=>e.hp!>0);
    for(const e of live){
      const u=e.unit!,attack=u.attack;
      if(attack&&lastStrike.get(e.id)!==attack.started){
        firstStrike.set(e.id,firstStrike.get(e.id)??g.state.tick);lastStrike.set(e.id,attack.started);attacks++;
      }
      if(g.state.tick%8!==e.id%8||attack)continue;
      const range=g.context.def(e).behaviors.combat!.range,target=g.context.get(u.target);
      if(target&&g.spatial.range(e,target)>range**2&&live.some(t=>g.combat.hostile(e,t)&&g.observation.visible(e.owner,t)&&g.spatial.range(e,t)<=range**2))nearbyIgnored++;
    }
    if(new Set(live.map(e=>e.owner)).size<2){elapsed++;break;}
  }
  const result={size,advanced,gap,ticks:elapsed,attacks,participants:firstStrike.size,nearbyIgnored,
    survivors:[actors.filter(e=>e.owner==='player.1'&&e.hp!>0).length,actors.filter(e=>e.owner==='player.2'&&e.hp!>0).length],
    health:actors.reduce((sum,e)=>sum+Math.max(0,e.hp!),0),
    positions:actors.filter(e=>e.hp!>0).slice(0,2).map(e=>precise(e)),
    cpuMs:Math.round(performance.now()-start),checksum:g.checksum()};
  console.log(JSON.stringify(result));
  if(report){
    const live=actors.filter(e=>e.hp!>0);
    reports.push({...result,traffic:inspectTraffic(g,live),units:live.map(e=>{
      const target=g.context.get(e.unit!.target);
      return {id:e.id,name:e.placement,definition:e.definition,hp:e.hp,order:e.unit!.order,target:target?.id,
        range:target?Math.sqrt(g.spatial.range(e,target)):null,weaponRange:g.context.def(e).behaviors.combat!.range,
        visible:target?g.observation.visible(e.owner,target):null,attack:e.unit!.attack,cooldown:e.unit!.cooldown,
        lastStrike:lastStrike.get(e.id),pursuit:e.unit!.pursuit};
    })});
  }
}
if(report)writeFileSync(report,JSON.stringify(reports,null,2)+'\n');
