/** Local input preferences, never simulation data. Chords use physical KeyboardEvent.code. */
export const SHORTCUTS_CHANGED='utc-shortcuts-changed';
function browserStorage():Storage|null {try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
const STORAGE='utc.controls.shortcuts.v1';
export type Shortcut={id:string;name:string;key:string;scope:'global'|'command'};
export const globalShortcuts:Shortcut[]=[
 {id:'camera.zoomIn',name:'Zoom in',key:'PageUp',scope:'global'},
 {id:'camera.zoomOut',name:'Zoom out',key:'PageDown',scope:'global'},
 {id:'camera.left',name:'Pan left',key:'ArrowLeft',scope:'global'},
 {id:'camera.right',name:'Pan right',key:'ArrowRight',scope:'global'},
 {id:'camera.up',name:'Pan up',key:'ArrowUp',scope:'global'},
 {id:'camera.down',name:'Pan down',key:'ArrowDown',scope:'global'},
 ...[1,2,3].map(n=>({id:`hero.${n}`,name:`Select hero ${n} (double press to center)`,key:`F${n}`,scope:'global' as const})),
 {id:'selection.worker',name:'Next idle worker',key:'F8',scope:'global'},
 {id:'selection.workerAlt',name:'Next idle worker (alternate)',key:'Backquote',scope:'global'},
 {id:'camera.alert',name:'Cycle recent alerts',key:'Space',scope:'global'},
 {id:'camera.hall',name:'Next Mound',key:'Backspace',scope:'global'},
 {id:'selection.next',name:'Next subgroup',key:'Tab',scope:'global'},
 {id:'selection.previous',name:'Previous subgroup',key:'Shift+Tab',scope:'global'},
 {id:'game.settings',name:'Game settings',key:'F10',scope:'global'},
 {id:'debug.toggle',name:'Debug overlay',key:'Ctrl+F3',scope:'global'},
 {id:'target.cancel',name:'Cancel targeting',key:'Escape',scope:'global'},
 {id:'placement.rotate',name:'Rotate building clockwise',key:'KeyR',scope:'command'},
 {id:'placement.reverse',name:'Rotate building counterclockwise',key:'Shift+KeyR',scope:'command'},
 ...[7,8,4,5,1,2].map((n,i)=>({id:`inventory.${i}`,name:`Use inventory slot ${i+1}`,key:`Numpad${n}`,scope:'global' as const})),
 {id:'camera.selection',name:'Center selection',key:'Home',scope:'global'},
 {id:'health.all',name:'Show all visible health bars (hold)',key:'Alt',scope:'global'},
 {id:'health.friendly',name:'Show friendly health bars (hold)',key:'BracketLeft',scope:'global'},
 {id:'health.enemy',name:'Show enemy health bars (hold)',key:'BracketRight',scope:'global'},
 ...Array.from({length:10},(_,i)=>{const digit=(i+1)%10;return [
 {id:`group.${digit}.recall`,name:`Recall group ${digit}`,key:`Digit${digit}`,scope:'global' as const},
 {id:`group.${digit}.assign`,name:`Assign group ${digit}`,key:`Ctrl+Digit${digit}`,scope:'global' as const},
 {id:`group.${digit}.add`,name:`Add selection to group ${digit}`,key:`Shift+Digit${digit}`,scope:'global' as const},
 ]}).flat(),
];
const allowed=/^(?:Alt|(?:(?:Ctrl|Alt|Shift|Meta)\+)*(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown|Space|Tab|Escape|Enter|Backspace|Backquote|BracketLeft|BracketRight|Delete))$/;
export function chord(e:Pick<KeyboardEvent,'code'|'key'|'ctrlKey'|'shiftKey'|'altKey'|'metaKey'>):string {
 const code=e.code||(/^[a-z]$/i.test(e.key)?`Key${e.key.toUpperCase()}`:/^[0-9]$/.test(e.key)?`Digit${e.key}`:e.key);
 if((code==='AltLeft'||code==='AltRight'||code==='Alt')&&!e.ctrlKey&&!e.shiftKey&&!e.metaKey)return 'Alt';
 return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Meta':'',code].filter(Boolean).join('+');
}
export function keyLabel(key:string):string{return key.replace(/Key(?=[A-Z](?:$|\+))/g,'').replace(/Digit(?=[0-9])/g,'').replace(/Arrow/g,'').replace('Escape','Esc').replace('Backquote','`').replace('BracketLeft','[').replace('BracketRight',']').replace('Numpad','Num ')}
export function authoredKey(key?:string):string {if(!key)return '';return /^[a-z]$/i.test(key)?`Key${key.toUpperCase()}`:key==='ESC'?'Escape':key;}
export class ShortcutSettings {
 private overrides:Record<string,string>=Object.create(null);
 constructor(private storage:Pick<Storage,'getItem'|'setItem'>|null=browserStorage()){
  try{const raw=JSON.parse(storage?.getItem(STORAGE)??'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const[id,key]of Object.entries(raw))if(typeof key==='string'&&(!key||allowed.test(key)))this.overrides[id]=key;}catch{}
 }
 key(id:string,fallback=''):string{return this.overrides[id]??globalShortcuts.find(s=>s.id===id)?.key??fallback;}
 matches(id:string,e:KeyboardEvent,fallback=''):boolean {const key=this.key(id,fallback);return !!key&&key===chord(e);}
 set(id:string,key:string):void {if(key&&!allowed.test(key))throw new Error('Unsupported shortcut');this.overrides[id]=key;this.persist();}
 reset():void{this.overrides=Object.create(null);this.persist();}
 private persist(){try{this.storage?.setItem(STORAGE,JSON.stringify(this.overrides));}catch{}if(typeof window!=='undefined')window.dispatchEvent(new Event(SHORTCUTS_CHANGED));}
}
export const shortcuts=new ShortcutSettings();

export function inputCaptured(e:KeyboardEvent):boolean {return e.defaultPrevented || (typeof document!=="undefined" && !!document.querySelector("dialog[open]")) || (typeof HTMLElement!=="undefined" && e.target instanceof HTMLElement && (e.target.matches("input,textarea,select")||e.target.isContentEditable));}

/** Shift is an order-queue modifier unless the player explicitly bound a shifted chord. */
export function commandMatches(id:string,e:KeyboardEvent,fallback=''):boolean{
 return shortcuts.matches(id,e,fallback)||(e.shiftKey&&!shortcuts.key(id,fallback).includes('Shift+')&&shortcuts.matches(id,{code:e.code,key:e.key,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,shiftKey:false} as KeyboardEvent,fallback));
}

/** Explicit chords take precedence over the implicit Shift-to-queue fallback. */
export function commandShortcut<T extends {id:string;hotkey?:string}>(entries:readonly T[],e:KeyboardEvent):T|undefined{
 return entries.find(b=>shortcuts.matches(`command.${b.id}`,e,authoredKey(b.hotkey)))??
  entries.find(b=>commandMatches(`command.${b.id}`,e,authoredKey(b.hotkey)));
}
