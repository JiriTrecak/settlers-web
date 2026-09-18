/** Isolated mission-trigger tests. Real travel/combat is covered by scripts/qa/briarwatch-playthrough.ts. */
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const source=parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-briarwatch.utcmap','utf8')))!;
function fixture(){
 const map={...structuredClone(source),entities:source.entities.filter(e=>e.definition!=='resource.forest.tree')};
 const g=new Game(map,[{player:0,kind:'human'}]);g.tick();const m=g.state.mission!;
 m.dialogue=null;m.scene=null;m.variables.stage='road';return g;
}
const actor=(g:Game,tag:string)=>g.entities.find(e=>e.placement===tag)!;
function advance(g:Game,n=4){for(let i=0;i<n;i++)g.tick();expect(g.state.mission?.error).toBeNull();}
function moveFixture(g:Game,tag:string,x:number,y:number){const e=actor(g,tag);e.x=x;e.y=y;e.unit!.position={x:x*1000,y:y*1000};e.unit!.order=null;e.unit!.route=[];g.context.reindex();g.spatial.rebuild();g.observation.update();}
function freeChild(g:Game){const p=g.map.entities.find(e=>e.id==='youngling')!;const e=g.context.create(p);g.state.mission!.spawned.push(p.id);g.state.mission!.variables['youngling-free']=true;return e;}
it('fails the mission when its hero dies and restarts with the original company',()=>{
 const g=fixture();actor(g,'marshal').hp=0;advance(g);expect(g.state.outcome?.defeated).toContain('player.1');
 const fresh=fixture();expect(fresh.state.outcome).toBeNull();expect(fresh.entities.filter(e=>e.owner==='player.1'&&e.unit)).toHaveLength(5);expect(actor(fresh,'marshal').equipment).toEqual([null,null,null,null]);
});
it('fails the rescue promptly if the caretaker dies before the cage is opened',()=>{
 const g=fixture(),m=g.state.mission!;m.variables['rescue-started']=true;m.objectiveStates.rescue='active';g.economy.remove(actor(g,'caretaker'));advance(g);
 expect(g.state.mission?.objectiveStates.rescue).toBe('failed');expect(g.state.outcome).toBeNull();
});
it('fails the escort if the rescued youngling dies without ending the mission',()=>{
 const g=fixture(),m=g.state.mission!;m.variables['rescue-started']=true;m.objectiveStates.rescue='active';freeChild(g).hp=0;advance(g);
 expect(g.state.mission?.objectiveStates.rescue).toBe('failed');expect(g.state.outcome).toBeNull();
});
it('keeps a full-inventory rescue reward pending across reload, then grants it once',()=>{
 const g=fixture(),m=g.state.mission!,hero=actor(g,'marshal');m.variables['rescue-started']=true;m.variables.volunteers=true;m.objectiveStates.rescue='active';freeChild(g);
 moveFixture(g,'marshal',49,139);moveFixture(g,'youngling',47,139);hero.equipment=Array(4).fill('item.barkguard');advance(g);
 expect(g.state.mission?.objectiveStates.rescue).toBe('active');expect(g.state.mission?.variables['rescue-full']).toBe(true);
 const restored=new Game(g.map,g.slots);restored.restore(g.snapshot());actor(restored,'marshal').equipment![0]=null;
 advance(restored,240);expect(restored.state.mission?.objectiveStates.rescue).toBe('completed');expect(actor(restored,'marshal').equipment!.filter(i=>i==='item.briar-rescue-ring')).toHaveLength(1);
 advance(restored,320);expect(actor(restored,'marshal').equipment!.filter(i=>i==='item.briar-rescue-ring')).toHaveLength(1);
});
it('requires physical ledger possession and returns it only once, including after reload',()=>{
 const g=fixture(),m=g.state.mission!;m.variables['ledger-started']=true;m.objectiveStates.ledger='active';moveFixture(g,'marshal',128,173);advance(g);
 expect(g.state.mission?.objectiveStates.ledger).toBe('active');actor(g,'marshal').equipment![0]='item.briar-ledger';advance(g);
 expect(g.state.mission?.objectiveStates.ledger).toBe('completed');expect(actor(g,'marshal').equipment).not.toContain('item.briar-ledger');expect(g.entities.filter(e=>e.placement==='merchant-reward')).toHaveLength(1);
 const b=new Game(g.map,g.slots);b.restore(g.snapshot());advance(b,600);expect(b.entities.filter(e=>e.placement==='merchant-reward')).toHaveLength(1);
});
it('fails a stolen-ledger quest if its merchant is killed',()=>{
 const g=fixture();g.state.mission!.variables['ledger-started']=true;g.state.mission!.objectiveStates.ledger='active';g.economy.remove(actor(g,'merchant'));advance(g);
 expect(g.state.mission?.objectiveStates.ledger).toBe('failed');expect(g.state.outcome).toBeNull();
});
it('restores an in-progress opening cinematic without changing its timeline',()=>{
 const a=new Game(source,[{player:0,kind:'human'}]);advance(a,80);const b=new Game(source,a.slots);b.restore(a.snapshot());
 for(let i=0;i<620;i++){a.tick();b.tick();}expect(b.checksum()).toBe(a.checksum());expect(a.state.mission?.variables.stage).toBe('road');
});
it('does not turn a dropped ledger into quest credit until it is picked up again',()=>{
 const g=fixture(),m=g.state.mission!,hero=actor(g,'marshal');m.variables['ledger-started']=true;m.objectiveStates.ledger='active';moveFixture(g,'marshal',127,174);hero.equipment![0]='item.briar-ledger';
 expect(g.command('player.1',{type:'dropItem',actor:hero.id,slot:0}).accepted).toBe(true);advance(g);expect(g.state.mission?.objectiveStates.ledger).toBe('active');
 const ledger=g.entities.find(e=>e.definition==='item.briar-ledger'&&e.item)!;expect(ledger).toBeTruthy();
 expect(g.command('player.1',{type:'pickup',actor:hero.id,target:ledger.id}).accepted).toBe(true);advance(g,120);
 expect(g.state.mission?.objectiveStates.ledger).toBe('completed');expect(g.entities.filter(e=>e.placement==='merchant-reward')).toHaveLength(1);
});
it('recruits only surviving town defenders',()=>{
 const g=fixture();g.state.mission!.variables.town=true;g.economy.remove(actor(g,'defender-1'));moveFixture(g,'marshal',157,102);advance(g);
 expect(actor(g,'defender-0').owner).toBe('player.1');expect(actor(g,'defender-2').owner).toBe('player.1');expect(actor(g,'defender-1')).toBeUndefined();
});
