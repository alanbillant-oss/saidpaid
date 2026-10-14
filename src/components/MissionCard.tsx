import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatMoney, parseMoney } from '../lib/money';
import { useStore } from '../lib/store';
import type { Mission } from '../lib/types';
import { Badge, Button, colors, styles } from './ui';

export function MissionCard({ mission }: { mission: Mission }) {
  const { state, dispatch } = useStore();
  const [price, setPrice] = useState('');
  const client = state.clients.find((c) => c.id === mission.clientId);
  const currency = state.business.currency;

  const submitPrice = () => {
    const minor = parseMoney(price);
    if (minor != null) dispatch({ type: 'setMissionPrice', id: mission.id, unitPrice: minor });
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mission.status === 'needs_info' ? colors.warn : colors.border,
        padding: 12,
        marginTop: 8,
      }}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }}>{client?.name ?? 'Unknown client'}</Text>
        {mission.status === 'needs_info' ? (
          <Badge text="Needs a price" tone="warn" />
        ) : mission.status === 'invoiced' ? (
          <Badge text="Invoiced" />
        ) : (
          <Badge text={mission.priceSource === 'user' ? 'Your price' : 'Rate card'} tone="good" />
        )}
      </View>
      <Text style={[styles.body, { marginTop: 4 }]}>
        {mission.description}
        {mission.quantity !== 1 ? ` × ${mission.quantity}` : ''}
      </Text>
      {mission.unitPrice != null && (
        <Text style={{ fontSize: 17, fontWeight: '700', marginTop: 6, color: colors.text }}>
          {formatMoney(Math.round(mission.unitPrice * mission.quantity), currency)}
        </Text>
      )}

      {mission.status === 'needs_info' && (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.muted, { marginBottom: 6 }]}>{mission.question}</Text>
          <View style={styles.row}>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder={`Price (${currency})`}
              keyboardType="decimal-pad"
              onSubmitEditing={submitPrice}
              style={[styles.input, { flex: 1, paddingVertical: 8 }]}
              placeholderTextColor={colors.muted}
            />
            <Button small title="Set" onPress={submitPrice} disabled={parseMoney(price) == null} />
          </View>
        </View>
      )}

      {mission.status !== 'invoiced' && (
        <Pressable onPress={() => dispatch({ type: 'deleteMission', id: mission.id })} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Undo</Text>
        </Pressable>
      )}
    </View>
  );
}
