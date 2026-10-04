import {expect,it} from 'vitest';
import {continuesOrder,orderIntent,approachingArmy} from '../../src/sim/ai/orderContinuity';
import {game,placed} from '../game/helpers';
import type {Action} from '../../src/shared/types/types';

it('retains progressing units when squad membership changes but retries a stalled member',()=>{
 const g=game([placed('one','unit.ants.warrior',110,110),placed('two','unit.ants.warrior',111,110)]);
 const [one,two]=['one','two'].map(name=>g.view().entities.find(e=>g.context.get(e.id)?.placement===name)!);
 const action:Action={type:'move',actors:[one.id,two.id],destination:{x:200,y:200},attackMove:true};
 const intent=orderIntent(action),progress={signature:intent,tick:10,point:{x:100,y:100},hp:one.hp!};
 const stalled={signature:intent,tick:10,point:{x:two.x,y:two.y},hp:two.hp!};
 one.unit!.moving=true;
 const reinforced={...action,actors:[one.id,two.id,999]};
 expect(orderIntent(reinforced)).toBe(intent);
 expect(continuesOrder(one,progress,reinforced,intent,300,40)).toBe(true);
 expect(progress.tick).toBe(300);
 expect(continuesOrder(two,stalled,reinforced,intent,300,40)).toBe(false);
 expect(continuesOrder(one,progress,{...action,destination:{x:20,y:20}},orderIntent({...action,destination:{x:20,y:20}}),301,40)).toBe(false);
 expect(continuesOrder(one,progress,{...action,attackMove:false},orderIntent({...action,attackMove:false}),301,40)).toBe(false);
});

it('keeps a progressing reinforcement route useful as its leader moves, but retargets outside the join area',()=>{
 const g=game([placed('one','unit.ants.warrior',110,110)]);
 const one=g.view(0).entities.find(e=>g.context.get(e.id)?.placement==='one')!;
 one.control!.order={type:'move',destination:{x:330,y:110},attackMove:true};
 one.unit!.moving=true;
 const before=structuredClone(one);
 expect(approachingArmy(one,{x:336,y:108})).toBe(true);
 expect(approachingArmy(one,{x:342,y:105})).toBe(true);
 expect(approachingArmy(one,{x:346,y:110})).toBe(false);
 expect(approachingArmy(one,{x:350,y:100})).toBe(false);
 expect(one).toEqual(before);
});

it('does not suppress recovery, floor changes, retreat orders or a different active intention',()=>{
 const g=game([placed('one','unit.ants.warrior',110,110)]);
 const one=g.view(0).entities.find(e=>g.context.get(e.id)?.placement==='one')!,leader={x:336,y:108};
 one.control!.order={type:'move',destination:{x:330,y:110},attackMove:true};
 one.unit!.moving=false;expect(approachingArmy(one,leader)).toBe(false);
 one.unit!.moving=true;expect(approachingArmy(one,{...leader,surface:'bridge'})).toBe(false);
 one.control!.order={type:'move',destination:{x:330,y:110},attackMove:false};expect(approachingArmy(one,leader)).toBe(false);
 one.control!.order={type:'attack',target:999,force:false};expect(approachingArmy(one,leader)).toBe(false);
 one.control!.order=null;expect(approachingArmy(one,leader)).toBe(false);
});
