import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCharacterInstance} from '../../src/render/characters/character-player.js';
import {speechEnvelope} from '../../src/render/characters/speech';
it('pauses articulation at punctuation and stops outside the line',()=>{
 expect(speechEnvelope('a, a',1.5,4)).toBe(0);expect(speechEnvelope('a, a',.5,4)).toBeGreaterThan(.5);expect(speechEnvelope('hello',4,4)).toBe(0);expect(speechEnvelope('hello',-1,4)).toBe(0);
});
it.each(['worker','warrior','archer','marshal','hunter','bombardier'])('%s opens mandibles independently of body animation and other units',async unit=>{
 const bytes=readFileSync(`assets/models/units/ants/${unit}/model.glb`);const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const a=createCharacterInstance(gltf,unit==='worker'?'base':unit),b=createCharacterInstance(gltf,unit==='worker'?'base':unit);
 const jaw=a.root.getObjectByName('mandibleL')!,other=b.root.getObjectByName('mandibleL')!;expect(jaw).toBeTruthy();const rest=jaw.quaternion.clone();
 a.player.speak(1);expect(jaw.quaternion.angleTo(rest)).toBeCloseTo(.24,4);expect(other.quaternion.angleTo(rest)).toBeLessThan(.0001);
 a.player.speak(0);expect(jaw.quaternion.angleTo(rest)).toBeLessThan(.0001);a.player.setState('attack');a.player.seek(.55);a.player.speak(.5);expect(jaw.quaternion.angleTo(rest)).toBeCloseTo(.12,4);
 a.player.setState('death');a.player.speak(1);expect(jaw.quaternion.angleTo(rest)).toBeLessThan(.0001);a.dispose();b.dispose();
});
