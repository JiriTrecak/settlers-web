import {createTool} from '@mastra/core/tools';
import {z} from 'zod';
import {assetCommandSchema} from '../../src/shared/authoring/commands';
import {assetDefinitionSchema,FILE_ROLES,ROLE_FORMATS} from '../../src/shared/authoring/asset';
/** Uses the Studio transaction queue, never a second filesystem writer. */
export async function assetStudioCommand(input:unknown){
 const command=assetCommandSchema.parse(input),base='http://127.0.0.1:5175/__studio';
 const boot=await fetch(base+'/bootstrap',{signal:AbortSignal.timeout(5000)});if(!boot.ok)throw Error('Start Asset Studio on port 5175');const {token}=await boot.json() as {token:string};
 const response=await fetch(base+'/authoring',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify(command),signal:AbortSignal.timeout(60000)});
 const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error??'Asset operation failed');return result;
}
export function assetTools(){return {
 asset_schema:createTool({id:'asset_schema',description:'Read the canonical asset definition and role/format rules shared by the asset editor, runtime compiler and MCP. No arbitrary filenames: geometry.glb, geometry_2.glb, albedo.png, etc.',inputSchema:z.object({}),execute:async()=>({definition:z.toJSONSchema(assetDefinitionSchema),roles:FILE_ROLES,formats:ROLE_FORMATS})}),
 asset_author:createTool({id:'asset_author',description:'List/get/create/save/validate canonical assets or upload a base64 resource by role and sequence. Mutations require the current expectedRevision and use the same validated transaction queue as the UI. Start Asset Studio on port 5175. Create empty drafts, then upload. Saving does not publish runtime outputs.',inputSchema:z.object({command:assetCommandSchema}).strict(),execute:async input=>assetStudioCommand(input.command)}),
};}
