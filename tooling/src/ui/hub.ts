import {Workbench} from './workbench';
import {ToolScreen} from './screen';
export class HubScreen extends ToolScreen {
 private token='';private workbench:Workbench|undefined;
 override destroy(){this.workbench?.dispose();super.destroy();}
 constructor(){super('studio');this.root.innerHTML=`
 <aside class="sidebar"><div class="brand"><span>✦</span><div>UNDER THE CANOPY<small>Asset Studio</small></div></div><button class="nav active" data-library>▦ &nbsp; Library</button><button class="nav" data-create>＋ &nbsp; Create asset</button><button class="nav" data-jobs>◷ &nbsp; Generation jobs</button><div class="sidebar-bottom"><small>LOCAL WORKSPACE</small><button class="nav" data-settings>⚙ &nbsp; Provider settings <i class="key-dot"></i></button></div></aside>
 <main><header><div><p class="eyebrow">YOUR WORLD, ONE LIBRARY</p><h1>Asset library</h1></div><button class="primary" data-create>＋ Create asset</button></header><div id="studio-content"><div class="empty"><span class="empty-symbol">✦</span><h2>Loading your library</h2><p>Reading published asset records and style collections.</p><button data-settings>Set up OpenAI</button></div></div></main>
 <dialog class="settings"><form><button type="button" class="close" aria-label="Close settings">×</button><p class="eyebrow">PROVIDER SETTINGS</p><h2>Connect OpenAI</h2><p>Your key stays on this Mac, outside Git and the game bundle. It is never included in asset metadata.</p><div class="key-status">Checking configuration…</div><label>API key<input name="key" type="password" autocomplete="new-password" placeholder="Paste your OpenAI API key" spellcheck="false" /></label><p class="hint">Generation uses your OpenAI API account. Saving a key does not start a paid request.</p><div class="form-message" role="status"></div><div class="actions"><button type="button" data-remove>Remove saved key</button><button class="primary" type="submit">Save key locally</button></div></form></dialog>`;
 const dialog=this.root.querySelector<HTMLDialogElement>('dialog')!;
 this.root.querySelectorAll('[data-settings]').forEach(el=>el.addEventListener('click',()=>dialog.showModal()));
 this.root.querySelector('.close')!.addEventListener('click',()=>dialog.close());
 const form=dialog.querySelector('form')!,input=form.querySelector<HTMLInputElement>('input')!,message=form.querySelector('.form-message')!;
 const save=async(key:string)=>{message.textContent='Saving…';try{const result=await this.api('/credentials',{key});input.value='';this.showKey(result);message.textContent=key?'Key saved. Ready for generation.':'Saved key removed.';}catch(e){input.value='';message.textContent=String(e);}};
 form.addEventListener('submit',e=>{e.preventDefault();const key=input.value;input.value='';void save(key);});
 form.querySelector('[data-remove]')!.addEventListener('click',()=>void save(''));
 void this.api('/bootstrap').then(data=>{this.token=data.token;this.showKey(data.credentials);this.workbench=new Workbench(this.root,(route,data)=>this.api(route,data));}).catch(e=>{message.textContent=String(e);});
 }
 private showKey(state:{configured:boolean;source:string|null}){this.root.querySelector('.key-status')!.textContent=state.configured?`Connected key · ${state.source==='environment'?'server environment':'saved on this Mac'}`:'No API key configured';this.root.querySelector('.key-dot')!.classList.toggle('connected',state.configured);const input=this.root.querySelector<HTMLInputElement>('input[name="key"]')!;input.disabled=state.source==='environment';}
 private async api(route:string,data?:unknown){const response=await fetch('/__studio'+route,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-Studio-Token':this.token}:{},body:data?JSON.stringify(data):undefined});const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed');return value;}
}
