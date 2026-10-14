import {expect,it} from 'vitest';
import {game,worker,placed} from './helpers';
import {prioritizeSelection,cycleSelection} from '../../src/presentation/selection';
import {areaSelection,commandCard} from '../../src/presentation/commands';

function fixture(){
 const g=game([placed('warrior-a','unit.test.warrior',210,200),placed('warrior-b','unit.test.warrior',214,200)]),view=g.view('player.1');
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 const warriors=g.entities.filter(e=>e.owner==='player.1'&&e.definition==='unit.test.warrior');
 const w=worker(g);
 return {g,view,hero,warriors,w};
}
it('box selection puts the hero before warriors and still excludes workers when army is present',()=>{
 const {g,view,hero,warriors,w}=fixture();
 const ids=areaSelection(view.entities,'player.1',g.registry);
 expect(ids[0]).toBe(hero.id);expect(ids).toContain(warriors[0].id);expect(ids).not.toContain(w.id);
 expect(commandCard(view,ids,'player.1',g.registry).some(b=>b.type==='learnAbility'&&b.actors[0]===hero.id)).toBe(true);
 expect(areaSelection(view.entities.filter(e=>e.id===w.id),'player.1',g.registry)).toEqual([w.id]);
});
it('orders mixed selections by hero, army, workers while preserving ties and explicit focus',()=>{
 const {g,view,hero,warriors,w}=fixture();
 const ids=[w.id,warriors[1].id,warriors[0].id,hero.id,w.id];
 expect(prioritizeSelection(ids,view.entities,g.registry)).toEqual([hero.id,warriors[1].id,warriors[0].id,w.id]);
 const selected=prioritizeSelection(ids,view.entities,g.registry);
 const next=cycleSelection(selected,view.entities,g.registry)!;
 expect(next).toBe(warriors[1].id);
 const armyFocus=prioritizeSelection(selected,view.entities,g.registry,next);
 expect(armyFocus[0]).toBe(next);expect(cycleSelection(armyFocus,view.entities,g.registry)).toBe(w.id);
 expect(cycleSelection(selected,view.entities,g.registry,true)).toBe(w.id);
 expect(prioritizeSelection(ids,view.entities,g.registry,w.id)[0]).toBe(w.id);
});
