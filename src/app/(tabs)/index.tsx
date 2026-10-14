import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { MissionCard } from '../../components/MissionCard';
import { Button, colors, styles } from '../../components/ui';
import { captureContext, isBackendConfigured, sendCapture } from '../../lib/api';
import { formatMoney, todayISO } from '../../lib/money';
import { type ChatEntry, type PendingClient, uid } from '../../lib/state';
import { useStore } from '../../lib/store';

export default function CaptureScreen() {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const listRef = useRef<FlatList<ChatEntry>>(null);

  const submit = async (input: { text: string } | { audioUri: string }) => {
    const today = todayISO();
    const userEntry: ChatEntry = {
      id: uid('u_'),
      role: 'user',
      text: 'text' in input ? input.text : '🎙️ Voice note…',
      at: new Date().toISOString(),
    };
    dispatch({ type: 'addChat', entry: userEntry });
    setBusy(true);
    try {
      const res = await sendCapture(input, captureContext(state, today));
      dispatch({ type: 'applyCapture', userEntryId: userEntry.id, transcript: res.transcript || userEntry.text, items: res.items, today });
    } catch (e) {
      dispatch({
        type: 'addChat',
        entry: { id: uid('a_'), role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.', at: new Date().toISOString(), error: true },
      });
    } finally {
      setBusy(false);
    }
  };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    submit({ text: t });
  };

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (recorder.uri) submit({ audioUri: recorder.uri });
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      dispatch({
        type: 'addChat',
        entry: { id: uid('a_'), role: 'assistant', text: 'Microphone access is needed to record voice notes.', at: new Date().toISOString(), error: true },
      });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const seconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={state.chat}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          <View>
            {!isBackendConfigured && (
              <View style={{ backgroundColor: colors.warnSoft, padding: 12, borderRadius: 12, marginBottom: 12 }}>
                <Text style={{ color: colors.warn }}>
                  The AI backend is not configured yet. See the README to add your Supabase URL and keys.
                </Text>
              </View>
            )}
            {state.chat.length === 0 && (
              <Text style={styles.empty}>
                Say what you did, like{'\n'}“Chez Paul, a poster for the summer menu{'\n'}and a small revision on the wine list.”
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ChatBubble entry={item} />}
      />
      {busy && <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>Listening to your note…</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={recorderState.isRecording ? `Recording… ${seconds}s` : 'Type a mission…'}
          placeholderTextColor={recorderState.isRecording ? colors.danger : colors.muted}
          editable={!recorderState.isRecording}
          multiline
          style={[styles.input, { flex: 1, maxHeight: 120 }]}
        />
        {text.trim() ? (
          <Button title="Send" onPress={sendText} disabled={busy} />
        ) : (
          <Pressable
            accessibilityLabel={recorderState.isRecording ? 'Stop recording' : 'Record a voice note'}
            onPress={toggleRecording}
            disabled={busy}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: recorderState.isRecording ? colors.danger : colors.accent,
              opacity: busy ? 0.4 : 1,
            }}
          >
            <Ionicons name={recorderState.isRecording ? 'stop' : 'mic'} size={24} color="#fff" />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  const { state } = useStore();
  if (entry.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.userBubble, borderRadius: 16, padding: 12, marginBottom: 10 }}>
        <Text style={{ color: '#fff', fontSize: 15 }}>{entry.text}</Text>
      </View>
    );
  }
  const missions = state.missions.filter((m) => entry.missionIds?.includes(m.id));
  const clientIds = [...new Set(missions.map((m) => m.clientId))];
  return (
    <View style={{ alignSelf: 'flex-start', width: '92%', marginBottom: 14 }}>
      {!!entry.text && <Text style={{ color: entry.error ? colors.danger : colors.text, fontSize: 15 }}>{entry.text}</Text>}
      {missions.length > 0 && <Text style={[styles.body, { fontWeight: '600' }]}>✅ Added</Text>}
      {missions.map((m) => (
        <MissionCard key={m.id} mission={m} />
      ))}
      {clientIds.map((cid) => (
        <RunningTotal key={cid} clientId={cid} />
      ))}
      {entry.pending?.map((p) => <PendingClientCard key={p.key} entryId={entry.id} pending={p} />)}
      {entry.notes?.map((n, i) => (
        <Text key={i} style={[styles.muted, { marginTop: 6 }]}>
          ❓ {n}
        </Text>
      ))}
    </View>
  );
}

function RunningTotal({ clientId }: { clientId: string }) {
  const { state } = useStore();
  const client = state.clients.find((c) => c.id === clientId);
  const open = state.missions.filter((m) => m.clientId === clientId && m.status === 'confirmed' && m.unitPrice != null);
  const total = open.reduce((s, m) => s + Math.round((m.unitPrice ?? 0) * m.quantity), 0);
  if (!client || !open.length) return null;
  return (
    <Text style={[styles.muted, { marginTop: 6 }]}>
      Not yet invoiced for {client.name}: {formatMoney(total, state.business.currency)}
    </Text>
  );
}

function PendingClientCard({ entryId, pending }: { entryId: string; pending: PendingClient }) {
  const { state, dispatch } = useStore();
  const candidates = pending.candidateIds.length
    ? state.clients.filter((c) => pending.candidateIds.includes(c.id))
    : state.clients.slice(0, 6);
  return (
    <View style={{ backgroundColor: colors.warnSoft, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <Text style={styles.body}>
        {pending.isNew ? 'New client' : 'I don’t know'} “{pending.spokenName}” ({pending.items.length} mission
        {pending.items.length > 1 ? 's' : ''}). Who is it?
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Button small title={`Create “${pending.spokenName}”`} onPress={() => dispatch({ type: 'createClientForPending', entryId, key: pending.key })} />
        {candidates.map((c) => (
          <Button
            key={c.id}
            small
            variant="secondary"
            title={c.name}
            onPress={() => dispatch({ type: 'resolvePending', entryId, key: pending.key, clientId: c.id })}
          />
        ))}
      </View>
    </View>
  );
}
