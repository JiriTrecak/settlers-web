import {expect,it} from 'vitest';
import {testContent as content} from '../fixtures/content';
import {workplaceCard} from '../../src/presentation/workplace';
import type {EntityView} from '../../src/sim/game/observation';
const base:EntityView={id:1,owner:'player.1',definition:'building.test.barracks',x:10,y:10,rotation:0,hp:100};
const queue=[1,2,3].map(id=>({id,name:'Warrior',icon:'icon.test.warrior',progress:null,costs:[],cancel:{type:'cancel' as const,actor:1,queue:id}}));
it('separates the active recruit from waiting slots without losing cancellation',()=>{
 const focus={...base,production:{paused:false,queue:[],active:{definition:'unit.test.warrior',queue:1,worker:9,progress:10},staff:null,produced:0,rally:null,status:'Training'}};
 const card=workplaceCard(focus,queue,content);
 expect(card.active?.task?.cancel).toEqual({type:'cancel',actor:1,queue:1});
 expect(card.waiting.map(q=>q.id)).toEqual([2,3]);expect(card.active?.progress).toBeGreaterThan(0);
});
it('shows the first order while it waits for a worker, without falsely advancing progress',()=>{
 const card=workplaceCard(base,queue,content);expect(card.active?.progress).toBeNull();expect(card.waiting.map(q=>q.id)).toEqual([2,3]);
});
it('does not expose remembered building production',()=>{
 const card=workplaceCard({...base,remembered:true},queue,content);expect(card).toEqual({active:null,waiting:[],summary:''});
});
it('shows research progress and keeps the pending task distinct',()=>{
 const cards=queue.map((q,i)=>({...q,progress:i?0:.5,cancel:{type:"cancelResearch" as const,actor:1,research:"research.test"}}));const card=workplaceCard(base,cards,content);
 expect(card.active?.progress).toBe(.5);expect(card.waiting).toEqual(cards.slice(1));
});
