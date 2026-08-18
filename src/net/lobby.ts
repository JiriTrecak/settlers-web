/**
 * Lobby HTTP. Vite proxies `/api` to MatchHost. App never talks lockstep here.
 */
import type { ClientIdentity, CreateRoom, JoinRoom, RoomView } from "../shared";

export type JoinResult = { token: string; room: RoomView; you: ClientIdentity };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<{ ok: boolean; version: string }> {
  return json(await fetch("/api/health"));
}

export async function fetchRooms(): Promise<RoomView[]> {
  return json(await fetch("/api/rooms"));
}

export async function createRoom(body: CreateRoom): Promise<JoinResult> {
  return json(
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function joinRoom(id: string, body: JoinRoom): Promise<JoinResult> {
  return json(
    await fetch(`/api/rooms/${encodeURIComponent(id)}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function startRoom(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}/start`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
}

export function matchUrl(roomId: string, token: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/match/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`;
}
