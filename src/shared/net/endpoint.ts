/**
 * Public MatchHost. Multiplayer HTTP + WS always hit this, never localhost.
 */
export const MATCH_HOST = "18.134.138.1:8787";

export function matchHttp(path: string): string {
  return `http://${MATCH_HOST}${path}`;
}

export function matchWs(path: string): string {
  return `ws://${MATCH_HOST}${path}`;
}
