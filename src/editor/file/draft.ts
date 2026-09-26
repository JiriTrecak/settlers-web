import {fingerprint} from '../../content/registry';
import {parseUtcMap,type UtcMap} from '../../shared/map/utcmap';

/** Drafts belong to a map and the exact project revision they were edited from. */
export class EditorDraft {
 private readonly key:string;
 private readonly baseRevision:string;
 private preserveStoredDraft=false;
 constructor(private storage:Storage, id:string, private initial:UtcMap){
  this.key='utc.editor.draft.v2:'+id;
  this.baseRevision=fingerprint(initial);
 }
 restore(legacyKeys:readonly string[]=[]):{map?:UtcMap;recovery?:UtcMap}{
  try{
   const current=this.storage.getItem(this.key);
   let value:unknown=current?JSON.parse(current):undefined;
   if(!current)for(const key of legacyKeys){
    const legacy=this.storage.getItem(key);if(!legacy)continue;
    const map=parseUtcMap(JSON.parse(legacy));
    // The old menu used one shared key for unrelated maps. Never restore across maps.
    if(map?.name===this.initial.name){value={map,dirty:true};break;}
   }
   const record=value as {map?:unknown;dirty?:boolean;baseRevision?:string}|undefined;
   const map=parseUtcMap(record?.map);
   if(map&&record?.dirty&&fingerprint(map)!==this.baseRevision){
    if(record.baseRevision===this.baseRevision)return {map};
    // Preserve before the editor's first sync writes its new draft. No deletion/migration in place.
    const recoveryKey=this.key+'.recovery:'+fingerprint(map);
    try{
     this.storage.setItem(recoveryKey,JSON.stringify(map));
     this.storage.setItem(this.key+'.recovery',recoveryKey);
    }catch{this.preserveStoredDraft=true;}
    return {recovery:map};
   }
   const recoveryKey=this.storage.getItem(this.key+'.recovery');
   const recovery=recoveryKey?parseUtcMap(JSON.parse(this.storage.getItem(recoveryKey)??'null')):undefined;
   return recovery?{recovery}:{};
  }catch{return {};}
 }
 write(map:UtcMap,dirty:boolean){
  if(this.preserveStoredDraft)return; // Never overwrite the only older draft when recovery storage is full.
  try{this.storage.setItem(this.key,JSON.stringify({version:1,baseRevision:this.baseRevision,dirty,map}));}catch{/* Export remains available when storage is full. */}
 }
}
