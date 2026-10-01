import {MCPServer} from '@mastra/mcp';
import {createTool} from '@mastra/core/tools';
import {z} from 'zod';
import {spellCommandSchema,documentSchema} from '../../tooling/spell-editor/shared/protocol';
const base='http://127.0.0.1:5177/__spells';
const server=new MCPServer({id:'utc-spells',name:'Under the Canopy Spell Editor',version:'1.0.0',description:'Independent spell authoring and real-simulation encounter controls. Start npm run dev:spells. No game or map-editor tab required.',tools:{
 spell_schema:createTool({id:'spell_schema',description:'Discover the spell document and command schemas.',inputSchema:z.object({}),execute:async()=>({document:z.toJSONSchema(documentSchema),commands:z.toJSONSchema(spellCommandSchema)})}),
 spell_author:createTool({id:'spell_author',description:'Read, validate, save or publish a spell, or control the shared Spell Editor encounter. Saving requires the revision returned by read; expectedRevision null creates a new document.',inputSchema:z.object({command:spellCommandSchema}),execute:async({command})=>{
  const response=await fetch(base+'/bootstrap',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Start the Spell Editor on port 5177');const {token}=await response.json() as {token:string};
  const result=await fetch(base+'/command',{method:'POST',headers:{'Content-Type':'application/json','X-Spell-Token':token},body:JSON.stringify(command),signal:AbortSignal.timeout(30000)});const body=await result.json();if(!result.ok)throw Error(body.error);return body;
 }}),
}});
await server.startStdio();
