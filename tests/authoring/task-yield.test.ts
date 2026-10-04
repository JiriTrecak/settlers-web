import {expect,it} from 'vitest';
import {TaskYield} from '../../src/shared/authoring/worker/taskYield';

it('resumes in task order after microtasks without relying on timers',async()=>{
 const tasks=new TaskYield(),events:string[]=[];
 try{
  const a=tasks.next().then(()=>events.push('first')),b=tasks.next().then(()=>events.push('second'));
  await Promise.resolve();events.push('microtask');expect(events).toEqual(['microtask']);
  await Promise.all([a,b]);expect(events).toEqual(['microtask','first','second']);
 }finally{tasks.dispose();}
});
it('releases outstanding waits on disposal and permits safe repeated cleanup',async()=>{
 const tasks=new TaskYield(),first=tasks.next(),second=tasks.next();
 tasks.dispose();tasks.dispose();
 await Promise.all([first,second,tasks.next()]);
});
