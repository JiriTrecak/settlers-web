import {it,expect} from 'vitest';
import {sceneryCatalogue} from '../../src/shared/assets/manifest';
import {parseCatalogue} from '../../src/shared/asset/catalog';
import {applySceneryBlockers} from '../../src/shared/map/sceneryCollision';
import {Navigation} from '../../src/sim/game/navigation';
it('publishes a hollow landmark with an open entrance and solid back wall',()=>{
 const entry=parseCatalogue(sceneryCatalogue)!.assets.find(a=>a.id==='hollow-stump-gate')!;
 expect(entry.blocker).toBeUndefined();expect(entry.blockers!.length).toBeGreaterThan(20);
 const land=new Uint8Array(64*64).fill(1);
 applySceneryBlockers({size:64,stamps:[{id:'gate',asset:entry.id,x:32,y:32}]},land,[entry]);
 for(let z=32;z<=50;z++)for(let x=30;x<=34;x++)expect(land[z*64+x]).toBe(1);
 expect(land[24*64+32]).toBe(0);expect(land[32*64+40]).toBe(0);
 const nav=new Navigation(64,(_a,b)=>!!land[b]);
 expect(nav.path(50*64+32,32*64+32)).not.toBeNull();
});
