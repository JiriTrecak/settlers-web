/**
 * Lockstep + lobby wire. Channel and MatchHost share this. No sim types.
 * `commit` is the only payload that advances sim.
 */
import type { Action } from "../types/types";
import type { MatchConfig } from "../match/match";

export type WireOutcome = {
  winner: number | null;
  defeated: number[];
};

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

export type ClientIdentity = {
  role: "player" | "spectator";
  player?: number;
  name: string;
};

export type RoomState = "waiting" | "playing" | "ended" | "desynced";

export type RoomView = {
  id: string;
  state: RoomState;
  name: string;
  mapId: string;
  host: string;
  slots: { player: number; name: string | null }[];
  spectators: number;
  tick?: number;
};

export type CreateRoom = {
  name: string;
  mapId: string;
  mapRevision: string;
  slotCount: number;
  guestName: string;
};

export type JoinRoom = {
  guestName: string;
  role: "player" | "spectator";
};

export type ClientMsg =
  | { type: "hello"; token: string }
  | { type: "ready" }
  | { type: "turn"; through: number; bundles: Bundle[] }
  | { type: "hash"; tick: number; checksum: number }
  | { type: "ended"; outcome: WireOutcome; tick: number; checksum: number };

export type ServerMsg =
  | { type: "welcome"; you: ClientIdentity; room: RoomView }
  | { type: "room"; room: RoomView }
  | { type: "start"; config: MatchConfig; you: ClientIdentity }
  | { type: "go"; tick: 1 }
  | { type: "commit"; tick: number; slots: CommitSlot[] }
  | { type: "hashOk"; tick: number }
  | { type: "desync"; tick: number; hashes: { player: number; checksum: number }[] }
  | { type: "ended"; outcome: WireOutcome; replayId: string }
  | { type: "error"; code: string; message: string };
