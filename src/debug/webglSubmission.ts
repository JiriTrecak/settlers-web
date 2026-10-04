import {perf} from './performance';
/** CPU time inside WebGL calls, not GPU execution time. Installed only for an
 * explicit synchronous capture, and removed even when rendering throws. */
export function measureWebGLSubmission<T>(context:WebGLRenderingContext|WebGL2RenderingContext,work:()=>T):T{
 const gl=context as unknown as Record<string,unknown>,restore:Array<()=>void>=[];
 const methods=['bufferData','bufferSubData','texImage2D','texImage3D','texSubImage2D','texSubImage3D','texStorage2D','texStorage3D','generateMipmap',
  'compileShader','linkProgram','getProgramParameter','getShaderParameter','getShaderInfoLog','getProgramInfoLog',
  'getActiveUniform','getActiveAttrib','getUniformLocation','getAttribLocation','getParameter','getShaderPrecisionFormat','checkFramebufferStatus',
  'drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','readPixels'];
 try{
  for(const name of methods){
   const original=gl[name];if(typeof original!=='function')continue;
   const descriptor=Object.getOwnPropertyDescriptor(gl,name);
   Object.defineProperty(gl,name,{configurable:true,writable:true,value:(...args:unknown[])=>{
    const started=perf.start();try{return Reflect.apply(original,context,args);}finally{perf.end(`GL call · ${name}`,started);}
   }});
   restore.push(()=>{if(descriptor)Object.defineProperty(gl,name,descriptor);else delete gl[name];});
  }
  return work();
 }finally{for(const reset of restore.reverse())reset();}
}
