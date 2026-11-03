import * as Print from 'expo-print';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, colors, Field, SectionTitle, styles } from '../../components/ui';
import { invoiceTotals, lineTotal } from '../../lib/invoice';
import { localeFor, useT } from '../../lib/i18n';
import { formatMoney, parseMoney, todayISO } from '../../lib/money';
import { invoiceHtml } from '../../lib/pdf';
import { businessById } from '../../lib/state';
import { useStore } from '../../lib/store';
import type { InvoiceLine } from '../../lib/types';

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const [sharing, setSharing] = useState(false);
  const t = useT();
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return <Text style={styles.empty}>{t('Invoice not found.')}</Text>;
  const business = businessById(state, inv.businessId);

  const client = state.clients.find((c) => c.id === inv.clientId);
  const editable = inv.status === 'draft';
  const locale = localeFor(state.uiLanguage);
  const money = (n: number) => formatMoney(n, inv.currency, locale);
  const totals = invoiceTotals(inv);
  const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC' }) : '');

  const setLine = (index: number, patch: Partial<InvoiceLine>) =>
    dispatch({ type: 'updateInvoice', id: inv.id, patch: { lines: inv.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) } });

  const exportPdf = async () => {
    setSharing(true);
    try {
      const html = invoiceHtml(inv, business, client);
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: inv.number ?? 'Invoice' });
      } else {
        await Print.printAsync({ uri });
      }
    } finally {
      setSharing(false);
    }
  };

  const issue = () => {
    const doIssue = () => dispatch({ type: 'issueInvoice', id: inv.id, today: todayISO() });
    if (Platform.OS === 'web') return doIssue();
    Alert.alert(t('Issue this invoice?'), t('It gets its final number and can no longer be edited.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Issue'), onPress: doIssue },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: inv.number ?? t('Draft invoice') }} />
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <Text style={styles.h1}>{client?.name}</Text>
        <Badge text={t(inv.status)} tone={inv.status === 'paid' ? 'good' : inv.status === 'sent' ? 'warn' : 'neutral'} />
      </View>
      {state.businesses.length > 1 && <Text style={{ color: business.accentColor, fontWeight: '600', marginBottom: 6 }}>{business.name}</Text>}
      {inv.dueDate && (
        <Text style={[styles.muted, { marginBottom: 12 }]}>{t('Issued {issue} · due {due}', { issue: fmtDate(inv.issueDate), due: fmtDate(inv.dueDate) })}</Text>
      )}

      <SectionTitle>{t('Lines')}</SectionTitle>
      {inv.lines.map((l, i) => (
        <Card key={i}>
          {editable ? (
            <>
              <TextInput value={l.description} onChangeText={(v) => setLine(i, { description: v })} style={[styles.input, { marginBottom: 8 }]} />
              <View style={styles.row}>
                <TextInput
                  defaultValue={String(l.quantity)}
                  keyboardType="decimal-pad"
                  onEndEditing={(e) => {
                    const q = Number(e.nativeEvent.text.replace(',', '.'));
                    if (q > 0) setLine(i, { quantity: q });
                  }}
                  style={[styles.input, { width: 70 }]}
                />
                <Text style={styles.muted}>×</Text>
                <TextInput
                  defaultValue={(l.unitPrice / 100).toFixed(2)}
                  keyboardType="decimal-pad"
                  onEndEditing={(e) => {
                    const p = parseMoney(e.nativeEvent.text);
                    if (p != null) setLine(i, { unitPrice: p });
                  }}
                  style={[styles.input, { flex: 1 }]}
                />
                <Button small variant="danger" title={t('Remove')} onPress={() => dispatch({ type: 'updateInvoice', id: inv.id, patch: { lines: inv.lines.filter((_, j) => j !== i) } })} />
              </View>
            </>
          ) : (
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[styles.body, { flex: 1 }]}>
                {l.description}
                {l.quantity !== 1 ? ` × ${l.quantity}` : ''}
              </Text>
              <Text style={styles.body}>{money(lineTotal(l))}</Text>
            </View>
          )}
        </Card>
      ))}

      {editable && (
        <Field
          label={t('Discount (%)')}
          defaultValue={String(inv.discountPercent)}
          keyboardType="decimal-pad"
          onEndEditing={(e) => {
            const d = Number(e.nativeEvent.text.replace(',', '.'));
            if (d >= 0 && d <= 100) dispatch({ type: 'updateInvoice', id: inv.id, patch: { discountPercent: d } });
          }}
        />
      )}

      <Card>
        <Row label={t('Subtotal')} value={money(totals.subtotal)} />
        {totals.discount > 0 && <Row label={t('Discount ({p}%)', { p: inv.discountPercent })} value={`-${money(totals.discount)}`} />}
        {inv.vatRate > 0 && <Row label={t('VAT ({p}%)', { p: inv.vatRate })} value={money(totals.vat)} />}
        <Row label={t('Total')} value={money(totals.total)} bold />
      </Card>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title={t('Share PDF')} variant="secondary" onPress={exportPdf} loading={sharing} />
        {editable && <Button title={t('Approve and issue')} onPress={issue} disabled={!inv.lines.length} />}
        {inv.status === 'sent' && <Button title={t('Mark as paid')} onPress={() => dispatch({ type: 'markPaid', id: inv.id })} />}
        {inv.status === 'paid' && <Button variant="secondary" title={t('Not paid yet')} onPress={() => dispatch({ type: 'markUnpaid', id: inv.id })} />}
        {editable && (
          <Button
            title={t('Delete draft')}
            variant="danger"
            onPress={() => {
              dispatch({ type: 'deleteDraft', id: inv.id });
              router.back();
            }}
          />
        )}
      </View>
      {editable && (
        <Text style={[styles.muted, { marginTop: 12 }]}>
          {t('Nothing is sent to your client automatically. Issue the invoice, then share the PDF.')}
        </Text>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const s = { fontSize: bold ? 18 : 15, fontWeight: bold ? ('700' as const) : ('400' as const), color: colors.text };
  return (
    <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
      <Text style={s}>{label}</Text>
      <Text style={s}>{value}</Text>
    </View>
  );
}
