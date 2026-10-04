import {expect,it} from 'vitest';
import {MCPServer} from '@mastra/mcp';
import {createTool} from '@mastra/core/tools';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {editorMcpResult,editorResultSchema} from '../../mcp/spells/result';

it('delivers native image blocks and metadata across the real MCP client/server protocol',async()=>{
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
 const server=new MCPServer({id:'image-proof',name:'Image proof',version:'1.0.0',tools:{inspect:createTool({id:'inspect',description:'Local transport fixture',inputSchema:z.object({image:z.boolean()}),outputSchema:editorResultSchema,execute:async input=>editorMcpResult(input.image?{asset:'asset.test',width:1,height:1,image}:{saved:true,revision:'test'})})}});
 const client=new Client({name:'image-proof',version:'1.0.0'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.getServer().connect(a);await client.connect(b);
  const result=await client.callTool({name:'inspect',arguments:{image:true}});
  expect(result.isError).toBe(false);expect(result.structuredContent).toEqual({asset:'asset.test',width:1,height:1});
  expect(result.content).toEqual([{type:'text',text:JSON.stringify(result.structuredContent)},{type:'image',mimeType:'image/png',data:image.split(',')[1]}]);
  const plain=await client.callTool({name:'inspect',arguments:{image:false}});
  expect(plain.isError).toBe(false);expect(plain.structuredContent).toEqual({result:{saved:true,revision:'test'}});
  expect(plain.content).toEqual([{type:'text',text:'{"saved":true,"revision":"test"}'}]);
 }finally{await client.close();await server.getServer().close();}
});
it('rejects external paths, malformed image URLs and oversized data without reading them',()=>{
 for(const image of ['https://example.com/image.png','file:///etc/passwd','data:text/html;base64,QQ==','data:image/png;base64,!!','data:image/png;base64,'+'A'.repeat(8_000_000)])expect(()=>editorMcpResult({image})).toThrow('Invalid editor image');
 expect(editorMcpResult([1,2]).structuredContent).toEqual({result:[1,2]});
});
