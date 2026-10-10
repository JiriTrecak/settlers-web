import {expect,it} from 'vitest';
import {AuthoringTransferEncoder,AuthoringTransferDecoder} from '../../src/shared/authoring/worker/transfer';

it('round-trips ordered edits, removals and restored buffers without changing older snapshots',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const heights=new Float32Array([1,2,3,4]),newHeights=new Float32Array([5,6,7,8]);
 const objects=[{id:'a',asset:'tree',x:1},{id:'b',asset:'rock',x:2}];
 const make=(rows:typeof objects,values:Float32Array)=>({field:{samples:values,surfacePaint:[{weights:values}]},generated:{terrain:{samples:values},objects:rows},stamps:rows,resources:[],owners:new Map(rows.map(r=>[r.id,'layer']))});
 const send=async(value:ReturnType<typeof make>)=>{
  const encoded=encoder.encode(value),packet=structuredClone(encoded.packet,{transfer:encoded.transfer});
  const decoded=await decoder.decode(packet,async()=>{});expect(decoded).toEqual(value);
  expect(decoded.field.samples).toBe(decoded.generated.terrain.samples);
  expect(decoded.field.samples).toBe(decoded.field.surfacePaint[0].weights);
  return decoded;
 };
 const first=await send(make(objects,heights));
 const edited=await send(make([{...objects[1]!,x:7},objects[0]!],heights));
 expect(edited.field.samples).toBe(first.field.samples);
 expect(first.generated.objects).toEqual(objects);
 await send(make([],newHeights));
 const restored=await send(make(objects,heights));
 expect(restored.field.samples).not.toBe(first.field.samples);
 expect([...heights]).toEqual([1,2,3,4]); // transfer never detaches compiler caches
 expect([...first.field.samples]).toEqual([1,2,3,4]);
});

it('rejects a dropped or reordered packet instead of silently applying an invalid delta',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const value={field:{samples:new Float32Array(1)},stamps:[],resources:[],owners:new Map()};
 encoder.encode(value);const packet=encoder.encode(value).packet;
 await expect(decoder.decode(packet,async()=>{})).rejects.toThrow('Out-of-order');
});

it('preserves signed zero and explicit undefined fields in records and resource placements',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const row={id:'a',x:-0,optional:undefined,nested:{value:-0}},value={field:{samples:new Float32Array(1)},generated:{objects:[row]},stamps:[row],resources:[row],owners:new Map()};
 const {packet,transfer}=encoder.encode(value),actual=await decoder.decode(structuredClone(packet,{transfer}),async()=>{});
 expect(actual).toStrictEqual(value);expect(Object.is(actual.stamps[0].x,-0)).toBe(true);
});

it('preserves ordered records when legacy and authored stamp IDs collide',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 for(const stamps of [[{id:'a',x:1},{id:'a',x:2}],[{id:'a',x:2}],[{id:'a',x:3},{id:'a',x:1}]]){
  const value={field:{samples:new Float32Array(1)},stamps,resources:[],owners:new Map()};
  const {packet,transfer}=encoder.encode(value);expect(await decoder.decode(structuredClone(packet,{transfer}),async()=>{})).toEqual(value);
 }
});

it('retains whole unchanged collections and ownership maps through unrelated pose updates',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const objects=[{id:'generated',x:1}],stamps=[{id:'placed',x:2}],resources=[{id:'tree',x:3}];
 const initial={generated:{objects},stamps,resources,owners:new Map([['generated','layer']])};
 const send=async(value:typeof initial)=>{
  const {packet,transfer}=encoder.encode(value);
  return decoder.decode(structuredClone(packet,{transfer}),async()=>{});
 };
 const first=await send(initial);
 const moved=await send({...initial,stamps:[{id:'placed',x:4}],resources:resources.map(r=>({...r})),owners:new Map(initial.owners)});
 expect(moved.generated.objects).toBe(first.generated.objects);
 expect(moved.resources).toBe(first.resources);expect(moved.owners).toBe(first.owners);
 expect(moved.stamps).not.toBe(first.stamps);expect(first.stamps).toEqual(stamps);
 const changed=await send({...initial,generated:{objects:[{id:'different',x:5}]},owners:new Map([['different','other-layer']])});
 expect(changed.generated.objects).not.toBe(moved.generated.objects);
 expect(changed.owners).toEqual(new Map([['different','other-layer']]));
 expect(first.owners).toEqual(initial.owners);
});

