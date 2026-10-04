import {z} from 'zod';
import {splitEditorImage} from '../../tooling/spell-editor/shared/imageResult';

// Mastra only preserves native content blocks when an output schema supplies structuredContent.
export const editorResultSchema=z.record(z.string(),z.unknown());
export function editorMcpResult(output:unknown){
 const image=splitEditorImage(output);
 if(!image)return {structuredContent:{result:output},content:[{type:'text' as const,text:JSON.stringify(output)??'null'}]};
 return {structuredContent:image.metadata,content:[
  {type:'text' as const,text:JSON.stringify(image.metadata)},
  {type:'image' as const,mimeType:image.mimeType,data:image.data},
 ]};
}
