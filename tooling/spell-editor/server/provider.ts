/** The SDK retries 503 responses. Never expose fetch errors, headers or credentials
 * to the assistant, and never retry editor mutations alongside model transport. */
export async function requestModelResponse(body:string,key:string,signal:AbortSignal,request:typeof fetch=fetch):Promise<Response>{
 try{
  return await request('https://api.openai.com/v1/responses',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body,
   signal:AbortSignal.any([signal,AbortSignal.timeout(180_000)]),
  });
 }catch(error){
  // A user cancellation/disconnected caller must not become an automatic retry.
  if(signal.aborted)throw error;
  return Response.json({error:{message:'The connection to OpenAI was interrupted. Retry the request; existing editor changes are preserved.',type:'provider_unavailable'}},{status:503});
 }
}
