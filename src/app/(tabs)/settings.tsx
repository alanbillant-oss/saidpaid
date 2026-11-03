import { router } from 'expo-router';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Card, colors, Field, SectionTitle, styles } from '../../components/ui';
import { isBackendConfigured, isDemoMode } from '../../lib/api';
import { demoBusiness, demoClients, demoRateItems, demoRateOptions } from '../../lib/demo';
import { useStore } from '../../lib/store';
import type { Business } from '../../lib/types';
import { pairLink } from '../../lib/whatsapp';
import { isWhatsAppAvailable, useWhatsApp } from '../../lib/whatsappSync';

export default function SettingsScreen() {
  const { state, dispatch } = useStore();
  const b = state.business;
  const set = (patch: Partial<Business>) => dispatch({ type: 'updateBusiness', patch });

  const confirm = (title: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      // The hosted demo runs in a frame where confirm() is unavailable.
      if (isDemoMode || window.confirm(title)) onYes();
      return;
    }
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: onYes },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>Your business</SectionTitle>
      <Field label="Name" value={b.name} onChangeText={(v) => set({ name: v })} placeholder="Jane Smith Studio" />
      <Field label="Address" value={b.address} onChangeText={(v) => set({ address: v })} multiline />
      <Field label="Email" value={b.email} onChangeText={(v) => set({ email: v })} keyboardType="email-address" autoCapitalize="none" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Currency" value={b.currency} onChangeText={(v) => set({ currency: v.toUpperCase().slice(0, 3) })} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="VAT rate (%)"
            value={String(b.vatRate)}
            onChangeText={(v) => set({ vatRate: Number(v.replace(',', '.')) || 0 })}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <Field label="VAT number" value={b.vatNumber ?? ''} onChangeText={(v) => set({ vatNumber: v })} />
      <Field label="Legal note on invoices" value={b.legalNote} onChangeText={(v) => set({ legalNote: v })} multiline />
      <Field label="Payment details (bank, IBAN…)" value={b.paymentDetails} onChangeText={(v) => set({ paymentDetails: v })} multiline />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="Payment terms (days)"
            value={String(b.paymentTermsDays)}
            onChangeText={(v) => set({ paymentTermsDays: Number(v) || 0 })}
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Invoice prefix" value={b.invoicePrefix} onChangeText={(v) => set({ invoicePrefix: v.replace(/[^A-Za-z0-9]/g, '') })} />
        </View>
      </View>

      <SectionTitle>Clients and prices</SectionTitle>
      <View style={{ gap: 10 }}>
        <Button variant="secondary" title={`Clients (${state.clients.length})`} onPress={() => router.push('/clients')} />
        <Button variant="secondary" title={`Rate card (${state.rateItems.length})`} onPress={() => router.push('/rates')} />
      </View>

      <SectionTitle>WhatsApp</SectionTitle>
      <WhatsAppSection confirm={confirm} />

      <SectionTitle>App</SectionTitle>
      <Card>
        <Text style={styles.body}>AI backend: {isBackendConfigured ? 'connected' : 'not configured'}</Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>Your data is stored on this device for now.</Text>
      </Card>
      <View style={{ gap: 10 }}>
        <Button
          variant="secondary"
          title="Load demo data (317 LAB)"
          onPress={() =>
            confirm('Replace your data with the demo workspace?', () =>
              dispatch({ type: 'reset', state: { business: demoBusiness, clients: demoClients, rateItems: demoRateItems, rateOptions: demoRateOptions } }),
            )
          }
        />
        <Button variant="danger" title="Erase all data" onPress={() => confirm('Erase all data on this device?', () => dispatch({ type: 'reset' }))} />
      </View>
    </ScrollView>
  );
}

function WhatsAppSection({ confirm }: { confirm: (title: string, onYes: () => void) => void }) {
  const { status, pairing, error, connect, disconnect, refresh } = useWhatsApp();

  if (!isWhatsAppAvailable) {
    return (
      <Card>
        <Text style={styles.muted}>Send voice notes on WhatsApp once the AI backend is set up.</Text>
      </Card>
    );
  }

  if (status.linked) {
    return (
      <View style={{ gap: 10 }}>
        <Card>
          <Text style={styles.body}>Connected{status.phone ? `: ${status.phone}` : ''}</Text>
          <Text style={[styles.muted, { marginTop: 4 }]}>
            Send a voice note or a message to the Saidpaid number. Your jobs show up here, priced with your rate card.
          </Text>
        </Card>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <Button variant="secondary" title="Disconnect WhatsApp" onPress={() => confirm('Disconnect WhatsApp?', disconnect)} />
      </View>
    );
  }

  if (pairing) {
    const link = pairLink(pairing.number, pairing.code);
    return (
      <View style={{ gap: 10 }}>
        <Card>
          <Text style={styles.muted}>Send this code to the Saidpaid number on WhatsApp (valid 15 minutes):</Text>
          <Text selectable style={{ fontSize: 28, fontWeight: '700', letterSpacing: 2, marginTop: 8, color: colors.text }}>
            {pairing.code}
          </Text>
          {!!pairing.number && <Text style={[styles.muted, { marginTop: 4 }]}>+{pairing.number}</Text>}
        </Card>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {link && <Button title="Open WhatsApp" onPress={() => Linking.openURL(link)} />}
        <Button variant="secondary" title="I've sent it" onPress={refresh} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Card>
        <Text style={styles.muted}>Dictate your jobs straight from WhatsApp, Saidpaid drafts the invoices.</Text>
      </Card>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button title="Connect WhatsApp" onPress={connect} />
    </View>
  );
}
