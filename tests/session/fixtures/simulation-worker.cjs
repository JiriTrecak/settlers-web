// Node harness for the actual browser worker entry/protocol. No alternate sim.
const {parentPort,workerData}=require('node:worker_threads');
require('tsx/cjs');
const scope=globalThis;
scope.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
scope.onmessage=null;
globalThis.self=scope;
if(workerData?.benchmark){
  const {SimulationRuntime}=require('../../../src/session/worker/runtime.ts');
  const advance=SimulationRuntime.prototype.advance,samples=[];
  let finished=false;
  SimulationRuntime.prototype.advance=function(...args){
    const begin=performance.now(),count=advance.apply(this,args);
    if(count&&this.world.clock.tickIndex>=200)samples.push(performance.now()-begin);
    if(!finished&&this.world.clock.tickIndex>=workerData.benchmark.ticks){
      finished=true;this.setPaused(true);
      parentPort.postMessage({type:'benchmark-complete',samples,checksum:this.world.checksum(),tick:this.world.clock.tickIndex,routing:this.world.settlement.spatial.routing});
    }
    return count;
  };
}
require('../../../src/session/worker/entry.ts');
parentPort.on('message',data=>{
  // Test-only stall; absent from the production worker protocol.
  if(data.type==='test-stall'){
    const end=performance.now()+data.ms;
    parentPort.postMessage({type:'test-stall-started'});
    while(performance.now()<end){}
    parentPort.postMessage({type:'test-stall-ended'});return;
  }
  scope.onmessage({data});
});
