export type Progress={event:'Started';data:{contentLength?:number}}|{event:'Progress';data:{chunkLength:number}}|{event:'Finished'};
export interface PendingUpdate {version:string;body?:string;download(progress:(event:Progress)=>void):Promise<void>;install():Promise<void>;close():Promise<void>}
export interface UpdateAdapter {check():Promise<PendingUpdate|null>;relaunch():Promise<void>}
export type UpdatePhase='idle'|'checking'|'current'|'available'|'downloading'|'ready'|'installing'|'restart'|'error';
export type UpdateState={phase:UpdatePhase;version?:string;notes?:string;received:number;total?:number;error?:string};
/** One menu-owned update session; never downloads or installs automatically. */
export class UpdateController {
 state:UpdateState={phase:'idle',received:0};
 private update:PendingUpdate|null=null;
 private disposed=false;
 constructor(private adapter:UpdateAdapter,private changed:(state:UpdateState)=>void){}
 private set(patch:Partial<UpdateState>){if(!this.disposed){this.state={...this.state,...patch};this.changed(this.state);}}
 get busy(){return ['checking','downloading','installing'].includes(this.state.phase);}
 async check(){
  if(this.disposed||this.busy||this.state.phase==='restart')return;
  this.set({phase:'checking',error:undefined,version:undefined,notes:undefined,received:0,total:undefined});
  try{
   await this.update?.close();this.update=null;
   const update=await this.adapter.check();
   if(this.disposed){await update?.close();return;}
   this.update=update;
   this.set({phase:update?'available':'current',version:update?.version,notes:update?.body});
  }catch{this.set({phase:'error',error:'Could not check for updates. Check your connection and try again.'});}
 }
 async download(){
  if(this.disposed||this.state.phase!=='available'||!this.update)return;
  this.set({phase:'downloading',received:0,error:undefined});
  try{await this.update.download(e=>{if(e.event==='Started')this.set({total:e.data.contentLength});else if(e.event==='Progress')this.set({received:this.state.received+e.data.chunkLength});});this.set({phase:'ready'});}
  catch{this.set({phase:'available',error:'Download or signature verification failed. Nothing was installed. Try downloading again.'});}
 }
 async install(){
  if(this.disposed||this.state.phase!=='ready'||!this.update)return;
  this.set({phase:'installing',error:undefined});
  try{await this.update.install();this.set({phase:'restart'});await this.restart();}
  catch{this.set({phase:'ready',error:'Installation failed. Close other copies of the game and try again.'});}
 }
 async restart(){
  if(this.disposed||this.state.phase!=='restart')return;
  try{await this.adapter.relaunch();}catch{this.set({error:'The update is installed. Restart the app to finish.'});}
 }
 async dispose(){this.disposed=true;await this.update?.close().catch(()=>{});this.update=null;}
}
