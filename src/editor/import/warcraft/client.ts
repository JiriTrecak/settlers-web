import type {WarcraftImport} from './convert';
/** Parsing and conversion cannot stall the editor or mutate the active map. */
export function importWarcraft(bytes:Uint8Array,textures:Record<string,string>={},signal?:AbortSignal):Promise<WarcraftImport>{
 if(bytes.length>128*1024*1024)return Promise.reject(Error('Warcraft map exceeds the 128 MB import limit'));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  const finish=(error?:Error,result?:WarcraftImport)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(result!);};
  const abort=()=>finish(new Error('Warcraft import cancelled'));
  const timer=setTimeout(()=>finish(new Error('Warcraft import exceeded the 90-second limit')),90000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  worker.onerror=e=>finish(new Error(e.message||'Warcraft importer failed'));
  worker.onmessage=e=>e.data.ok?finish(undefined,e.data.result):finish(new Error(e.data.error));
  const copy=Uint8Array.from(bytes);worker.postMessage({bytes:copy,textures},[copy.buffer]);
 });
}
export function pickWarcraftFile():Promise<File|undefined>{
 return new Promise(resolve=>{
  const input=document.createElement('input');input.type='file';input.accept='.w3x,.w3m';input.hidden=true;
  const finish=(file?:File)=>{input.remove();resolve(file);};
  input.addEventListener('change',()=>finish(input.files?.[0]),{once:true});input.addEventListener('cancel',()=>finish(),{once:true});
  document.body.append(input);input.click();
 });
}
