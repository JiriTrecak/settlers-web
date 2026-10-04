/** Short, opaque references survive Eve's text-based context estimation. Pixels live only in the local server. */
export const agentImagePrefix='Studio image reference: ';
export function agentImageModelOutput(output:unknown){
 if(output&&typeof output==='object'&&'imageReference' in output&&typeof output.imageReference==='string'){
  const {imageReference,...metadata}=output;
  return {type:'content' as const,value:[{type:'text' as const,text:JSON.stringify(metadata)},{type:'text' as const,text:agentImagePrefix+imageReference}]};
 }
 return {type:'json' as const,value:output};
}
