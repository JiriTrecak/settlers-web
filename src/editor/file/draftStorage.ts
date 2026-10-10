/** Drafts contain ordinary map documents, never compiled render or navigation data. */
export interface DraftStorage {
 getItem(key:string):Promise<string|null>;
 setItem(key:string,value:string):Promise<void>;
}
export class BrowserDraftStorage implements DraftStorage {
 constructor(private namespace:string){}
 private open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('utc-editor-drafts',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error??Error('Draft storage is unavailable'));
  });
 }
 private async transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await this.open();
  try{return await new Promise<T>((resolve,reject)=>{
   const tx=db.transaction('drafts',mode),request=run(tx.objectStore('drafts'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onerror=()=>reject(tx.error??request.error??Error('Could not store editor draft'));
   tx.onabort=()=>reject(tx.error??Error('Draft write was interrupted'));
  });}finally{db.close();}
 }
 async getItem(key:string):Promise<string|null>{return (await this.transaction('readonly',store=>store.get(this.namespace+':'+key)))??null;}
 async setItem(key:string,value:string):Promise<void>{await this.transaction('readwrite',store=>store.put(value,this.namespace+':'+key));}
}
/** Small session identifier only. The terrain document itself is stored in IndexedDB. */
export function browserDraftStorage():DraftStorage{
 try{
  const key='utc.editor.draft-session';let id=sessionStorage.getItem(key);
  if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}
  return new BrowserDraftStorage(id);
 }catch(error){
  // Keep the editor usable when browser privacy settings disable persistence,
  // but report the failure instead of claiming recovery is available.
  return {getItem:async()=>{throw error;},setItem:async()=>{throw error;}};
 }
}
