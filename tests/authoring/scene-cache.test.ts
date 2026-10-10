import {it,expect,vi} from 'vitest';
import {MapCompilerRuntime} from '../../src/shared/authoring/worker/runtime';
import {AuthoringTransferDecoder} from '../../src/shared/authoring/worker/transfer';
import {SceneSnapshotReader} from '../../src/shared/authoring/worker/scene';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralFixture} from './fixture';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import * as generators from '../../src/shared/authoring/generate';

it('loads a saved map in fresh workers without persistent artifacts or generators, preserving byte water buffers',async()=>{
 const preview=proceduralFixture(),compiled=compileMapScene(preview,landscapeAssets),history=new AuthoringHistory(preview.authoring!);history.apply(compiled);
 const text=stringifyUtcMap({...preview,authoring:history.document}),generate=vi.spyOn(generators,'generateScene');
 try{
  for(let load=0;load<2;load++){
   const map=parseUtcMap(JSON.parse(text))!,runtime=new MapCompilerRuntime(),result=runtime.compile({id:1,patch:map});
   expect(result).not.toHaveProperty('persist');if('error' in result.reply)throw Error(result.reply.error);
   const snapshot=await new AuthoringTransferDecoder().decode(result.reply.packet,async()=>{});
   const scene=new SceneSnapshotReader().read(snapshot,map);
   expect(scene.field.cellWater!.flow).toBeInstanceOf(Uint8Array);
   expect(scene.field.cellWater!.flow.subarray(0,4)).toHaveLength(4);
   expect(scene.field.samples).toEqual(compiled.field.samples);
   expect(scene.field.waterAt(127,129)).toBeCloseTo(compiled.field.waterAt(127,129));
   expect(scene.stamps).toEqual(compiled.stamps);
  }
  expect(generate).not.toHaveBeenCalled();
 }finally{generate.mockRestore();}
});
