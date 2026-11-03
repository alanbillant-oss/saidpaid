import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { demoExtract } from './demoExtract';
import { activeBusiness, activeRates, type State } from './state';
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
  const { rateItems, rateOptions } = activeRates(state);
  return {
    today,
    currency: activeBusiness(state).currency,
    clients: state.clients.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
    rateItems: rateItems.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases, unit: unitOf(r.pricing) })),
    rateOptions: rateOptions.map((o) => ({ id: o.id, name: o.name, aliases: o.aliases })),
    recentMissions: state.missions.slice(-20).map((m) => ({ client: names.get(m.clientId) ?? '', description: m.description, date: m.date })),
  };
}

export async function readFileBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Text content of a picked file (CSV exports). */
export async function readFileText(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).text();
  return (await fetch(uri)).text();
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
  const body =
    'text' in input
      ? { text: input.text, context }
      : { audio_base64: await readFileBase64(input.audioUri), mime_type: mimeFor(input.audioUri), context };

  return callFunction<CaptureResult>('capture', body);
}

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isBackendConfigured) throw new Error('The AI backend is not configured yet. See the README to add your Supabase URL and keys.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
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
  return data as T;
}

/** Dictation: audio in, editable text out. Nothing is extracted until the text is sent. */
export async function transcribe(audioUri: string): Promise<string> {
  if (isDemoMode) throw new Error('Voice notes need the real AI backend. In this demo, type your missions instead.');
  const data = await callFunction<{ transcript: string }>('capture', {
    mode: 'transcribe',
    audio_base64: await readFileBase64(audioUri),
    mime_type: mimeFor(audioUri),
  });
  return data.transcript;
}

export type ImportedRate = { name: string; aliases: string[]; pricing: Pricing };

/** Rate card PDF in, structured services out. The freelancer reviews them before anything is saved. */
export async function importRateCard(pdfBase64: string, currency: string): Promise<ImportedRate[]> {
  if (isDemoMode) throw new Error('PDF import needs the real AI backend.');
  const data = await callFunction<{ items: ImportedRate[] }>('import-rates', { pdf_base64: pdfBase64, currency });
  return data.items;
}
