import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, SectionTitle, styles } from '../components/ui';
import { formatMoney, parseMoney } from '../lib/money';
import { uid } from '../lib/state';
import { useStore } from '../lib/store';
import type { Pricing, RateItem, Unit } from '../lib/types';

type Kind = 'flat' | 'per_unit' | 'on_quote';
type Draft = { id: string; name: string; aliases: string; kind: Kind; unit: Unit; amount: string; minimum: string; original?: RateItem };

const UNITS: Unit[] = ['hour', 'day', 'minute', 'piece'];

function describe(p: Pricing, currency: string): string {
  const m = (n: number) => formatMoney(n, currency);
  switch (p.kind) {
    case 'flat':
      return m(p.amount);
    case 'per_unit':
      return `${m(p.amount)} / ${p.unit}${p.minimum ? ` (min ${m(p.minimum)})` : ''}`;
    case 'tiers':
      return p.tiers.map((t) => `${t.upTo == null ? 'over' : `≤${t.upTo} ${p.unit}`}: ${t.amount == null ? 'quote' : m(t.amount)}`).join(' · ');
    case 'on_quote':
      return 'On quote';
  }
}

export default function RatesScreen() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const currency = state.business.currency;

  const open = (r?: RateItem) => {
    const p = r?.pricing;
    setDraft({
      id: r?.id ?? uid('r_'),
      name: r?.name ?? '',
      aliases: r?.aliases.join(', ') ?? '',
      kind: p?.kind === 'per_unit' || p?.kind === 'on_quote' ? p.kind : 'flat',
      unit: p?.kind === 'per_unit' ? p.unit : 'hour',
      amount: p?.kind === 'flat' || p?.kind === 'per_unit' ? (p.amount / 100).toString() : '',
      minimum: p?.kind === 'per_unit' && p.minimum ? (p.minimum / 100).toString() : '',
      original: r,
    });
  };

  if (draft) {
    const amount = parseMoney(draft.amount);
    const editableKind = !draft.original || draft.original.pricing.kind !== 'tiers';
    const valid = draft.name.trim() && (draft.kind === 'on_quote' || amount != null);
    const save = () => {
      const pricing: Pricing = !editableKind
        ? (draft.original as RateItem).pricing
        : draft.kind === 'on_quote'
          ? { kind: 'on_quote' }
          : draft.kind === 'flat'
            ? { kind: 'flat', amount: amount as number }
            : { kind: 'per_unit', unit: draft.unit, amount: amount as number, minimum: parseMoney(draft.minimum) ?? undefined };
      dispatch({
        type: 'upsertRateItem',
        item: {
          ...draft.original,
          id: draft.id,
          name: draft.name.trim(),
          aliases: draft.aliases.split(',').map((a) => a.trim()).filter(Boolean),
          pricing,
        },
      });
      setDraft(null);
    };

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Service" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Poster" />
        <Field label="Other words you use for it (comma separated)" value={draft.aliases} onChangeText={(v) => setDraft({ ...draft, aliases: v })} />
        {editableKind ? (
          <>
            <SectionTitle>Pricing</SectionTitle>
            <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
              {(['flat', 'per_unit', 'on_quote'] as Kind[]).map((k) => (
                <Button
                  key={k}
                  small
                  variant={draft.kind === k ? 'primary' : 'secondary'}
                  title={k === 'flat' ? 'Fixed price' : k === 'per_unit' ? 'Per unit' : 'On quote'}
                  onPress={() => setDraft({ ...draft, kind: k })}
                />
              ))}
            </View>
            {draft.kind === 'per_unit' && (
              <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
                {UNITS.map((u) => (
                  <Button key={u} small variant={draft.unit === u ? 'primary' : 'secondary'} title={u} onPress={() => setDraft({ ...draft, unit: u })} />
                ))}
              </View>
            )}
            {draft.kind !== 'on_quote' && (
              <Field label={`Price (${currency})`} value={draft.amount} onChangeText={(v) => setDraft({ ...draft, amount: v })} keyboardType="decimal-pad" />
            )}
            {draft.kind === 'per_unit' && (
              <Field label="Minimum (optional)" value={draft.minimum} onChangeText={(v) => setDraft({ ...draft, minimum: v })} keyboardType="decimal-pad" />
            )}
          </>
        ) : (
          <Card>
            <Text style={styles.muted}>Priced by length: {describe((draft.original as RateItem).pricing, currency)}</Text>
          </Card>
        )}
        <View style={{ gap: 10 }}>
          <Button title="Save" onPress={save} disabled={!valid} />
          {draft.original && (
            <Button
              variant="danger"
              title="Delete"
              onPress={() => {
                dispatch({ type: 'deleteRateItem', id: draft.id });
                setDraft(null);
              }}
            />
          )}
          <Button variant="ghost" title="Cancel" onPress={() => setDraft(null)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        Prices only ever come from here or from what you say. When a service is missing, the app asks you.
      </Text>
      {state.rateItems.map((r) => (
        <Pressable key={r.id} onPress={() => open(r)}>
          <Card>
            <Text style={[styles.body, { fontWeight: '700' }]}>{r.name}</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>{describe(r.pricing, currency)}</Text>
            {r.clientPricing &&
              Object.entries(r.clientPricing).map(([cid, p]) => (
                <Text key={cid} style={[styles.muted, { marginTop: 2 }]}>
                  {state.clients.find((c) => c.id === cid)?.name ?? 'Client'}: {describe(p, currency)}
                </Text>
              ))}
          </Card>
        </Pressable>
      ))}
      {state.rateOptions.length > 0 && (
        <>
          <SectionTitle>Add-ons</SectionTitle>
          {state.rateOptions.map((o) => (
            <Card key={o.id}>
              <Text style={styles.body}>
                {o.name}: {o.kind === 'percent' ? `+${o.value}%` : `+${formatMoney(o.value, currency)}`}
              </Text>
            </Card>
          ))}
        </>
      )}
      <View style={{ marginTop: 12 }}>
        <Button title="Add service" onPress={() => open()} />
      </View>
    </ScrollView>
  );
}
