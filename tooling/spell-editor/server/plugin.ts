import type {Plugin} from 'vite';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {within} from '../../asset-studio/server/storage';
import {SpellEditorService} from './service';
import {spellCommandSchema} from '../shared/protocol';
import {z} from 'zod';
export function spellEditor(root:string):Plugin{
 const service=new SpellEditorService(root),token=randomBytes(24).toString('hex');
 return {name:'spell-editor-service',configureServer(server){
  let last=performance.now();const timer=setInterval(()=>{const now=performance.now();service.advance(now-last);last=now;},25);server.httpServer?.once('close',()=>clearInterval(timer));
  server.middlewares.use(async(req,res,next)=>{
   if(!/^(127\.0\.0\.1|localhost):5177$/.test(req.headers.host??'')){res.statusCode=403;res.end('Local editor only');return;}
   const url=new URL(req.url??'/','http://127.0.0.1:5177');
   if(url.pathname.startsWith('/runtime-assets/')){
    try{const file=await within(root,'assets/library/'+decodeURIComponent(url.pathname.slice('/runtime-assets/'.length)));if(!file.startsWith(path.resolve(root,'assets/library')+path.sep))throw Error('Invalid resource');const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}return;
   }
   if(!url.pathname.startsWith('/__spells'))return next();
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   const origin=req.headers.origin;
   if(origin&&origin!==`http://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Local same-origin requests only'}));return;}
   try{
    if(url.pathname==='/__spells/bootstrap'&&req.method==='GET'){res.end(JSON.stringify({token,schema:z.toJSONSchema(spellCommandSchema)}));return;}
    if(req.headers['x-spell-token']!==token){res.statusCode=403;res.end(JSON.stringify({error:'Invalid editor token'}));return;}
    if(url.pathname==='/__spells/state'&&req.method==='GET'){res.end(JSON.stringify(service.state()));return;}
    if(url.pathname!=='/__spells/command'){res.statusCode=404;res.end();return;}
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1_000_000)throw Error('Request exceeds 1 MB');}
    res.end(JSON.stringify(await service.execute(JSON.parse(body))));
   }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:String(e)}));}
  });
 }};
}
