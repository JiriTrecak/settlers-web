import {content} from '../../content/builtin';
import {shortcutCatalog} from '../../shared/input/catalog';
import {shortcuts,chord,keyLabel} from '../../shared/input/shortcuts';
/** Capture stays inside the dialog; game listeners never see binding keystrokes. */
export function keyboardControls():HTMLElement {
 const root=document.createElement('details');root.style.cssText='margin-top:24px;text-align:left';
 const title=document.createElement('summary');title.textContent='Keyboard shortcuts';root.append(title);
 const note=document.createElement('p');note.textContent='Click a key, then press its replacement. Saved on this device. Escape cancels capture; Clear unbinds. Commands may share default keys on different cards. Shift queues orders; Ctrl-click selects matching units; middle mouse drags the camera.';root.append(note);
 const search=document.createElement('input');search.placeholder='Find a shortcut';search.setAttribute('aria-label','Find a shortcut');root.append(search);
 const message=document.createElement('p');message.setAttribute('role','status');message.style.color='#f5a07e';root.append(message);
 const list=document.createElement('div');list.style.cssText='max-height:340px;overflow:auto';root.append(list);
 const catalog=shortcutCatalog(content);
 const render=()=>{list.replaceChildren();for(const entry of catalog.filter(e=>e.name.toLowerCase().includes(search.value.toLowerCase()))){
  const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 0';
  const label=document.createElement('span');label.textContent=entry.name;label.style.flex='1';
  const button=document.createElement('button');button.type='button';button.textContent=keyLabel(shortcuts.key(entry.id,entry.key))||'Unbound';button.setAttribute('aria-label',`Rebind ${entry.name}`);
  button.onclick=()=>{button.textContent='Press a key…';button.focus();const capture=(e:KeyboardEvent)=>{e.preventDefault();e.stopPropagation();
   const key=chord(e),conflicts=catalog.filter(other=>other.id!==entry.id&&shortcuts.key(other.id,other.key)===key);
   // Target cancel and submenu Back intentionally share Escape. Other edited collisions require clearing first.
   if(conflicts.length){message.textContent=`Already used by ${conflicts.map(c=>c.name).join(', ')}. Clear that binding first.`;return;}
   if(key==='Enter'){message.textContent='Enter is reserved for chat.';return;}
   try{shortcuts.set(entry.id,key);message.textContent='Shortcut saved.';render();}catch{message.textContent='Unsupported key. Try a letter, number, function key or navigation key.';}
  };button.onkeydown=e=>{e.preventDefault();e.stopPropagation();button.onkeyup=null;if(e.key==='Escape'){render();return;}
   if(e.key==='Alt'&&entry.id.startsWith('health.')){button.onkeyup=up=>{button.onkeyup=null;if(up.key==='Alt')capture(up);};return;}
   if(['Shift','Control','Alt','Meta'].includes(e.key))return;capture(e);
  };};
  button.onblur=()=>{button.onkeydown=null;button.onkeyup=null;button.textContent=keyLabel(shortcuts.key(entry.id,entry.key))||'Unbound';};
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';clear.setAttribute('aria-label',`Clear ${entry.name}`);clear.onclick=()=>{shortcuts.set(entry.id,'');render();};
  row.append(label,button,clear);list.append(row);
 }};search.oninput=render;render();
 const reset=document.createElement('button');reset.type='button';reset.textContent='Restore all default shortcuts';reset.onclick=()=>{shortcuts.reset();message.textContent='Default shortcuts restored.';render();};root.append(reset);return root;
}
