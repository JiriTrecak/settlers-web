/** Replay exported AI navigation inputs without running an entire match.
 * node --import tsx scripts/bench/replay-ai-navigation.ts /tmp/ai-navigation-probe.json
 * Captured and replay timings have different cache histories; compare search
 * work and answers first. Neither timing is a match-budget acceptance result.
 */
import {readFileSync} from 'node:fs';
import {ObservedNavigation,type ObservedMover} from '../../src/sim/ai/observedNavigation';
import type {Point} from '../../src/sim/game/state';
import {SimulationProfiler} from '../../src/sim/profiling';

const input=process.argv[2];if(!input)throw Error('Pass a captured AI navigation JSON file');
const data=JSON.parse(readFileSync(input,'utf8')) as {
 maps:{size:number;land:number[];heights:number[]}[];
 queries:{map:number;from:ObservedMover;to:Point;result:boolean;ms:number}[];
};
const navigations=data.maps.map(map=>{
 const profile=new SimulationProfiler();profile.enabled=true;
 const nav=new ObservedNavigation({...map,fingerprint:'probe',surfaces:[],starts:[],camps:[],resources:[]},undefined,profile);
 nav.prepare(data.queries.filter(q=>data.maps[q.map]===map).map(q=>q.from));
 return {nav,profile};
});
for(const q of data.queries){
 const {nav,profile}=navigations[q.map]!;
 const before=profile.workSnapshot(),start=performance.now(),result=nav.reachable(q.from,q.to),ms=performance.now()-start;
 const work=profile.workSnapshot().map(w=>({...w,value:w.value-(before.find(b=>b.path===w.path)?.value??0)})).filter(w=>w.value);
 if(result!==q.result)throw Error(`Reachability answer changed: ${JSON.stringify(q.from)} -> ${JSON.stringify(q.to)}`);
 console.log(JSON.stringify({from:{x:q.from.x,y:q.from.y,radius:q.from.radius},to:q.to,result,capturedMs:q.ms,replayMs:ms,work}));
}
