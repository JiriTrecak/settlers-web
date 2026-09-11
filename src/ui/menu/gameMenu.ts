import {graphicsControls} from './graphicsControls';
import {shortcuts} from '../../shared/input/shortcuts';
import {SaveLibrary,validateSaveDestination,type SavedGame} from '../../shared/save/saveLibrary';
import {localSaveSchema,type LocalSave,type SaveMode} from '../../shared/save/localSave';
import {getMap} from '../../shared/map/library';
import './gameMenu.css';
type MenuHooks={pause:(paused:boolean)=>void;leave:()=>void;snapshot?:()=>LocalSave;restart?:()=>void;load?:(save:LocalSave)=>void};
export class GameMenu {
 private dialog:HTMLDialogElement|null=null;
 private status:HTMLElement|null=null;
 private busy=false;
 private readonly library=new SaveLibrary();
 constructor(private readonly mode:SaveMode,private readonly mapName:string,private readonly hooks:MenuHooks){}
 open(){
  if(this.dialog){this.close();return;}
  const dialog=this.dialog=document.createElement('dialog');dialog.className='match-menu';dialog.setAttribute('aria-label','Game menu');
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!this.busy)this.close();});
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if(!e.repeat&&shortcuts.matches('game.settings',e)){e.preventDefault();if(!this.busy)this.close();}});
  document.body.append(dialog);this.main();dialog.showModal();this.hooks.pause(true);
 }
 private page(title:string,description=''){
  const root=this.dialog!;root.replaceChildren();const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=description;root.append(h,p);
  this.status=document.createElement('p');this.status.className='match-menu-status';this.status.setAttribute('role','status');root.append(this.status);
  return root;
 }
 private button(label:string,fn:()=>void|Promise<void>,parent:HTMLElement=this.dialog!){const b=document.createElement('button');b.textContent=label;b.onclick=()=>void this.run(fn);parent.append(b);return b;}
 private async run(fn:()=>void|Promise<void>){
  if(this.busy)return;this.busy=true;this.dialog?.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await fn();}catch(error){if(this.status)this.status.textContent=error instanceof Error?error.message:String(error);}
  finally{this.busy=false;this.dialog?.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 private main(){
  this.page(`${this.mode==='campaign'?'Campaign':'Skirmish'} menu`,this.mapName);
  this.button('Resume',()=>this.close());
  if(this.hooks.snapshot){this.button('Save game',()=>this.savePage());this.button('Load game',()=>this.loadPage());this.button('Restart scenario',()=>this.restartPage());}
  this.button('Settings',()=>{this.page('Settings');this.dialog!.append(graphicsControls());this.button('Back',()=>this.main());});
  this.button('Exit to menu',()=>{this.page('Leave this scenario?','Unsaved progress will be lost.');if(this.hooks.snapshot)this.button('Save and exit',async()=>{await this.save(this.mapName);this.hooks.leave();});this.button('Exit without saving',()=>this.hooks.leave());this.button('Cancel',()=>this.main());});
 }
 private nameField(){const label=document.createElement('label');label.textContent='Save name';const input=document.createElement('input');input.maxLength=100;input.value=this.mapName;label.append(input);this.dialog!.append(label);return input;}
 private async save(name:string){return this.library.save(name,this.mapName,this.hooks.snapshot!());}
 private savePage(){
  this.page(`${this.mode==='campaign'?'Campaign':'Skirmish'} saves`,'Saved on this device. Campaign and skirmish saves are kept separate.');const input=this.nameField();
  this.button('Save',async()=>{const record=await this.save(input.value);this.main();this.status!.textContent=`Saved “${record.name}”.`;});this.button('Back',()=>this.main());
 }
 private restartPage(){
  this.page('Save before restarting?','Restart begins this same scenario again with the same map, players, teams, and seed.');const input=this.nameField();
  this.button('Save and restart',async()=>{await this.save(input.value);this.hooks.restart!();});
  this.button('Restart without saving',()=>this.hooks.restart!());this.button('Cancel',()=>this.main());
 }
 private async loadPage(){
  this.page(`Load ${this.mode} save`,'Only saves from this game mode appear here. Loading restores the saved map and player setup.');
  const list=document.createElement('div');list.className='match-save-list';this.dialog!.append(list);
  this.button('Import save…',()=>{const input=document.createElement('input');input.type='file';input.accept='.utcsave,application/json';input.onchange=()=>{if(input.files?.[0])void this.run(async()=>{const file=input.files![0],save=localSaveSchema.parse(JSON.parse(await file.text()));validateSaveDestination(save,this.mode,getMap(save.mapId));await this.library.save(file.name.replace(/\.utcsave$/i,''),getMap(save.mapId).name,save);await this.loadPage();});};input.click();});
  this.button('Back',()=>this.main());
  const saves=await this.library.list(this.mode);if(!this.dialog||!list.isConnected)return;
  if(!saves.length){list.textContent='No saves yet.';return;}
  for(const record of saves){const row=document.createElement('article'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=record.name;detail.textContent=`${record.mapName} · ${new Date(record.savedAt).toLocaleString()}`;row.append(name,detail);list.append(row);
   this.button('Load',()=>{const save=validateSaveDestination(record.data,this.mode,getMap(record.data.mapId));this.hooks.load!(save);},row);
   this.button('Export',()=>this.export(record),row);
  }
 }
 private export(record:SavedGame){const url=URL.createObjectURL(new Blob([JSON.stringify(record.data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${record.data.mode}-${record.name.replace(/[^a-z0-9-]/gi,'-')}.utcsave`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 close(){this.dialog?.close();this.dialog?.remove();this.dialog=null;this.status=null;this.hooks.pause(false);}
 destroy(){this.close();}
}
