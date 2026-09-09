// Orbitable preview of evaluated Blender geometry. Reloads assets without resetting the user's view.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class BuildingViewer {
  constructor(container, status) {
    this.container = container;
    this.status = status;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive building model: drag to rotate, scroll to zoom, right-drag to pan');
    this.renderer.domElement.style.touchAction = 'none';
    container.append(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .05, 200);
    this.camera.position.set(6, 8, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.minZoom = .35;
    this.controls.maxZoom = 6;
    this.controls.maxPolarAngle = Math.PI * .94;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.target.set(0, 2, 0);
    this.lights = new THREE.Group();
    this.scene.add(this.lights);
    this.loader = new GLTFLoader();
    this.generation = 0;
    this.revision = 0;
    this.visible = false;
    this.wireframe = false;
    this.width = 9.7;
    this.teamColor = 'default';
    this.lastFrame = performance.now();
    this.variant = 'base';
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.width / (w / h) / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    requestAnimationFrame(this.frame);
    const now = performance.now(), dt = Math.min((now - this.lastFrame) / 1000, .10);
    this.lastFrame = now;
    if (!this.visible) return;
    this.player?.update(dt);
    if (this.player?.action) {
      document.getElementById('animationTime').value = this.player.action.time / this.player.action.getClip().duration;
      document.getElementById('animationState').value = this.player.state;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  show(value) { this.visible = value; if (value) this.resize(); }

  reset() {
    if (!this.metadata) return;
    const c = this.metadata.camera;
    this.camera.position.fromArray(c.position);
    this.camera.up.set(0, 1, 0);
    this.controls.target.fromArray(c.target);
    this.camera.zoom = 1;
    this.width = c.scale * (this.metadata.kind === 'character' ? 1.25 : 1);
    this.controls.update();
    this.resize();
  }

  setView(name) {
    if (name === 'saved' || name === 'reference') return this.reset();
    if (!this.metadata) return;
    const target = new THREE.Vector3().fromArray(this.metadata.camera.target);
    const offset = new THREE.Vector3().fromArray(this.metadata.camera.position).sub(target);
    const elevation = Math.atan2(offset.y, Math.hypot(offset.x, offset.z));
    const angle = { front: 0, right: Math.PI / 2, back: Math.PI }[name];
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation)).multiplyScalar(offset.length()));
    this.controls.update();
  }

  setWireframe(value) {
    this.wireframe = value;
    this.model?.traverse(o => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.wireframe = value; });
  }

  setTeamColor(value) {
    this.teamColor = value;
    this.model?.traverse(o => {
      if (!o.isMesh) return;
      for (const material of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (material.name !== 'TC_TeamColor') continue;
        material.userData.defaultTeamColor ??= material.color.clone();
        if (value === 'default') material.color.copy(material.userData.defaultTeamColor);
        else material.color.set(value);
      }
    });
  }

  setVariant(value) {
    this.variant = value; this.player?.setVariant(value);
    if (this.metadata?.variantTriangles) this.status.textContent = `${this.metadata.variantTriangles[value].toLocaleString()} triangles · ${value} · shared rig`;
  }

  async showScaleBuilding(value) {
    if (value && !this.scaleBuilding) {
      const gltf = await this.loader.loadAsync('/scale-building.glb');
      this.scaleBuilding = gltf.scene;
      this.scaleBuilding.position.set(-3.6, 0, -1.3);
      this.scene.add(this.scaleBuilding);
    }
    if (this.scaleBuilding) this.scaleBuilding.visible = value;
    if (value) {
      this.camera.position.set(7, 7, 12); this.controls.target.set(-1.8, 1.6, 0);
      this.camera.zoom = 1; this.width = 12; this.controls.update(); this.resize();
    } else this.reset();
  }

  release(model) {
    const geometries = new Set(), materials = new Set();
    model.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) materials.add(m); } });
    for (const g of geometries) g.dispose();
    for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
  }

  async load(revision) {
    if (!revision || revision === this.revision) return;
    this.revision = revision;
    const generation = ++this.generation;
    this.status.textContent = 'Loading Blender geometry…';
    try {
      const [gltf, response] = await Promise.all([
        this.loader.loadAsync('/asset/model.glb?v=' + revision),
        fetch('/asset/viewer.json?v=' + revision)
      ]);
      if (!response.ok) throw new Error('Viewer metadata is unavailable');
      const metadata = await response.json();
      if (generation !== this.generation) { this.release(gltf.scene); return; }
      const first = !this.model;
      const playback = this.player ? { state: this.player.state, paused: this.player.paused, speed: this.player.speed } : null;
      this.player?.dispose(); this.player = null;
      if (this.model) { this.scene.remove(this.model); this.release(this.model); }
      this.model = gltf.scene;
      this.metadata = metadata;
      this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(this.model);
      document.getElementById('characterControls').hidden = metadata.kind !== 'character';
      if (metadata.kind === 'character') {
        const { CharacterPlayer } = await import('/character-player.js');
        this.player = new CharacterPlayer(this.model, gltf.animations, this.variant);
        if (playback) { this.player.setState(playback.state); this.player.paused = playback.paused; this.player.speed = playback.speed; }
        this.player.onEvent = e => { document.getElementById('animationEvent').textContent = e.type + ' · ' + e.variant; };
      }
      this.setWireframe(this.wireframe);
      this.setTeamColor(this.teamColor);
      for (const light of [...this.lights.children]) { this.lights.remove(light); light.dispose?.(); }
      this.lights.add(new THREE.AmbientLight(0xffffff, .35));
      for (const source of metadata.lights) {
        const color = new THREE.Color().setRGB(...source.color, THREE.LinearSRGBColorSpace);
        let light;
        if (source.type === 'POINT') {
          light = new THREE.PointLight(color, source.energy * .09, 4, 2);
        } else {
          light = new THREE.DirectionalLight(color, source.energy / 340);
          light.castShadow = true;
          light.shadow.mapSize.set(2048, 2048);
          Object.assign(light.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30 });
          light.shadow.normalBias = .025;
          light.shadow.bias = -.0001;
          light.target.position.set(0, 1.8, 0);
          this.lights.add(light.target);
        }
        light.position.fromArray(source.position);
        this.lights.add(light);
      }
      if (first) this.reset();
      this.status.textContent = `${(metadata.variantTriangles?.[this.variant] ?? metadata.triangles).toLocaleString()} triangles · drag to rotate · scroll to zoom · right-drag to pan`;
    } catch (error) {
      if (generation !== this.generation) return;
      this.revision = 0;
      this.status.textContent = '3D preview unavailable: ' + error.message + '. Render the saved .blend to export it.';
    }
  }
}
