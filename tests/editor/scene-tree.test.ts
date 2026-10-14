import {expect,it} from 'vitest';
import {buildSceneTree,filterSceneTree} from '../../src/editor/chrome/sceneTreeModel';
import {authoredObjectSchema,mapPreviewSceneSchema} from '../../src/shared/authoring/layers';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
import {flatTerrainData} from '../../src/shared/map/terrainData';
import {emptyUtcMap} from '../../src/shared/map/utcmap';

/** Test-owned catalogue: one named object asset; layers use test recipe ids that resolve to ground cover. */
const assets:LandscapeAsset[]=[{id:'asset.test.giant-oak',name:'Giant oak',kind:'tree',scale:1,clearance:0}];
const region={type:'region',points:[{x:10,z:10},{x:40,z:10},{x:40,z:40},{x:10,z:40}]};
function fixture(){
 const scene=mapPreviewSceneSchema.parse({version:1,terrain:flatTerrainData(256,0,-8),objects:[],layers:[
  {id:'forest',name:'Forest',recipe:'recipe.test.forest',seed:14,shape:region},
  {id:'banks',name:'Banks',recipe:'recipe.test.banks',seed:6,shape:region},
 ]});
 scene.objects=[authoredObjectSchema.parse({id:'shared',asset:'asset.test.giant-oak',x:32,z:32,locked:true}),authoredObjectSchema.parse({id:'second',asset:'asset.test.giant-oak',x:50,z:32,visible:false})];
 return {scene,assets,generated:[{owner:'forest'},{owner:'forest'}],stamps:[{id:'shared',asset:'oak',x:1,y:1}],entities:emptyUtcMap().entities};
}
it('groups the complete scene without modifying map order and keeps selection namespaces distinct',()=>{
 const input=fixture(),before=JSON.stringify(input.scene),tree=buildSceneTree(input);
 expect(tree.count).toBe(input.scene.layers.length+input.scene.objects.length+input.stamps.length+input.entities.length);
 expect(tree.nodes.get('object:shared')?.selection).toEqual({kind:'object',id:'shared'});
 expect(tree.nodes.get('stamp:shared')?.selection).toEqual({kind:'stamp',id:'shared'});
 expect(tree.nodes.get('object:shared')?.locked).toBe(true);expect(tree.nodes.get('object:second')?.hidden).toBe(true);
 expect(tree.nodes.get('objects:asset.test.giant-oak')?.children).toEqual(['object:shared','object:second']);
 expect(tree.nodes.get('layer:forest')?.detail).toBe('2');expect(JSON.stringify(input.scene)).toBe(before);
});
it('searches IDs and folder names, retains ancestors, and filters categories independently',()=>{
 const tree=buildSceneTree(fixture()),one=filterSceneTree(tree,'second','all');
 expect(one.count).toBe(1);expect(one.nodes.has('objects')).toBe(true);expect(one.nodes.has('object:second')).toBe(true);expect(one.nodes.has('layers')).toBe(false);
 const group=filterSceneTree(tree,'Giant oak','objects');expect(group.count).toBe(2);
 const layers=filterSceneTree(tree,'','layers');expect([...layers.nodes.values()].filter(n=>n.selection).every(n=>n.selection?.kind==='layer')).toBe(true);
 expect(filterSceneTree(tree,'nothing matches this','all').nodes.get('root')?.children).toEqual([]);
});
