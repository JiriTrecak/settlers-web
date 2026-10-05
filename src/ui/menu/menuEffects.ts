/** All coordinates are in the clean plate's 1672 × 941 space, before object-fit: cover.
 * Artwork, mask and emitters therefore crop together on any viewport. No game renderer needed. */
const WIDTH=1672,HEIGHT=941;
const fires=[
 {x:1453,y:474,width:37,height:77,seed:1},
 {x:1340,y:599,width:25,height:59,seed:4},
 {x:1116,y:479,width:13,height:38,seed:7},
];
// Hand-traced opening: shafts sit behind the giant trunk, fern, acorn and foreground.
// These are scene occluders, not a screen-space gradient washing over the whole illustration.
const opening='M 720 34 L 841 20 L 900 44 L 1010 70 L 1000 152 L 1008 230 L 994 287 L 969 331 L 971 380 L 942 416 L 930 462 L 900 496 L 845 519 L 832 558 L 761 566 L 749 522 L 720 496 L 695 431 L 665 393 L 665 318 L 658 265 L 672 207 L 701 149 Z';
const branches=[
 'M 587 90 C 743 105 871 160 1042 270 L 1010 384 C 958 303 842 250 751 201 L 621 154 Z',
 'M 755 47 L 781 47 L 775 137 L 760 173 L 744 161 Z',
];
const fract=(x:number)=>x-Math.floor(x);
const random=(n:number)=>fract(Math.sin(n*127.1+311.7)*43758.5453);

function surface(w:number,h:number){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}

const beams=[
 {x:775,y:47,dx:-55,width:38,length:575,strength:1},
 {x:843,y:64,dx:-80,width:49,length:560,strength:1},
 // Keep the entire animated sweep in the open valley, left of the fallen trunk.
 {x:726,y:65,dx:-50,width:22,length:460,strength:.85},
 {x:696,y:83,dx:-14,width:11,length:410,strength:.55},
 {x:756,y:51,dx:-60,width:13,length:485,strength:.65},
];

/** Blur once, then sweep each shaft behind a stationary scene occlusion mask. */
function rayLayers(){
 const mask=surface(WIDTH/2,Math.ceil(HEIGHT/2)),m=mask.getContext('2d')!;
 m.scale(.5,.5);m.fillStyle='#fff';m.filter='blur(8px)';m.fill(new Path2D(opening));
 m.filter='none';m.globalCompositeOperation='destination-out';
 for(const path of branches)m.fill(new Path2D(path));
 const textures=beams.map(b=>{
  const canvas=surface(160,340),c=canvas.getContext('2d')!;
  c.scale(.5,.5);c.translate(160,20);c.filter='blur(6px)';
  const g=c.createLinearGradient(0,0,0,b.length);
  g.addColorStop(0,'rgba(214,232,224,0)');g.addColorStop(.1,'rgba(214,232,224,.82)');
  g.addColorStop(.55,'rgba(175,206,205,.56)');g.addColorStop(1,'rgba(145,176,177,0)');
  c.fillStyle=g;c.beginPath();c.moveTo(-b.width*.16,0);c.lineTo(b.width*.16,0);
  c.lineTo(b.width,b.length);c.lineTo(-b.width,b.length);c.closePath();c.fill();
  return canvas;
 });
 return {mask,textures,buffer:surface(mask.width,mask.height)};
}

function smokeSprite(){
 const canvas=surface(96,96),c=canvas.getContext('2d')!;
 for(let i=0;i<8;i++){
  const x=48+(random(i+19)-.5)*25,y=48+(random(i+31)-.5)*25,r=22+random(i+13)*18;
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(128,139,142,.19)');g.addColorStop(.5,'rgba(109,122,127,.1)');g.addColorStop(1,'rgba(90,103,108,0)');
  c.fillStyle=g;c.fillRect(0,0,96,96);
 }
 return canvas;
}

