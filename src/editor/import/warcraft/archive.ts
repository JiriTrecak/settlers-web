import MpqArchive from 'mdx-m3-viewer/dist/cjs/parsers/mpq/archive';
import Crypto from 'mdx-m3-viewer/dist/cjs/parsers/mpq/crypto';
import BlockTable from 'mdx-m3-viewer/dist/cjs/parsers/mpq/blocktable';
export const constructor=<T>(value:T):T=>(value as {default?:T}).default??value;
/** Reject corrupt offsets/counts before the MPQ reader allocates or opens its listfile. */
export function openWarcraftArchive(input:Uint8Array){
 if(input.length>128*1024*1024)throw Error('Warcraft map exceeds the 128 MB import limit');
 const bytes=Uint8Array.from(input);let offset=-1;
 for(let i=0;i+4<=bytes.length;i+=512)if(bytes[i]===77&&bytes[i+1]===80&&bytes[i+2]===81&&bytes[i+3]===26)offset=i;
 if(offset<0||offset+32>bytes.length)throw Error('Missing or truncated MPQ header');
 const v=new DataView(bytes.buffer,offset),headerSize=v.getUint32(4,true),version=v.getUint16(12,true),sector=v.getUint16(14,true);
 if(version!==0||headerSize!==32||sector>10)throw Error('Unsupported MPQ archive header');
 const hashes=v.getUint32(24,true),blocks=v.getUint32(28,true),hashPos=v.getUint32(16,true)+offset,blockPos=v.getUint32(20,true)+offset;
 if(!hashes||hashes>65536||blocks>hashes||hashPos<offset+32||blockPos<offset+32||hashPos+hashes*16>bytes.length||blockPos+blocks*16>bytes.length)throw Error('Invalid MPQ table dimensions');
 const crypto=new (constructor(Crypto))(),table=new (constructor(BlockTable))(crypto);
 table.load(bytes.slice(blockPos,blockPos+blocks*16));
 let total=0;
 for(const block of table.entries){
  if(!(block.flags&0x80000000))continue;
  total+=block.normalSize;
  if(block.normalSize>32*1024*1024||total>256*1024*1024)throw Error('Warcraft archive exceeds the decoded size limit');
  if(block.compressedSize&&(block.offset+offset<offset+32||block.offset+offset+block.compressedSize>bytes.length))throw Error('Warcraft archive entry lies outside the file');
 }
 const archive=new (constructor(MpqArchive))();archive.load(bytes,true);return archive;
}
