import {expect,it} from 'vitest';
import {game,placed} from './helpers';

it('reuses membership while retaining live fields and stable mutation-pass semantics',()=>{
 const g=game([placed('first','unit.ants.warrior',80,90)]),c=g.context;
 const first=g.entities.find(e=>e.placement==='first')!,before=c.entitySnapshot(),ids=before.map(e=>e.id);
 expect(c.entitySnapshot()).toBe(before);
 first.hp!--;expect(before.find(e=>e.id===first.id)!.hp).toBe(first.hp);
 const added=c.create(placed('new','unit.ants.warrior',85,90));
 const afterAdd=c.entitySnapshot();expect(afterAdd).not.toBe(before);expect(afterAdd).toContain(added);expect(before.map(e=>e.id)).toEqual(ids);
 c.remove(first);const afterRemove=c.entitySnapshot();
 expect(afterRemove).not.toContain(first);expect(afterAdd).toContain(first);expect(c.entitySnapshot()).toBe(afterRemove);
 // A status added by an earlier entity during the pass must still be visible
 // when a later existing entity is reached; never snapshot only status holders.
 added.stunnedUntil=12;expect(afterAdd.find(e=>e.id===added.id)!.stunnedUntil).toBe(12);
});

it('drops cached membership when authoritative state is restored or reindexed',()=>{
 const g=game([placed('first','unit.ants.warrior',80,90)]),c=g.context,before=c.entitySnapshot(),save=structuredClone(g.snapshot());
 c.create(placed('temporary','unit.ants.warrior',90,90));g.restore(save);
 const restored=c.entitySnapshot();expect(restored.map(e=>e.id)).toEqual(before.map(e=>e.id));expect(restored).not.toBe(before);
 for(let i=0;i<before.length;i++)expect(restored[i]).not.toBe(before[i]);
 c.reindex();expect(c.entitySnapshot()).not.toBe(restored);
});
