import {expect,it,vi} from 'vitest';
import {MapInput} from '../../src/render/input/mapInput';
import {shortcuts,SHORTCUTS_CHANGED,commandMatches,commandShortcut} from '../../src/shared/input/shortcuts';
import {shortcutCatalog} from '../../src/shared/input/catalog';
import {testContent as content} from '../fixtures/content';

it('delivers canvas pointer callbacks and removes those same listeners on destroy',()=>{
 const win=new EventTarget();vi.stubGlobal('window',win);
 vi.stubGlobal('document',{createElement:()=>({style:{},remove(){}}),body:{append(){}}});
 const canvas=Object.assign(new EventTarget(),{setPointerCapture(){},hasPointerCapture:()=>false});
 const command=vi.fn();
 const input=new MapInput(canvas as any,{} as any,{rts:true,onChanged(){},onRightClick:command});
 const pointer=()=>Object.assign(new Event('pointerdown'),{button:2,clientX:12,clientY:34,shiftKey:true,pointerId:1});
 try{
  canvas.dispatchEvent(pointer());
  expect(command).toHaveBeenCalledExactlyOnceWith(12,34,true);
  input.destroy();command.mockClear();
  canvas.dispatchEvent(pointer());
  expect(command).not.toHaveBeenCalled();
 }finally{input.destroy();vi.unstubAllGlobals();}
});
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
 const creatable=content.definitions.filter(d=>d.creation&&['construct','train'].includes(d.creation.method));
 expect(creatable.some(d=>d.creation!.method==='construct')).toBe(true);expect(creatable.some(d=>d.creation!.method==='train')).toBe(true);
 for(const d of creatable){
  const id=`${d.creation!.method==='construct'?'build':'produce'}:${d.id}`;
  if(!content.actions.overrides[id]?.hidden)expect(c.some(s=>s.id===`command.${id}`),id).toBe(true);
 }
 for(const d of content.definitions)for(const binding of d.behaviors.abilities?.bindings??[])if(binding.command)expect(c.some(s=>s.id===`command.cast:${binding.id}`&&s.key===`Key${binding.command!.hotkey}`)).toBe(true);
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
