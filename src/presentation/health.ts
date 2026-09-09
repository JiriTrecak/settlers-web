export function healthPipState(hp: number, maxHp: number, building: boolean) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const count = building ? 16 : 4;
  return { count, filled: Math.ceil(ratio * count),
    color: ratio > .75 ? 0x65ef62 : ratio > .5 ? 0xf3d94b : ratio > .25 ? 0xf19436 : 0xe74639 };
}

