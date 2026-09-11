import {expect,it,vi} from 'vitest';
import {MapInput} from '../../src/render/input/mapInput';
import {shortcuts,SHORTCUTS_CHANGED,commandMatches,commandShortcut} from '../../src/shared/input/shortcuts';
import {shortcutCatalog} from '../../src/shared/input/catalog';
import {content} from '../../src/content/builtin';
it('pans with an override, releases using physical key even after modifiers change, and ignores dialogs',()=>{
 const win=new EventTarget();let dialog=false;
 vi.stubGlobal('window',win);vi.stubGlobal('HTMLElement',class {});
 vi.stubGlobal('document',{createElement:()=>({style:{},remove(){}}),querySelector:()=>dialog?{}:null,body:{append(){}},documentElement:{classList:{contains:()=>false}}});
 const canvas=Object.assign(new EventTarget(),{clientHeight:600}),camera={game:true,distance:40,panWorld:vi.fn(),zoomBy:vi.fn()};
 const input=new MapInput(canvas as any,camera as any,{rts:true,onChanged(){}});
 const key=(type:string,code:string,ctrlKey=false)=>win.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code,key:code,ctrlKey,shiftKey:false,altKey:false,metaKey:false}));
 try{
  shortcuts.set('camera.left','Ctrl+KeyJ');key('keydown','ArrowLeft');input.tick(25);expect(camera.panWorld).not.toHaveBeenCalled();
  key('keydown','KeyJ',true);input.tick(25);expect(camera.panWorld).toHaveBeenCalledWith(-.7,0);
  camera.panWorld.mockClear();key('keyup','KeyJ');input.tick(25);expect(camera.panWorld).not.toHaveBeenCalled();
  dialog=true;key('keydown','KeyJ',true);input.tick(25);expect(camera.panWorld).not.toHaveBeenCalled();dialog=false;
  key('keydown','KeyJ',true);win.dispatchEvent(new Event(SHORTCUTS_CHANGED));input.tick(25);expect(camera.panWorld).not.toHaveBeenCalled();
 }finally{input.destroy();shortcuts.reset();vi.unstubAllGlobals();}
});
it('allows Shift+command for queued targeting without making Ctrl or Alt accidentally issue orders',()=>{
 const key=(shift=false,ctrl=false)=>({code:'KeyA',key:'a',shiftKey:shift,ctrlKey:ctrl,altKey:false,metaKey:false}) as KeyboardEvent;
 expect(commandMatches('command.attack',key(),'KeyA')).toBe(true);
 expect(commandMatches('command.attack',key(true),'KeyA')).toBe(true);
 expect(commandMatches('command.attack',key(false,true),'KeyA')).toBe(false);
});
it('catalog contains unique ids and declared abilities, buildings, recruitment and navigation bindings',()=>{
 const c=shortcutCatalog(content);expect(new Set(c.map(s=>s.id)).size).toBe(c.length);
 expect(c.find(s=>s.id==='command.navigation:back')?.key).toBe('Escape');
 expect(c.some(s=>s.id==='command.produce:unit.ants.archer')).toBe(true);
 expect(c.some(s=>s.id==='command.build:building.ants.barracks')).toBe(true);
 for(const id of Object.keys(content.rules.spells))expect(c.some(s=>s.id===`command.cast:${id}`)).toBe(true);
});

it('prefers an explicit shifted binding over queuing an earlier command with the same base key',()=>{
 const attack={id:'attack',hotkey:'A'},hold={id:'hold',hotkey:'H'};
 const e={code:'KeyA',key:'A',shiftKey:true,ctrlKey:false,altKey:false,metaKey:false} as KeyboardEvent;
 try{
  shortcuts.set('command.hold','Shift+KeyA');
  expect(commandShortcut([attack,hold],e)).toBe(hold);
  expect(commandShortcut([attack],e)).toBe(attack);
  expect(commandShortcut([attack,hold],{...e,shiftKey:false})).toBe(attack);
 }finally{shortcuts.reset();}
});
