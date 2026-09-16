import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placed} from '../game/helpers';

function fixture(script:string){
 return {...emptyUtcMap(),entities:[placed('hero','unit.ants.marshal',60,60),placed('guard','unit.ants.warrior',63,60)],mission:{campaign:'test',title:'Recovery checkpoint',order:1,regions:[],script}};
}
it('recovers current health and mana without replenishing charges, resetting cooldowns or reviving losses',()=>{
 const g=new Game(fixture('function on_start() end function on_tick() if not mission.get("rested") then mission.recover("hero"); mission.recover("guard"); mission.set("rested",true) end end'),[{player:0,kind:'human'}]);
 g.tick();const hero=g.entities.find(e=>e.placement==='hero')!,guard=g.entities.find(e=>e.placement==='guard')!;
 hero.hp=25;hero.spellcasting!.mana=0;hero.spellcasting!.learned['spell.marshal.faultline']=1;hero.spellcasting!.cooldowns['spell.marshal.faultline']=500;
 hero.equipment![0]='item.trailkeeper-flask';hero.equipmentState=hero.equipment!.map((_,i)=>i===0?{charges:1,readyTick:300,hits:0}:null);
 guard.hp=0;
 const copy=new Game(g.map,g.slots);copy.restore(g.snapshot());
 for(let i=0;i<4;i++){g.tick();copy.tick();}
 expect(g.state.mission?.error).toBeNull();expect(g.checksum()).toBe(copy.checksum());
 expect(hero.hp).toBe(g.context.stats(hero).maxHp);expect(hero.spellcasting!.mana).toBe(g.context.stats(hero).maxMana);
 expect(hero.spellcasting!.cooldowns['spell.marshal.faultline']).toBe(500);
 expect(hero.equipmentState![0]).toEqual({charges:1,readyTick:300,hits:0});
 expect(g.entities.some(e=>e.placement==='guard'&&e.hp!>0)).toBe(false);
 hero.hp=100;for(let i=0;i<8;i++)g.tick();expect(hero.hp).toBeLessThan(g.context.stats(hero).maxHp);
});
it('discards recovery if the same script callback fails validation',()=>{
 const g=new Game(fixture('function on_start() end function on_tick() mission.recover("hero");mission.recover("missing") end'),[{player:0,kind:'human'}]);
 g.tick();const hero=g.entities.find(e=>e.placement==='hero')!;hero.hp=25;hero.spellcasting!.mana=0;
 for(let i=0;i<4;i++)g.tick();expect(g.state.mission?.error).toContain('Unknown entity ID');expect(hero.hp).toBeLessThan(30);expect(hero.spellcasting!.mana).toBeLessThan(5);
});
