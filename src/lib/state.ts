import { resolveClient } from './clients';
import { emptyBusiness } from './demo';
import { buildDrafts, issueInvoice } from './invoice';
import { priceItem } from './pricing';
import type { Business, Client, ExtractedItem, Invoice, Mission, RateItem, RateOption } from './types';

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
  business: Business;
  clients: Client[];
  rateItems: RateItem[];
  rateOptions: RateOption[];
  missions: Mission[];
  invoices: Invoice[];
  chat: ChatEntry[];
};

export const initialState: State = {
  business: emptyBusiness,
  clients: [],
  rateItems: [],
  rateOptions: [],
  missions: [],
  invoices: [],
  chat: [],
};

export type Action =
  | { type: 'hydrate'; state: State }
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
  | { type: 'updateBusiness'; patch: Partial<Business> }
  | { type: 'upsertClient'; client: Client }
  | { type: 'deleteClient'; id: string }
  | { type: 'upsertRateItem'; item: RateItem }
  | { type: 'deleteRateItem'; id: string }
  | { type: 'createDrafts' }
  | { type: 'updateInvoice'; id: string; patch: Partial<Invoice> }
  | { type: 'issueInvoice'; id: string; today: string }
  | { type: 'markPaid'; id: string }
  | { type: 'deleteDraft'; id: string };

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function missionsFromItems(state: State, items: ExtractedItem[], clientId: string, captureId: string): Mission[] {
  return items.map((it) => {
    const line = priceItem(it, clientId, state.rateItems, state.rateOptions);
    return {
      id: uid('m_'),
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
      return { ...initialState, ...action.state };
    case 'reset':
      return { ...initialState, ...action.state };
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
      return { ...state, business: { ...state.business, ...action.patch } };
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
      const drafts = buildDrafts(state.missions, state.business, () => uid('i_'));
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
      const issued = issueInvoice(inv, state.invoices, state.business, client, action.today);
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
