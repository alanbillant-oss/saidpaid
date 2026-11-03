import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Chip } from '../../components/BusinessSwitcher';
import { RegistrySearch } from '../../components/RegistrySearch';
import { Button, colors, Field, SectionTitle, styles } from '../../components/ui';
import { confirmAction } from '../../lib/confirm';
import { useT } from '../../lib/i18n';
import { todayISO } from '../../lib/money';
import { invoiceHtml } from '../../lib/pdf';
import { useStore } from '../../lib/store';
import type { Business, Invoice, InvoiceTemplate } from '../../lib/types';

const TEMPLATES: { id: InvoiceTemplate; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'bold', label: 'Bold' },
];
const SWATCHES = ['#1F6F4A', '#2B4C9B', '#B4561B', '#7A2E8E', '#B42318', '#15130F', '#0E7C86', '#C49A1A'];
const MAX_LOGO_BASE64 = 400_000;

/** One of the freelancer's companies: legal identity, numbering and how its invoices look. */
export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const t = useT();
  const b = state.businesses.find((x) => x.id === id);
  if (!b) return <Text style={styles.empty}>—</Text>;
  const set = (patch: Partial<Business>) => dispatch({ type: 'updateBusiness', id: b.id, patch });
  const used = state.missions.some((m) => m.businessId === b.id) || state.invoices.some((i) => i.businessId === b.id);

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6, allowsEditing: true });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset?.base64) return;
    if (asset.base64.length > MAX_LOGO_BASE64) return;
    const mime = asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
    set({ logoDataUri: `data:${mime};base64,${asset.base64}` });
  };

  const preview = () => {
    const today = todayISO();
    const sample: Invoice = {
      id: 'preview',
      businessId: b.id,
      number: (b.invoicePrefix || 'F') + '-' + today.slice(0, 4) + '-0001',
      clientId: 'preview',
      issueDate: today,
      dueDate: today,
      lines: [
        { description: b.invoiceLanguage === 'fr' ? 'Affiche menu d’été' : 'Summer menu poster', quantity: 1, unitPrice: 15000 },
        { description: b.invoiceLanguage === 'fr' ? 'Retouche carte des vins' : 'Wine list revision', quantity: 2, unitPrice: 3000 },
      ],
      discountPercent: 0,
      vatRate: b.vatRate,
      currency: b.currency,
      status: 'sent',
    };
    Print.printAsync({ html: invoiceHtml(sample, b, { id: 'preview', name: 'Chez Paul', aliases: [], address: '12 rue du Port\n13002 Marseille' }) });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: b.name || t('Company') }} />
      {state.activeBusinessId !== b.id && (
        <View style={{ marginBottom: 12 }}>
          <Button variant="secondary" title={t('Use for new missions')} onPress={() => dispatch({ type: 'setActiveBusiness', id: b.id })} />
        </View>
      )}

      <SectionTitle>{t('Identity')}</SectionTitle>
      <RegistrySearch
        title="Find my company in the registry"
        onPick={(c) => set({ name: b.name.trim() ? b.name : c.name, siren: c.siren, address: c.address || b.address, vatNumber: b.vatRate > 0 ? c.vatNumber : b.vatNumber })}
      />
      <Field label={t('Name')} value={b.name} onChangeText={(v) => set({ name: v })} placeholder="317 LAB" />
      <Field label={t('Legal form (e.g. Micro-entreprise, SAS)')} value={b.legalForm} onChangeText={(v) => set({ legalForm: v })} />
      <Field label={t('SIREN')} value={b.siren ?? ''} onChangeText={(v) => set({ siren: v.replace(/\D/g, '').slice(0, 9) || undefined })} keyboardType="number-pad" />
      <Field label={t('Address')} value={b.address} onChangeText={(v) => set({ address: v })} multiline />
      <Field label={t('Email')} value={b.email} onChangeText={(v) => set({ email: v })} keyboardType="email-address" autoCapitalize="none" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={t('Currency')} value={b.currency} onChangeText={(v) => set({ currency: v.toUpperCase().slice(0, 3) })} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('VAT rate (%)')} value={String(b.vatRate)} onChangeText={(v) => set({ vatRate: Number(v.replace(',', '.')) || 0 })} keyboardType="decimal-pad" />
        </View>
      </View>
      <Field label={t('VAT number')} value={b.vatNumber ?? ''} onChangeText={(v) => set({ vatNumber: v })} autoCapitalize="characters" />
      <Field label={t('Legal note on invoices')} value={b.legalNote} onChangeText={(v) => set({ legalNote: v })} multiline />
      <Field label={t('Payment details (bank, IBAN…)')} value={b.paymentDetails} onChangeText={(v) => set({ paymentDetails: v })} multiline />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={t('Payment terms (days)')} value={String(b.paymentTermsDays)} onChangeText={(v) => set({ paymentTermsDays: Number(v) || 0 })} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('Invoice prefix')} value={b.invoicePrefix} onChangeText={(v) => set({ invoicePrefix: v.replace(/[^A-Za-z0-9]/g, ''), numberTemplate: undefined })} />
        </View>
      </View>
      {b.numberTemplate && <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>{t('Numbering: {pattern}', { pattern: b.numberTemplate })}</Text>}

      <SectionTitle>{t('Invoice template')}</SectionTitle>
      <View style={[styles.row, { marginBottom: 12 }]}>
        {TEMPLATES.map((x) => (
          <Chip key={x.id} label={t(x.label)} color={b.accentColor} active={b.template === x.id} onPress={() => set({ template: x.id })} />
        ))}
      </View>
      <Text style={styles.label}>{t('Accent color')}</Text>
      <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 12 }]}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={c}
            onPress={() => set({ accentColor: c })}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: b.accentColor === c ? colors.text : colors.bg }}
          />
        ))}
      </View>
      <Text style={styles.label}>{t('Logo')}</Text>
      <View style={[styles.row, { marginBottom: 12 }]}>
        {b.logoDataUri && <Image source={{ uri: b.logoDataUri }} style={{ width: 56, height: 56, borderRadius: 8 }} resizeMode="contain" />}
        <Button small variant="secondary" title={t(b.logoDataUri ? 'Change logo' : 'Add a logo')} onPress={pickLogo} />
        {b.logoDataUri && <Button small variant="ghost" title={t('Remove logo')} onPress={() => set({ logoDataUri: undefined })} />}
      </View>
      <Text style={styles.label}>{t('Invoice language')}</Text>
      <View style={[styles.row, { marginBottom: 16 }]}>
        <Chip label="Français" color={b.accentColor} active={b.invoiceLanguage === 'fr'} onPress={() => set({ invoiceLanguage: 'fr' })} />
        <Chip label="English" color={b.accentColor} active={b.invoiceLanguage === 'en'} onPress={() => set({ invoiceLanguage: 'en' })} />
      </View>

      <View style={{ gap: 10 }}>
        <Button variant="secondary" title={t('Preview an invoice')} onPress={preview} />
        {state.businesses.length > 1 &&
          (used ? (
            <Text style={styles.muted}>{t('This company has missions or invoices, so it is kept.')}</Text>
          ) : (
            <Button
              variant="danger"
              title={t('Delete company')}
              onPress={() =>
                confirmAction(t('Delete company'), t('Cancel'), t('Yes'), () => {
                  router.back();
                  dispatch({ type: 'deleteBusiness', id: b.id });
                })
              }
            />
          ))}
      </View>
    </ScrollView>
  );
}
