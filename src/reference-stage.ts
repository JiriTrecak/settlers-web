import {liveSourceOcclusion} from './render/prop/liveSourceOcclusion';
import {EditorBridge} from './shared/control/editorBridge';
/** Art-direction fixture: the saved map and the game's renderer, without editor chrome. */
import { perf } from "./debug/performance";
import { GRAPHICS_CHANGED, readResolutionScale, readShadowMode, setShadowMode } from "./shared/settings/graphics";
const mapSources = import.meta.glob('../assets/maps/{campaign,skirmish,showcase}/**/*.utcmap', {query:'?raw', import:'default', eager:true}) as Record<string,string>;
import { parseUtcMap, decodeHeight, HeightField } from "./shared";
import { emptyLandscape } from "./shared/landscape/curve";
import { projectCatalogue, projectMeshUrl } from "./shared/assets/project";
import { Renderer } from "./render";
import {
  authoredScene,
  editorEntities,
  resourceStamps,
} from "./presentation/scenery";
async function start() {
  const params = new URLSearchParams(location.search);
  const mapId=params.get('map') ?? 'threewater-forest';
  const raw=Object.entries(mapSources).find(([path])=>path.endsWith('/'+mapId+'.utcmap'))?.[1];
  if(!raw)throw Error('Unknown authored map: '+mapId);
  const x = Number(params.get("x") ?? 128),
    z = Number(params.get("z") ?? 127),
    zoom = Math.max(0.5, Math.min(2, Number(params.get("zoom") ?? 0.8)));
  const map = parseUtcMap(JSON.parse(raw));
  if (!map) throw Error("Invalid Ant comparison map");
  const angle=(name:string,fallback:number,min:number,max:number)=>{
    const n=Number(params.get(name)??fallback);return Math.min(max,Math.max(min,Number.isFinite(n)?n:fallback));
  };
  const yaw=angle('yaw',-45,-360,360),pitch=angle('pitch',45,15,89);
  const sites=document.createElement('details');sites.style.cssText='position:fixed;z-index:10;right:12px;top:12px;background:#101820ee;color:white;padding:10px;font:14px system-ui;max-height:80vh;overflow:auto';
  const label=document.createElement('summary');label.textContent=map.landscape?.importedTerrain?'Reference comparison':'Inspect Root sites';sites.append(label);
  const seenMaps=new Set<string>();
  for(const [path,raw] of Object.entries(mapSources)){
    const id=path.split('/').at(-1)!.replace('.utcmap','');
    const authored=parseUtcMap(JSON.parse(raw));if(!authored||seenMaps.has(id))continue;seenMaps.add(id);
    for(const site of authored.entities.filter(e=>e.definition==='building.neutral.corrupted-root')){
      const a=document.createElement('a');a.style.cssText='display:block;color:#dce6c7;padding:5px';
      a.textContent=authored.name+' · '+site.position.x+', '+site.position.y;
      a.href='?'+new URLSearchParams({map:id,x:String(site.position.x),z:String(site.position.y),zoom:'1'});sites.append(a);
    }
  }
  document.body.append(sites);
  const catalog = projectCatalogue();
  const urls = new Map(
    catalog.assets.flatMap((a) => {
      const url = projectMeshUrl(a.file);
      return url ? [[a.id, url] as [string, string]] : [];
    }),
  );
  const renderer = new Renderer(
    document.querySelector<HTMLCanvasElement>("#scene")!,
    urls,
  );
  renderer.setKinds(new Map(catalog.assets.map((a) => [a.id, a.type])));
  const authored=projectScene(map),field = authored?.field??new HeightField(map.size);
  if(!authored)field.load(map.height ? decodeHeight(map.height,map.size)! : [], map.waterLevel ?? 0, map.landscape?.importedTerrain);
  renderer.setTerrain(field);
  renderer.setLandscape(map.landscape ?? emptyLandscape());
  renderer.setGridMode("none");
  renderer.camera.setGame(true,map.size);
  renderer.camera.pose({
    x,
    z,
    yaw: yaw*Math.PI/180,
    pitch: pitch*Math.PI/180,
    gameZoom: zoom,
  });
  const entities = editorEntities(map),
    snapshot = { tick: 0, size: map.size, settlement: authoredScene(entities) },
    stamps = [...(authored?.stamps??map.stamps), ...resourceStamps(entities)];
  if(params.has('hour')){
    const hour=Number(params.get('hour'));if(Number.isFinite(hour)){renderer.sky.setPlaying(false);renderer.sky.setHour(hour);}
    const controls=document.createElement('nav');controls.setAttribute('aria-label','Lighting reference');controls.style.cssText='position:fixed;z-index:10;bottom:56px;left:12px;display:flex;gap:8px;background:#101820ee;color:white;padding:10px;font:14px system-ui';
    const phase=document.createElement('span');phase.textContent=renderer.sky.snapshot().label;phase.setAttribute('role','status');controls.append(phase);
    for(const [label,h] of [['Dawn',6],['Day',12],['Dusk',18],['Night',22]] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{renderer.sky.setHour(h);phase.textContent=renderer.sky.snapshot().label;renderer.present(performance.now());};controls.append(button);}
    document.body.append(controls);
  }
  renderer.draw(snapshot, stamps);
  await Promise.all([renderer.ready(), renderer.gameReady()]);
  renderer.draw(snapshot, stamps);
  if(map.landscape?.importedTerrain){
    const save=document.createElement('button');save.textContent='Save comparison PNG';
    save.style.cssText='position:fixed;left:150px;bottom:12px;z-index:10;background:#101820ee;color:white;border:1px solid #6b7966;padding:8px 12px';
    save.onclick=()=>{
      const image=renderer.capture(1920,16/9,12),a=document.createElement('a');
      a.download=`${mapId}-x${x}-z${z}-yaw${yaw}-pitch${pitch}-hour${renderer.sky.hour}-time12.png`;
      a.href=image.toDataURL('image/png');a.click();
    };
    document.body.append(save);
    const note=document.createElement('p');note.style.cssText='max-width:280px;font-size:12px';
    note.textContent='Comparison export: 1920 × 1080, animation time 12 seconds. Camera yaw and pitch can be set in the URL.';sites.append(note);
  }
  // Benchmarks and exported comparisons use a fixed animation instant.
  // Normal previews animate while retaining the selected daytime look.
  const benchmark=params.has('benchmark');
  let frames=0,lastFrame=0, intervals:number[]=[];
  const results:{scale:number;shadow:string;fps:number;frameP95:number|undefined;report:ReturnType<typeof perf.report>}[]=[];
  const summary=()=>results.map(r=>({scale:r.scale,shadows:r.shadow,fps:Math.round(r.fps),frameP95:r.frameP95,GPU:r.report.timings['GPU frame'],CPU:r.report.timings['Present total (CPU)']}));
  const modes=[{scale:1,shadow:'soft'},{scale:.5,shadow:'soft'},{scale:1,shadow:'filtered'},{scale:.5,shadow:'filtered'}] as const;
  const original={scale:readResolutionScale(),shadow:readShadowMode(),debug:perf.enabled};
  let mode=0,finished=false;
  const output=document.createElement('pre');
  if(benchmark){
    output.style.cssText='position:fixed;left:12px;top:12px;background:#101820ee;color:white;padding:12px;font:13px monospace;max-height:85vh;overflow:auto';
    document.body.append(output);renderer.sky.setPlaying(false);renderer.sky.setHour(11);
    if(!perf.enabled)perf.toggle();
  }
  const apply=()=>{
    window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:modes[mode]!.scale}));
    setShadowMode(modes[mode]!.shadow);
  };
  const restore=()=>{
    window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:original.scale}));
    setShadowMode(original.shadow);
    if(perf.enabled!==original.debug)perf.toggle();
  };
  if(benchmark){apply();window.addEventListener('beforeunload',restore,{once:true})}
  let previewPaused=false;
  const pause=document.createElement('button');pause.textContent='Pause preview';pause.style.cssText='position:fixed;left:12px;bottom:12px;z-index:10;background:#101820ee;color:white;border:1px solid #6b7966;padding:8px 12px';
  pause.onclick=()=>{previewPaused=!previewPaused;pause.textContent=previewPaused?'Resume preview':'Pause preview';};
  if(!benchmark)document.body.append(pause);
  const frame = (now:number) => {
    if(!benchmark&&(document.hidden||previewPaused)){requestAnimationFrame(frame);return;}

    perf.frame(now);renderer.present(benchmark?12_000:now);
    if(benchmark&&!finished){
      if(document.hidden){frames=0;intervals=[];lastFrame=0;}
      else {
        frames++;if(frames===120)perf.resetTimings();if(frames>120&&lastFrame)intervals.push(now-lastFrame);lastFrame=now;
        output.textContent='Fixed scene · 11:00 · '+map.name+'\n'+JSON.stringify(modes[mode])+' · '+frames+'/360 frames\n'+JSON.stringify(summary(),null,2);
        if(frames>=360){
          const sorted=intervals.slice().sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
          results.push({...modes[mode],fps:1000/mean,frameP95:sorted[Math.ceil(sorted.length*.95)-1],report:perf.report()});
          frames=0;intervals=[];lastFrame=0;mode++;
          if(mode===modes.length){finished=true;restore();output.textContent='Complete · original settings restored\n'+JSON.stringify(summary(),null,2);document.body.dataset.benchmark=JSON.stringify(results)}else apply();
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Opt-in inspection endpoint (occlusion probe restores all temporary changes): identical capture path to the game.
  // Keeps visual comparisons independent of the desktop panel's aspect ratio.
  if(params.has('inspect')){
    const bridge=new EditorBridge({dispatch(op,p){
      const options=(p??{}) as Record<string,unknown>;
      if(op==='screenshot'){
        const animationTime=Number(options.animationTime??12);
        const canvas=renderer.capture(Number(options.maxWidth??1920),Number(options.aspect??16/9),animationTime);
        return {data:canvas.toDataURL('image/png').split(',')[1],mime:'image/png',width:canvas.width,height:canvas.height,mapName:map.name,camera:{x:renderer.camera.targetX,z:renderer.camera.targetZ,yaw:renderer.camera.yaw,pitch:renderer.camera.pitch,zoom:renderer.camera.gameZoom},hour:renderer.sky.hour,animationTime};
      }
      if(op==='gameView'){
        renderer.camera.pose({x:typeof options.x==='number'?options.x:undefined,z:typeof options.z==='number'?options.z:undefined,gameZoom:typeof options.gameZoom==='number'?options.gameZoom:undefined});
        renderer.present(performance.now());return {x:renderer.camera.targetX,z:renderer.camera.targetZ};
      }
      if(op==='occlusionProbe'){
        const source=map.landscape?.importedTerrain;
        if(!source?.occlusion?.dynamic)throw Error('No dynamic source occlusion');
        const state=liveSourceOcclusion(source);
        const nearby=source.occlusion.dynamic.plants.filter(p=>Math.hypot(p.x-renderer.camera.targetX,p.z-renderer.camera.targetZ)<65);
        const visible=renderer.landmarks(16/9,nearby.map(p=>p.id)).filter(p=>p.anchor.u>.15&&p.anchor.u<.85&&p.anchor.v>.15&&p.anchor.v<.8);
        visible.sort((a,b)=>Math.hypot(a.anchor.u-.5,a.anchor.v-.5)-Math.hypot(b.anchor.u-.5,b.anchor.v-.5));
        const plant=source.occlusion.dynamic.plants.find(p=>p.id===(visible[0]?.id??options.id));
        if(!plant)throw Error('Unknown source occlusion caster');
        const before=state.rgba.slice(),maxWidth=960;
        const baseline=renderer.capture(maxWidth,16/9,12).toDataURL('image/png').split(',')[1];
        let changedPixels=0,updateMs=0,update=state.lastUpdate,without='';
        try{
          const radius=Math.max(0,Math.min(32,Number(options.radius)||0));
          const hidden=new Set(source.occlusion.dynamic.plants.filter(p=>p.id===plant.id||Math.hypot(p.x-plant.x,p.z-plant.z)<=radius).map(p=>p.id));
          const filtered=stamps.filter(s=>!hidden.has(s.id)),start=performance.now();state.sync(filtered);updateMs=performance.now()-start;update={...state.lastUpdate};
          for(let i=0;i<before.length;i+=4)if(before[i]!==state.rgba[i]||before[i+1]!==state.rgba[i+1]||before[i+2]!==state.rgba[i+2]||before[i+3]!==state.rgba[i+3])changedPixels++;
          without=renderer.capture(maxWidth,16/9,12).toDataURL('image/png').split(',')[1]!;
        }finally{state.sync(stamps);}
        const restored=renderer.capture(maxWidth,16/9,12).toDataURL('image/png').split(',')[1];
        let restoredBytes=true;for(let i=0;i<before.length;i++)if(before[i]!==state.rgba[i]){restoredBytes=false;break;}
        return {id:plant.id,landmark:renderer.landmarks(16/9,[plant.id]),subscribers:state.subscriberCount,changedPixels,updateMs,update,restoredBytes,baseline,without,restored};
      }
      if(op==='waterDiagnostics')return renderer.referenceWaterDiagnostics();
      if(op==='gamePerformance')return perf.report();
      throw Error('Reference preview exposes screenshot, gameView, waterDiagnostics, occlusionProbe and gamePerformance only');
    }});
    const inspectPort=Number(params.get('inspectPort')??7380);
    if(!Number.isInteger(inspectPort)||inspectPort<1024||inspectPort>65535)throw Error('Invalid inspection port');
    bridge.start(inspectPort);window.addEventListener('beforeunload',()=>bridge.stop(),{once:true});
  }
  document.body.dataset.ready = "true";
  document.body.dataset.map = map.name;
  document.body.dataset.capture = JSON.stringify({
    x,
    z,
    yaw,
    pitch,
    gameZoom: zoom,
    animationTime: 12,
    stamps: map.stamps.length,
  });
}
void start().catch((error) => {
  const el = document.querySelector<HTMLElement>("#error")!;
  el.hidden = false;
  el.textContent = String(error?.stack ?? error);
  document.body.dataset.error = String(error);
});
import {projectScene} from './shared/authoring/project';
