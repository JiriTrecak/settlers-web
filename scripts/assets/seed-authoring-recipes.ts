/** Source-informed starting points, not a claim to reproduce unavailable Scouring brush code. */
import path from 'node:path';
import {access} from 'node:fs/promises';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {landscapeRecipeSchema} from '../../src/shared/authoring/recipes';
import {saveJson} from '../../tooling/asset-studio/server/storage';
const root=process.cwd();
const pine=(name:string)=>`asset.models.environment.trees.reference-${name}`;
const grass=(name:string)=>`asset.models.environment.grass.reference-${name}`;
const scatter={species:[{asset:pine('fir-a'),weight:1},{asset:pine('fir-b'),weight:1}],spacing:3.2,minSpacing:3.2,probability:1,jitter:.65,scaleMin:.85,scaleMax:1.15,maxSlope:1,waterClearance:2,objectClearance:0,edgeFade:1,patchiness:{scale:12,strength:.12}};
const definitions=[
 {id:'water.clear-forest',name:'Clear forest water',kind:'water-profile',water:{shallowColor:'#72877a',deepColor:'#243d45',clarity:3,rippleScale:.15,rippleStrength:.055,foamStrength:.3,reflectionStrength:.45,causticStrength:.3,cloudStrength:.03,flowSpeed:1}},
 {id:'water.muddy',name:'Muddy water',kind:'water-profile',water:{shallowColor:'#8c8060',deepColor:'#494a35',clarity:.7,rippleScale:.18,rippleStrength:.045,foamStrength:.2,reflectionStrength:.3,causticStrength:.02,cloudStrength:.025,flowSpeed:1}},
 {id:'recipe.forest.conifer-edge',name:'Conifer forest · soft sapling edge',recipe:{type:'forest',...scatter,interiorMargin:3.5,edge:{...scatter,width:5,species:[{asset:pine('fir-small-a'),weight:1}],spacing:1.5,minSpacing:1.5,probability:.65,waterClearance:.5,scaleMin:.75,scaleMax:1.1,edgeFade:1.5,patchiness:{scale:6,strength:.4}}}},
 {id:'recipe.grass.meadow',name:'Meadow · mixed low grass',recipe:{type:'grass',...scatter,species:[{asset:grass('grass-low'),weight:6},{asset:grass('grass-messy'),weight:3},{asset:grass('grass-daisy'),weight:1}],spacing:.65,minSpacing:.2,probability:.7,waterClearance:.2,scaleMin:.7,scaleMax:1.2,edgeFade:2,patchiness:{scale:5,strength:.65}}},
 {id:'recipe.foliage.riverbank',name:'Riverbank · broken tall grass',recipe:{type:'ground-cover',...scatter,species:[{asset:grass('grass-high-a'),weight:2},{asset:grass('grass-high-b'),weight:1}],spacing:.75,minSpacing:.2,probability:.6,waterClearance:.1,riverBank:{min:.1,max:3},scaleMin:.6,scaleMax:1.25,edgeFade:1,patchiness:{scale:4,strength:.75}}},
 {id:'recipe.river.gentle',name:'Gentle forest stream',recipe:{type:'river',water:'water.clear-forest',width:7,depth:1.8,bankWidth:3,flow:.6,maxUphillGrade:0}},
 {id:'recipe.river.swift',name:'Swift woodland river',recipe:{type:'river',water:'water.clear-forest',width:12,depth:3,bankWidth:4,flow:1.8,maxUphillGrade:0}},
 {id:'recipe.terrain.hill',name:'Soft woodland rise',recipe:{type:'terrain',operation:'raise',height:4,falloff:8}},
];
for(const raw of definitions){const asset=assetDefinitionSchema.parse({version:1,kind:'landscape-recipe',...raw,recipe:'recipe'in raw?landscapeRecipeSchema.parse(raw.recipe):undefined,revision:1,status:'published',tags:['authoring','source-informed'],resources:[],usesGeometry:false,provenance:{method:'authored',licenseNote:'Designed from supplied prebuild class values and measured Eldenvale patterns. Original brush algorithms were not included.'}});const file=path.join(root,assetFolder(asset.id),'asset.json');try{await access(file);console.log('Kept existing '+asset.id);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await saveJson(file,asset);console.log('Created '+asset.id);}}
