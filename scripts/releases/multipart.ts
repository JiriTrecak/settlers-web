import {open, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';

type Aws = (args: string[]) => string;
/** Bounded-memory uploads; publish atomically only if the immutable key is absent. */
export async function multipartUpload(aws: Aws, bucket: string, key: string, file: string, type: string, temp: string, progress: (message: string) => void = console.log) {
  const source = await open(file, 'r');
  const partFile = join(temp, 'upload-part.bin');
  let uploadId: string | undefined;
  let completed = false;
  try {
    const size = (await source.stat()).size;
    const buffer = Buffer.alloc(32 * 1024 * 1024);
    uploadId = JSON.parse(aws(['s3api', 'create-multipart-upload', '--bucket', bucket, '--key', key,
      '--content-type', type, '--cache-control', 'public, max-age=31536000, immutable'])).UploadId;
    if (!uploadId) throw Error('S3 did not return an upload id');
    const parts: {PartNumber: number; ETag: string}[] = [];
    for (let offset = 0; offset < size;) {
      const length = Math.min(buffer.length, size - offset);
      let filled = 0;
      while (filled < length) {
        const {bytesRead} = await source.read(buffer, filled, length - filled, offset + filled);
        if (!bytesRead) throw Error('Release package changed during upload');
        filled += bytesRead;
      }
      await writeFile(partFile, buffer.subarray(0, length));
      const partNumber = parts.length + 1;
      const part = JSON.parse(aws(['s3api', 'upload-part', '--bucket', bucket, '--key', key,
        '--upload-id', uploadId, '--part-number', String(partNumber), '--body', partFile]));
      if (!part.ETag) throw Error('S3 did not confirm an uploaded part');
      parts.push({PartNumber: partNumber, ETag: part.ETag});
      offset += length;
      progress(`Uploaded ${Math.round(offset / size * 100)}% (${parts.length} parts).`);
    }
    const manifest = join(temp, 'upload-parts.json');
    await writeFile(manifest, JSON.stringify({Parts: parts}));
    aws(['s3api', 'complete-multipart-upload', '--bucket', bucket, '--key', key,
      '--upload-id', uploadId, '--multipart-upload', 'file://' + manifest, '--if-none-match', '*']);
    completed = true;
  } finally {
    await source.close();
    await rm(partFile, {force: true});
    if (uploadId && !completed) {
      try { aws(['s3api', 'abort-multipart-upload', '--bucket', bucket, '--key', key, '--upload-id', uploadId]); }
      catch { progress('Multipart cleanup could not finish; the bucket lifecycle will remove abandoned parts.'); }
    }
  }
}
