export class Bytes {
  readonly view: DataView;
  pos = 0;

  constructor(readonly buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get length(): number {
    return this.buffer.byteLength;
  }

  skipTo(pos: number): void {
    if (pos < 0 || pos > this.length) {
      throw new Error(`seek ${pos} out of 0..${this.length}`);
    }
    this.pos = pos;
  }

  read8(): number {
    if (this.pos + 1 > this.length) throw new Error("eof");
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  read16(): number {
    if (this.pos + 2 > this.length) throw new Error("eof");
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  read16signed(): number {
    const v = this.read16();
    return v < 0x8000 ? v : v - 0x10000;
  }

  read32(): number {
    if (this.pos + 4 > this.length) throw new Error("eof");
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  assume(expected: readonly number[]): void {
    for (let i = 0; i < expected.length; i++) {
      const got = this.read8();
      if (got !== (expected[i]! & 0xff)) {
        throw new Error(`expected ${expected[i]} got ${got} at ${this.pos - 1}`);
      }
    }
  }
}
