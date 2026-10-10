import {readWarcraftMap} from './read';
import {convertWarcraftMap} from './convert';
self.onmessage=(event:MessageEvent<{bytes:Uint8Array;textures:Record<string,string>}>)=>{
 try{self.postMessage({ok:true,result:convertWarcraftMap(readWarcraftMap(event.data.bytes),event.data.textures)});}
 catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
};
