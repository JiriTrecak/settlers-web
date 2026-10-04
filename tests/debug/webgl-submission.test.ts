import {expect,it,vi} from 'vitest';
import {perf} from '../../src/debug/performance';
import {measureWebGLSubmission} from '../../src/debug/webglSubmission';
it('measures API calls with the original receiver and restores inherited and own methods after errors',()=>{
 const inherited=vi.fn(function(this:unknown,value:number){expect(this).toBe(context);return value+1;});
 const own=vi.fn(()=>{throw Error('render failed');});
 const context=Object.assign(Object.create({bufferData:inherited}),{linkProgram:own}) as WebGL2RenderingContext;
 const measured=perf.measureSync(()=>measureWebGLSubmission(context,()=>{expect((context.bufferData as any)(3)).toBe(4);}));
 expect(measured.scopes.some(s=>s.name==='GL call · bufferData'&&s.count===1)).toBe(true);
 expect(Object.hasOwn(context,'bufferData')).toBe(false);expect(context.linkProgram).toBe(own);
 expect(()=>measureWebGLSubmission(context,()=>context.linkProgram({} as WebGLProgram))).toThrow('render failed');
 expect(Object.hasOwn(context,'bufferData')).toBe(false);expect(context.linkProgram).toBe(own);
});
