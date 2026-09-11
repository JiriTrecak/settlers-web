import {localSaveSchema,type LocalSave,type SaveMode} from './localSave';
import type {MapEntry} from '../map/library';
export type SavedGame={id:string;name:string;savedAt:number;mapName:string;data:LocalSave};
/** Both library filtering and imported files use the same authoritative mode flag. */
export function savesForMode(saves:readonly SavedGame[],mode:SaveMode):SavedGame[]{
 return saves.filter(s=>s.data.mode===mode).sort((a,b)=>b.savedAt-a.savedAt||a.id.localeCompare(b.id));
}
export function validateSaveDestination(raw:unknown,mode:SaveMode,entry:MapEntry):LocalSave{
 const save=localSaveSchema.parse(raw);
 if(save.mode!==mode || (entry.map.mission?'campaign':'skirmish')!==mode)throw new Error(`Only ${mode} saves can be loaded here.`);
 if(save.mapId!==entry.id || save.mapRevision!==entry.revision)throw new Error('This save uses a different map or content revision.');
 if(save.match.mapId!==save.mapId||save.match.mapRevision!==save.mapRevision||save.match.seed!==save.seed)throw new Error('Saved match metadata does not match the scenario.');
 if(save.player===null?save.match.slots.some(s=>s.kind==='human'):!save.match.slots.some(s=>s.player===save.player&&s.kind==='human'))throw new Error('Invalid saved player assignment.');
 return save;
}
/** Snapshots exceed localStorage quotas on large maps. Commit them atomically in IndexedDB. */
export class SaveLibrary {
 private async db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('under-the-canopy-saves',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('saves',{keyPath:'id'});
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Save storage is unavailable.'));
  });
 }
 async list(mode:SaveMode):Promise<SavedGame[]>{
  const db=await this.db();try{return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('saves','readonly'),request=transaction.objectStore('saves').getAll();
   request.onsuccess=()=>{const valid:SavedGame[]=[];for(const row of request.result){const parsed=localSaveSchema.safeParse(row.data);if(parsed.success)valid.push({...row,data:parsed.data});}resolve(savesForMode(valid,mode));};
   request.onerror=()=>reject(request.error);
  });}finally{db.close();}
 }
 async save(name:string,mapName:string,raw:unknown):Promise<SavedGame>{
  const record:SavedGame={id:crypto.randomUUID(),name:name.trim().slice(0,100)||mapName,savedAt:Date.now(),mapName,data:localSaveSchema.parse(raw)};
  const db=await this.db();try{await new Promise<void>((resolve,reject)=>{
   const transaction=db.transaction('saves','readwrite');transaction.objectStore('saves').put(record);
   transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error??new Error('Could not save the game.'));transaction.onabort=()=>reject(transaction.error??new Error('Save was interrupted.'));
  });return record;}finally{db.close();}
 }
}
