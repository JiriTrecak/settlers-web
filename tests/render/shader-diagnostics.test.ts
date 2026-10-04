import {expect,it,vi} from 'vitest';
import {ShaderDiagnostics} from '../../src/render/display/shaderDiagnostics';

function fixture(){
 const gl={LINK_STATUS:1,isContextLost:vi.fn(()=>false),getProgramParameter:vi.fn(()=>true as boolean|null),
  getProgramInfoLog:vi.fn(()=> 'program error'),getShaderInfoLog:vi.fn(()=> 'shader error')};
 const report=vi.fn(),diagnostics=new ShaderDiagnostics(gl as unknown as WebGL2RenderingContext,report);
 const program=()=>({program:{},name:'Test shader',vertexShader:{} as WebGLShader,fragmentShader:{} as WebGLShader});
 return {gl,report,diagnostics,program};
}

it('validates each successful program once without requesting diagnostic logs',()=>{
 const {gl,report,diagnostics,program}=fixture(),a=program(),b=program();
 diagnostics.check([a]);diagnostics.check([a,b]);diagnostics.check([a,b]);
 expect(gl.getProgramParameter).toHaveBeenCalledTimes(2);
 expect(gl.getProgramInfoLog).not.toHaveBeenCalled();expect(gl.getShaderInfoLog).not.toHaveBeenCalled();
 expect(report).not.toHaveBeenCalled();expect(diagnostics.failures).toBe(0);
});

it('preserves program and both shader diagnostics on failed links, reported once',()=>{
 const {gl,report,diagnostics,program}=fixture(),failed=program();gl.getProgramParameter.mockReturnValue(false);
 diagnostics.check([failed]);diagnostics.check([failed]);
 expect(report).toHaveBeenCalledExactlyOnceWith({name:'Test shader',program:'program error',vertex:'shader error',fragment:'shader error'});
 expect(gl.getShaderInfoLog.mock.calls).toEqual([[failed.vertexShader],[failed.fragmentShader]]);
 expect(diagnostics.failures).toBe(1);
});

it('does not treat context loss or unavailable link status as validated',()=>{
 const {gl,diagnostics,program}=fixture(),a=program();gl.isContextLost.mockReturnValue(true);
 diagnostics.check([a]);expect(gl.getProgramParameter).not.toHaveBeenCalled();
 gl.isContextLost.mockReturnValue(false);gl.getProgramParameter.mockReturnValue(null);diagnostics.check([a]);
 gl.getProgramParameter.mockReturnValue(true);diagnostics.check([a]);diagnostics.check([a]);
 expect(gl.getProgramParameter).toHaveBeenCalledTimes(2);expect(diagnostics.failures).toBe(0);
});
