import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {validatePlacements} from '../../src/content/map';
/** Asset and map declarations are checked against shipped files, not a synthetic catalog. */
it('ships thirty distinct square icons',()=>{
 const images=content.definitions.filter(d=>d.itemTier).map(d=>readFileSync(resolve(content.asset(d.icon).image!)));
 expect(images).toHaveLength(30);expect(new Set(images.map(b=>b.toString('base64'))).size).toBe(30);
 for(const b of images){expect(b.toString('hex',0,8)).toBe('89504e470d0a1a0a');expect(b.readUInt32BE(16)).toBe(128);expect(b.readUInt32BE(20)).toBe(128);}
});
it('allows three designated legendary camps and rejects accidental medium-camp T3 loot',()=>{
 const map=JSON.parse(readFileSync('assets/maps/skirmish/worldroot-hollow.utcmap','utf8'));
 expect(map.camps.filter((c:any)=>c.legendary)).toHaveLength(2);
 expect(()=>validatePlacements(map,content)).not.toThrow();
 const legendary=map.camps.find((c:any)=>c.legendary);legendary.legendary=false;
 expect(()=>validatePlacements(map,content)).toThrow(/legendary camp/);
 legendary.legendary=true;
 const third=map.camps.find((c:any)=>!c.legendary);third.legendary=true;third.lootPool='loot.camp.legendary';
 expect(()=>validatePlacements(map,content)).not.toThrow();
 const fourth=map.camps.find((c:any)=>!c.legendary);fourth.legendary=true;fourth.lootPool='loot.camp.legendary';
 expect(()=>validatePlacements(map,content)).toThrow(/three legendary/);
});
