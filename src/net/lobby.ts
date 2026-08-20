/**
 * Lobby HTTP against MATCH_HOST (EC2). Lockstep stays on the Channel.
 */
import { matchHttp, matchWs, type ClientIdentity, type CreateRoom, type JoinRoom, type RoomView } from "../shared";

export type JoinResult = { token: string; room: RoomView; you: ClientIdentity };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    let msg = body || `${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string };
      if (parsed.error === "not_found") msg = "Room not found";
      else if (parsed.message) msg = parsed.message;
      else if (parsed.error) msg = parsed.error;
    } catch {
      /* keep raw */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<{ ok: boolean; version: string }> {
  return json(await fetch(matchHttp("/api/health")));
}

export async function fetchRooms(): Promise<RoomView[]> {
  return json(await fetch(matchHttp("/api/rooms")));
}

export async function fetchRoom(id: string): Promise<RoomView> {
  return json(await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}`)));
}

export async function createRoom(body: CreateRoom): Promise<JoinResult> {
  return json(
    await fetch(matchHttp("/api/rooms"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function joinRoom(id: string, body: JoinRoom): Promise<JoinResult> {
  return json(
    await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/join`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function startRoom(id: string, token: string): Promise<void> {
  const res = await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/start`), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function loadRoom(id: string, token: string, save: unknown): Promise<void> {
  const res = await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/load`), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(save),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function restartRoom(id: string, token: string): Promise<void> {
  const res = await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/restart`), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function leaveRoom(id: string, token: string): Promise<void> {
  await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/leave`), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Kill a room (tests + host abort). Gone from `/api/rooms`. */
export async function endRoom(id: string, token: string): Promise<void> {
  const res = await fetch(matchHttp(`/api/rooms/${encodeURIComponent(id)}/end`), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(await res.text());
}

export function matchUrl(roomId: string, token: string): string {
  return matchWs(`/match/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`);
}
