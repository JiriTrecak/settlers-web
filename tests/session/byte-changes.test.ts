import {expect,it} from 'vitest';
import {ByteChangeJournal,byteChangesBetween} from '../../src/shared/snapshots/byteChanges';

it('retains coalesced edits without retaining byte snapshots and rejects unrelated baselines',()=>{
 const first=new Uint8Array(64),journal=new ByteChangeJournal(first);
 const second=first.slice();second[3]=2;journal.publish(second,[3]);
 const third=second.slice();third[3]=0;third[9]=1;journal.publish(third,[3,9]);
 expect(byteChangesBetween(first,third)).toEqual([[3],[3,9]]);
 expect(byteChangesBetween(second,third)).toEqual([[3,9]]);
 expect(byteChangesBetween(third,third)).toEqual([]);
 expect(byteChangesBetween(third,first)).toBeUndefined();
 expect(byteChangesBetween(first.slice(),third)).toBeUndefined();
 const other=new Uint8Array(64);new ByteChangeJournal(other);
 expect(byteChangesBetween(other,third)).toBeUndefined();
});

it('bounds both update count and index storage, then resumes from a recent baseline',()=>{
 const first=new Uint8Array(20000),journal=new ByteChangeJournal(first);let latest=first;
 for(let i=0;i<17;i++){latest=latest.slice();latest[i]=1;journal.publish(latest,[i]);}
 expect(byteChangesBetween(first,latest)).toBeUndefined();
 const before=latest;latest=latest.slice();latest.fill(2);journal.publish(latest,Array.from(latest.keys()));
 expect(byteChangesBetween(before,latest)).toBeUndefined();
 const recent=latest;latest=latest.slice();latest[0]=1;journal.publish(latest,[0]);
 expect(byteChangesBetween(recent,latest)).toEqual([[0]]);
});
