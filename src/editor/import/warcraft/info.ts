import {WarcraftReader} from './binary';
export type WarcraftPlayer={id:number;type:number;race:number;fixed:boolean;name:string;x:number;y:number};
export type WarcraftInfo={version:number;build:number;name:string;description:string;tileset:string;players:WarcraftPlayer[];margins:number[];playableWidth:number;playableHeight:number};
/** Read only map metadata and players, never triggers or scripts.
 * Layout: War3Net.Build.Core/Serialization/Binary/Info/MapInfo.cs. */
export function readWarcraftInfo(bytes:Uint8Array):WarcraftInfo{
 const r=new WarcraftReader(bytes,'war3map.w3i'),version=r.i32();
 if(![18,25,28,31,32,33].includes(version))throw Error(`Unsupported Warcraft map information version ${version}`);
 r.skip(8);let build=0;
 if(version>=27){const major=r.i32(),minor=r.i32();build=major*100+minor;r.skip(8);}
 const name=r.string();r.string();const description=r.string();r.string();
 r.skip(32);const margins=Array.from({length:4},()=>r.i32()),playableWidth=r.count(512),playableHeight=r.count(512);
 r.skip(4);const tileset=String.fromCharCode(r.u8());r.skip(4);if(version>=25)r.string();
 r.string();r.string();r.string();r.skip(4);if(version>=25)r.string();r.string();r.string();r.string();
 if(version>=25){r.skip(24);r.string();r.skip(5);}
 if(version>=28)r.skip(4);
 if(version>=31)r.skip(8);
 if(version>=32)r.skip(8);
 if(version>=33)r.skip(4);
 const players:WarcraftPlayer[]=[];
 for(let i=0,n=r.count(28);i<n;i++){
  const id=r.i32(),type=r.i32(),race=r.i32(),fixed=!!r.i32(),playerName=r.string(),x=r.f32(),y=r.f32();
  r.skip(version>=31?16:8);players.push({id,type,race,fixed,name:playerName,x,y});
 }
 return {version,build,name,description,tileset,players,margins,playableWidth,playableHeight};
}
