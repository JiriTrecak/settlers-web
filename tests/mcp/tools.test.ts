import {expect,it} from 'vitest';
import {z} from 'zod';
import {editorTools} from '../../mcp/editor/tools';
import {assetTools} from '../../mcp/editor/assetTools';
import type {EditorHub} from '../../mcp/editor/hub';

it('exposes object-root JSON schemas for every discoverable MCP tool',()=>{
 for(const [name,tool] of Object.entries({...editorTools({} as EditorHub),...assetTools()}))
  expect(z.toJSONSchema(tool.inputSchema as z.ZodType).type,name).toBe('object');
});
it('still validates checkpoint load and save payloads',()=>{
 const schema=editorTools({} as EditorHub).game_checkpoint.inputSchema as z.ZodType;
 expect(schema.safeParse({action:'save'}).success).toBe(true);
 expect(schema.safeParse({action:'load',save:{}}).success).toBe(true);
 expect(schema.safeParse({action:'load'}).success).toBe(false);
 expect(schema.safeParse({action:'save',save:{}}).success).toBe(false);
});
