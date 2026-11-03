import { Pressable, ScrollView, Text, View } from 'react-native';
import { useT } from '../lib/i18n';
import { activeBusiness } from '../lib/state';
import { useStore } from '../lib/store';
import { colors, styles } from './ui';

export function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  const tint = color ?? colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? tint : colors.border,
        backgroundColor: active ? tint : colors.card,
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Which company new missions and drafts belong to. Hidden when there is only one. */
export function BusinessSwitcher({ label = 'Invoicing as' }: { label?: string }) {
  const { state, dispatch } = useStore();
  const t = useT();
  if (state.businesses.length < 2) return null;
  const current = activeBusiness(state);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{t(label)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {state.businesses.map((b) => (
          <Chip
            key={b.id}
            label={b.name || t('Unnamed company')}
            color={b.accentColor}
            active={b.id === current.id}
            onPress={() => dispatch({ type: 'setActiveBusiness', id: b.id })}
          />
        ))}
      </ScrollView>
    </View>
  );
}
