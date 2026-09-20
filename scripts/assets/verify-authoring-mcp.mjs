/** Read-only end-to-end check against the same stdio server used by agents. */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','mcp/editor/index.ts'],cwd:process.cwd(),stderr:'pipe'});
const client=new Client({name:'authoring-verification',version:'1.0.0'});
transport.stderr?.on('data',data=>process.stderr.write(data));
try{
 await client.connect(transport);
 const {tools}=await client.listTools();for(const name of ['editor_scene','asset_schema','asset_author'])if(!tools.some(t=>t.name===name))throw Error('Missing MCP tool '+name);
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});if(result.isError)throw Error(JSON.stringify(result.content));const text=result.content.find(c=>c.type==='text')?.text;return text?JSON.parse(text):result;};
 const schema=await call('asset_schema',{});if(!schema.roles?.includes('geometry'))throw Error('Asset schema was not returned');
 const assets=await call('asset_author',{command:{op:'asset.list'}});if(!Array.isArray(assets)||!assets.length)throw Error('Asset library is empty');
 console.log(JSON.stringify({tools:tools.filter(t=>['editor_scene','asset_schema','asset_author'].includes(t.name)).map(t=>t.name),assets:assets.length,roles:schema.roles.length}));
 if(process.argv.includes('--scene')){const result=await call('editor_scene',{command:{action:'get'}});console.log(JSON.stringify({layers:result.scene.layers.length,generated:result.generated}));}
}finally{await client.close();await transport.close();}
