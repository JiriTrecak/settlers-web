import {defineTool,toolOutput,toolOutputPart} from 'eve/tools';
import {authoringTools} from '../../../shared/authoringTools';
import {call} from '../../bridge';
export default defineTool({
 ...authoringTools.studio_author,
 execute:(input,ctx)=>call('studio_author',input,ctx.session.id,ctx.abortSignal),
 toModelOutput(output){
  if(output?.image){const {image,...metadata}=output;return toolOutput.content([toolOutputPart.text(JSON.stringify(metadata)),toolOutputPart.file(image.split(',')[1],{mediaType:'image/png'})]);}
  return toolOutput.json(output);
 }
});
