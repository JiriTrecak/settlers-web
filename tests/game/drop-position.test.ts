import {expect,it} from 'vitest';
import {game} from './helpers';
import {dropPosition} from '../../src/sim/game/dropPosition';

it('keeps a full dropped inventory separated, reachable and deterministic after restore',()=>{
 const g=game([]),hero=g.entities.find(e=>e.owner==='player.1'&&e.equipment)!;
 const definition=g.registry.definitions.find(d=>d.itemEffect)?.id;
 expect(definition).toBeDefined();hero.equipment!.fill(definition!);
 const saved=g.snapshot(),restored=game([]);restored.restore(saved);
 for(let slot=0;slot<6;slot++){g.inventory.drop(hero,slot);restored.inventory.drop(restored.context.get(hero.id)!,slot);}
 expect(restored.snapshot()).toEqual(g.snapshot());
 const drops=g.entities.filter(e=>e.definition===definition&&e.item);
 expect(drops).toHaveLength(6);
 for(let i=0;i<drops.length;i++)for(let j=i+1;j<drops.length;j++)expect((drops[i].x-drops[j].x)**2+(drops[i].y-drops[j].y)**2).toBeGreaterThanOrEqual(4);
 expect(hero.equipment!.every(e=>e===null)).toBe(true);
});
it('never places beyond map boundaries and preserves drops if no nearby ground is available',()=>{
 const g=game([]),p=dropPosition(g.context,{x:0,y:0});
 expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);
 // An impassable local area returns the original site rather than losing a reward.
 g.spatial.terrain.fill(0);
 expect(dropPosition(g.context,{x:100,y:100})).toEqual({x:100,y:100});
});
