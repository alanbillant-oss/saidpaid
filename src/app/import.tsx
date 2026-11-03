import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BusinessSwitcher, Chip } from '../components/BusinessSwitcher';
import { Button, Card, colors, styles } from '../components/ui';
import { isDemoMode, readFileBase64 } from '../lib/api';
import { useT } from '../lib/i18n';
import { base64ToBytes, buildImport, classify, decodeCsvBytes, type FileKind, parseCsv, type Row, toRows } from '../lib/importer';
import { SAMPLE_FILES } from '../lib/importSamples';
import { activeBusiness, uid } from '../lib/state';
import { useStore } from '../lib/store';

type Picked = { name: string; kind: FileKind | 'excel'; rows: Row[] };

const fromText = (name: string, text: string): Picked => {
  const rows = toRows(parseCsv(text));
  return { name, kind: classify(Object.keys(rows[0] ?? {})), rows };
};

/** Bring clients, services and past invoices over from facture.net (or any tool that exports CSV). */
export default function ImportScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const business = activeBusiness(state);
  const [files, setFiles] = useState<Picked[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [unpaidAsPaid, setUnpaidAsPaid] = useState(true);

  const preview = useMemo(
    () =>
      buildImport(
        files.filter((f): f is Picked & { kind: FileKind } => f.kind !== 'excel'),
        { clients: state.clients, rateItems: state.rateItems, invoices: state.invoices },
        business.id,
        business.currency,
        uid,
        { unpaidAsPaid },
      ),
    [files, state.clients, state.rateItems, state.invoices, business.id, business.currency, unpaidAsPaid],
  );

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, base64: true, type: '*/*' });
    if (res.canceled) return;
    const picked: Picked[] = [];
    for (const a of res.assets) {
      if (/\.xlsx?$/i.test(a.name)) {
        picked.push({ name: a.name, kind: 'excel', rows: [] });
        continue;
      }
      const b64 = a.base64 ?? (await readFileBase64(a.uri));
      picked.push(fromText(a.name, decodeCsvBytes(base64ToBytes(b64))));
    }
    setDone(null);
    setFiles((prev) => [...prev.filter((p) => !picked.some((x) => x.name === p.name)), ...picked]);
  };

  const run = () => {
    dispatch({
      type: 'importData',
      businessId: business.id,
      clients: preview.clients,
      rateItems: preview.rateItems,
      invoices: preview.invoices,
      numberTemplate: preview.numberTemplate,
    });
    const lines = [
      t('Imported: {c} clients, {r} services, {i} invoices.', { c: preview.clients.length, r: preview.rateItems.length, i: preview.invoices.length }),
      preview.skipped ? t('Already in Saidpaid, skipped: {n}', { n: preview.skipped }) : '',
      preview.drafts ? t('{n} drafts to finish in Invoices.', { n: preview.drafts }) : '',
      preview.lastNumber ? t('Numbering continues after {n}.', { n: preview.lastNumber }) : '',
    ];
    setDone(lines.filter(Boolean).join('\n'));
    setFiles([]);
  };

  const total = preview.clients.length + preview.rateItems.length + preview.invoices.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[styles.body, { marginBottom: 12 }]}>
        {t('Export your clients, items and invoices from facture.net (CSV or Excel), then add the files here.')}
      </Text>
      <BusinessSwitcher label="Import into" />
      <View style={{ gap: 10, marginBottom: 12 }}>
        <Button title={t('Choose files')} onPress={pick} />
        {isDemoMode && (
          <Button
            variant="secondary"
            title={t('Try with example files')}
            onPress={() => {
              setDone(null);
              setFiles(SAMPLE_FILES.map((f) => fromText(f.name, f.text)));
            }}
          />
        )}
      </View>

      {files.map((f) => (
        <Card key={f.name}>
          <Text style={[styles.body, { fontWeight: '600' }]}>{f.name}</Text>
          {f.kind === 'excel' ? (
            <Text style={{ color: colors.warn, marginTop: 4 }}>{t('Excel file: open it and save it as CSV, then add it again.')}</Text>
          ) : f.kind === 'unknown' ? (
            <Text style={{ color: colors.warn, marginTop: 4 }}>{t('not recognised')}</Text>
          ) : (
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {f.rows.length} {t(f.kind)}
            </Text>
          )}
        </Card>
      ))}

      {files.length > 0 && (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={styles.body}>
            {t('Ready: {c} clients, {r} services, {i} invoices.', { c: preview.clients.length, r: preview.rateItems.length, i: preview.invoices.length })}
          </Text>
          {preview.skipped > 0 && <Text style={[styles.muted, { marginTop: 4 }]}>{t('Already in Saidpaid, skipped: {n}', { n: preview.skipped })}</Text>}
          {preview.drafts > 0 && <Text style={[styles.muted, { marginTop: 4 }]}>{t('{n} drafts to finish in Invoices.', { n: preview.drafts })}</Text>}
          {preview.voided > 0 && (
            <Text style={[styles.muted, { marginTop: 4 }]}>{t('{n} corrected invoices kept as cancelled, outside the totals.', { n: preview.voided })}</Text>
          )}
          <Text style={[styles.label, { marginTop: 10 }]}>{t('Invoices with no payment date')}</Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Chip label={t('Already paid')} active={unpaidAsPaid} onPress={() => setUnpaidAsPaid(true)} />
            <Chip label={t('Still to be paid')} active={!unpaidAsPaid} onPress={() => setUnpaidAsPaid(false)} />
          </View>
          {preview.lastNumber && <Text style={[styles.muted, { marginTop: 4 }]}>{t('Numbering continues after {n}.', { n: preview.lastNumber })}</Text>}
          <View style={{ marginTop: 10 }}>
            <Button title={t('Import everything')} onPress={run} disabled={!total} />
          </View>
        </Card>
      )}

      {done && (
        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
          <Text style={{ color: colors.accent }}>{done}</Text>
        </Card>
      )}
    </ScrollView>
  );
}
