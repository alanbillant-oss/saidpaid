import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BusinessSwitcher } from '../components/BusinessSwitcher';
import { RegistrySearch } from '../components/RegistrySearch';
import { Button, Card, colors, Field, SectionTitle, styles } from '../components/ui';
import { useMoney, useT } from '../lib/i18n';
import { parseMoney } from '../lib/money';
import { activeBusiness, activeRates, uid } from '../lib/state';
import { useStore } from '../lib/store';
import type { Client, Pricing, RateItem } from '../lib/types';

const blank = (): Client => ({ id: uid('c_'), name: '', aliases: [] });

const amountOf = (p: Pricing | undefined) => (p && (p.kind === 'flat' || p.kind === 'per_unit') ? p.amount : null);

/** A client price keeps the shape of the standard one (per hour stays per hour). */
function clientPricing(base: Pricing, amount: number): Pricing {
  if (base.kind === 'per_unit') return { kind: 'per_unit', unit: base.unit, amount, minimum: base.minimum };
  if (base.kind === 'tiers') return { kind: 'per_unit', unit: base.unit, amount };
  return { kind: 'flat', amount };
}

export default function ClientsScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const money = useMoney();
  const business = activeBusiness(state);
  const { rateItems } = activeRates(state);
  const [editing, setEditing] = useState<Client | null>(null);
  const [aliases, setAliases] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});

  const open = (c: Client) => {
    setEditing(c);
    setAliases(c.aliases.join(', '));
    // Every company's services, so switching company inside the editor never drops a price.
    setPrices(
      Object.fromEntries(
        state.rateItems.map((r) => {
          const a = amountOf(r.clientPricing?.[c.id]);
          return [r.id, a == null ? '' : String(a / 100).replace('.', state.uiLanguage === 'fr' ? ',' : '.')];
        }),
      ),
    );
  };

  const standard = (r: RateItem) => {
    const a = amountOf(r.pricing);
    if (a == null) return t('On quote');
    const unit = r.pricing.kind === 'per_unit' ? ` / ${t(r.pricing.unit)}` : '';
    return money(a, business.currency) + unit;
  };

  if (editing) {
    const hasMissions = state.missions.some((m) => m.clientId === editing.id);
    const save = () => {
      dispatch({
        type: 'upsertClient',
        client: { ...editing, name: editing.name.trim(), aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) },
      });
      for (const r of state.rateItems) {
        const raw = (prices[r.id] ?? '').trim();
        const amount = raw ? parseMoney(raw) : null;
        const before = amountOf(r.clientPricing?.[editing.id]);
        if (amount === before) continue;
        dispatch({ type: 'setClientPrice', rateItemId: r.id, clientId: editing.id, pricing: amount == null ? null : clientPricing(r.pricing, amount) });
      }
      setEditing(null);
    };
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <RegistrySearch
          onPick={(c) =>
            setEditing({
              ...editing,
              name: editing.name.trim() ? editing.name : c.name,
              address: c.address || editing.address,
              siren: c.siren,
              vatNumber: c.vatNumber,
            })
          }
        />
        <Field label={t('Name')} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
        <Field label={t('Nicknames you use when talking (comma separated)')} value={aliases} onChangeText={setAliases} placeholder="Paul, le resto" />
        <Field
          label={t('Billing email')}
          value={editing.email ?? ''}
          onChangeText={(v) => setEditing({ ...editing, email: v })}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field label={t('Address')} value={editing.address ?? ''} onChangeText={(v) => setEditing({ ...editing, address: v })} multiline />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('SIREN')} value={editing.siren ?? ''} onChangeText={(v) => setEditing({ ...editing, siren: v.replace(/\D/g, '').slice(0, 9) || undefined })} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('VAT number')} value={editing.vatNumber ?? ''} onChangeText={(v) => setEditing({ ...editing, vatNumber: v || undefined })} autoCapitalize="characters" />
          </View>
        </View>
        <Field
          label={t('Payment terms (days, empty = default)')}
          value={editing.paymentTermsDays?.toString() ?? ''}
          onChangeText={(v) => setEditing({ ...editing, paymentTermsDays: v ? Number(v) || 0 : undefined })}
          keyboardType="number-pad"
        />

        {rateItems.length > 0 && (
          <>
            <SectionTitle>{t('Prices for this client ({company})', { company: business.name })}</SectionTitle>
            <BusinessSwitcher />
            <Text style={[styles.muted, { marginBottom: 8 }]}>{t('Leave empty to use the standard price.')}</Text>
            <Card>
              {rateItems.map((r) => (
                <View key={r.id} style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body}>{r.name}</Text>
                    <Text style={[styles.muted, { fontSize: 12 }]}>{t('standard {price}', { price: standard(r) })}</Text>
                  </View>
                  <TextInput
                    value={prices[r.id] ?? ''}
                    onChangeText={(v) => setPrices({ ...prices, [r.id]: v })}
                    placeholder="—"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={[styles.input, { width: 110, textAlign: 'right', paddingVertical: 8 }]}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ gap: 10 }}>
          <Button title={t('Save')} disabled={!editing.name.trim()} onPress={save} />
          {state.clients.some((c) => c.id === editing.id) && !hasMissions && (
            <Button
              variant="danger"
              title={t('Delete client')}
              onPress={() => {
                dispatch({ type: 'deleteClient', id: editing.id });
                setEditing(null);
              }}
            />
          )}
          <Button variant="ghost" title={t('Cancel')} onPress={() => setEditing(null)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {state.clients.map((c) => {
        const special = rateItems.filter((r) => r.clientPricing?.[c.id]).length;
        return (
          <Pressable key={c.id} onPress={() => open(c)}>
            <Card>
              <Text style={[styles.body, { fontWeight: '700' }]}>{c.name}</Text>
              {(c.aliases.length > 0 || c.email || c.siren || special > 0) && (
                <Text style={[styles.muted, { marginTop: 4 }]}>
                  {[c.aliases.join(', '), c.email, c.siren ? `${t('SIREN')} ${c.siren}` : '', special ? t('{n} special prices', { n: special }) : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}
      {!state.clients.length && <Text style={styles.empty}>{t('No clients yet. Add one, or just mention a new client in a voice note.')}</Text>}
      <View style={{ marginTop: 12 }}>
        <Button title={t('Add client')} onPress={() => open(blank())} />
      </View>
    </ScrollView>
  );
}
