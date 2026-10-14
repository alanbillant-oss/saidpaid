import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#F6F5F2',
  card: '#FFFFFF',
  text: '#15130F',
  muted: '#6E6A62',
  border: '#E6E2DA',
  accent: '#1F6F4A',
  accentSoft: '#E3F1E9',
  warn: '#B4561B',
  warnSoft: '#FBEBDD',
  danger: '#B42318',
  userBubble: '#15130F',
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.accent, fg: '#fff', border: colors.accent },
  secondary: { bg: colors.card, fg: colors.text, border: colors.border },
  danger: { bg: colors.card, fg: colors.danger, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
};

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 72 }, props.style]} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const bg = tone === 'good' ? colors.accentSoft : tone === 'warn' ? colors.warnSoft : colors.bg;
  const fg = tone === 'good' ? colors.accent : tone === 'warn' ? colors.warn : colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  button: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1 },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 15, lineHeight: 22 },
});
