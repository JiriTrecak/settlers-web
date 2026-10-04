import {expect,it,vi} from 'vitest';
import {editorTools} from '../../mcp/editor/tools';
import type {EditorHub} from '../../mcp/editor/hub';

it('forwards capture and checkpoints through existing game operations',async()=>{
 const call=vi.fn(async()=>({ok:true}));
 const tools=editorTools({call} as unknown as EditorHub);
 await tools.game_performance.execute!({action:'capture'},{} as never);
 expect(call).toHaveBeenLastCalledWith('gamePerformance',{action:'capture'},undefined);
 await tools.game_checkpoint.execute!({action:'save'},{} as never);
 expect(call).toHaveBeenLastCalledWith('gameSave',undefined,undefined);
 const save={v:4,world:{tick:20}};
 await tools.game_checkpoint.execute!({action:'load',save},{} as never);
 expect(call).toHaveBeenLastCalledWith('gameLoad',{save},undefined);
});

it('defaults to reading performance and rejects unintended diagnostic operations',async()=>{
 const tools=editorTools({call:vi.fn()} as unknown as EditorHub);
 const performance=tools.game_performance.inputSchema!['~standard'];
 const checkpoint=tools.game_checkpoint.inputSchema!['~standard'];
 expect(await performance.validate({})).toEqual({value:{action:'get'}});
 expect(await performance.validate({action:'reset'})).toHaveProperty('issues');
 expect(await checkpoint.validate({action:'delete'})).toHaveProperty('issues');
 expect(await checkpoint.validate({action:'save',save:{}})).toHaveProperty('issues');
});
