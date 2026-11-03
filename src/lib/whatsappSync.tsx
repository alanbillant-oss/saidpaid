import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { captureContext, isBackendConfigured, isDemoMode } from './api';
import { todayISO } from './money';
import { useStore } from './store';
import { actionsForCaptures, type WhatsAppCapture, type WhatsAppStatus } from './whatsapp';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SECRET_KEY = 'saidpaid:device-secret';
const ENABLED_KEY = 'saidpaid:whatsapp';
const POLL_MS = 20_000;

export const isWhatsAppAvailable = isBackendConfigured && !isDemoMode;

async function deviceSecret(): Promise<string> {
  const saved = await AsyncStorage.getItem(SECRET_KEY);
  if (saved) return saved;
  const secret = [...getRandomBytes(32)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(SECRET_KEY, secret);
  return secret;
}

async function call<T>(action: 'pair' | 'sync' | 'unlink', extra: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY as string },
    body: JSON.stringify({ device_secret: await deviceSecret(), action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`);
  return data as T;
}

type Pairing = { code: string; number: string | null };

type Ctx = {
  status: WhatsAppStatus;
  pairing: Pairing | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WhatsAppContext = createContext<Ctx | null>(null);

/** Pulls messages sent to the Saidpaid WhatsApp number and feeds them to the capture flow. */
export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, ready } = useStore();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<WhatsAppStatus>({ linked: false, phone: null });
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toAck = useRef<string[]>([]);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isWhatsAppAvailable) return;
    AsyncStorage.getItem(ENABLED_KEY).then((v) => setEnabled(v === '1'));
  }, []);

  const refresh = useCallback(async () => {
    if (!isWhatsAppAvailable || inFlight.current) return;
    inFlight.current = true;
    try {
      const ack = toAck.current;
      const res = await call<WhatsAppStatus & { captures: WhatsAppCapture[] }>('sync', {
        context: captureContext(stateRef.current, todayISO()),
        ack_ids: ack,
      });
      toAck.current = toAck.current.filter((id) => !ack.includes(id));
      setStatus({ linked: res.linked, phone: res.phone });
      if (res.linked) setPairing(null);
      for (const action of actionsForCaptures(stateRef.current, res.captures)) dispatch(action);
      // Acknowledged on the next sync, once the missions are saved on the phone.
      toAck.current.push(...res.captures.map((c) => c.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WhatsApp sync failed.');
    } finally {
      inFlight.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    if (!ready || !enabled) return;
    refresh();
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ready, enabled, refresh]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const res = await call<Pairing & WhatsAppStatus>('pair', { context: captureContext(stateRef.current, todayISO()) });
      setPairing({ code: res.code, number: res.number });
      await AsyncStorage.setItem(ENABLED_KEY, '1');
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start WhatsApp pairing.');
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await call('unlink');
      await AsyncStorage.removeItem(ENABLED_KEY);
      setEnabled(false);
      setPairing(null);
      setStatus({ linked: false, phone: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect WhatsApp.');
    }
  }, []);

  return (
    <WhatsAppContext.Provider value={{ status, pairing, error, connect, disconnect, refresh }}>{children}</WhatsAppContext.Provider>
  );
}

export function useWhatsApp() {
  const ctx = useContext(WhatsAppContext);
  if (!ctx) throw new Error('useWhatsApp must be used inside WhatsAppProvider');
  return ctx;
}
