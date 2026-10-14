import { router } from 'expo-router';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, SectionTitle, styles } from '../../components/ui';
import { isBackendConfigured, isDemoMode } from '../../lib/api';
import { demoBusiness, demoClients, demoRateItems, demoRateOptions } from '../../lib/demo';
import { useStore } from '../../lib/store';
import type { Business } from '../../lib/types';

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
