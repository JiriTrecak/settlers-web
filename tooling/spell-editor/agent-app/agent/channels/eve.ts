import {eveChannel} from 'eve/channels/eve';
export default eveChannel({auth:request=>{
 const token=process.env.CANOPY_AGENT_TOKEN;
 if(!token||request.headers.get('authorization')!=='Bearer '+token)return null;
 return {authenticator:'canopy-editor',principalId:'local-author',principalType:'user',attributes:{}};
}});
