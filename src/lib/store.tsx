import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { type Action, initialState, reducer, type State } from './state';

// v0 keeps data on the device. The Supabase schema in supabase/migrations is ready for sync.
const STORAGE_KEY = 'saidpaid:v1';

const StoreContext = createContext<{ state: State; dispatch: Dispatch<Action>; ready: boolean } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) dispatch({ type: 'hydrate', state: JSON.parse(raw) });
      })
      .catch((e) => console.warn('Could not load saved data', e))
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) => console.warn('Could not save data', e));
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch, ready }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
