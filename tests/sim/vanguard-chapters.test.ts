import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import type {Placement} from '../../src/content/schema';
function game(id:string){const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/campaign/${id}.utcmap`,'utf8')))!;return new Game({...map,entities:map.entities.filter(e=>e.definition!=='resource.forest.tree')},[{player:0,kind:'human'}]);}
function advance(g:Game){for(let i=0;i<8;i++){if(g.state.mission)g.state.mission.dialogue=null;g.tick();}expect(g.state.mission?.error).toBeNull();}
const stage=(g:Game)=>g.state.mission?.variables.stage;
function add(g:Game,id:string,definition:string,x=50,y=50){return g.context.create({id,definition,position:{x,y},owner:'player.1',rotation:0} as Placement);}
function kill(g:Game,...ids:string[]){for(const id of ids){const e=g.entities.find(e=>e.placement===id);expect(e,id).toBeDefined();e!.hp=0;}}
it('runs the settlement chapter through economy, recruitment, raid and victory, including a saved raid',()=>{
 const g=game('vanguard-hearth');advance(g);expect(stage(g)).toBe('gather');
 const hall=g.entities.find(e=>e.placement==='mound')!;hall.inventory={'item.amber':100,'item.wood':60};advance(g);expect(stage(g)).toBe('settle');
 add(g,'test-house','building.ants.house');add(g,'test-barracks','building.ants.barracks',60,50);advance(g);expect(stage(g)).toBe('archers');
 add(g,'test-archer-1','unit.ants.archer',75,198);add(g,'test-archer-2','unit.ants.archer',75,200);advance(g);expect(stage(g)).toBe('raid');
 const restored=game('vanguard-hearth');restored.restore(g.snapshot());for(let i=0;i<8;i++){g.tick();restored.tick();}expect(restored.checksum()).toBe(g.checksum());
 kill(g,'raider-one','raider-two','raider-three');advance(g);expect(stage(g)).toBe('outpost');
 kill(g,'gate-ogre','gate-wolf-one','gate-wolf-two');advance(g);expect(g.state.outcome?.winner).toBe('player.1');
});
it('runs the Root expedition through its specialized economy and Hunter counterattack',()=>{
 const g=game('vanguard-root');advance(g);expect(stage(g)).toBe('scout');
 const hero=g.entities.find(e=>e.placement==='marshal')!;hero.x=213;hero.y=84;g.spatial.rebuild();advance(g);expect(stage(g)).toBe('guardians');
 kill(g,'root-ogre','root-wolf-one','root-wolf-two');advance(g);expect(stage(g)).toBe('rootworks');
 const works=add(g,'test-rootworks','building.ants.rootworks',205,67);advance(g);expect(stage(g)).toBe('harvest');
 works.inventory={'item.root':100};advance(g);expect(stage(g)).toBe('upgrade');
 const mound=g.entities.find(e=>e.placement==='mound')!;mound.definition='building.ants.great-mound';advance(g);expect(stage(g)).toBe('hunters');
 add(g,'test-hunter-1','unit.ants.hunter',208,82);add(g,'test-hunter-2','unit.ants.hunter',210,82);advance(g);expect(stage(g)).toBe('defend');
 for(const id of ['counter-ogre','counter-wolf-one','counter-wolf-two','counter-wolf-three'])expect(g.entities.find(e=>e.placement===id)?.unit?.order).toMatchObject({type:'move',attackMove:true});
 kill(g,'counter-ogre','counter-wolf-one','counter-wolf-two','counter-wolf-three');advance(g);expect(g.state.outcome?.winner).toBe('player.1');
});
it.each(['vanguard-hearth','vanguard-root'])('fails %s when its original Mound is lost',(id)=>{const g=game(id);advance(g);kill(g,'mound');advance(g);expect(g.state.outcome?.defeated).toContain('player.1');});
