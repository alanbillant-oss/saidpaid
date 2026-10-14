import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, colors, SectionTitle, styles } from '../../components/ui';
import { invoiceTotals } from '../../lib/invoice';
import { formatMoney, todayISO } from '../../lib/money';
import { useStore } from '../../lib/store';
import type { Invoice } from '../../lib/types';

export default function InvoicesScreen() {
  const { state, dispatch } = useStore();
  const currency = state.business.currency;
  const money = (n: number) => formatMoney(n, currency);
  const today = todayISO();

  const ready = state.missions.filter((m) => m.status === 'confirmed' && m.unitPrice != null);
  const needsInfo = state.missions.filter((m) => m.status === 'needs_info');
  const toInvoice = ready.reduce((s, m) => s + Math.round((m.unitPrice ?? 0) * m.quantity), 0);
  const total = (i: Invoice) => invoiceTotals(i).total;
  const sent = state.invoices.filter((i) => i.status === 'sent');
  const overdue = sent.filter((i) => i.dueDate && i.dueDate < today);
  const paid = state.invoices.filter((i) => i.status === 'paid');

  const byClient = new Map<string, number>();
  for (const m of ready) byClient.set(m.clientId, (byClient.get(m.clientId) ?? 0) + Math.round((m.unitPrice ?? 0) * m.quantity));

  const groups: { title: string; items: Invoice[] }[] = [
    { title: 'Drafts', items: state.invoices.filter((i) => i.status === 'draft') },
    { title: 'Sent', items: sent },
    { title: 'Paid', items: paid },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Stat label="To invoice" value={money(toInvoice)} />
        <Stat label="Awaiting payment" value={money(sent.reduce((s, i) => s + total(i), 0))} hint={overdue.length ? `${overdue.length} overdue` : undefined} />
        <Stat label="Paid" value={money(paid.reduce((s, i) => s + total(i), 0))} />
      </View>

      <Card>
        <Text style={[styles.body, { fontWeight: '700' }]}>Ready to invoice</Text>
        {[...byClient.entries()].map(([cid, amount]) => (
          <View key={cid} style={[styles.row, { justifyContent: 'space-between', marginTop: 6 }]}>
            <Text style={styles.body}>{state.clients.find((c) => c.id === cid)?.name}</Text>
            <Text style={styles.body}>{money(amount)}</Text>
          </View>
        ))}
        {!ready.length && <Text style={[styles.muted, { marginTop: 6 }]}>No confirmed mission waiting.</Text>}
        {needsInfo.length > 0 && (
          <Text style={{ color: colors.warn, marginTop: 8 }}>
            {needsInfo.length} mission{needsInfo.length > 1 ? 's' : ''} still need a price (see Capture).
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          <Button title="Prepare draft invoices" onPress={() => dispatch({ type: 'createDrafts' })} disabled={!ready.length} />
        </View>
      </Card>

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <View key={g.title}>
              <SectionTitle>{g.title}</SectionTitle>
              {g.items.map((inv) => {
                const isOverdue = inv.status === 'sent' && !!inv.dueDate && inv.dueDate < today;
                return (
                  <Pressable key={inv.id} onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: inv.id } })}>
                    <Card>
                      <View style={[styles.row, { justifyContent: 'space-between' }]}>
                        <Text style={[styles.body, { fontWeight: '700' }]}>{state.clients.find((c) => c.id === inv.clientId)?.name}</Text>
                        <Text style={[styles.body, { fontWeight: '700' }]}>{formatMoney(total(inv), inv.currency)}</Text>
                      </View>
                      <View style={[styles.row, { marginTop: 6 }]}>
                        <Text style={styles.muted}>
                          {inv.number ?? 'Draft'} · {inv.lines.length} line{inv.lines.length > 1 ? 's' : ''}
                        </Text>
                        {isOverdue && <Badge text="Overdue" tone="warn" />}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          ),
      )}
    </ScrollView>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint && <Text style={{ fontSize: 12, color: colors.warn, marginTop: 2 }}>{hint}</Text>}
    </View>
  );
}
