import {SpellEditorService} from './service';

/** Libraries share transactional storage; mutable encounters belong to one tab. */
export class PreviewSessions {
 readonly headless:SpellEditorService;
 private sessions=new Map<string,{service:SpellEditorService;seen:number}>();
 constructor(readonly root:string,private now=Date.now){this.headless=new SpellEditorService(root);}
 resolve(client?:string){
  const now=this.now();
  for(const [id,session] of this.sessions)if(now-session.seen>3_600_000)this.sessions.delete(id);
  if(!client){
   const active=[...this.sessions.values()].filter(s=>now-s.seen<15_000);
   if(active.length>1)throw Error('Multiple Spell Studio tabs are open. Close unused tabs before controlling an encounter through MCP, or send X-Studio-Client for the intended tab.');
   return active[0]?.service??this.headless;
  }
  let session=this.sessions.get(client);
  if(!session){
   if(this.sessions.size>=32)throw Error('Too many editor preview sessions. Close unused tabs and restart the editor server. Saved content is preserved.');
   session={service:new SpellEditorService(this.root),seen:now};this.sessions.set(client,session);
  }
  session.seen=now;return session.service;
 }
 advance(milliseconds:number){
  this.headless.advance(milliseconds);
  const now=this.now();
  for(const [id,session] of this.sessions){
   if(now-session.seen>3_600_000)this.sessions.delete(id);
   else if(now-session.seen<15_000)session.service.advance(milliseconds);
  }
 }
}