export class MenuEffects {
 readonly canvas=document.createElement('canvas');
 private readonly context:CanvasRenderingContext2D|null;
 private readonly rays:ReturnType<typeof rayLayers>|null;
 private readonly smoke:HTMLCanvasElement;
 private readonly reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 private readonly observer:ResizeObserver;
 private frame=0;
 private time=0;
 private previous=0;
 private lastDraw=0;
 private width=1;
 private height=1;
 private disposed=false;
 constructor(private readonly stage:HTMLElement){
  this.canvas.className='canopy-effects';this.canvas.setAttribute('aria-hidden','true');
  this.context=this.canvas.getContext('2d',{alpha:true});
  this.rays=this.context?rayLayers():null;this.smoke=this.context?smokeSprite():surface(1,1);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);
  document.addEventListener('visibilitychange',this.visibility);
  this.reduced.addEventListener('change',this.motion);
  stage.append(this.canvas);this.resize();this.resume();
 }
 private resize(){
  const {width,height}=this.stage.getBoundingClientRect();if(!width||!height)return;
  this.width=width;this.height=height;
  // Decorative particles do not need a retina-sized full-screen buffer.
  const scale=Math.min(1,1600/width);
  this.canvas.width=Math.round(width*scale);this.canvas.height=Math.round(height*scale);this.draw();
 }
 private visibility=()=>{if(document.hidden)this.pause();else this.resume();};
 private motion=()=>{this.pause();this.resume();};
 private pause(){cancelAnimationFrame(this.frame);this.frame=0;this.previous=0;}
 private resume(){
  if(this.disposed||document.hidden||!this.context)return;
  this.draw();if(!this.reduced.matches&&!this.frame)this.frame=requestAnimationFrame(this.animate);
 }
 private animate=(now:number)=>{
  this.frame=0;if(this.disposed||document.hidden)return;
  if(this.previous)this.time+=Math.min(100,now-this.previous)/1000;this.previous=now;
  if(now-this.lastDraw>=1000/30){this.draw();this.lastDraw=now;}
  this.frame=requestAnimationFrame(this.animate);
 };
 private draw(){
  const c=this.context;if(!c)return;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.canvas.width,this.canvas.height);
  const cover=Math.max(this.width/WIDTH,this.height/HEIGHT),resolution=this.canvas.width/this.width;
  c.setTransform(cover*resolution,0,0,cover*resolution,(this.width-WIDTH*cover)/2*resolution,(this.height-HEIGHT*cover)/2*resolution);
  const t=this.reduced.matches?2:this.time;
  if(this.rays){
   const {buffer,mask,textures}=this.rays,r=buffer.getContext('2d')!;
   r.setTransform(1,0,0,1,0,0);r.clearRect(0,0,buffer.width,buffer.height);
   r.globalCompositeOperation='screen';
   textures.forEach((ray,i)=>{
    const b=beams[i]!;
    r.save();r.scale(.5,.5);r.translate(b.x,b.y);
    r.rotate(-Math.atan2(b.dx,b.length)+Math.sin(t*.43+i*1.9)*.055);
    r.scale(.9+.16*Math.sin(t*.67+i),1);
    r.globalAlpha=b.strength*(.78+.2*Math.sin(t*.73+i*1.7));
    r.drawImage(ray,-160,-20,320,680);r.restore();
   });
   // Drifting illuminated dust reinforces depth without blanketing the forest in fog.
   r.save();r.scale(.5,.5);r.fillStyle='#dbe8d5';
   for(let i=0;i<24;i++){
    const life=fract(t*.026+random(i+91)),x=728+random(i+42)*190+Math.sin(t*.35+i)*9;
    r.globalAlpha=Math.sin(life*Math.PI)*.35;
    r.beginPath();r.arc(x,100+life*410,.8+random(i+6),0,Math.PI*2);r.fill();
   }
   r.restore();r.globalAlpha=1;r.globalCompositeOperation='destination-in';r.drawImage(mask,0,0);
   c.globalCompositeOperation='screen';c.drawImage(buffer,0,0,WIDTH,HEIGHT);
  }
  c.globalCompositeOperation='screen';c.globalAlpha=1;
  for(const f of fires){
   const pulse=.88+.07*Math.sin(t*8+f.seed)+.05*Math.sin(t*13+f.seed);
   // A local light spill belongs on the surrounding burned wood, not the whole scene.
   const glow=c.createRadialGradient(f.x,f.y,0,f.x,f.y,f.height*1.65);
   glow.addColorStop(0,`rgba(243,96,16,${.3*pulse})`);glow.addColorStop(.38,`rgba(201,59,8,${.12*pulse})`);glow.addColorStop(1,'rgba(130,40,3,0)');
   c.fillStyle=glow;c.fillRect(f.x-f.height*2,f.y-f.height*2,f.height*4,f.height*4);
   // Continuous tongues with independent timing; no looping video or baked flame image.
   for(let i=0;i<9;i++){
    const phase=t*(2.6+random(i+f.seed)) +i*1.6+f.seed;
    const x=f.x+(random(i+f.seed*23)-.5)*f.width*1.6,y=f.y+Math.sin(i*3)*4;
    const envelope=.42+.58*random(i+f.seed*31);
    const h=f.height*envelope*(.48+.65*(.5+.5*Math.sin(phase))),w=f.width*(.23+.08*Math.sin(phase*.7));
    const bend=Math.sin(phase*1.9)*w*1.2+Math.sin(phase*.6)*h*.14;
    const g=c.createLinearGradient(x,y,x,y-h);
    g.addColorStop(0,'rgba(255,159,38,.3)');g.addColorStop(.18,'#ffe399');g.addColorStop(.45,'rgba(255,161,39,.92)');g.addColorStop(.75,'rgba(238,68,9,.6)');g.addColorStop(1,'rgba(184,43,5,0)');
    c.shadowColor='rgba(255,111,21,.45)';c.shadowBlur=4;
    c.fillStyle=g;c.beginPath();c.moveTo(x-w,y);c.bezierCurveTo(x-w*1.5,y-h*.3,x+bend-w*.4,y-h*.65,x+bend,y-h);c.bezierCurveTo(x+bend+w*.2,y-h*.55,x+w*1.2,y-h*.35,x+w,y);c.closePath();c.fill();
   }
   c.shadowBlur=0;
   // Embers follow the taller smoke columns, with independent lifetimes and drift.
   for(let i=0;i<15;i++){
    const life=fract(t*(.09+random(i+13)*.06)+random(i+f.seed*17));
    const x=f.x+(random(i+f.seed*23)-.5)*f.width+life*48+Math.sin(life*9+i)*7,y=f.y-life*f.height*5.6;
    c.globalAlpha=Math.sin(life*Math.PI)*.75;c.fillStyle='#ffbb66';c.fillRect(x,y,1.2,2);
   }
   c.globalAlpha=1;
  }
  c.globalCompositeOperation='source-over';
  for(const f of fires)for(let i=0;i<16;i++){
   const life=fract(t*.07+i/16+f.seed*.13),rise=life*f.height*7.5;
   const x=f.x+life*64+Math.sin(life*5+f.seed)*14,y=f.y-12-rise,size=f.width*1.3+life*f.height*1.45;
   c.globalAlpha=Math.sin(life*Math.PI)*.55;
   c.drawImage(this.smoke,x-size/2,y-size/2,size,size);
  }
  c.globalAlpha=1;
 }
 destroy(){this.disposed=true;this.pause();this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener('change',this.motion);this.canvas.remove();}
}
