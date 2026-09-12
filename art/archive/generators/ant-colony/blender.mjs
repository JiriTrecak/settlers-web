import {readFileSync} from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'ant-colony-workshop',version:'1.0.0'});
try {
 await client.connect(new StdioClientTransport({command:'/Users/jiritrecak/.local/bin/uv',args:['--directory','/Users/jiritrecak/blender_mcp/mcp','run','blender-mcp'],stderr:'inherit'}));
 const result=await client.callTool({name:'execute_blender_code',arguments:{code:readFileSync(process.argv[2]??'scripts/ant-colony/models.py','utf8')}},undefined,{timeout:240000});
 for(const content of result.content??[])if(content.type==='text')console.log(content.text);
 if(result.isError)process.exitCode=1;
}finally{await client.close();}
