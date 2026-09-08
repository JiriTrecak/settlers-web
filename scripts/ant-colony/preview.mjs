/** Isolated, headless real-engine preview; uses the existing editor MCP protocol. */
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {WebSocket} from 'ws';
const root=resolve('tmp/ant-colony/chrome-preview');mkdirSync(root,{recursive:true});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding',
 '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9233',`--user-data-dir=${root}`,'--window-size=1681,937','about:blank'
],{stdio:['ignore','ignore','ignore']});
chrome.on('error',error=>{console.error(error);process.exit(1);});
let tabs;
for(let i=0;i<40;i++){
 try{tabs=await(await fetch('http://127.0.0.1:9233/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}
 await new Promise(r=>setTimeout(r,250));
}
const tab=tabs?.find(t=>t.type==='page');if(!tab)throw Error('Headless preview failed to start');
const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
let id=0;const pending=new Map();
socket.on('message',data=>{const message=JSON.parse(String(data));if(!message.id)return;const p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result);});
const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
await call('Page.enable');
await call('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.hostname==='localhost')localStorage.setItem('utc.mcp',JSON.stringify({enabled:true,port:7380}));`});
await call('Page.navigate',{url:'http://localhost:5173/?screen=editor&map=ant-colony-compare'});
console.log('Isolated Ant preview running; editor MCP on 7380, Chrome debugging on 9233.');
const stop=()=>{socket.close();chrome.kill('SIGTERM');process.exit(0);};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
await new Promise(()=>{});
