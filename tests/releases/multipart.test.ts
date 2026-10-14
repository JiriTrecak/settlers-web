import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it, expect} from 'vitest';
import {multipartUpload} from '../../scripts/releases/multipart';

describe('immutable release multipart upload', () => {
  it('uploads exact package bytes and requires an absent key at completion', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'release-multipart-test-'));
    try {
      const data = Buffer.alloc(33 * 1024 * 1024, 71), uploaded: Buffer[] = [];
      await writeFile(join(temp, 'package'), data);
      const calls: string[][] = [];
      await multipartUpload(args => {
        calls.push(args);
        if (args[1] === 'create-multipart-upload') return JSON.stringify({UploadId: 'test'});
        if (args[1] === 'upload-part') {
          uploaded.push(readFileSync(args[args.indexOf('--body') + 1]!));
          return JSON.stringify({ETag: `part-${uploaded.length}`});
        }
        if (args[1] === 'complete-multipart-upload') {
          expect(args.slice(-2)).toEqual(['--if-none-match', '*']);
          const manifest = args[args.indexOf('--multipart-upload') + 1]!.slice(7);
          expect(JSON.parse(readFileSync(manifest, 'utf8')).Parts).toEqual([
            {PartNumber: 1, ETag: 'part-1'}, {PartNumber: 2, ETag: 'part-2'}
          ]);
        }
        return '{}';
      }, 'bucket', 'key', join(temp, 'package'), 'application/octet-stream', temp, () => {});
      expect(Buffer.concat(uploaded).equals(data)).toBe(true);
      expect(calls.some(c => c[1] === 'abort-multipart-upload')).toBe(false);
    } finally { await rm(temp, {recursive: true, force: true}); }
  });

  it.each(['upload-part', 'complete-multipart-upload'])('aborts on %s failure without hiding the error', async failing => {
    const temp = await mkdtemp(join(tmpdir(), 'release-multipart-test-'));
    try {
      await writeFile(join(temp, 'package'), 'signed bytes');
      const calls: string[] = [];
      await expect(multipartUpload(args => {
        calls.push(args[1]!);
        if (args[1] === failing) throw Error('upload failed');
        return JSON.stringify({UploadId: 'test', ETag: 'part'});
      }, 'bucket', 'key', join(temp, 'package'), 'application/octet-stream', temp, () => {})).rejects.toThrow('upload failed');
      expect(calls.at(-1)).toBe('abort-multipart-upload');
    } finally { await rm(temp, {recursive: true, force: true}); }
  });
});
