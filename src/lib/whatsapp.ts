import type { Action, ChatEntry, State } from './state';
import type { ExtractedItem } from './types';

/** A message sent to the Saidpaid WhatsApp number, already read by the AI on the server. */
export type WhatsAppCapture = {
  id: string;
  kind: 'text' | 'audio';
  transcript: string | null;
  items: ExtractedItem[];
  created_at: string;
};

export type WhatsAppStatus = { linked: boolean; phone: string | null };

export const chatIdFor = (captureId: string) => `wa_${captureId}`;

/**
 * Turns server captures into the same actions as a capture typed in the app, so pricing,
 * client matching and clarifications all go through one path. Already applied captures are skipped.
 */
export function actionsForCaptures(state: State, captures: WhatsAppCapture[]): Action[] {
  const seen = new Set(state.chat.map((c) => c.id));
  const actions: Action[] = [];
  for (const cap of captures) {
    const id = chatIdFor(cap.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const transcript = cap.transcript?.trim() || (cap.kind === 'audio' ? 'Voice note' : '');
    const entry: ChatEntry = {
      id,
      role: 'user',
      text: transcript,
      at: cap.created_at,
      source: 'whatsapp',
    };
    actions.push({ type: 'addChat', entry });
    actions.push({ type: 'applyCapture', userEntryId: id, transcript, items: cap.items ?? [], today: cap.created_at.slice(0, 10) });
  }
  return actions;
}

/** wa.me link that opens WhatsApp on the Saidpaid number with the pairing code typed in. */
export function pairLink(number: string | null, code: string): string | null {
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(`Saidpaid code ${code}`)}`;
}
