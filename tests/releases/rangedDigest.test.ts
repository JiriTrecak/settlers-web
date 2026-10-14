import {createHash} from 'node:crypto';
import {expect, it} from 'vitest';
import {rangedDigest} from '../../scripts/releases/rangedDigest';

it('retries an interrupted range without double-counting or skipping bytes', async () => {
  const data=Buffer.from('signed release package with a partial final range');
  let interrupted=false;
  const result=await rangedDigest(data.length,async(start,end)=>{
    if(start===8&&!interrupted){interrupted=true;throw Error('connection reset');}
    return data.subarray(start,end+1);
  },undefined,8);
  expect(interrupted).toBe(true);
  expect(result).toBe(createHash('sha256').update(data).digest('hex'));
});

it('rejects persistent truncation instead of accepting an incomplete package', async()=>{
  await expect(rangedDigest(10,async()=>Buffer.alloc(2),undefined,8)).rejects.toThrow('Incomplete verification range');
});
