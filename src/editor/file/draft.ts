import type {DraftStorage} from './draftStorage';
import {fingerprint} from '../../content/registry';
import {parseUtcMap,stringifyUtcMap,type UtcMap} from '../../shared/map/utcmap';

/** Drafts belong to a map and the exact project revision they were edited from. */
export class EditorDraft {
 private readonly key:string;
 private readonly baseRevision:string;
 private preserveStoredDraft=false;
 constructor(private storage:DraftStorage, id:string, initial:UtcMap){
  this.key='utc.editor.draft.v3:'+id;
  this.baseRevision=fingerprint(initial);
 }
 async restore():Promise<{map?:UtcMap;recovery?:UtcMap}>{
  try{
   const current=await this.storage.getItem(this.key);
   let value:unknown=current?JSON.parse(current):undefined;
   const record=value as {map?:unknown;dirty?:boolean;baseRevision?:string}|undefined;
   const map=parseUtcMap(record?.map);
   if(map&&record?.dirty&&fingerprint(map)!==this.baseRevision){
    if(record.baseRevision===this.baseRevision)return {map};
    // Preserve before the editor's first sync writes its new draft. No deletion/migration in place.
    const recoveryKey=this.key+'.recovery:'+fingerprint(map);
    try{
     await this.storage.setItem(recoveryKey,stringifyUtcMap(map));
     await this.storage.setItem(this.key+'.recovery',recoveryKey);
    }catch{this.preserveStoredDraft=true;}
    return {recovery:map};
   }
   const recoveryKey=await this.storage.getItem(this.key+'.recovery');
   const recovery=recoveryKey?parseUtcMap(JSON.parse(await this.storage.getItem(recoveryKey)??'null')):undefined;
   return recovery?{recovery}:{};
  }catch(error){this.preserveStoredDraft=true;throw error;}
 }
 private pending:Promise<void>=Promise.resolve();
 async write(map:UtcMap,dirty:boolean):Promise<void>{
  if(this.preserveStoredDraft)return Promise.reject(Error('The earlier draft could not be preserved. Export this map to keep your changes.'));
  // Capture at submission, so later edits cannot change an in-flight write.
  const record=JSON.stringify({version:1,baseRevision:this.baseRevision,dirty,map:JSON.parse(stringifyUtcMap(map))});
  const pending=this.pending.catch(()=>{}).then(()=>this.storage.setItem(this.key,record));
  this.pending=pending;return pending;
 }
 flush():Promise<void>{return this.pending;}
}
