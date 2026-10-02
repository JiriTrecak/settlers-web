export async function call(name:string,input:unknown,sessionId:string,signal?:AbortSignal){
 const response=await fetch('http://127.0.0.1:5177/__spells/internal/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.CANOPY_AGENT_TOKEN},body:JSON.stringify({name,input,sessionId}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(300000)]):AbortSignal.timeout(300000)});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Editor tool failed');return result;
}
