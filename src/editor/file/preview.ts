import {readUtcMap,stringifyUtcMap,type UtcMap} from '../../shared/map/utcmap';

const READY='utc-map-preview-ready',DOCUMENT='utc-map-preview-document';
/** Pass one snapshot directly to the new same-origin window. No disk or browser storage. */
export function openMapPreview(map:UtcMap):Promise<void>{
 const snapshot=JSON.parse(stringifyUtcMap(map)),token=crypto.randomUUID(),origin=window.location.origin;
 const preview=window.open(`/?preview=${encodeURIComponent(token)}`,'_blank');
 if(!preview)return Promise.reject(Error('Allow popups to test this map.'));
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{window.removeEventListener('message',receive);clearTimeout(timeout);clearInterval(closed);};
  const receive=(event:MessageEvent)=>{
   if(event.origin!==origin||event.source!==preview||event.data?.type!==READY||event.data?.token!==token)return;
   try{preview.postMessage({type:DOCUMENT,token,map:snapshot},origin);cleanup();resolve();}
   catch(error){cleanup();reject(error);}
  };
  const timeout=setTimeout(()=>{cleanup();reject(Error('The preview did not connect. Try testing the map again.'));},60_000);
  const closed=setInterval(()=>{if(preview.closed){cleanup();reject(Error('The preview window was closed.'));}},1000);
  window.addEventListener('message',receive);
 });
}

/** Only the opening editor can deliver the document, once, for this preview token. */
export function receiveMapPreview(token:string):Promise<UtcMap>{
 const opener=window.opener,origin=window.location.origin;
 if(!opener||opener.closed)return Promise.reject(Error('This temporary preview has expired. Start a new test from the map editor.'));
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{window.removeEventListener('message',receive);clearTimeout(timeout);};
  const receive=(event:MessageEvent)=>{
   if(event.origin!==origin||event.source!==opener||event.data?.type!==DOCUMENT||event.data?.token!==token)return;
   cleanup();
   const read=readUtcMap(event.data.map);
   if('error' in read)reject(Error(`The editor sent an invalid map: ${read.error}`));else resolve(read.map);
  };
  const timeout=setTimeout(()=>{cleanup();reject(Error('This temporary preview has expired. Start a new test from the map editor.'));},60_000);
  window.addEventListener('message',receive);
  opener.postMessage({type:READY,token},origin);
 });
}
