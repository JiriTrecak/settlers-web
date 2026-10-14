import {createHash} from 'node:crypto';

/** Verify every byte while making interrupted multi-gigabyte transfers retryable. */
export async function rangedDigest(size: number, read: (start: number, end: number) => Promise<Uint8Array>, progress: (percent: number) => void = () => {}, chunkSize = 32 * 1024 * 1024) {
  const hash = createHash('sha256');
  let lastProgress = 0;
  for (let start = 0; start < size; start += chunkSize) {
    const end = Math.min(size, start + chunkSize) - 1;
    let chunk: Uint8Array | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        chunk = await read(start, end);
        if (chunk.byteLength !== end - start + 1) throw Error('Incomplete verification range');
        break;
      } catch (error) { chunk = undefined; if (attempt === 2) throw error; }
    }
    hash.update(chunk!);
    const percent = Math.floor((end + 1) / size * 10) * 10;
    if (percent > lastProgress) { progress(percent); lastProgress = percent; }
  }
  return hash.digest('hex');
}
