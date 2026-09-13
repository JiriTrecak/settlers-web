import type {Plugin} from 'vite';
import type {IncomingMessage} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {StudioService} from './service';
export async function body(req:IncomingMessage,limit=1024*1024){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Request too large');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
export function assetStudio(root:string):Plugin {
 const service=new StudioService(root),ready=service.init(),credentials=service.credentials,token=randomBytes(32).toString('hex');
 return {name:'asset-studio-local-api',configureServer(server){
  server.middlewares.use('/__studio',async(req,res,next)=>{
   try{
    // A loopback binding alone does not prevent hostile websites from making requests.
    const host=req.headers.host||'',origin=req.headers.origin;
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||origin&&origin!==`http://${host}`){res.statusCode=403;res.end('Origin rejected');return;}
    if(req.method!=='GET'){
     const supplied=Buffer.from(String(req.headers['x-studio-token']||'')),expected=Buffer.from(token);
     if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.statusCode=403;res.end('Session token required');return;}
     if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON required');
    }
    await ready;
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    const url=new URL(req.url||'/',`http://${host}`);
    if(req.method==='GET'&&url.pathname==='/bootstrap'){res.end(JSON.stringify({token,credentials:await credentials.status()}));return;}
    if(req.method==='POST'&&url.pathname==='/credentials'){const data=await body(req,2048);if(typeof data.key!=='string')throw Error('Key is required');await credentials.set(data.key);res.end(JSON.stringify(await credentials.status()));return;}
    if(req.method==='GET'&&url.pathname==='/library'){res.end(JSON.stringify({assets:await service.snapshot(),styles:await service.styles(),uploads:await service.references()}));return;}
    if(req.method==='POST'&&url.pathname==='/references'){res.end(JSON.stringify(await service.uploadReference(await body(req,28*1024*1024))));return;}
    if(req.method==='GET'&&url.pathname==='/jobs'){res.end(JSON.stringify(service.list()));return;}
    if(req.method==='GET'&&url.pathname==='/assignments'){res.end(JSON.stringify(await service.assignmentTargets()));return;}
    if(req.method==='POST'&&url.pathname==='/assignments'){const data=await body(req);res.end(JSON.stringify(await service.assign(data.asset,data.definition,data.revision)));return;}
    if(req.method==='GET'&&url.pathname==='/model'){const model=await service.model(url.searchParams.get('id')||'');res.setHeader('Content-Type',model.mime);res.end(model.bytes);return;}
    if(req.method==='GET'&&url.pathname==='/image'){const image=await service.image(url.searchParams.get('file')||'');res.setHeader('Content-Type',image.mime);res.end(image.bytes);return;}
    if(req.method==='POST'&&url.pathname==='/jobs'){const data=await body(req,72*1024*1024);res.end(JSON.stringify(await service.create(data.request,data.import?Buffer.from(data.import,'base64'):undefined,data.mask?Buffer.from(data.mask,'base64'):undefined)));return;}
    const match=/^\/jobs\/([a-f0-9-]+)\/(process|approve|publish|cancel)$/.exec(url.pathname);
    if(req.method==='POST'&&match){const data=await body(req),id=match[1];let result;
     if(match[2]==='cancel')result=await service.cancel(id);
     if(match[2]==='process')result=await service.process(id,data.candidate,data.transform,data.export);
     if(match[2]==='approve')result=await service.approve(id,data.candidate,data.outputHash);
     if(match[2]==='publish')result=await service.publish(id,data.candidate);
     res.end(JSON.stringify(result));return;
    }
    next();
   }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:'Request failed'}));}
  });
 }};
}
