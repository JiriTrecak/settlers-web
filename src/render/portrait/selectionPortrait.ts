import connectedHudUrl from '../../../assets/library/image.woodland-connected-hud/image.png?url';
import { AmbientLight, TextureLoader, SRGBColorSpace, LinearFilter, Box3, Color, DirectionalLight, HalfFloatType, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector3, Vector4, WebGLRenderTarget, type Object3D, type Texture, type WebGLRenderer } from 'three';
export type PortraitInstance = {root:Object3D;update:(dt:number)=>void;dispose:()=>void};
/** A tiny scissored pass on the existing game canvas. No second context or pixel readbacks. */
export class SelectionPortrait {
  private scene = new Scene();
  private readonly backdrop = new TextureLoader().load(connectedHudUrl);
  private camera = new OrthographicCamera();
  private instance:PortraitInstance|null=null;
  private key='';
  private host:HTMLElement|null=null;
  private last=0;
  private box=new Box3();
  private size=new Vector3();
  private center=new Vector3();
  private fitted='';
  private viewport=new Vector4();
  private scissor=new Vector4();
  private clear=new Color();
  /** The canvas has no MSAA, so the unit renders linear HDR over transparent black into its own
   * multisampled target. The blit draws the sRGB backdrop untonemapped (as a scene background
   * was), then the unit with the renderer's tone mapping and premultiplied resolved edges. */
  private readonly target=new WebGLRenderTarget(1,1,{type:HalfFloatType,samples:4});
  private readonly blitScene=new Scene();
  private readonly blitCamera=new OrthographicCamera(-1,1,1,-1,0,1);
  private readonly quad=new PlaneGeometry(2,2);
  private readonly blits=[
    new Mesh(this.quad,new MeshBasicMaterial({map:this.backdrop,toneMapped:false,depthTest:false,depthWrite:false})),
    new Mesh(this.quad,new MeshBasicMaterial({map:this.target.texture,transparent:true,premultipliedAlpha:true,depthTest:false,depthWrite:false})),
  ];
  constructor(environment:Texture){
    this.blits.forEach((mesh,i)=>{mesh.frustumCulled=false;mesh.renderOrder=i;this.blitScene.add(mesh);});
    // Match the portrait cutout in commandDock.css; reuse the approved panel texture.
    this.backdrop.colorSpace=SRGBColorSpace;this.backdrop.generateMipmaps=false;this.backdrop.minFilter=LinearFilter;
    this.backdrop.offset.set(.2494,.3304);this.backdrop.repeat.set(.1128,.336);
    this.scene.environment=environment;this.scene.environmentIntensity=.7;
    this.scene.add(new AmbientLight(0xffefd5,1.2));
    const light=new DirectionalLight(0xffe2b3,3.2);light.position.set(-4,7,6);this.scene.add(light);
    const rim=new DirectionalLight(0x93afcf,1.3);rim.position.set(4,3,-3);this.scene.add(rim);
  }
  set(host:HTMLElement, key:string, create:()=>PortraitInstance|null){
    this.host=host;
    if(this.key===key&&this.instance)return;
    this.instance?.dispose();this.instance?.root.removeFromParent();this.instance=null;this.key='';
    delete host.dataset.live;
    if(!key)return;
    this.instance=create();if(!this.instance)return;
    this.key=key;this.instance.root.rotation.y=-.32;
    this.scene.add(this.instance.root);this.instance.update(0);this.instance.root.updateMatrixWorld(true);
    this.box.setFromObject(this.instance.root);this.box.getSize(this.size);this.box.getCenter(this.center);this.fitted='';this.last=performance.now();
    host.dataset.live='true';
  }
  draw(gl:WebGLRenderer,now:number){
    const host=this.host;
    if(!host?.isConnected||host.hidden||!this.instance||host.closest('.mission-cinematic')||document.hidden)return;
    const rect=host.getBoundingClientRect(),canvas=gl.domElement.getBoundingClientRect();
    if(rect.width<1||rect.height<1||rect.bottom>canvas.bottom+1)return;
    const dt=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;this.instance.update(dt);
    const box=this.box,center=this.center,size=this.size;
    const fit=`${rect.width}/${rect.height}/${host.dataset.kind}`;
    if(fit!==this.fitted){this.fitted=fit;
    const building=host.dataset.kind==='building';
    this.camera.position.copy(center).add(new Vector3(0,building?1.05:.28,1.8).normalize().multiplyScalar(Math.max(3,size.length()*2)));
    this.camera.lookAt(center);this.camera.updateMatrixWorld();
    let x=0,y=0;const v=new Vector3();
    for(const a of [box.min.x,box.max.x])for(const b of [box.min.y,box.max.y])for(const c of [box.min.z,box.max.z]){
      v.set(a,b,c).applyMatrix4(this.camera.matrixWorldInverse);x=Math.max(x,Math.abs(v.x));y=Math.max(y,Math.abs(v.y));
    }
    const aspect=rect.width/rect.height,half=Math.max(y,x/aspect)*1.08;
    this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.near=.01;this.camera.far=Math.max(100,size.length()*6);this.camera.updateProjectionMatrix();
    }
    gl.getViewport(this.viewport);gl.getScissor(this.scissor);const scissorTest=gl.getScissorTest(),auto=gl.autoClear,shadows=gl.shadowMap.enabled,previous=gl.getRenderTarget();
    gl.getClearColor(this.clear);const alpha=gl.getClearAlpha();
    const ratio=gl.getPixelRatio(),w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    try{
      gl.autoClear=true;gl.shadowMap.enabled=false;
      gl.setClearColor(0x000000,0);gl.setRenderTarget(this.target);gl.render(this.scene,this.camera);
      gl.setRenderTarget(previous);
      gl.setViewport(rect.left-canvas.left,canvas.bottom-rect.bottom,rect.width,rect.height);
      gl.setScissor(rect.left-canvas.left,canvas.bottom-rect.bottom,rect.width,rect.height);gl.setScissorTest(true);
      gl.autoClear=false;gl.render(this.blitScene,this.blitCamera);
    }finally{
      gl.setRenderTarget(previous);gl.setViewport(this.viewport);gl.setScissor(this.scissor);gl.setScissorTest(scissorTest);gl.autoClear=auto;gl.shadowMap.enabled=shadows;gl.setClearColor(this.clear,alpha);
    }
  }
  destroy(){this.instance?.dispose();this.instance=null;this.host=null;this.scene.clear();this.backdrop.dispose();this.target.dispose();this.quad.dispose();this.blits.forEach(mesh=>mesh.material.dispose());}
}
