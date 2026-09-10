import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";
import { commandFeedbackStyles, type CommandFeedback } from "../../presentation/commandFeedback";
import type { HeightField } from "../../shared/map/height";

const ON_SECONDS = .4, GAP_SECONDS = .15, MAX_MARKERS = 24;
export function commandPulseOpacity(age: number, pulses: number) {
  if (age < 0 || age >= (ON_SECONDS + GAP_SECONDS) * pulses - GAP_SECONDS) return 0;
  const phase = age % (ON_SECONDS + GAP_SECONDS);
  return phase < ON_SECONDS ? .95 * (1 - phase / ON_SECONDS) : 0;
}

/** Short-lived ground decals. Feedback never participates in picking or simulation. */
export class CommandFeedbackEffects {
  private readonly markers: {mesh: Mesh<RingGeometry, MeshBasicMaterial>; start: number; pulses: number}[] = [];
  constructor(private readonly parent: Group) {}
  show(feedback: CommandFeedback, height: HeightField) {
    if (this.markers.length >= MAX_MARKERS) this.remove(0);
    const style = commandFeedbackStyles[feedback.kind];
    const geometry = new RingGeometry(feedback.radius, feedback.radius + .12, 48);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = feedback.point.x + positions.getX(i), z = feedback.point.y + positions.getZ(i);
      positions.setXYZ(i, x, height.sample(x, z) + .12, z);
    }
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, new MeshBasicMaterial({color: style.color, side: DoubleSide, transparent: true, opacity: .95, depthTest: false, depthWrite: false}));
    mesh.name = `command-feedback-${feedback.kind}`;
    mesh.renderOrder = 22;
    this.parent.add(mesh);
    this.markers.push({mesh, start: performance.now(), pulses: style.pulses});
  }
  update(now: number) {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i], age = (now - m.start) / 1000;
      if (age >= (ON_SECONDS + GAP_SECONDS) * m.pulses - GAP_SECONDS) this.remove(i);
      else m.mesh.material.opacity = commandPulseOpacity(age, m.pulses);
    }
  }
  private remove(index: number) {
    const [{mesh}] = this.markers.splice(index, 1);
    mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose();
  }
  dispose() { while (this.markers.length) this.remove(0); }
}
