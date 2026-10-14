import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, styles } from '../components/ui';
import { uid } from '../lib/state';
import { useStore } from '../lib/store';
import type { Client } from '../lib/types';

const blank = (): Client => ({ id: uid('c_'), name: '', aliases: [] });

export default function ClientsScreen() {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<Client | null>(null);
  const [aliases, setAliases] = useState('');

  const open = (c: Client) => {
    setEditing(c);
    setAliases(c.aliases.join(', '));
  };

  if (editing) {
    const hasMissions = state.missions.some((m) => m.clientId === editing.id);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
        <Field
          label="Nicknames you use when talking (comma separated)"
          value={aliases}
          onChangeText={setAliases}
          placeholder="Paul, the restaurant"
        />
        <Field label="Billing email" value={editing.email ?? ''} onChangeText={(v) => setEditing({ ...editing, email: v })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Address" value={editing.address ?? ''} onChangeText={(v) => setEditing({ ...editing, address: v })} multiline />
        <Field
          label="Payment terms (days, empty = default)"
          value={editing.paymentTermsDays?.toString() ?? ''}
          onChangeText={(v) => setEditing({ ...editing, paymentTermsDays: v ? Number(v) || 0 : undefined })}
          keyboardType="number-pad"
        />
        <View style={{ gap: 10 }}>
          <Button
            title="Save"
            disabled={!editing.name.trim()}
            onPress={() => {
              dispatch({
                type: 'upsertClient',
                client: { ...editing, name: editing.name.trim(), aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) },
              });
              setEditing(null);
            }}
          />
          {state.clients.some((c) => c.id === editing.id) && !hasMissions && (
            <Button
              variant="danger"
              title="Delete client"
              onPress={() => {
                dispatch({ type: 'deleteClient', id: editing.id });
                setEditing(null);
              }}
            />
          )}
          <Button variant="ghost" title="Cancel" onPress={() => setEditing(null)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {state.clients.map((c) => (
        <Pressable key={c.id} onPress={() => open(c)}>
          <Card>
            <Text style={[styles.body, { fontWeight: '700' }]}>{c.name}</Text>
            {(c.aliases.length > 0 || c.email) && (
              <Text style={[styles.muted, { marginTop: 4 }]}>{[c.aliases.join(', '), c.email].filter(Boolean).join(' · ')}</Text>
            )}
          </Card>
        </Pressable>
      ))}
      {!state.clients.length && <Text style={styles.empty}>No clients yet. Add one, or just mention a new client in a voice note.</Text>}
      <View style={{ marginTop: 12 }}>
        <Button title="Add client" onPress={() => open(blank())} />
      </View>
    </ScrollView>
  );
}
