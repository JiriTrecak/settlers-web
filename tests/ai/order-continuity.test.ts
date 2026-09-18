import {expect,it} from 'vitest';
import {continuesOrder,orderIntent} from '../../src/sim/ai/orderContinuity';
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
