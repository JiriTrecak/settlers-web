import {WarcraftReader} from './binary';
export type WarcraftObjectChange={base:string;id:string;fields:Record<string,string|number>};
/** Unit/destructible changes, including Reforged v3 per-object metadata. */
export function readWarcraftObjects(bytes:Uint8Array,file:string):WarcraftObjectChange[]{
 const r=new WarcraftReader(bytes,file),version=r.i32(),result:WarcraftObjectChange[]=[];
 if(version<1||version>3)throw Error(`${file}: unsupported object version ${version}`);
 for(let table=0;table<2;table++)for(let i=0,count=r.count(20000);i<count;i++){
  const base=r.fourCC(),custom=r.fourCC(),id=custom==='\0\0\0\0'?base:custom;
  if(version>=3)r.skip(r.count(10000)*4);
  const fields:Record<string,string|number>=Object.create(null);
  for(let j=0,n=r.count(10000);j<n;j++){
   const field=r.fourCC(),type=r.i32();
   if(type<0||type>3)throw Error(`${file}: invalid object value type`);
   fields[field]=type===0?r.i32():type===3?r.string():r.f32();r.skip(4);
  }
  result.push({base,id,fields});
 }
 if(r.remaining)throw Error(`${file}: unexpected trailing object data`);return result;
}
