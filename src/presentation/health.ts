/** Shared continuous red → amber → green ramp for world bars and HUD portraits. */
export function healthRatio(value: number, maximum: number): number {
  return Number.isFinite(value) && Number.isFinite(maximum) && maximum > 0
    ? Math.max(0, Math.min(1, value / maximum)) : 0;
}
export function healthColor(hp: number, maxHp: number): number {
  const ratio = healthRatio(hp, maxHp);
  const a = ratio < .5 ? 0xdb3935 : 0xe8bf32;
  const b = ratio < .5 ? 0xe8bf32 : 0x64cc39;
  const t = ratio < .5 ? ratio * 2 : (ratio - .5) * 2;
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1-t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
