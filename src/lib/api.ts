import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { demoExtract } from './demoExtract';
import type { State } from './state';
import type { CaptureResult, Pricing } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Demo mode: no backend, a simple keyword matcher stands in for Claude (web preview only). */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1' && !isBackendConfigured;

const unitOf = (p: Pricing) => (p.kind === 'per_unit' || p.kind === 'tiers' ? p.unit : null);

/** What the model needs to know: who the clients are and what the rate card contains (no prices). */
export function captureContext(state: State, today: string) {
  const names = new Map(state.clients.map((c) => [c.id, c.name]));
  return {
    today,
    currency: state.business.currency,
    clients: state.clients.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
    rateItems: state.rateItems.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases, unit: unitOf(r.pricing) })),
    rateOptions: state.rateOptions.map((o) => ({ id: o.id, name: o.name, aliases: o.aliases })),
    recentMissions: state.missions.slice(-20).map((m) => ({ client: names.get(m.clientId) ?? '', description: m.description, date: m.date })),
  };
}

async function readAudioBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function mimeFor(uri: string): string {
  if (Platform.OS === 'web') return 'audio/webm';
  if (uri.endsWith('.caf')) return 'audio/x-caf';
  if (uri.endsWith('.3gp')) return 'audio/3gpp';
  return 'audio/mp4';
}

export async function sendCapture(
  input: { text: string } | { audioUri: string },
  context: ReturnType<typeof captureContext>,
): Promise<CaptureResult> {
  if (isDemoMode) {
    if (!('text' in input)) throw new Error('Voice notes need the real AI backend. In this demo, type your missions instead.');
    await new Promise((r) => setTimeout(r, 400));
    return { transcript: input.text, items: demoExtract(input.text, context) };
  }
  if (!isBackendConfigured) {
    throw new Error('Backend not configured. Copy .env.example to .env and fill in the Supabase URL and anon key.');
  }
  const body =
    'text' in input
      ? { text: input.text, context }
      : { audio_base64: await readAudioBase64(input.audioUri), mime_type: mimeFor(input.audioUri), context };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
  return data as CaptureResult;
}
