import { BoxGeometry, Color, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { PLAYER_COLORS, type HeightField } from '../../shared';

/** Sparse boundary markers, sampled in stable grid order. No navigation obstacles. */
export function territoryPostPositions(territory: ArrayLike<number>, size = 256) {
  const posts: { x: number; z: number; owner: number }[] = [];
  const buckets = new Map<string, typeof posts>();
  const spacing = 2.8;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const owner = territory[z * size + x]!;
    if (owner < 0) continue;
    const edges = [[0,-1],[1,0],[0,1],[-1,0]] as const;
    const edge = edges.find(([dx,dz]) => x+dx < 0 || z+dz < 0 || x+dx >= size || z+dz >= size || territory[(z+dz)*size+x+dx] !== owner);
    if (!edge) continue;
    const px = x + edge[0] * .25, pz = z + edge[1] * .25;
    const gx = Math.floor(px/spacing), gz = Math.floor(pz/spacing);
    let crowded = false;
    for (let bz=gz-1;bz<=gz+1;bz++) for(let bx=gx-1;bx<=gx+1;bx++)
      if (buckets.get(`${bx},${bz}`)?.some(p => Math.hypot(p.x-px,p.z-pz)<spacing)) crowded=true;
    if(crowded) continue;
    const post = {x:px,z:pz,owner};
    posts.push(post);
    const key = `${gx},${gz}`, bucket=buckets.get(key) ?? [];
    bucket.push(post); buckets.set(key,bucket);
  }
  return posts;
}

/** Two instanced draws for all players: stone feet and painted rectangular caps. */
export class TerritoryPosts extends Group {
  private readonly stone = new MeshStandardMaterial({color:0x90958c,roughness:1});
  private readonly paint = new MeshStandardMaterial({roughness:.85});
  private readonly stem = new BoxGeometry(.48,.65,.48);
  private readonly cap = new BoxGeometry(.64,.43,.64);
  rebuild(territory: ArrayLike<number>, field: HeightField) {
    this.clearInstances();
    const posts = territoryPostPositions(territory).filter(p => field.sample(p.x,p.z)>.5);
    const bases = new InstancedMesh(this.stem,this.stone,posts.length);
    const caps = new InstancedMesh(this.cap,this.paint,posts.length);
    const transform = new Object3D(), color = new Color();
    posts.forEach((p,i) => {
      // Embed the bottom slightly so slopes never leave the foot floating.
      const y = Math.min(...[-.24,.24].flatMap(dx => [-.24,.24].map(dz => field.sample(p.x+dx,p.z+dz))));
      transform.position.set(p.x,y+.275,p.z); transform.updateMatrix();
      bases.setMatrixAt(i,transform.matrix);
      transform.position.y=y+.765; transform.updateMatrix(); caps.setMatrixAt(i,transform.matrix);
      caps.setColorAt(i,color.set(PLAYER_COLORS[p.owner % PLAYER_COLORS.length]!));
    });
    for(const mesh of [bases,caps]) {
      mesh.castShadow=true; mesh.receiveShadow=true;
      mesh.computeBoundingSphere(); this.add(mesh);
    }
  }
  private clearInstances() {
    for(const child of this.children) (child as InstancedMesh).dispose();
    this.clear();
  }
  dispose() { this.clearInstances(); this.stem.dispose(); this.cap.dispose(); this.stone.dispose(); this.paint.dispose(); }
}
