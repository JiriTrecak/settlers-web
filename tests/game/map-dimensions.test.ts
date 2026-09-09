import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {HeightField,encodeHeight,decodeHeight} from '../../src/shared/map/height';
import {slots,run} from './helpers';
it('runs a 512 map alongside a 256 map with independent path, fog and snapshot strides',()=>{
 const small=new Game(emptyUtcMap(),slots);
 const map={...emptyUtcMap(),size:512 as const,playerStarts:emptyUtcMap().playerStarts.map((p,i)=>({...p,x:i?38:400,z:i?38:400}))};
 const large=new Game(map,slots),a=large.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;
 expect(large.spatial.terrain.length).toBe(512**2);expect(small.spatial.terrain.length).toBe(256**2);
 expect(large.command('player.1',{type:'move',actors:[a.id],destination:{x:425,y:417}}).accepted).toBe(true);
 run(large,1500);expect(a.x).toBe(425);expect(a.y).toBe(417);
 expect(large.view('player.1').fog!.cells.length).toBe(512**2);
 const save=large.snapshot();const restored=new Game(map,slots);restored.restore(save);
 expect(restored.checksum()).toBe(large.checksum());
 const forged=small.snapshot();forged.state.entities[0].x=400;expect(()=>small.restore(forged)).toThrow(/outside map/);
});
it('persists dimensions and rejects out-of-bounds placements and mismatched height encodings',()=>{
 const h=new HeightField(512);h.raise(400,400,4,2);
 const m={...emptyUtcMap(),size:512 as const,height:encodeHeight(h.samples,512)};
 const parsed=parseUtcMap(JSON.parse(stringifyUtcMap(m)))!;
 expect(parsed.size).toBe(512);expect(decodeHeight(parsed.height!,512)).not.toBeNull();
 expect(parseUtcMap({...m,size:256})).toBeNull();
 expect(parseUtcMap({...emptyUtcMap(),playerStarts:[{...emptyUtcMap().playerStarts[0],x:400},emptyUtcMap().playerStarts[1]]})).toBeNull();
});
