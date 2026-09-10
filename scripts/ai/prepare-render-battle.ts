/** Diagnostic save only: add two native T2 squads without changing authored maps. */
import {readFileSync,writeFileSync} from 'node:fs';
import {World} from '../../src/sim/world/world';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {slotOwner} from '../../src/content/schema';
const [input,output,mapFile]=process.argv.slice(2);
if(!input||!output||!mapFile)throw Error('Usage: prepare-render-battle input-save output-save authored-map');
const save=JSON.parse(readFileSync(input,'utf8'));
const map=parseUtcMap(JSON.parse(readFileSync(mapFile,'utf8')));
if(!map)throw Error('Invalid map');
const world=new World({map,slots:save.world.slots,seed:save.seed});world.restore(save.world);
const game=world.settlement,squads=[];
for(let side=0;side<2;side++){
 const owner=slotOwner(side),cx=side?144:126,cells=[];
 for(let y=116;y<=140;y++)for(let x=cx-6;x<=cx+6;x++){const i=y*map.size+x;if(game.context.spatial.walkable(i)&&!game.context.spatial.occupied[i]&&!game.context.spatial.resources[i])cells.push({x,y})}
 cells.sort((a,b)=>(a.x-cx)**2+(a.y-128)**2-((b.x-cx)**2+(b.y-128)**2)||a.y-b.y||a.x-b.x);
 if(cells.length<16)throw Error('Not enough formation space');
 const actors=[];
 for(let i=0;i<16;i++)actors.push(game.context.create({id:'',definition:`unit.ants.${i<6?'hunter':i<12?'warrior':'bombardier'}`,owner,position:cells[i],rotation:side?270:90}).id);
 squads.push({owner,actors});game.context.spatial.rebuild();
}
game.observation.update();
for(const s of squads){const result=game.command(s.owner,{type:'move',actors:s.actors,destination:{x:s.owner==='player.1'?144:126,y:128},attackMove:true});if(!result.accepted)throw Error(result.reason)}
save.world=world.snapshot();
const verify=new World({map,slots:save.world.slots,seed:save.seed});verify.restore(save.world);
writeFileSync(output,JSON.stringify(save));
console.log(JSON.stringify({tick:save.world.tick,squads,output}));
