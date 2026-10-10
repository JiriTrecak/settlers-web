import {WarcraftReader} from './binary';
export type WarcraftCorner={ground:number;waterHeight:number;water:boolean;ramp:boolean;blight:boolean;boundary:boolean;texture:number;variation:number;cliffTexture:number;cliffVariation:number;level:number};
export type WarcraftTerrain={version:number;tileset:string;groundTiles:string[];cliffTiles:string[];width:number;height:number;offsetX:number;offsetY:number;corners:WarcraftCorner[]};
/** W3E 11 and 12. Version 12 widens ground texture/flags to 16 bits.
 * Heights remain in Warcraft terrain-tile units (128 world units per tile).
 * https://github.com/ChiefOfGxBxL/WC3MapSpecification/blob/master/Terrain/12.md */
export function readWarcraftTerrain(bytes:Uint8Array):WarcraftTerrain{
 const r=new WarcraftReader(bytes,'war3map.w3e');if(r.fourCC()!=='W3E!')throw Error('Invalid Warcraft terrain signature');
 const version=r.i32();if(version!==11&&version!==12)throw Error(`Unsupported Warcraft terrain version ${version}`);
 const tileset=String.fromCharCode(r.u8());r.i32();
 const groundTiles=Array.from({length:r.count(version===12?64:16)},()=>r.fourCC());
 const cliffTiles=Array.from({length:r.count(256)},()=>r.fourCC());
 const width=r.count(513),height=r.count(513);if(width<2||height<2)throw Error('Warcraft terrain must contain cells');
 const offsetX=r.f32(),offsetY=r.f32(),stride=version===12?8:7;
 if(r.remaining!==width*height*stride)throw Error('Warcraft terrain dimensions do not match its samples');
 const corners:WarcraftCorner[]=[];
 for(let i=0;i<width*height;i++){
  const ground=(r.i16()-8192)/512,packedWater=r.u16(),packed=version===12?r.u16():r.u8();
  const texture=packed&(version===12?63:15),flags=packed>>(version===12?6:4),variation=r.u8(),cliff=r.u8();
  if(texture>=groundTiles.length)throw Error(`Warcraft terrain references missing texture ${texture}`);
  corners.push({ground,waterHeight:((packedWater&0x3fff)-8192)/512,water:!!(flags&4),ramp:!!(flags&1),blight:!!(flags&2),boundary:!!(flags&8)||!!(packedWater&0x4000),texture,variation:variation&31,cliffVariation:variation>>5,cliffTexture:cliff>>4,level:cliff&15});
 }
 return {version,tileset,groundTiles,cliffTiles,width,height,offsetX,offsetY,corners};
}
