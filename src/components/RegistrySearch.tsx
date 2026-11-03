import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useT } from '../lib/i18n';
import { type RegistryCompany, searchCompanies } from '../lib/registry';
import { colors, styles } from './ui';

/** Type a name or SIREN, pick the company, and its legal details fill themselves in. */
export function RegistrySearch({ onPick, title = 'Search the French company registry' }: { onPick: (c: RegistryCompany) => void; title?: string }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistryCompany[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading');
      searchCompanies(query, ctrl.signal)
        .then((r) => {
          setResults(r);
          setStatus('done');
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) {
            console.warn('Registry search failed', e);
            setStatus('error');
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  return (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.accent }]}>{t(title)}</Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('Company name or SIREN')}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={[styles.input, { flex: 1 }]}
        />
        {status === 'loading' && <ActivityIndicator color={colors.accent} />}
      </View>
      {status === 'error' && <Text style={{ color: colors.warn, marginTop: 8 }}>{t('The registry could not be reached. Fill in the details by hand.')}</Text>}
      {status === 'done' && !results.length && <Text style={[styles.muted, { marginTop: 8 }]}>{t('No company found.')}</Text>}
      {results.map((c) => (
        <Pressable
          key={c.siren}
          onPress={() => {
            onPick(c);
            setQuery('');
          }}
          style={{ backgroundColor: colors.card, borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={[styles.body, { fontWeight: '600' }]}>
            {c.name}
            {!c.active ? ` (${t('closed')})` : ''}
          </Text>
          <Text style={styles.muted}>
            {t('SIREN')} {c.siren}
            {c.address ? ` · ${c.address}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
