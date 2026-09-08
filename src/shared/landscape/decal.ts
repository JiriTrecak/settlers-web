/** Painted surface details; coordinates and size are in world metres, rotation in degrees. */
export const DECAL_KINDS = ['leaf-litter', 'tiny-flowers', 'pebbles'] as const;
export type DecalKind = typeof DECAL_KINDS[number];
export type GroundDecal = { id: string; kind: DecalKind; x: number; z: number; size: number; rotation: number; opacity: number };
export function validDecal(raw: unknown): raw is GroundDecal {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as GroundDecal;
  return typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 128 && DECAL_KINDS.includes(d.kind)
    && [d.x,d.z,d.size,d.rotation,d.opacity].every(Number.isFinite)
    && Math.abs(d.x)<=512 && Math.abs(d.z)<=512 && d.size>=.5 && d.size<=32
    && Math.abs(d.rotation)<=360 && d.opacity>=0 && d.opacity<=1;
}
export function decalAt(decals: readonly GroundDecal[], x: number, z: number): GroundDecal | undefined {
  return [...decals].reverse().find(d => {
    const a=d.rotation*Math.PI/180, dx=x-d.x,dz=z-d.z;
    return Math.abs(dx*Math.cos(a)+dz*Math.sin(a))<=d.size/2 && Math.abs(-dx*Math.sin(a)+dz*Math.cos(a))<=d.size/2;
  });
}
