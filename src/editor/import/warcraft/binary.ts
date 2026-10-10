/** Bounded reader for untrusted map files. No script content is evaluated. */
export class WarcraftReader {
 private readonly view:DataView;
 offset=0;
 constructor(readonly bytes:Uint8Array,readonly file:string){this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
 get remaining(){return this.bytes.length-this.offset;}
 skip(n:number){this.require(n);this.offset+=n;}
 private require(n:number){if(!Number.isSafeInteger(n)||n<0||n>this.remaining)throw Error(`${this.file}: truncated data at byte ${this.offset}`);}
 u8(){this.require(1);return this.view.getUint8(this.offset++);}
 u16(){this.require(2);const v=this.view.getUint16(this.offset,true);this.offset+=2;return v;}
 i16(){this.require(2);const v=this.view.getInt16(this.offset,true);this.offset+=2;return v;}
 i32(){this.require(4);const v=this.view.getInt32(this.offset,true);this.offset+=4;return v;}
 f32(){this.require(4);const v=this.view.getFloat32(this.offset,true);this.offset+=4;if(!Number.isFinite(v))throw Error(`${this.file}: invalid coordinate`);return v;}
 fourCC(){this.require(4);const value=String.fromCharCode(...this.bytes.subarray(this.offset,this.offset+4));this.offset+=4;return value;}
 string(){const end=this.bytes.indexOf(0,this.offset);if(end<0||end-this.offset>1048576)throw Error(`${this.file}: unterminated string`);const value=new TextDecoder().decode(this.bytes.subarray(this.offset,end));this.offset=end+1;return value;}
 count(max:number){const n=this.i32();if(n<0||n>max)throw Error(`${this.file}: invalid record count ${n}`);return n;}
}
