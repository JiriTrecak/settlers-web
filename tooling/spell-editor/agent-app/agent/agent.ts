import {defineAgent} from 'eve';
import {createOpenAI} from '@ai-sdk/openai';
// This credential is an ephemeral capability for the editor proxy, never the user's key.
const provider=createOpenAI({apiKey:process.env.CANOPY_AGENT_TOKEN??'not-configured',baseURL:'http://127.0.0.1:5177/__spells/provider/v1'});
export default defineAgent({model:provider(process.env.CANOPY_AGENT_MODEL??'gpt-6.1-sol'),defaultTools:false,reasoning:'medium',modelContextWindowTokens:128000,modelOptions:{providerOptions:{openai:{store:false}}},limits:{maxInputTokensPerSession:1000000,maxOutputTokensPerSession:60000,sessionTimeoutMs:86400000}});
