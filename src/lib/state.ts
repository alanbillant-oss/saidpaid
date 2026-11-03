import { resolveClient } from './clients';
import { emptyBusiness, newBusiness } from './demo';
import { buildDrafts, issueInvoice } from './invoice';
import { priceItem } from './pricing';
import type { Business, Client, ExtractedItem, Invoice, Language, Mission, RateItem, RateOption } from './types';

/** Missions whose client we could not identify, waiting for the freelancer to pick or create one. */
export type PendingClient = {
  key: string;
  spokenName: string;
  email: string | null;
  isNew: boolean;
  candidateIds: string[];
  items: ExtractedItem[];
};

export type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  missionIds?: string[];
  pending?: PendingClient[];
  notes?: string[];
  error?: boolean;
};

export type State = {
  businesses: Business[];
  /** The company missions are captured for and invoices are drafted from. */
  activeBusinessId: string;
  uiLanguage: Language;
  clients: Client[];
  rateItems: RateItem[];
  rateOptions: RateOption[];
  missions: Mission[];
  invoices: Invoice[];
  chat: ChatEntry[];
};

export const initialState: State = {
  businesses: [emptyBusiness],
  activeBusinessId: emptyBusiness.id,
  uiLanguage: 'fr',
  clients: [],
  rateItems: [],
  rateOptions: [],
  missions: [],
  invoices: [],
  chat: [],
};

export type Action =
  | { type: 'hydrate'; state: unknown }
  | { type: 'reset'; state?: Partial<State> }
  | { type: 'addChat'; entry: ChatEntry }
  | { type: 'updateChat'; id: string; patch: Partial<ChatEntry> }
  | { type: 'applyCapture'; userEntryId: string; transcript: string; items: ExtractedItem[]; today: string }
  | { type: 'resolvePending'; entryId: string; key: string; clientId: string }
  | { type: 'createClientForPending'; entryId: string; key: string }
  | { type: 'setMissionPrice'; id: string; unitPrice: number }
  | { type: 'updateMission'; id: string; patch: Partial<Mission> }
  | { type: 'deleteMission'; id: string }
  | { type: 'addManualMission'; mission: Omit<Mission, 'id'> }
  | { type: 'updateBusiness'; id: string; patch: Partial<Business> }
  | { type: 'addBusiness'; id: string }
  | { type: 'deleteBusiness'; id: string }
  | { type: 'setActiveBusiness'; id: string }
  | { type: 'importRateItems'; items: RateItem[]; options: RateOption[] }
  | { type: 'setClientPrice'; rateItemId: string; clientId: string; pricing: RateItem['pricing'] | null }
  | { type: 'setLanguage'; language: Language }
  | { type: 'importData'; businessId: string; clients: Client[]; rateItems: RateItem[]; invoices: Invoice[]; numberTemplate: string | null }
  | { type: 'upsertClient'; client: Client }
  | { type: 'deleteClient'; id: string }
  | { type: 'upsertRateItem'; item: RateItem }
  | { type: 'deleteRateItem'; id: string }
  | { type: 'createDrafts' }
  | { type: 'updateInvoice'; id: string; patch: Partial<Invoice> }
  | { type: 'issueInvoice'; id: string; today: string }
  | { type: 'markPaid'; id: string }
  | { type: 'deleteDraft'; id: string };

export function activeBusiness(state: State): Business {
  return state.businesses.find((b) => b.id === state.activeBusinessId) ?? state.businesses[0] ?? emptyBusiness;
}

export function businessById(state: State, id: string | undefined): Business {
  return state.businesses.find((b) => b.id === id) ?? activeBusiness(state);
}

/** Rate card of the active company only: the same service can have a different price per company. */
export function activeRates(state: State) {
  const id = activeBusiness(state).id;
  return { rateItems: state.rateItems.filter((r) => r.businessId === id), rateOptions: state.rateOptions.filter((o) => o.businessId === id) };
}

