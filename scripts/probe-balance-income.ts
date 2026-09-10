import {readFileSync} from 'node:fs';
import {parseUtcMap} from '../src/shared/map/utcmap';
import {Game} from '../src/sim/game/game';
import {content} from '../src/content/builtin';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/worldroot-hollow.utcmap','utf8')))!;
const g=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}],content);
let previous:Record<string,number>={};
for(let minute=1;minute<=3;minute++){
 for(let i=0;i<2400;i++)g.tick();
 const bank=g.context.get(g.state.objectives['player.1'])!.inventory;
 const delivered=Object.fromEntries(['item.amber','item.wood'].map(item=>[item,(bank[item]??0)-(previous[item]??content.rules.startingSetup.inventory[item]??0)]));
 previous={...bank};
 console.log(JSON.stringify({minute,delivered,assigned:g.entities.filter(e=>e.owner==='player.1'&&e.unit?.order?.type==='gather').map(e=>e.unit!.order)}));
}
