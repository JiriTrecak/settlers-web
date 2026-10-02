import {AsyncEntry} from '@napi-rs/keyring';
import {createHash} from 'node:crypto';
import {z} from 'zod';

export const settingsSchema=z.object({model:z.enum(['gpt-6.1-sol','gpt-6-luna','gpt-6-astra']).default('gpt-6.1-sol'),imageModel:z.enum(['gpt-image-2.5-sunburst','gpt-image-2.5-flare']).default('gpt-image-2.5-sunburst')}).strict();
export type AgentSettings=z.infer<typeof settingsSchema>;
export interface CredentialEntry {getPassword():Promise<string|null|undefined>;setPassword(value:string):Promise<void>;deletePassword():Promise<boolean>}
/** The entire credential record lives in the OS keychain, never in the project or browser. */
export class Credentials {
 private entry?:CredentialEntry;
 constructor(private root:string,entry?:CredentialEntry){this.entry=entry;}
 private store(){return this.entry??=new AsyncEntry('Under the Canopy Spell Studio',createHash('sha256').update(this.root).digest('hex').slice(0,24),{linux:{store:'secret-service'}});}
 private async read(){const raw=await this.store().getPassword();return raw?z.object({key:z.string(),settings:settingsSchema}).parse(JSON.parse(raw)):{key:'',settings:settingsSchema.parse({})};}
 async status(){try{const record=await this.read();return {...record.settings,configured:!!record.key,storage:'OS credential store',available:true};}catch{return {...settingsSchema.parse({}),configured:false,storage:'OS credential store',available:false};}}
 async key(){let record;try{record=await this.read();}catch{throw Error('Unlock your operating-system credential store, then reopen Settings.');}if(!record.key)throw Error('Add your OpenAI API key in Settings first.');return record.key;}
 async settings(){return (await this.read()).settings;}
 async save(input:unknown){const data=settingsSchema.extend({apiKey:z.string().trim().min(12).max(512).optional()}).strict().parse(input);const current=await this.read();await this.store().setPassword(JSON.stringify({key:data.apiKey??current.key,settings:settingsSchema.parse({model:data.model,imageModel:data.imageModel})}));return this.status();}
 async clear(){await this.store().deletePassword();return this.status();}
}
