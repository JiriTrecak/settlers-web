/** Capture the actual running game through its existing editor/game MCP hub.
 * Open an isolated game tab first; --map guards against loading an unrelated map.
 * --load restores a verified local save without adding it to the user's library.
 * --read-capture exports a capture started in the debug UI without restarting it.
 * --prepare-only restores/positions the battle and exits before capture, so the
 * UI capture button and input workload can be exercised together without a
 * tool round trip consuming the ten-second measurement window.
 * Do not run CPU benchmarks during capture. Leave the browser idle unless
 * --interaction describes a deliberately exercised input workload.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {EditorHub} from '../../mcp/editor/hub';
const args=process.argv.slice(2),option=(key:string,fallback='')=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]??fallback;};
const expected=option('--map');if(!expected)throw Error('--map is required');
const interaction=option('--interaction');
const hub=new EditorHub();
try{
 await hub.listen();
 const deadline=Date.now()+15000;
 while(!hub.connected&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));
 const before=await hub.call('gameStatus') as {map:string;tick:number};
 if(before.map!==expected)throw Error(`Expected ${expected}, connected to ${before.map}`);
 const setup=option('--export-setup');if(setup){
  const save=await hub.call('gameSave',{},30000) as {match:unknown};
  writeFileSync(setup,JSON.stringify(save.match,null,2));
  console.log(JSON.stringify({setup}));
 }else if(args.includes('--read-capture')){
 const performance=await hub.call('gamePerformance',{action:'get'},15000) as {capture:unknown};
 if(!performance.capture)throw Error('No completed browser capture; finish the debug UI capture first');
 const path=option('--output','/tmp/browser-budget.json');
 writeFileSync(path,JSON.stringify({scope:'Existing debug UI capture. Start state was not recorded by this script; use for input instrumentation verification, not reproducible battle comparison.',interaction:interaction||'Unspecified manual capture',end:before,...performance},null,2));
 console.log(JSON.stringify({path}));
 }else{
 const file=option('--load');if(file){
  const save=JSON.parse(readFileSync(file,'utf8'));if(save.mapId!==expected)throw Error('Save belongs to another map');
  await hub.call('gameLoad',{save},30000);
 }
 const x=option('--x'),z=option('--z');
 if(x&&z)await hub.call('gameView',{x:Number(x),z:Number(z),cameraMode:'rts'});
 if(args.includes('--prepare-only')){
  console.log(JSON.stringify({prepared:true,map:expected}));
 }else{
 // Give resource uploads/first presentation a separate warm-up before capturing.
 await new Promise(r=>setTimeout(r,3000));
 const start=await hub.call('gameStatus');
 const mode=option('--mode','budget');if(mode!=='budget'&&mode!=='details')throw Error('--mode must be budget or details');
 await hub.call('gamePerformance',{action:'capture',mode},15000);
 console.log(interaction?`Capturing 10 seconds; exercise input now: ${interaction}`:'Capturing 10 seconds without browser interaction');
 await new Promise(r=>setTimeout(r,11000));
 const performance=await hub.call('gamePerformance',{action:'get'},15000) as {capture:unknown};
 if(!performance.capture)throw Error('Browser did not complete its capture');
 const end=await hub.call('gameStatus');
 const path=option('--output','/tmp/browser-budget.json');
 writeFileSync(path,JSON.stringify({scope:'Actual game browser. cpuBudget correlates measured roots in 25 ms windows and labels remaining coverage gaps. Independent timing percentiles and delivery latency must not be summed.',interaction:interaction||'No browser interaction',start,end,...performance},null,2));
 console.log(JSON.stringify({path}));
 }
 }
}finally{hub.stop();}
