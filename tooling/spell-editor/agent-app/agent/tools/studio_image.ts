import {defineTool} from 'eve/tools';
import {agentImageModelOutput} from '../../../shared/agentImages';
import {authoringTools} from '../../../shared/authoringTools';
import {call} from '../../bridge';
export default defineTool({
 ...authoringTools.studio_image,
 execute:(input,ctx)=>call('studio_image',input,ctx.session.id,ctx.abortSignal),
 toModelOutput:agentImageModelOutput
});
