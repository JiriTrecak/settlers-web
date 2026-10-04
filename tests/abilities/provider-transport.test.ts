import {expect,it,vi} from 'vitest';
import {requestModelResponse} from '../../tooling/spell-editor/server/provider';
import {createOpenAI} from '@ai-sdk/openai';
import {generateText} from 'ai';

it('marks a pre-response transport failure retryable without leaking provider details',async()=>{
 const request=vi.fn().mockRejectedValue(new TypeError('fetch failed: test-secret'));
 const response=await requestModelResponse('{"store":false}','test-secret',new AbortController().signal,request);
 expect(response.status).toBe(503);
 const data=await response.text();expect(data).toContain('provider_unavailable');expect(data).not.toContain('test-secret');
 expect(request).toHaveBeenCalledTimes(1); // Retry belongs to the SDK, never a tool replay.
});
it('passes provider responses and streaming bodies through without consuming or replaying them',async()=>{
 for(const status of [200,400,401,429,503]){
  const upstream=new Response('stream or error',{status}),request=vi.fn().mockResolvedValue(upstream);
  const response=await requestModelResponse('{"store":false}','test-key',new AbortController().signal,request);
  expect(response).toBe(upstream);expect(response.bodyUsed).toBe(false);expect(request).toHaveBeenCalledTimes(1);
 }
});
it('does not reinterpret a caller cancellation as a retryable outage',async()=>{
 const controller=new AbortController();controller.abort();
 const error=new DOMException('Cancelled','AbortError');
 await expect(requestModelResponse('{}','test-key',controller.signal,vi.fn().mockRejectedValue(error))).rejects.toBe(error);
});
it('bounds a provider that never sends response headers',async()=>{
 const timeout=new AbortController(),timer=vi.spyOn(AbortSignal,'timeout').mockReturnValue(timeout.signal);try{
  const request=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true})));
  const pending=requestModelResponse('{}','test-key',new AbortController().signal,request);
  expect(timer).toHaveBeenCalledWith(180_000);timeout.abort(new DOMException('Timed out','TimeoutError'));
  expect((await pending).status).toBe(503);expect(request).toHaveBeenCalledTimes(1);
 }finally{timer.mockRestore();}
});
it('allows the model SDK to recover from a transient transport failure without replaying editor tools',async()=>{
 const upstream=vi.fn<typeof fetch>()
  .mockRejectedValueOnce(new TypeError('fetch failed'))
  .mockResolvedValueOnce(Response.json({id:'resp_test',created_at:1,model:'test-model',status:'completed',output:[{
   id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Recovered',annotations:[]}],
  }],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));
 const provider=createOpenAI({apiKey:'test-capability',baseURL:'http://editor.invalid/provider',fetch:(_url,init)=>
  requestModelResponse(String(init?.body),'test-key',init?.signal??new AbortController().signal,upstream)});
 const result=await generateText({model:provider.responses('test-model'),prompt:'Return a recovery acknowledgement.',maxRetries:1});
 expect(result.text).toBe('Recovered');expect(upstream).toHaveBeenCalledTimes(2);
});
