export type StoredMap={id:string;json:string};
/** IndexedDB stores the same editable document exported to disk, one row per
 * local map. No compiled scene or generator state is persisted. */
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('utc-local-maps-v3',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('maps',{keyPath:'id'});
  request.onerror=()=>reject(request.error??Error('Local maps are unavailable'));
  request.onsuccess=()=>resolve(request.result);
 });
 try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('maps',mode),request=run(tx.objectStore('maps'));
  tx.oncomplete=()=>resolve(request.result);
  tx.onabort=()=>reject(tx.error??request.error??Error('Map save was interrupted'));
  tx.onerror=()=>reject(tx.error??request.error??Error('Could not store map'));
 });}finally{db.close();}
}
export const localMapStorage={
 read:():Promise<StoredMap[]>=>transaction('readonly',store=>store.getAll()),
 write:async (row:StoredMap):Promise<void>=>{await transaction('readwrite',store=>store.put(row));},
};
