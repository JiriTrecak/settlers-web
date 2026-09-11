import {inputCaptured,shortcuts,SHORTCUTS_CHANGED} from './shortcuts';

/** Presentation-only held keys. Physical key release also works after modifiers change. */
export class HeldShortcuts {
 private held=new Map<string,string>();
 private readonly clear=()=>this.held.clear();
 private readonly down=(e:KeyboardEvent)=>{
  if(inputCaptured(e)||e.repeat)return;
  const id=this.ids.find(id=>shortcuts.matches(id,e));
  if(id){this.held.set(e.code,id);e.preventDefault();}
 };
 private readonly up=(e:KeyboardEvent)=>{this.held.delete(e.code);};
 constructor(private readonly ids:readonly string[]){
  if(typeof window==='undefined')return;
  window.addEventListener('keydown',this.down);
  window.addEventListener('keyup',this.up);
  window.addEventListener('blur',this.clear);
  window.addEventListener(SHORTCUTS_CHANGED,this.clear);
 }
 active():ReadonlySet<string>{
  if(typeof document!=='undefined'&&(document.hidden||document.querySelector('dialog[open]')||document.documentElement.classList.contains('game-chat-open')))this.clear();
  return new Set(this.held.values());
 }
 dispose(){
  this.clear();if(typeof window==='undefined')return;
  window.removeEventListener('keydown',this.down);
  window.removeEventListener('keyup',this.up);
  window.removeEventListener('blur',this.clear);
  window.removeEventListener(SHORTCUTS_CHANGED,this.clear);
 }
}