/** Upgrade data saved by v0 (one business, no businessId on records) to the current shape. */
export function migrate(raw: unknown): State {
  const s = (raw ?? {}) as Partial<State> & { business?: Partial<Business> };
  let businesses = s.businesses;
  if (!businesses?.length) businesses = [{ ...emptyBusiness, ...(s.business ?? {}), id: s.business && 'id' in s.business && s.business.id ? s.business.id : emptyBusiness.id }];
  businesses = businesses.map((b) => ({ ...emptyBusiness, ...b }));
  const fallback = businesses[0].id;
  const withBiz = <T extends { businessId?: string }>(xs: T[] | undefined) => (xs ?? []).map((x) => ({ ...x, businessId: x.businessId ?? fallback }));
  const { business: _old, ...rest } = s;
  return {
    ...initialState,
    ...rest,
    businesses,
    activeBusinessId: businesses.some((b) => b.id === s.activeBusinessId) ? (s.activeBusinessId as string) : fallback,
    rateItems: withBiz(s.rateItems) as RateItem[],
    rateOptions: withBiz(s.rateOptions) as RateOption[],
    missions: withBiz(s.missions) as Mission[],
    invoices: withBiz(s.invoices) as Invoice[],
  };
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function missionsFromItems(state: State, items: ExtractedItem[], clientId: string, captureId: string): Mission[] {
  return items.map((it) => {
    const { rateItems, rateOptions } = activeRates(state);
    const line = priceItem(it, clientId, rateItems, rateOptions);
    return {
      id: uid('m_'),
      businessId: activeBusiness(state).id,
      clientId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      priceSource: line.priceSource,
      date: it.date,
      status: line.unitPrice == null ? 'needs_info' : 'confirmed',
      question: line.question,
      captureId,
    };
  });
}

function patchChat(chat: ChatEntry[], id: string, patch: Partial<ChatEntry>) {
  return chat.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return migrate(action.state);
    case 'reset':
      return migrate({ ...initialState, ...action.state });
    case 'addChat':
      return { ...state, chat: [...state.chat, action.entry] };
    case 'updateChat':
      return { ...state, chat: patchChat(state.chat, action.id, action.patch) };

    case 'applyCapture': {
      const missions: Mission[] = [];
      const pending = new Map<string, PendingClient>();
      for (const it of action.items) {
        const match = it.is_new_client ? { kind: 'none' as const } : resolveClient(it.client_spoken_name, state.clients, it.client_id);
        if (match.kind === 'exact') {
          missions.push(...missionsFromItems(state, [it], match.client.id, action.userEntryId));
          continue;
        }
        const key = it.client_spoken_name.trim().toLowerCase() || '?';
        const group = pending.get(key) ?? {
          key,
          spokenName: it.client_spoken_name || 'Unknown client',
          email: it.new_client_email,
          isNew: it.is_new_client,
          candidateIds: match.kind === 'ambiguous' ? match.candidates.map((c) => c.id) : [],
          items: [],
        };
        group.items.push(it);
        pending.set(key, group);
      }
      const notes = action.items.flatMap((it) => (it.ambiguity ? [it.ambiguity] : []));
      const entry: ChatEntry = {
        id: uid('a_'),
        role: 'assistant',
        text: action.items.length ? '' : "I didn't hear any billable mission in that one.",
        at: new Date().toISOString(),
        missionIds: missions.map((m) => m.id),
        pending: [...pending.values()],
        notes,
      };
      return {
        ...state,
        missions: [...state.missions, ...missions],
        chat: [...patchChat(state.chat, action.userEntryId, { text: action.transcript }), entry],
      };
    }

    case 'resolvePending':
    case 'createClientForPending': {
      const entry = state.chat.find((c) => c.id === action.entryId);
      const group = entry?.pending?.find((p) => p.key === action.key);
      if (!entry || !group) return state;
      let clients = state.clients;
      let clientId: string;
      if (action.type === 'createClientForPending') {
        const client: Client = { id: uid('c_'), name: group.spokenName, aliases: [], email: group.email ?? undefined };
        clients = [...clients, client];
        clientId = client.id;
      } else {
        clientId = action.clientId;
      }
      const next = { ...state, clients };
      const missions = missionsFromItems(next, group.items, clientId, entry.id);
      return {
        ...next,
        missions: [...state.missions, ...missions],
        chat: patchChat(state.chat, entry.id, {
          missionIds: [...(entry.missionIds ?? []), ...missions.map((m) => m.id)],
          pending: entry.pending?.filter((p) => p.key !== action.key),
        }),
      };
    }

    case 'setMissionPrice':
      return {
        ...state,
        missions: state.missions.map((m) =>
          m.id === action.id ? { ...m, unitPrice: action.unitPrice, priceSource: 'user', status: 'confirmed', question: undefined } : m,
        ),
      };
    case 'updateMission':
      return { ...state, missions: state.missions.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)) };
    case 'deleteMission': {
      const m = state.missions.find((x) => x.id === action.id);
      if (!m || m.status === 'invoiced') return state; // invoiced missions are removed from the invoice instead
      return { ...state, missions: state.missions.filter((x) => x.id !== action.id) };
    }
    case 'addManualMission':
      return { ...state, missions: [...state.missions, { ...action.mission, id: uid('m_') }] };

    case 'updateBusiness':
      return { ...state, businesses: state.businesses.map((b) => (b.id === action.id ? { ...b, ...action.patch, id: b.id } : b)) };
    case 'addBusiness':
      return { ...state, businesses: [...state.businesses, newBusiness(action.id)], activeBusinessId: action.id };
    case 'deleteBusiness': {
      // A company that already has missions or invoices is kept: its history must stay intact.
      const used = state.missions.some((m) => m.businessId === action.id) || state.invoices.some((i) => i.businessId === action.id);
      if (used || state.businesses.length <= 1) return state;
      const businesses = state.businesses.filter((b) => b.id !== action.id);
      return {
        ...state,
        businesses,
        activeBusinessId: state.activeBusinessId === action.id ? businesses[0].id : state.activeBusinessId,
        rateItems: state.rateItems.filter((r) => r.businessId !== action.id),
        rateOptions: state.rateOptions.filter((o) => o.businessId !== action.id),
      };
    }
    case 'setActiveBusiness':
      return state.businesses.some((b) => b.id === action.id) ? { ...state, activeBusinessId: action.id } : state;
    case 'setLanguage':
      return { ...state, uiLanguage: action.language };
    case 'setClientPrice':
      return {
        ...state,
        rateItems: state.rateItems.map((r) => {
          if (r.id !== action.rateItemId) return r;
          const clientPricing = { ...(r.clientPricing ?? {}) };
          if (action.pricing) clientPricing[action.clientId] = action.pricing;
          else delete clientPricing[action.clientId];
          return { ...r, clientPricing };
        }),
      };
    case 'importData':
      return {
        ...state,
        clients: [...state.clients, ...action.clients],
        rateItems: [...state.rateItems, ...action.rateItems],
        invoices: [...state.invoices, ...action.invoices],
        businesses: action.numberTemplate
          ? state.businesses.map((b) => (b.id === action.businessId ? { ...b, numberTemplate: action.numberTemplate ?? undefined } : b))
          : state.businesses,
      };
    case 'importRateItems':
      return { ...state, rateItems: [...state.rateItems, ...action.items], rateOptions: [...state.rateOptions, ...action.options] };
    case 'upsertClient':
      return {
        ...state,
        clients: state.clients.some((c) => c.id === action.client.id)
          ? state.clients.map((c) => (c.id === action.client.id ? action.client : c))
          : [...state.clients, action.client],
      };
    case 'deleteClient':
      if (state.missions.some((m) => m.clientId === action.id)) return state;
      return { ...state, clients: state.clients.filter((c) => c.id !== action.id) };
    case 'upsertRateItem':
      return {
        ...state,
        rateItems: state.rateItems.some((r) => r.id === action.item.id)
          ? state.rateItems.map((r) => (r.id === action.item.id ? action.item : r))
          : [...state.rateItems, action.item],
      };
    case 'deleteRateItem':
      return { ...state, rateItems: state.rateItems.filter((r) => r.id !== action.id) };

    case 'createDrafts': {
      const drafts = state.businesses.flatMap((b) =>
        buildDrafts(state.missions.filter((m) => m.businessId === b.id), b, () => uid('i_')),
      );
      if (!drafts.length) return state;
      const owner = new Map(drafts.flatMap((d) => d.missionIds.map((mid) => [mid, d.invoice.id] as const)));
      return {
        ...state,
        invoices: [...state.invoices, ...drafts.map((d) => d.invoice)],
        missions: state.missions.map((m) => (owner.has(m.id) ? { ...m, status: 'invoiced', invoiceId: owner.get(m.id) } : m)),
      };
    }
    case 'updateInvoice':
      return {
        ...state,
        invoices: state.invoices.map((i) => (i.id === action.id && i.status === 'draft' ? { ...i, ...action.patch } : i)),
      };
    case 'issueInvoice': {
      const inv = state.invoices.find((i) => i.id === action.id);
      if (!inv || inv.status !== 'draft' || !inv.lines.length) return state;
      const client = state.clients.find((c) => c.id === inv.clientId);
      const business = businessById(state, inv.businessId);
      const sameCompany = state.invoices.filter((i) => i.businessId === business.id);
      const issued = issueInvoice(inv, sameCompany, business, client, action.today);
      return { ...state, invoices: state.invoices.map((i) => (i.id === inv.id ? issued : i)) };
    }
    case 'markPaid':
      return { ...state, invoices: state.invoices.map((i) => (i.id === action.id && i.status === 'sent' ? { ...i, status: 'paid' } : i)) };
    case 'deleteDraft': {
      const inv = state.invoices.find((i) => i.id === action.id);
      if (!inv || inv.status !== 'draft') return state;
      return {
        ...state,
        invoices: state.invoices.filter((i) => i.id !== inv.id),
        missions: state.missions.map((m) => (m.invoiceId === inv.id ? { ...m, status: 'confirmed', invoiceId: undefined } : m)),
      };
    }
  }
}
