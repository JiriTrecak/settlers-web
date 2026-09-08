import {afterEach,expect,it,vi} from 'vitest';
import {readBrushSize,saveBrushSize} from '../../src/editor/brush/sizePrefs';
afterEach(()=>vi.unstubAllGlobals());
it('remembers sizes independently and safely handles corrupt or unavailable storage',()=>{
 const values=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 expect(readBrushSize('clean')).toBe(4);
 saveBrushSize('clean',12.5);saveBrushSize('brush',7);
 expect(readBrushSize('clean')).toBe(12.5);expect(readBrushSize('brush')).toBe(7);
 values.set('utc.brush-size.clean','NaN');expect(readBrushSize('clean')).toBe(4);
 vi.stubGlobal('localStorage',{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}});
 expect(readBrushSize('brush')).toBe(4);expect(()=>saveBrushSize('brush',8)).not.toThrow();
});
