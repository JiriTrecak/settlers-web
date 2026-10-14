import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {validatePlacements} from '../../src/content/map';
import {testContent} from '../fixtures/content';
import type {Placement} from '../../src/content/schema';
function map(experience:number,definition='unit.test.marshal',health?:number){
 const hero:Placement={id:'marshal',definition,position:{x:40,y:40},owner:'player.1',rotation:0,initialState:{experience,...(health===undefined?{}:{health})}};
 return {...emptyUtcMap(),entities:[hero],playerStarts:[{player:1,x:40,z:40,setup:'setup.ants',mainFort:'marshal'}],mission:{campaign:'test',title:'Starting level',order:1,heroLevelCap:4,regions:[],script:'function on_start() end'}};
}
const hero=testContent.get('unit.test.marshal'),levels=hero.behaviors.progression!.levels,cap=levels[3]!;
it('starts an authored level-four hero with level-four health, mana and available skill points, and survives saves',()=>{
 const m=map(cap.experience);validatePlacements(m,testContent);const g=new Game(m,[{player:0,kind:'human'}],testContent),entity=g.entities[0];
 expect(g.context.stats(entity).level).toBe(4);expect(entity.hp).toBe(cap.maxHp);expect(entity.abilities?.mana).toBe(cap.maxMana);
 expect(entity.abilities?.ranks).toEqual(Object.fromEntries(hero.behaviors.abilities!.bindings.map(b=>[b.id,b.initialRank??0])));
 const restored=new Game(m,[{player:0,kind:'human'}],testContent);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
});
it('validates initial XP against progression and mission caps, and initial health against the authored level',()=>{
 // Health above the level-one maximum but within the level-four maximum.
 const health=cap.maxHp-1;expect(health).toBeGreaterThan(levels[0]!.maxHp);
 expect(()=>validatePlacements(map(cap.experience+1),testContent)).toThrow(/experience/);
 expect(()=>validatePlacements(map(1,'unit.test.warrior'),testContent)).toThrow(/experience/);
 expect(()=>validatePlacements(map(cap.experience,'unit.test.marshal',health),testContent)).not.toThrow();
 expect(()=>validatePlacements(map(levels[1]!.experience-1,'unit.test.marshal',health),testContent)).toThrow(/health/);
});
