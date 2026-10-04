import {describe,it,expect} from 'vitest';
import {createOpenAI} from '@ai-sdk/openai';
import {AgentImages} from '../../tooling/spell-editor/server/agentImages';
import {agentImageModelOutput,agentImagePrefix} from '../../tooling/spell-editor/shared/agentImages';

const image='data:image/png;base64,aW1hZ2U=';
const pixel=(i:number)=>'data:image/png;base64,'+Buffer.from('image'+i).toString('base64');
function request(reference:string){return {input:[{type:'function_call_output',call_id:'capture',output:[{type:'input_text',text:agentImagePrefix+reference}]}]};}
describe('assistant image transport',()=>{
 it('keeps large pixels out of Eve history but delivers them as Responses input_image after SDK conversion',async()=>{
  const images=new AgentImages(),large='data:image/png;base64,'+'A'.repeat(800000),registered=images.register({workspace:'effects',image:large});
  const output=agentImageModelOutput(registered);expect(JSON.stringify(output).length).toBeLessThan(500);if(output.type!=='content')throw Error('Expected image content');
  let wire:any;
  const provider=createOpenAI({apiKey:'test-only',fetch:async(_url,init)=>{wire=images.hydrate(JSON.parse(String(init?.body)));throw Error('Captured locally; no network');}});
  await expect(provider.responses('gpt-6.1-sol').doGenerate({prompt:[{role:'assistant',content:[{type:'tool-call',toolCallId:'capture',toolName:'studio_canvas',input:'{}'}]},{role:'tool',content:[{type:'tool-result',toolCallId:'capture',toolName:'studio_canvas',output}]}]})).rejects.toThrow('Captured locally');
  const parts=wire.input.find((item:any)=>item.type==='function_call_output').output;
  expect(parts[0]).toMatchObject({type:'input_text'});expect(parts[1]).toEqual({type:'input_image',image_url:large});
 });
 it('bounds recent images without telling the model to repeatedly reopen reviewed history',()=>{
  const images=new AgentImages(),refs=Array.from({length:10},(_,i)=> (images.register({image:pixel(i),asset:'asset.test'}) as any).imageReference);
  const input=refs.flatMap(ref=>request(ref).input),hydrated=images.hydrate({input});
  expect(hydrated.input.flatMap((item:any)=>item.output).filter((part:any)=>part.type==='input_image')).toHaveLength(8);
  expect(hydrated.input[0].output[0].text).toContain('do not reopen already reviewed images');
  expect(input[0].output[0].text).toBe(agentImagePrefix+refs[0]);
  images.clear();expect(images.hydrate(request(refs[4])).input[0].output[0].text).toContain('not attached');
 });
 it('attaches all four icons from a comparison batch after SDK serialization',async()=>{
  const images=new AgentImages();let wire:any;
  const outputs=Array.from({length:4},(_,i)=>{const output=agentImageModelOutput(images.register({asset:'asset.test.'+i,image:pixel(i)}));if(output.type!=='content')throw Error('Expected image content');return output;});
  const provider=createOpenAI({apiKey:'test-only',fetch:async(_url,init)=>{wire=images.hydrate(JSON.parse(String(init?.body)));throw Error('Captured locally; no network');}});
  await expect(provider.responses('gpt-6.1-sol').doGenerate({prompt:[
   {role:'assistant',content:outputs.map((_,i)=>({type:'tool-call' as const,toolCallId:'image-'+i,toolName:'studio_asset_image',input:'{}'}))},
   {role:'tool',content:outputs.map((output,i)=>({type:'tool-result' as const,toolCallId:'image-'+i,toolName:'studio_asset_image',output}))},
  ]})).rejects.toThrow('Captured locally');
  const results=wire.input.filter((item:any)=>item.type==='function_call_output');
  expect(results).toHaveLength(4);results.forEach((result:any,i:number)=>expect(result.output[1]).toEqual({type:'input_image',image_url:pixel(i)}));
 });
 it('bounds hydrated bytes and does not multiply pixels for repeated references',()=>{
  const images=new AgentImages(),large='data:image/png;base64,'+'A'.repeat(6*1024*1024);
  const refs=Array.from({length:3},()=> (images.register({image:large}) as any).imageReference);
  const output=images.hydrate({input:refs.flatMap(ref=>request(ref).input)});
  expect(output.input.flatMap((item:any)=>item.output).filter((part:any)=>part.type==='input_image')).toHaveLength(1);
  const duplicate=images.hydrate({input:[...request(refs[2]).input,...request(refs[2]).input]});
  expect(duplicate.input.flatMap((item:any)=>item.output).filter((part:any)=>part.type==='input_image')).toHaveLength(1);
 });
 it('deduplicates repeated inspections by pixels and attaches the newest occurrence without displacing other images',()=>{
  const images=new AgentImages();
  const refs=Array.from({length:8},(_,i)=>(images.register({image:pixel(i)}) as any).imageReference);
  const repeated=Array.from({length:12},()=>images.register({image:pixel(0),asset:'asset.test.same'}) as any);
  expect(repeated.every(r=>r.imageReference===refs[0]&&r.imagePreviouslyReturned)).toBe(true);
  const input=[...refs,...repeated.map(r=>r.imageReference)].flatMap(ref=>request(ref).input);
  const result=images.hydrate({input}).input;
  expect(result.flatMap((item:any)=>item.output).filter((part:any)=>part.type==='input_image')).toHaveLength(8);
  expect(result[0].output[0].text).toContain('most recent result');
  expect(result.at(-1)!.output[0]).toEqual({type:'input_image',image_url:pixel(0)});
  expect(input[0].output[0].text).toBe(agentImagePrefix+refs[0]);
 });
 it('distinguishes earlier pixel delivery from a later historical omission',()=>{
  const images=new AgentImages(),first=(images.register({image}) as any).imageReference;
  images.hydrate(request(first));
  const refs=Array.from({length:8},(_,i)=>(images.register({image:pixel(i)}) as any).imageReference);
  const result=images.hydrate({input:[first,...refs].flatMap(ref=>request(ref).input)});
  expect(result.input[0].output[0].text).toContain('pixels were attached to an earlier model request');
  expect(result.input[0].output[0].text).toContain('does not mean the original tool returned metadata only');
 });
 it('expires/evicts bytes and never resolves arbitrary URLs, paths or unknown references',()=>{
  let now=0;const images=new AgentImages(()=>now,image.length+1,10);
  const first=(images.register({image}) as any).imageReference,second=(images.register({image:pixel(1)}) as any).imageReference;
  expect(images.hydrate(request(first)).input[0].output[0].type).toBe('input_text');
  expect(images.hydrate(request(second)).input[0].output[0].type).toBe('input_image');
  now=11;expect(images.hydrate(request(second)).input[0].output[0].type).toBe('input_text');
  for(const value of ['https://example.com/image.png','file:///etc/passwd','data:text/html;base64,QQ=='])expect(()=>images.register({image:value})).toThrow('Invalid editor image');
  expect(images.hydrate(request('unknown')).input[0].output[0].type).toBe('input_text');
 });
});
