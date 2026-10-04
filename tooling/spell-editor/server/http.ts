import type {Plugin} from 'vite';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {within} from '../../asset-studio/server/storage';
import {PreviewSessions} from './previewSessions';
import {spellCommandSchema} from '../shared/protocol';
import {toolRequestSchema} from '../shared/authoringTools';
import {Credentials} from './credentials';
import {CanvasBridge} from './canvasBridge';
import {AuthoringToolkit} from './authoringTools';
import {AgentRuntime} from './agentRuntime';
import {AgentImages} from './agentImages';
import {requestModelResponse} from './provider';
import {z} from 'zod';

async function body(req:IncomingMessage,limit=1_000_000){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>limit)throw Error('Request exceeds size limit');}return text;}
async function relay(response:Response,res:ServerResponse){res.statusCode=response.status;res.setHeader('Content-Type',response.headers.get('content-type')??'application/json');for(const [key,value] of response.headers)if(key.startsWith('x-eve-'))res.setHeader(key,value);if(!response.body){res.end();return;}const stream=Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);res.once('close',()=>stream.destroy());stream.on('error',()=>res.end());stream.pipe(res);}
export function spellEditor(root:string):Plugin{
 const sessions=new PreviewSessions(root),images=new AgentImages(),token=randomBytes(24).toString('hex'),capability=randomBytes(32).toString('hex');
 const credentials=new Credentials(root),canvas=new CanvasBridge(),toolkit=new AuthoringToolkit(sessions.headless,credentials,canvas,fetch,client=>sessions.resolve(client)),agent=new AgentRuntime(root,capability,credentials);
 return {name:'spell-editor-service',configureServer(server){
  let last=performance.now();const timer=setInterval(()=>{const now=performance.now();sessions.advance(now-last);last=now;},25);server.httpServer?.once('close',()=>{clearInterval(timer);canvas.dispose();agent.stop();images.clear();});
  server.middlewares.use(async(req,res,next)=>{
   if(!/^(127\.0\.0\.1|localhost):5177$/.test(req.headers.host??'')){res.statusCode=403;res.end('Local editor only');return;}
   const url=new URL(req.url??'/','http://127.0.0.1:5177');
   if(url.pathname.startsWith('/runtime-assets/')){
    try{const file=await within(root,'assets/library/'+decodeURIComponent(url.pathname.slice('/runtime-assets/'.length)));if(!file.startsWith(path.resolve(root,'assets/library')+path.sep))throw Error('Invalid resource');const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}return;
   }
   if(!url.pathname.startsWith('/__spells'))return next();
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   const origin=req.headers.origin;
   if(origin&&origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']==='cross-site'){res.statusCode=403;res.end(JSON.stringify({error:'Local same-origin requests only'}));return;}
   try{
    // Eve's only outbound route: a fixed OpenAI endpoint with the actual key injected here.
    if(url.pathname.startsWith('/__spells/provider/')||url.pathname==='/__spells/internal/tool'){
     if(req.headers.authorization!=='Bearer '+capability||req.method!=='POST'){res.statusCode=403;res.end();return;}
     if(url.pathname==='/__spells/internal/tool'){
      const data=JSON.parse(await body(req)),tool=toolRequestSchema.parse({name:data.name,input:data.input});
      const client=agent.clients.get(data.sessionId);if(!client)throw Error('Unknown authoring session. Start a new conversation.');
      const controller=new AbortController();res.once('close',()=>controller.abort());
      res.end(JSON.stringify(images.register(await toolkit.execute(tool.name,tool.input,client,controller.signal))));return;
     }
     if(url.pathname!=='/__spells/provider/v1/responses'){res.statusCode=404;res.end();return;}
     const data=images.hydrate(JSON.parse(await body(req,12_000_000)));data.store=false;
     const controller=new AbortController();res.once('close',()=>controller.abort());
     const response=await requestModelResponse(JSON.stringify(data),await credentials.key(),controller.signal);
     if(!response.ok){res.statusCode=response.status;res.end(JSON.stringify({error:{message:response.status>=500?'OpenAI is temporarily unavailable. Retry the request; existing editor changes are preserved.':`OpenAI request failed (${response.status}). Check the API key, quota and selected model in Settings.`,type:'provider_error'}}));return;}
     await relay(response,res);return;
    }
    if(url.pathname==='/__spells/bootstrap'&&req.method==='GET'){res.end(JSON.stringify({token,schema:z.toJSONSchema(spellCommandSchema)}));return;}
    if(req.headers['x-spell-token']!==token){res.statusCode=403;res.end(JSON.stringify({error:'Invalid editor token'}));return;}
    const client=z.string().uuid().optional().parse(req.headers['x-studio-client']);
    if(url.pathname==='/__spells/settings'){
     if(req.method==='GET')res.end(JSON.stringify(await credentials.status()));
     else if(req.method==='PUT'){const result=await credentials.save(JSON.parse(await body(req,4096)));agent.stop();images.clear();res.end(JSON.stringify(result));}
     else if(req.method==='DELETE'){agent.stop();images.clear();res.end(JSON.stringify(await credentials.clear()));}
     else{res.statusCode=405;res.end();}return;
    }
    if(url.pathname==='/__spells/canvas'){
     if(!client)throw Error('A browser client ID is required');
     if(req.method==='GET')res.end(JSON.stringify(canvas.poll(client)));
     else if(req.method==='POST'){canvas.reply(client,JSON.parse(await body(req,8_100_000)));res.end('{}');}
     else{res.statusCode=405;res.end();}return;
    }
    if(url.pathname==='/__spells/tool'&&req.method==='POST'){const data=toolRequestSchema.parse(JSON.parse(await body(req)));res.end(JSON.stringify(await toolkit.execute(data.name,data.input,client)));return;}
    if(url.pathname.startsWith('/__spells/agent/')){
     if(!client)throw Error('A browser client ID is required');
     const route=url.pathname.slice('/__spells/agent'.length);
     const match=/^\/eve\/v1\/session(?:\/(wrun_[a-zA-Z0-9_-]+)(?:\/(stream|cancel|clear|compact|reset))?)?$/.exec(route);
     if(!match||!['GET','POST'].includes(req.method??'')){res.statusCode=404;res.end();return;}
     const sessionId=match[1];if(sessionId&&agent.clients.get(sessionId)!==client)throw Error('This chat belongs to another editor tab or a previous server session. Start a new chat.');
     await credentials.key();const host=await agent.ensure();
     const response=await fetch(host+route+url.search,{method:req.method,headers:{Authorization:'Bearer '+capability,'Content-Type':'application/json'},body:req.method==='POST'?(await body(req,100000))||undefined:undefined,redirect:'error'});
     if(!sessionId&&response.ok){const result=await response.json();if(result.sessionId)agent.clients.set(result.sessionId,client);res.end(JSON.stringify(result));return;}
     await relay(response,res);return;
    }
    if(url.pathname==='/__spells/state'&&req.method==='GET'){res.end(JSON.stringify(sessions.resolve(client).state()));return;}
    if(url.pathname!=='/__spells/command'){res.statusCode=404;res.end();return;}
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    res.end(JSON.stringify(await sessions.resolve(client).execute(JSON.parse(await body(req)))));
   }catch(e){if(!res.headersSent)res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:String(e)}));}
  });
 }};
}
