import {expect,it} from 'vitest';
import {speechEnvelope} from '../../src/render/characters/speech';
it('pauses articulation at punctuation and stops outside the line',()=>{
 expect(speechEnvelope('a, a',1.5,4)).toBe(0);expect(speechEnvelope('a, a',.5,4)).toBeGreaterThan(.5);expect(speechEnvelope('hello',4,4)).toBe(0);expect(speechEnvelope('hello',-1,4)).toBe(0);
});
