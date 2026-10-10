import {startingUnits} from '../../src/content/startingHero';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {content} from '../../src/content/builtin';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
for(const [slug,definitions,worker] of [
 ['ants-queensguard-hall',['building.ants.fort','building.ants.great-mound','building.ants.elder-hall'],'unit.ants.settler'],
 ['beetles-carapace-hall',['building.beetles.bastion'],'unit.beetles.worker'],
] as const){
 const folder=`art/assets/asset.models.buildings.${slug}`,bytes=readFileSync(folder+'/geometry.glb');
 const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 describe(slug,()=>{
  it('replaces the hall model and icon while preserving economy and square grid contracts',()=>{
   for(const id of definitions){
    const hall=content.get(id),asset=content.asset(hall.asset);
    expect(asset.file).toContain(slug+'/geometry.glb');expect(content.asset(hall.icon!).image).toContain(slug+'/image.png');
    expect(hall.footprint).toEqual({width:20,depth:20});expect(hall.entrance).toEqual({x:.5,y:10.5});
    expect(hall.behaviors.storage).toMatchObject({dropoff:true,accepts:['item.wood','item.amber']});
    expect(hall.behaviors.production).toMatchObject({mode:'queued',outputs:[worker]});expect(hall.supplyProvided).toBe(15);
   }
  });
  it('publishes a grounded square mesh with preserved maps within the 10k budget',()=>{
   expect(bytes.equals(readFileSync(`assets/library/asset.models.buildings.${slug}/geometry.glb`))).toBe(true);
   const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);expect(primitives).toHaveLength(1);
   const triangles=gltf.accessors[primitives[0].indices].count/3;expect(triangles).toBeGreaterThan(5000);expect(triangles).toBeLessThanOrEqual(10000);
   const a=gltf.accessors[primitives[0].attributes.POSITION];expect(a.min[1]).toBeCloseTo(0,4);
   expect(a.max[0]-a.min[0]).toBeCloseTo(15,4);expect(a.max[2]-a.min[2]).toBeCloseTo(15,4);
   expect(gltf.images).toHaveLength(3);expect(gltf.materials[0].normalTexture).toBeDefined();
  });
  it('keeps a 2K per-pixel red ownership mask while preserving neutral and blue shell surfaces',async()=>{
   const def=assetDefinitionSchema.parse(JSON.parse(readFileSync(folder+'/asset.json','utf8')));
   expect(def.capabilities.teamColor).toEqual({mode:'mask',slots:['TC_TeamColor'],mask:{role:'team_mask',index:1}});
   const m=gltf.materials[0];expect(m.name).toBe('TC_TeamColor');expect(m.extras.teamColorMask).toBe('baseColorAlpha');expect(m.alphaMode??'OPAQUE').toBe('OPAQUE');
   const image=gltf.images[gltf.textures[m.pbrMetallicRoughness.baseColorTexture.index].source],v=gltf.bufferViews[image.bufferView],offset=28+jsonLength+(v.byteOffset??0);
   const {data,info}=await sharp(bytes.subarray(offset,offset+v.byteLength)).raw().toBuffer({resolveWithObject:true});
   expect(info.channels).toBe(4);expect(info.width).toBe(2048);
   let red=0,natural=0,badRed=0,badNatural=0;
   for(let i=0;i<data.length;i+=4){const [r,g,b,a]=[data[i],data[i+1],data[i+2],data[i+3]];
    if(r-Math.max(g,b)>70&&Math.abs(g-b)<10&&g>35&&b>35){red++;if(a<200)badRed++;}
    if(b>r+25||(Math.abs(r-g)<8&&Math.abs(g-b)<8)){natural++;if(a>30)badNatural++;}
   }
   expect(red).toBeGreaterThan(1000);expect(natural).toBeGreaterThan(1000);
   expect(badRed/red).toBeLessThan(.02);expect(badNatural/natural).toBeLessThan(.001);
  });
 });
}
it('keeps the starting company clear of the enlarged hall footprint',()=>{
 const hall=content.get(content.rules.startingSetup.fort),half=hall.footprint!.depth/2;
 expect(hall.entrance!.y).toBeGreaterThan(half);
 for(const unit of startingUnits(content.rules.startingSetup)){
  const {radius}=content.get(unit.definition).dimensions!;
  expect(Math.max(Math.abs(unit.offset.x),Math.abs(unit.offset.y))-radius).toBeGreaterThan(half);
 }
});
