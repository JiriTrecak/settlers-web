import {expect,it} from 'vitest';
import {buildSceneTree,filterSceneTree} from '../../src/editor/chrome/sceneTreeModel';
import {proceduralFixture} from '../authoring/fixture';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {authoredObjectSchema} from '../../src/shared/authoring/layers';

function fixture(){
 const map=proceduralFixture(),scene=map.authoring!;
 scene.objects=[authoredObjectSchema.parse({id:'shared',asset:'asset.models.environment.mega-oak-trunk',x:32,z:32,locked:true}),authoredObjectSchema.parse({id:'second',asset:'asset.models.environment.mega-oak-trunk',x:50,z:32,visible:false})];
 return {scene,assets:landscapeAssets,generated:[{owner:'forest'},{owner:'forest'}],stamps:[{id:'shared',asset:'oak',x:1,y:1}],entities:map.entities};
}
it('groups the complete scene without modifying map order and keeps selection namespaces distinct',()=>{
 const input=fixture(),before=JSON.stringify(input.scene),tree=buildSceneTree(input);
 expect(tree.count).toBe(input.scene.layers.length+input.scene.objects.length+input.stamps.length+input.entities.length);
 expect(tree.nodes.get('object:shared')?.selection).toEqual({kind:'object',id:'shared'});
 expect(tree.nodes.get('stamp:shared')?.selection).toEqual({kind:'stamp',id:'shared'});
 expect(tree.nodes.get('object:shared')?.locked).toBe(true);expect(tree.nodes.get('object:second')?.hidden).toBe(true);
 expect(tree.nodes.get('objects:asset.models.environment.mega-oak-trunk')?.children).toEqual(['object:shared','object:second']);
 expect(tree.nodes.get('layer:forest')?.detail).toBe('2');expect(JSON.stringify(input.scene)).toBe(before);
});
it('searches IDs and folder names, retains ancestors, and filters categories independently',()=>{
 const tree=buildSceneTree(fixture()),one=filterSceneTree(tree,'second','all');
 expect(one.count).toBe(1);expect(one.nodes.has('objects')).toBe(true);expect(one.nodes.has('object:second')).toBe(true);expect(one.nodes.has('layers')).toBe(false);
 const group=filterSceneTree(tree,'Mega oak','objects');expect(group.count).toBe(2);
 const layers=filterSceneTree(tree,'','layers');expect([...layers.nodes.values()].filter(n=>n.selection).every(n=>n.selection?.kind==='layer')).toBe(true);
 expect(filterSceneTree(tree,'nothing matches this','all').nodes.get('root')?.children).toEqual([]);
});