it('keeps bulk chunks exact across boundaries, exceptional values, and later deltas',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const objects=Array.from({length:4097},(_,i)=>({id:`tree.${i}`,label:'Žluťoučký 🌲',x:i/7,nested:{visible:true,variants:['leaf',null,i]}}));
 const exceptional={id:'exception',coordinates:[-0,NaN,Infinity,-Infinity,undefined],hole:new Array(2),optional:undefined};
 const make=(rows:unknown[])=>({generated:{objects:rows},stamps:[],resources:[],owners:new Map()});
 const first=make([...objects,exceptional]);let yields=0;
 const transfer=async(value:ReturnType<typeof make>)=>{
  const {packet,transfer}=encoder.encode(value);
  const decoded=await decoder.decode(structuredClone(packet,{transfer}),async()=>{yields++;});
  expect(decoded).toStrictEqual(value);return decoded;
 };
 const decoded=await transfer(first);expect(yields).toBeGreaterThan(4);
 const edited=make([objects[4096],{...objects[1024],x:19},...objects.slice(0,1024),exceptional]);
 const next=await transfer(edited);
 expect(next.generated.objects[0]).toBe(decoded.generated.objects[4096]);
 expect(decoded).toStrictEqual(first); // old snapshots remain immutable
});

it('retains ownership collections only while values and insertion order match',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const send=async(owners:Map<string,string>)=>{
  const {packet,transfer}=encoder.encode({stamps:[],resources:[],owners});
  const decoded=await decoder.decode(structuredClone(packet,{transfer}),async()=>{});
  expect([...decoded.owners]).toEqual([...owners]);return {packet,decoded};
 };
 const first=await send(new Map([['a','forest'],['b','meadow']]));
 const unchanged=await send(new Map([['a','forest'],['b','meadow']]));
 expect(unchanged.packet.owners.order).toBeUndefined();expect(unchanged.packet.owners.rows).toHaveLength(0);
 expect(unchanged.decoded.owners).toBe(first.decoded.owners);
 await send(new Map([['b','meadow'],['a','forest']]));
 await send(new Map([['b','forest']]));await send(new Map());
 await send(new Map([['a','forest'],['b','meadow']]));
});

it('sends only changed stable-order records, including duplicate IDs and exceptional numbers',async()=>{
 const encoder=new AuthoringTransferEncoder(),decoder=new AuthoringTransferDecoder();
 const rows=Array.from({length:2050},(_,i)=>({id:i<2?'duplicate':`item.${i}`,x:i}));
 const send=async(stamps:typeof rows)=>{
  const value={stamps,resources:[],owners:new Map()},encoded=encoder.encode(value);
  const decoded=await decoder.decode(structuredClone(encoded.packet,{transfer:encoded.transfer}),async()=>{});
  expect(decoded).toStrictEqual(value);return {packet:encoded.packet,decoded};
 };
 const first=await send(rows);
 const changed=rows.map((row,i)=>i===1?{...row,x:-0}:i===1025?{...row,x:15.5}:row);
 const next=await send(changed);
 expect(next.packet.stamps.order).toBeUndefined();expect(next.packet.stamps.removed).toHaveLength(0);
 expect(next.packet.stamps.rows).toHaveLength(1);expect(next.packet.stamps.raw).toHaveLength(1);
 expect(next.decoded.stamps[0]).toBe(first.decoded.stamps[0]);
 expect(first.decoded.stamps).toStrictEqual(rows);
 const unchanged=await send(changed.map(row=>({...row})));
 expect(unchanged.packet.stamps.rows).toHaveLength(0);expect(unchanged.packet.stamps.raw).toHaveLength(0);
 expect(unchanged.decoded.stamps).toBe(next.decoded.stamps);
 await send([...changed].reverse());await send(rows);
});

it('starts a fresh stream from map values without a saved compiler packet',async()=>{
 const values={field:{samples:new Float32Array([1,2,3])},stamps:[{id:'tree',x:1}],resources:[],owners:new Map<string,string>()};
 const first=new AuthoringTransferEncoder().encode(values),second=new AuthoringTransferEncoder().encode(values);
 expect(first.packet.sequence).toBe(1);expect(second.packet.sequence).toBe(1);
 const decoder=new AuthoringTransferDecoder();
 const decoded=await decoder.decode(structuredClone(second.packet,{transfer:second.transfer}),async()=>{});
 expect(decoded).toStrictEqual(values);
 expect([...values.field.samples]).toEqual([1,2,3]);
});
