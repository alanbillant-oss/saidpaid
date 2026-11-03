import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Chip } from '../../components/BusinessSwitcher';
import { Button, Card, colors, SectionTitle, styles } from '../../components/ui';
import { isBackendConfigured, isDemoMode } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { demoWorkspace } from '../../lib/demo';
import { useT } from '../../lib/i18n';
import { activeBusiness, uid } from '../../lib/state';
import { useStore } from '../../lib/store';

export default function SettingsScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const active = activeBusiness(state);
  const confirm = (title: string, onYes: () => void) => confirmAction(t(title), t('Cancel'), t('Yes'), onYes);
  const rateCount = state.rateItems.filter((r) => r.businessId === active.id).length;

  const addBusiness = () => {
    const id = uid('b_');
    dispatch({ type: 'addBusiness', id });
    router.push({ pathname: '/business/[id]', params: { id } });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>{t('Companies')}</SectionTitle>
      {state.businesses.map((b) => (
        <Pressable key={b.id} onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: b.accentColor }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.body, { fontWeight: '700' }]}>{b.name || t('Unnamed company')}</Text>
              <Text style={styles.muted}>
                {[b.legalForm, t(b.template === 'classic' ? 'Classic' : b.template === 'minimal' ? 'Minimal' : 'Bold'), b.id === active.id ? t('active') : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </Pressable>
      ))}
      <Button variant="secondary" title={t('Add a company')} onPress={addBusiness} />

      <SectionTitle>{t('Clients and prices')}</SectionTitle>
      <View style={{ gap: 10 }}>
        <Button variant="secondary" title={t('Clients ({n})', { n: state.clients.length })} onPress={() => router.push('/clients')} />
        <Button variant="secondary" title={t('Rate card ({n})', { n: rateCount })} onPress={() => router.push('/rates')} />
        <Button variant="secondary" title={t('Import from facture.net or a spreadsheet')} onPress={() => router.push('/import')} />
      </View>

      <SectionTitle>{t('App')}</SectionTitle>
      <Card>
        <Text style={styles.label}>{t('Language')}</Text>
        <View style={[styles.row, { marginBottom: 12 }]}>
          <Chip label="Français" active={state.uiLanguage === 'fr'} onPress={() => dispatch({ type: 'setLanguage', language: 'fr' })} />
          <Chip label="English" active={state.uiLanguage === 'en'} onPress={() => dispatch({ type: 'setLanguage', language: 'en' })} />
        </View>
        <Text style={styles.body}>
          {t('AI backend: {state}', { state: t(isBackendConfigured ? 'connected' : isDemoMode ? 'demo' : 'not configured') })}
        </Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>{t('Your data is stored on this device for now.')}</Text>
      </Card>
      <View style={{ gap: 10 }}>
        <Button
          variant="secondary"
          title={t('Load demo data')}
          onPress={() => confirm('Replace your data with the demo workspace?', () => dispatch({ type: 'reset', state: { ...demoWorkspace(), uiLanguage: state.uiLanguage } }))}
        />
        <Button
          variant="danger"
          title={t('Erase all data')}
          onPress={() => confirm('Erase all data on this device?', () => dispatch({ type: 'reset', state: { uiLanguage: state.uiLanguage } }))}
        />
      </View>
    </ScrollView>
  );
}
