import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {validatePlacements} from '../../src/content/map';
import {content} from '../../src/content/builtin';
import type {Placement} from '../../src/content/schema';
function map(experience:number,definition='unit.ants.marshal',health?:number){
 const hero:Placement={id:'marshal',definition,position:{x:40,y:40},owner:'player.1',rotation:0,initialState:{experience,...(health===undefined?{}:{health})}};
 return {...emptyUtcMap(),entities:[hero],playerStarts:[{player:1,x:40,z:40,setup:'setup.ants',mainFort:'marshal'}],mission:{campaign:'test',title:'Starting level',order:1,heroLevelCap:4,regions:[],script:'function on_start() end'}};
}
it('starts an authored level-four hero with level-four health, mana and available skill points, and survives saves',()=>{
 const m=map(450);validatePlacements(m,content);const g=new Game(m,[{player:0,kind:'human'}]),hero=g.entities[0];
 expect(g.context.stats(hero).level).toBe(4);expect(hero.hp).toBe(925);expect(hero.spellcasting?.mana).toBe(285);expect(hero.spellcasting?.learned).toEqual({});
 const restored=new Game(m,[{player:0,kind:'human'}]);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
});
it('validates initial XP against progression and mission caps, and initial health against the authored level',()=>{
 expect(()=>validatePlacements(map(451),content)).toThrow(/experience/);
 expect(()=>validatePlacements(map(1,'unit.ants.warrior'),content)).toThrow(/experience/);
 expect(()=>validatePlacements(map(450,'unit.ants.marshal',900),content)).not.toThrow();
 expect(()=>validatePlacements(map(100,'unit.ants.marshal',900),content)).toThrow(/health/);
});
