/**
 * Lockstep wire. Channel carries these; Room commits ticks.
 * `src/net` and later `server/` share this. No sim types.
 */
import type { Action } from "../types/types";
import type { MatchConfig } from "../match/match";

export type Bundle = {
  tick: number;
  actions: Action[];
};

export type CommitSlot = {
  player: number;
  actions: Action[];
};

export type Commit = {
  tick: number;
  slots: CommitSlot[];
};

export type ClientMsg =
  | { type: "hello"; token: string }
  | { type: "ready" }
  | { type: "turn"; through: number; bundles: Bundle[] }
  | { type: "hash"; tick: number; value: number }
  | { type: "ended"; outcome: { winner: number | null; defeated: number[] }; replayId: string };

export type ServerMsg =
  | { type: "start"; config: MatchConfig; you: { role: "player" | "spectator"; player?: number } }
  | { type: "go" }
  | { type: "commit"; tick: number; slots: CommitSlot[] }
  | { type: "desync"; tick: number }
  | { type: "ended"; outcome: { winner: number | null; defeated: number[] }; replayId: string }
  | { type: "error"; code: string; message: string };
