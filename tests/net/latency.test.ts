import {expect,it} from 'vitest';
import {ConnectionLatency,connectionDelay} from '../../src/net/latency';
import {HostedMatch} from '../../src/net/host';
import type {ServerMsg} from '../../src/shared';
import {emptyPipeline,SAVE_FORMAT_VERSION} from '../../src/shared/save/save';

it('uses bounded server-timed samples and rejects unsolicited, duplicate and expired replies',()=>{
  const connection=new ConnectionLatency();
  const id=connection.probe(0)!;
  expect(connection.reply('forged',5)).toBe(false);
  expect(connection.probe(10)).toBeNull();
  expect(connection.reply(id,10)).toBe(true);
  expect(connection.reply(id,11)).toBe(false);
  expect(connection.roundTrip(11)).toBeNull();
  for(const [start,end] of [[20,35],[40,60]])expect(connection.reply(connection.probe(start)!,end)).toBe(true);
  expect(connection.roundTrip(60)).toBe(20);
  expect(connection.roundTrip(16000)).toBeNull();
  expect(connection.reply(connection.probe(16000)!,22000)).toBe(false);
  connection.reset();expect(connection.roundTrip(22000)).toBeNull();
});

it('takes the slowest player plus one beat, bounds the result, and excludes missing samples from optimistic estimates',()=>{
  expect(connectionDelay([2,8])).toBe(2);
  expect(connectionDelay([40,50])).toBe(3);
  expect(connectionDelay([150,100])).toBe(7);
  expect(connectionDelay([null,2])).toBe(8);
  expect(connectionDelay([null,300])).toBe(13);
  expect(connectionDelay([5000])).toBe(40);
  expect(connectionDelay([])).toBe(8);
});

function lobby(){
  let now=0;
  const room=new HostedMatch({name:'latency',mapId:'test',mapRevision:'test',slotCount:2,guestName:'A'},'latency',()=>now);
  const joined=room.join('B','player') as {token:string};
  const a:ServerMsg[]=[],b:ServerMsg[]=[];
  room.bind(room.hostToken,m=>a.push(m));room.bind(joined.token,m=>b.push(m));
  const sample=(auth:string,messages:ServerMsg[],rtt:number)=>{
    const probe=messages.filter((m):m is Extract<ServerMsg,{type:'latencyProbe'}>=>m.type==='latencyProbe').at(-1)!;
    now+=rtt;room.ingest(auth,{type:'latencyReply',id:probe.id});
  };
  return {room,a,b,joined,sample,time:(value:number)=>{now=value;}};
}

it('shares the measured delay at start, ignores spectators, and does not mutate it during play',()=>{
  const {room,a,b,joined,sample,time}=lobby();
  // The two outstanding probes share a clock; interleaving is the actual round-trip budget.
  for(let i=0;i<5;i++){sample(room.hostToken,a,2);sample(joined.token,b,2);}
  const spectator=room.join('observer','spectator') as {token:string};
  const observer:ServerMsg[]=[];room.bind(spectator.token,m=>observer.push(m));
  expect(observer.some(m=>m.type==='latencyProbe')).toBe(false);
  expect(room.view().inputDelayMs).toBe(50);
  expect(room.view().slots.every(s=>s.roundTripMs!<=4)).toBe(true);
  expect(room.start(room.hostToken)).toMatchObject({config:{delay:2}});
  for(const messages of [a,b,observer])expect(messages.find(m=>m.type==='start')).toMatchObject({config:{delay:2}});
  time(3000);room.pulse();sample(room.hostToken,a,300);sample(joined.token,b,300);
  expect(room.view().inputDelayMs).toBe(50);
  expect(room.restart(room.hostToken)).toMatchObject({config:{delay:25}});
});

it('falls back when a player has not answered or has reconnected',()=>{
  const {room,a,sample}=lobby();
  for(let i=0;i<5;i++)sample(room.hostToken,a,2);
  expect(room.view().inputDelayMs).toBe(200);
  room.unbind(room.hostToken);room.bind(room.hostToken,()=>{});
  expect(room.view().slots[0].roundTripMs).toBeUndefined();
  expect(room.start(room.hostToken)).toMatchObject({config:{delay:8}});
});

it('keeps a saved pipeline delay when loading on a newly slower connection',()=>{
  const {room,a,b,joined,sample,time}=lobby();
  for(let i=0;i<5;i++){sample(room.hostToken,a,2);sample(joined.token,b,2);}
  const start=room.start(room.hostToken);if(!('config' in start))throw new Error(start.error);
  const save={v:SAVE_FORMAT_VERSION,remote:true,match:start.config,pipeline:emptyPipeline(100,start.config.slots,start.config.delay)};
  time(3000);room.pulse();sample(room.hostToken,a,300);sample(joined.token,b,300);
  expect(room.load(room.hostToken,save)).toMatchObject({config:{delay:2}});
  room.ingest(room.hostToken,{type:'turn',through:103,bundles:[]});
  room.ingest(joined.token,{type:'turn',through:103,bundles:[]});
  expect(a.filter(m=>m.type==='commit').map(m=>m.tick)).toEqual([101,102,103]);
  expect(b.filter(m=>m.type==='commit')).toEqual(a.filter(m=>m.type==='commit'));
});

it('falls back after samples expire rather than using an old low-latency estimate',()=>{
  const {room,a,b,joined,sample,time}=lobby();
  for(let i=0;i<5;i++){sample(room.hostToken,a,2);sample(joined.token,b,2);}
  time(20000);
  expect(room.start(room.hostToken)).toMatchObject({config:{delay:8}});
});

it('does not let another member answer a player’s latency probe',()=>{
  const {room,a,joined,time}=lobby();
  const probe=a.find(m=>m.type==='latencyProbe')! as Extract<ServerMsg,{type:'latencyProbe'}>;
  for(let i=1;i<=5;i++){time(i);room.ingest(joined.token,{type:'latencyReply',id:probe.id});}
  expect(room.view().slots.every(s=>s.roundTripMs===undefined)).toBe(true);
  expect(room.start(room.hostToken)).toMatchObject({config:{delay:8}});
});
