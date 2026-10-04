import {it,expect} from 'vitest';
import {attackPhase} from '../../src/render/characters/attackPhase';
it('hits the authored contact at release and clamps both ends of a scaled weapon cycle',()=>{
 const attack={started:10,impact:30,ends:45};
 expect(attackPhase(0,attack,.7)).toBe(0);expect(attackPhase(20,attack,.7)).toBeCloseTo(.35);
 expect(attackPhase(30,attack,.7)).toBe(.7);expect(attackPhase(40,attack,.7)).toBeCloseTo(.9);
 expect(attackPhase(100,attack,.7)).toBe(1);
});
