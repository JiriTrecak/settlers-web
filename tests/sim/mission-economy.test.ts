import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {testContent} from '../fixtures/content';
import {snapPlacement} from '../../src/shared/spatial/placement';
import type {Placement} from '../../src/content/schema';
const placement=(id:string,definition:string,x:number,y:number,inventory:Record<string,number>={}):Placement=>({id,definition,owner:'player.1',position:snapPlacement(testContent.get(definition),{x,y}),rotation:0,...(Object.keys(inventory).length?{initialState:{inventory}}:{})});
function fixture(script:string){
 return {...emptyUtcMap(),playerStarts:[{player:1,x:40,z:40,setup:'setup.ants',mainFort:'hall'}],
 entities:[placement('hall','building.test.fort',40,40,{'item.test.amber':100,'item.test.wood':40}),placement('rootworks','building.test.rootworks',70,70,{'item.test.root':80}),placement('hero','unit.test.marshal',55,45)],
 mission:{campaign:'test',title:'Economy queries',order:1,regions:[],script}};
}
it('counts completed buildings and wallet currencies without counting foundations or cargo',()=>{
 const g=new Game(fixture('function on_start() end function on_tick() mission.set("halls",mission.count("player.1","building.test.fort")); mission.set("amber",mission.stock("player.1","item.test.amber")); mission.set("root",mission.stock("player.1","item.test.root")) end'),[{player:0,kind:'human'}],testContent);
 g.context.create(placement('foundation','building.test.fort',90,90,{'item.test.amber':500}),false);
 const worker=g.context.create(placement('worker','unit.test.settler',55,50));worker.unit!.cargo={item:'item.test.amber',amount:10};
 for(let i=0;i<4;i++)g.tick();expect(g.state.mission?.error).toBeNull();expect(g.state.mission?.variables).toMatchObject({halls:1,amber:100,root:80});
 const restored=new Game(g.map,[{player:0,kind:'human'}],testContent);restored.restore(g.snapshot());for(let i=0;i<8;i++){g.tick();restored.tick();}expect(restored.checksum()).toBe(g.checksum());
});
it('rejects invalid query definitions atomically instead of silently completing objectives',()=>{
 const g=new Game(fixture('function on_start() mission.set("before",true); mission.stock("player.1","unit.test.warrior") end'),[{player:0,kind:'human'}],testContent);g.tick();expect(g.state.mission?.error).toContain('currency');expect(g.state.mission?.variables).toEqual({});
});
