import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BusinessSwitcher } from '../components/BusinessSwitcher';
import { Button, Card, colors, Field, SectionTitle, styles } from '../components/ui';
import { type ImportedRate, importRateCard, isDemoMode, readFileBase64 } from '../lib/api';
import { localeFor, useT } from '../lib/i18n';
import { formatMoney, parseMoney } from '../lib/money';
import { activeBusiness, activeRates, uid } from '../lib/state';
import { useStore } from '../lib/store';
import type { Pricing, RateItem, Unit } from '../lib/types';

type Kind = 'flat' | 'per_unit' | 'on_quote';
type Draft = { id: string; name: string; aliases: string; kind: Kind; unit: Unit; amount: string; minimum: string; original?: RateItem };

const UNITS: Unit[] = ['hour', 'day', 'minute', 'piece'];

export default function RatesScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const business = activeBusiness(state);
  const { rateItems, rateOptions } = activeRates(state);
  const currency = business.currency;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pdf, setPdf] = useState<{ status: 'idle' | 'reading' | 'error'; message?: string; items?: ImportedRate[] }>({ status: 'idle' });

  const m = (n: number) => formatMoney(n, currency, localeFor(state.uiLanguage));
  const describe = (p: Pricing): string => {
    switch (p.kind) {
      case 'flat':
        return m(p.amount);
      case 'per_unit':
        return `${m(p.amount)} / ${t(p.unit)}${p.minimum ? ` (min ${m(p.minimum)})` : ''}`;
      case 'tiers':
        return p.tiers.map((x) => `${x.upTo == null ? t('over') : `≤${x.upTo} ${t(p.unit)}`}: ${x.amount == null ? t('quote') : m(x.amount)}`).join(' · ');
      case 'on_quote':
        return t('On quote');
    }
  };

  const importPdf = async () => {
    if (isDemoMode) {
      setPdf({ status: 'error', message: t('PDF import needs the real AI backend.') });
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, base64: true });
    if (picked.canceled || !picked.assets[0]) return;
    setPdf({ status: 'reading' });
    try {
      const asset = picked.assets[0];
      const b64 = asset.base64 ?? (await readFileBase64(asset.uri));
      setPdf({ status: 'idle', items: await importRateCard(b64, currency) });
    } catch (e) {
      setPdf({ status: 'error', message: t(e instanceof Error ? e.message : 'Something went wrong.') });
    }
  };

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
          businessId: draft.original?.businessId ?? business.id,
          name: draft.name.trim(),
          aliases: draft.aliases.split(',').map((a) => a.trim()).filter(Boolean),
          pricing,
        },
      });
      setDraft(null);
    };

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t('Service')} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Affiche" />
        <Field label={t('Other words you use for it (comma separated)')} value={draft.aliases} onChangeText={(v) => setDraft({ ...draft, aliases: v })} />
        {editableKind ? (
          <>
            <SectionTitle>{t('Pricing')}</SectionTitle>
            <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
              {(['flat', 'per_unit', 'on_quote'] as Kind[]).map((k) => (
                <Button
                  key={k}
                  small
                  variant={draft.kind === k ? 'primary' : 'secondary'}
                  title={t(k === 'flat' ? 'Fixed price' : k === 'per_unit' ? 'Per unit' : 'On quote')}
                  onPress={() => setDraft({ ...draft, kind: k })}
                />
              ))}
            </View>
            {draft.kind === 'per_unit' && (
              <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
                {UNITS.map((u) => (
                  <Button key={u} small variant={draft.unit === u ? 'primary' : 'secondary'} title={t(u)} onPress={() => setDraft({ ...draft, unit: u })} />
                ))}
              </View>
            )}
            {draft.kind !== 'on_quote' && (
              <Field label={t('Price ({currency})', { currency })} value={draft.amount} onChangeText={(v) => setDraft({ ...draft, amount: v })} keyboardType="decimal-pad" />
            )}
            {draft.kind === 'per_unit' && (
              <Field label={t('Minimum (optional)')} value={draft.minimum} onChangeText={(v) => setDraft({ ...draft, minimum: v })} keyboardType="decimal-pad" />
            )}
          </>
        ) : (
          <Card>
            <Text style={styles.muted}>{t('Priced by length: {d}', { d: describe((draft.original as RateItem).pricing) })}</Text>
          </Card>
        )}
        <View style={{ gap: 10 }}>
          <Button title={t('Save')} onPress={save} disabled={!valid} />
          {draft.original && (
            <Button
              variant="danger"
              title={t('Delete')}
              onPress={() => {
                dispatch({ type: 'deleteRateItem', id: draft.id });
                setDraft(null);
              }}
            />
          )}
          <Button variant="ghost" title={t('Cancel')} onPress={() => setDraft(null)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BusinessSwitcher label="Rate card" />
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        {t('Prices only ever come from here or from what you say. When a service is missing, the app asks you.')}
      </Text>

      {pdf.items ? (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={[styles.body, { fontWeight: '700', marginBottom: 8 }]}>{t('{n} services found. Check them, then import.', { n: pdf.items.length })}</Text>
          {pdf.items.map((r, i) => (
            <View key={i} style={[styles.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
              <Text style={[styles.body, { flex: 1 }]}>{r.name}</Text>
              <Text style={styles.muted}>{describe(r.pricing)}</Text>
            </View>
          ))}
          <View style={[styles.row, { marginTop: 10 }]}>
            <Button
              small
              title={t('Import {n} services', { n: pdf.items.length })}
              onPress={() => {
                const items = (pdf.items ?? []).map((r) => ({ ...r, id: uid('r_'), businessId: business.id }));
                dispatch({ type: 'importRateItems', items, options: [] });
                setPdf({ status: 'idle' });
              }}
            />
            <Button small variant="ghost" title={t('Cancel')} onPress={() => setPdf({ status: 'idle' })} />
          </View>
        </Card>
      ) : null}
      {pdf.status === 'reading' && <Text style={[styles.muted, { marginBottom: 12 }]}>{t('Reading your rate card…')}</Text>}
      {pdf.status === 'error' && <Text style={{ color: colors.warn, marginBottom: 12 }}>{pdf.message}</Text>}

      {rateItems.map((r) => (
        <Pressable key={r.id} onPress={() => open(r)}>
          <Card>
            <Text style={[styles.body, { fontWeight: '700' }]}>{r.name}</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>{describe(r.pricing)}</Text>
            {r.clientPricing &&
              Object.entries(r.clientPricing).map(([cid, p]) => (
                <Text key={cid} style={[styles.muted, { marginTop: 2 }]}>
                  {state.clients.find((c) => c.id === cid)?.name ?? 'Client'} : {describe(p)}
                </Text>
              ))}
          </Card>
        </Pressable>
      ))}
      {rateOptions.length > 0 && (
        <>
          <SectionTitle>{t('Add-ons')}</SectionTitle>
          {rateOptions.map((o) => (
            <Card key={o.id}>
              <Text style={styles.body}>
                {o.name} : {o.kind === 'percent' ? `+${o.value} %` : `+${m(o.value)}`}
              </Text>
            </Card>
          ))}
        </>
      )}
      <View style={{ marginTop: 12, gap: 10 }}>
        <Button title={t('Add service')} onPress={() => open()} />
        <Button variant="secondary" title={t('Import a rate card (PDF)')} onPress={importPdf} loading={pdf.status === 'reading'} />
      </View>
    </ScrollView>
  );
}
