/** Chat is presentation traffic: never part of simulation state or command ordering. */
export type ChatMessage = { name: string; player: number | null; text: string };
export function chatText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
  return text || null;
}
