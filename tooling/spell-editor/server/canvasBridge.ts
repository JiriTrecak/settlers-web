import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export const canvasReplySchema=z.object({id:z.string().uuid(),result:z.object({workspace:z.enum(['spells','effects']),id:z.string(),dirty:z.boolean(),image:z.string().max(8_000_000).optional()}).strict().optional(),error:z.string().max(2000).optional()}).strict();
export type CanvasAction={workspace:'current'|'spells'|'effects';id:string;capture:boolean};
type Reply=z.infer<typeof canvasReplySchema>['result'];
/** Requests are addressed to a single browser tab, never broadcast to whichever tab answers first. */
export class CanvasBridge {
 private clients=new Map<string,number>();
 private requests=new Map<string,{client:string;action:CanvasAction;resolve:(value:NonNullable<Reply>)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 poll(client:string){this.clients.set(client,Date.now());return [...this.requests].filter(([,r])=>r.client===client).map(([id,r])=>({requestId:id,...r.action}));}
 async request(action:CanvasAction,client?:string){client??=[...this.clients].filter(([,at])=>Date.now()-at<5000).sort((a,b)=>b[1]-a[1])[0]?.[0];if(!client||Date.now()-(this.clients.get(client)??0)>5000)throw Error('Open the editor canvas in a browser to use this tool.');const id=randomUUID();return new Promise<NonNullable<Reply>>((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(id);reject(Error('Canvas did not respond. Keep the editor tab open and retry.'));},30000);this.requests.set(id,{client:client!,action,resolve,reject,timer});});}
 reply(client:string,raw:unknown){const data=canvasReplySchema.parse(raw),pending=this.requests.get(data.id);if(!pending||pending.client!==client)throw Error('Unknown canvas request');clearTimeout(pending.timer);this.requests.delete(data.id);if(data.error)pending.reject(Error(data.error));else if(data.result)pending.resolve(data.result);else pending.reject(Error('Canvas returned no result'));}
 dispose(){for(const r of this.requests.values()){clearTimeout(r.timer);r.reject(Error('Editor closed'));}this.requests.clear();}
}
