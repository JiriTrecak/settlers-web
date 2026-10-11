/** Publish captured, reproducible pine builds through the workbench contract.
 * Build/capture first. Runtime textures follow the shared 512px export budget. */
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';

const store=new AuthoringStore(process.cwd());
for(const variant of ['a','b','sapling']){
 const id=`asset.models.environment.woodland-pine-${variant}`;
 const build=JSON.parse((await store.resource(id,{role:'build',index:1})).bytes.toString());
 const source=build.files['geometry.glb'];
 if(source.asset!==id)throw Error('Expected a locally authored pine build');
 const {bytes}=await store.resource(id,source),geometry=await resizeModelTextures(bytes,512);
 let current=await store.get(id);
 await store.dispatch({op:'asset.upload',id,expectedRevision:current.revision,role:'geometry',index:1,format:'glb',base64:geometry.toString('base64')});
 current=await store.get(id);
 await store.dispatch({op:'asset.save',expectedRevision:current.revision,definition:{...current,exportSettings:{textureSize:512}}});
 await store.dispatch({op:'asset.validate',id});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,'with 512px textures');
}
