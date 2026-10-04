type Program={program:unknown;name?:string;vertexShader:WebGLShader;fragmentShader:WebGLShader};
export type ShaderFailure={name:string;program:string;vertex:string;fragment:string};

/** Three's default diagnostics read three driver logs for every successful
 * program. Some drivers block for tens of milliseconds per read. Keep error
 * detection, but retrieve those logs only after an unsuccessful link. */
export class ShaderDiagnostics {
 private readonly checked=new WeakSet<Program>();
 failures=0;
 constructor(private readonly gl:WebGLRenderingContext|WebGL2RenderingContext,
  private readonly report:(failure:ShaderFailure)=>void=failure=>console.error('Shader link failed',failure)){}
 check(programs:readonly Program[]):void {
  if(this.gl.isContextLost())return;
  for(const entry of programs){
   if(this.checked.has(entry)||!entry.program)continue;
   const program=entry.program as WebGLProgram,linked=this.gl.getProgramParameter(program,this.gl.LINK_STATUS);
   // A lost context / unavailable result is not proof of a checked program.
   if(linked!==true&&linked!==false)continue;
   this.checked.add(entry);
   if(linked)continue;
   this.failures++;
   this.report({name:entry.name??'Unnamed shader',program:this.gl.getProgramInfoLog(program)??'',
    vertex:this.gl.getShaderInfoLog(entry.vertexShader)??'',fragment:this.gl.getShaderInfoLog(entry.fragmentShader)??''});
  }
 }
}
