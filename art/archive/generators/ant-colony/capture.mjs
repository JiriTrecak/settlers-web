/** Capture the real-engine fixture at its reference resolution, without an editor bridge. */
import {WebSocket} from 'ws';import fs from 'node:fs/promises';
const endpoint='http://127.0.0.1:9233';
const tab=await(await fetch(`${endpoint}/json/new?about:blank`,{method:'PUT',signal:AbortSignal.timeout(5000)})).json();
const socket=new WebSocket(tab.webSocketDebuggerUrl);let id=0,completed=false;const pending=new Map();
const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error(`${method} timed out`));},90000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));});
socket.on('message',data=>{const m=JSON.parse(String(data));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
try{
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1681,height:937,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:process.argv[3]??'http://localhost:5173/reference-stage.html'});
 const state=await call('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>{const check=()=>{if(document.body?.dataset.error)return reject(Error(document.body.dataset.error));if(document.body?.dataset.ready)return resolve(document.body.dataset.capture);setTimeout(check,100);};check();})`,awaitPromise:true,returnByValue:true});
 if(state.exceptionDetails)throw Error(state.exceptionDetails.exception?.description??'Reference render failed');
 await new Promise(resolve=>setTimeout(resolve,2500));
 const shot=await call('Page.captureScreenshot',{format:'png'});
 const path=process.argv[2]??'tmp/ant-colony/compare-current.png';
 await fs.writeFile(path,Buffer.from(shot.data,'base64'));await fs.writeFile(path+'.json',state.result.value);
 completed=true;console.log(JSON.stringify({path,width:1681,height:937,...JSON.parse(state.result.value)}));
}finally{
 for(const p of pending.values())clearTimeout(p.timer);socket.close();
 if(completed)await fetch(`${endpoint}/json/close/${tab.id}`).catch(()=>{});
 else console.log(`Retained diagnostic target ${tab.id}`);
}
