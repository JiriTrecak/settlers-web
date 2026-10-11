import {expect,it} from 'vitest';
import {startingMines} from '../../src/editor/import/warcraft/startingMines';
it('assigns only the nearest deposit to a main, preserving nearby expansion sites',()=>{
 const start={player:1,x:50,z:50};
 const result=startingMines([start],[{index:4,x:50,y:76},{index:5,x:70,y:77}],40);
 expect([...result]).toEqual([[4,start]]);
});
it('assigns each mine at most once, with stable ties independent of array order',()=>{
 const starts=[{player:1,x:0,z:0},{player:2,x:20,z:0}],mines=[{index:4,x:10,y:0},{index:5,x:20,y:20}];
 const expected=[[4,starts[0]],[5,starts[1]]];
 expect([...startingMines(starts,mines,40)]).toEqual(expected);
 expect([...startingMines([...starts].reverse(),[...mines].reverse(),40)]).toEqual(expected);
 expect(startingMines(starts,[{index:6,x:100,y:100}],40).size).toBe(0);
});
