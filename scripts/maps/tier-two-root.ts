/** Add finite Root beside existing contested camps, preserving authored terrain and camp rosters. */
import {readFileSync,writeFileSync} from 'node:fs';
import {content} from '../../src/content/builtin';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
const plans=[
 ['assets/maps/skirmish/worldroot-hollow.utcmap',['worldroot.camp.4','worldroot.camp.7']],
 ['assets/maps/skirmish/crownmere-basin.utcmap',['camp.100.38','camp.156.218']],
 ['assets/maps/skirmish/amberfall-wilds.utcmap',['camp.17','camp.18']],
 ['assets/maps/showcase/mosswater-divide.utcmap',['camp-camp-ogre-103-145-0','camp-camp-ogre-103-145-1']],
 ['assets/maps/tutorial/mosswater-divide.utcmap',['camp-camp-ogre-103-145-0','camp-camp-ogre-103-145-1']],
] as const;
const report:unknown[]=[];
for(const [file,ids] of plans){
 const raw=JSON.parse(readFileSync(file,'utf8'));raw.entities=raw.entities.filter((e:any)=>!e.id.startsWith('tier2.root.'));
 for(const [index,id] of ids.entries()){
  const map=parseUtcMap(raw)!;const g=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}],content),camp=map.camps.find(c=>c.id===id)!;
  const sp=g.spatial;
  const free=(x:number,y:number,r:number)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(x+dx<1||y+dy<1||x+dx>=map.size-1||y+dy>=map.size-1||!sp.walkable(sp.cell({x:x+dx,y:y+dy}))||g.entities.some(e=>e.unit&&e.x===x+dx&&e.y===y+dy))return false;return true;};
  let found:{x:number,y:number,dropoff:{x:number,y:number}}|undefined;
  const options=[];for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++)if(Math.hypot(dx,dy)>=5&&Math.hypot(dx,dy)<=12)options.push({x:camp.home.x+dx,y:camp.home.y+dy});
  options.sort((a,b)=>Math.hypot(a.x-camp.home.x,a.y-camp.home.y)-Math.hypot(b.x-camp.home.x,b.y-camp.home.y));
  for(const p of options){
   if(!free(p.x,p.y,3)||map.playerStarts.some(s=>Math.hypot(p.x-s.x,p.y-s.z)<40))continue;
   for(const [dx,dy] of [[9,0],[-9,0],[0,9],[0,-9]]){
    const dropoff={x:p.x+dx,y:p.y+dy};if(!free(dropoff.x,dropoff.y,4))continue;
    const heights=sp.footprint({definition:'building.ants.rootworks',...dropoff,rotation:0}).map(i=>sp.heights[i]);if(Math.max(...heights)-Math.min(...heights)>100)continue;
    if(map.playerStarts.some(s=>sp.navigation.path(sp.cell({x:s.x,y:s.z+8}),sp.cell({x:p.x,y:p.y+3}))===null))continue;
    found={...p,dropoff};break;
   }if(found)break;
  }
  if(!found)throw new Error(`No accessible clearing near ${id}`);
  raw.entities.push({id:`tier2.root.${index+1}`,definition:'building.neutral.corrupted-root',position:{x:found.x,y:found.y},rotation:0,owner:'none',initialState:{amount:3000}});
  // Clear decorative stamps from the deposit and reserved construction pad, never terrain or gameplay entities.
  raw.stamps=raw.stamps.filter((s:any)=>!(Math.abs(s.x-found!.x)<=4&&Math.abs(s.y-found!.y)<=4)&&!(Math.abs(s.x-found!.dropoff.x)<=4&&Math.abs(s.y-found!.dropoff.y)<=4));
  report.push({file,camp:id,deposit:{x:found.x,y:found.y},rootworks:found.dropoff});
 }
 const map=parseUtcMap(raw)!;const error=playableMapError(map);if(error)throw new Error(`${file}: ${error}`);
 writeFileSync(file,JSON.stringify(raw)+'\n');
}
writeFileSync('scripts/maps/tier-two-root-sites.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
