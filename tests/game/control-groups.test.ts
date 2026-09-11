import {expect,it} from 'vitest';
import {ControlGroups} from '../../src/presentation/controlGroups';
import {ShortcutSettings,chord} from '../../src/shared/input/shortcuts';
it('replaces, adds without duplicates, recalls and focuses only on a rapid second recall',()=>{
 const g=new ControlGroups();g.assign(1,[2,3]);g.assign(1,[3,4],true);expect(g.members(1)).toEqual([2,3,4]);
 expect(g.recall(1,100).focus).toBe(false);expect(g.recall(1,300).focus).toBe(true);expect(g.recall(1,1000).focus).toBe(false);
 g.assign(1,[7]);expect(g.members(1)).toEqual([7]);g.prune(new Set([2]));expect(g.members(1)).toEqual([]);
});
it('persists overrides, supports unbinding and recovers from corrupted preferences',()=>{
 let raw='broken';const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>raw=v};
 const s=new ShortcutSettings(storage);expect(s.key('group.1.recall')).toBe('Digit1');s.set('group.1.recall','Alt+KeyG');
 expect(new ShortcutSettings(storage).key('group.1.recall')).toBe('Alt+KeyG');s.set('group.1.recall','');expect(s.key('group.1.recall')).toBe('');
 expect(()=>s.set('group.1.recall','garbage')).toThrow();s.reset();expect(s.key('group.1.recall')).toBe('Digit1');
 expect(chord({code:'Digit1',key:'!',ctrlKey:true,shiftKey:false,altKey:false,metaKey:false})).toBe('Ctrl+Digit1');
});

import {SettlementHud} from '../../src/ui/settlement/settlementHud';
import {game,placed} from './helpers';
import {vi} from 'vitest';
it('refuses enemy membership and restores saved groups without pruning against the old world',()=>{
 const g=game([placed('own','unit.ants.warrior',170,170),{...placed('enemy','unit.ants.warrior',171,170),owner:'player.2'}]);
 const own=g.entities.find(e=>e.placement==='own')!,enemy=g.entities.find(e=>e.placement==='enemy')!;
 const hud=Object.assign(Object.create(SettlementHud.prototype),{controlGroups:new ControlGroups(),current:g.view('player.1'),owner:'player.1',readOnly:false,selectedIds:[own.id,enemy.id],renderGroups:vi.fn(),hooks:{mode(){}},hint:{textContent:''}});
 hud.groupInput(1,'assign');expect(hud.saveControls()[1]).toEqual([own.id]);
 // A restored match may contain IDs absent from the pre-load observation.
 hud.restoreControls([[9001]]);expect(hud.saveControls()[0]).toEqual([9001]);expect(hud.current).toBeNull();expect(hud.selectedIds).toEqual([]);
});
