/**
 * One match participant. Identity is the lockstep slot. Render draws a cube
 * from the view — it does not invent players.
 */
import type { GridPos, SlotKind } from "../../shared";

export type PlayerView = {
  readonly id: number;
  readonly kind: SlotKind;
  readonly name?: string;
  readonly x: number;
  readonly y: number;
};

export class Player {
  readonly id: number;
  readonly kind: SlotKind;
  readonly name?: string;
  pos: GridPos;

  constructor(args: { id: number; kind: SlotKind; name?: string; pos: GridPos }) {
    this.id = args.id;
    this.kind = args.kind;
    this.name = args.name;
    this.pos = args.pos;
  }

  view(): PlayerView {
    return { id: this.id, kind: this.kind, name: this.name, x: this.pos.x, y: this.pos.y };
  }
}
