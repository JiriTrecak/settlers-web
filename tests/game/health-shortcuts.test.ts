import {expect,it,vi} from 'vitest';
import {HeldShortcuts} from '../../src/shared/input/heldShortcuts';
import {shortcuts,chord,keyLabel,ShortcutSettings} from '../../src/shared/input/shortcuts';
import {healthBarVisible} from '../../src/presentation/healthVisibility';
import type {EntityView} from '../../src/sim/game/observation';

it('holds both Alt keys safely, releases rebound chords, and clears on chat, dialogs, blur and rebinding',()=>{
 const win=new EventTarget();let dialog=false,chat=false;
 vi.stubGlobal('window',win);vi.stubGlobal('HTMLElement',class {});
 vi.stubGlobal('document',{querySelector:()=>dialog?{}:null,documentElement:{classList:{contains:()=>chat}}});
 const held=new HeldShortcuts(['health.all','health.friendly','health.enemy']);
 const key=(type:string,code:string,options:object={})=>win.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code,key:code,ctrlKey:false,shiftKey:false,altKey:code.startsWith('Alt'),metaKey:false,...options}));
 try{
  key('keydown','AltLeft');key('keydown','AltRight');expect(held.active().has('health.all')).toBe(true);
  key('keyup','AltLeft');expect(held.active().has('health.all')).toBe(true);key('keyup','AltRight');expect(held.active().size).toBe(0);
  shortcuts.set('health.all','Ctrl+KeyJ');key('keydown','KeyJ',{ctrlKey:true});expect(held.active().has('health.all')).toBe(true);
  key('keyup','KeyJ');expect(held.active().size).toBe(0);
  key('keydown','BracketRight');chat=true;expect(held.active().size).toBe(0);chat=false;
  dialog=true;key('keydown','BracketRight');expect(held.active().size).toBe(0);dialog=false;
  key('keydown','BracketLeft');win.dispatchEvent(new Event('blur'));expect(held.active().size).toBe(0);
  key('keydown','BracketRight');shortcuts.set('health.enemy','KeyK');expect(held.active().size).toBe(0);
  held.dispose();key('keydown','KeyK');expect(held.active().size).toBe(0);
 }finally{held.dispose();shortcuts.reset();vi.unstubAllGlobals();}
});

it('keeps health shortcuts local, persisted and readable, including modifier-only Alt',()=>{
 let value='{}';const storage={getItem:()=>value,setItem:(_k:string,v:string)=>value=v};
 const prefs=new ShortcutSettings(storage);prefs.set('health.all','Alt');prefs.set('health.enemy','BracketRight');
 expect(new ShortcutSettings(storage).key('health.all')).toBe('Alt');
 expect(keyLabel(prefs.key('health.enemy'))).toBe(']');
 expect(chord({code:'AltRight',key:'Alt',altKey:false,ctrlKey:false,shiftKey:false,metaKey:false})).toBe('Alt');
});

it('reveals only observed health while preserving selected and damaged-unit defaults',()=>{
 const entity:EntityView={id:1,definition:'unit.ants.warrior',owner:'player.1',hostile:false,x:0,y:0,rotation:0,hp:100};
 const show=(overrides:Partial<EntityView>,key='',kind='building',selected=false)=>healthBarVisible({...entity,...overrides},kind,100,selected,new Set(key?[key]:[]));
 expect(show({})).toBe(false);expect(show({},'', 'building',true)).toBe(true);
 expect(show({hp:90},'', 'unit')).toBe(true);expect(show({hp:90})).toBe(false);
 expect(show({},'health.friendly')).toBe(true);expect(show({hostile:true},'health.friendly')).toBe(false);
 expect(show({hostile:true,owner:'none'},'health.enemy')).toBe(true);
 expect(show({owner:'none'},'health.friendly')).toBe(false);
 expect(show({hostile:undefined},'health.all')).toBe(true);
 expect(show({remembered:true},'health.all','unit',true)).toBe(false);
 expect(show({hp:0},'health.all')).toBe(false);
 expect(show({unit:{contained:true} as EntityView['unit']},'health.all')).toBe(false);
});
