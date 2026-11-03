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
import { BusinessSwitcher } from '../../components/BusinessSwitcher';
import { MissionCard } from '../../components/MissionCard';
import { Button, colors, styles } from '../../components/ui';
import { captureContext, isBackendConfigured, isDemoMode, sendCapture, transcribe } from '../../lib/api';
import { useMoney, useT } from '../../lib/i18n';
import { todayISO } from '../../lib/money';
import { businessById, type ChatEntry, type PendingClient, uid } from '../../lib/state';
import { useStore } from '../../lib/store';

export default function CaptureScreen() {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<false | 'transcribing' | 'reading'>(false);
  const [dictated, setDictated] = useState(false);
  const t = useT();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const listRef = useRef<FlatList<ChatEntry>>(null);

  const say = (text: string) =>
    dispatch({ type: 'addChat', entry: { id: uid('a_'), role: 'assistant', text, at: new Date().toISOString(), error: true } });

  const submit = async (input: { text: string }) => {
    const today = todayISO();
    const userEntry: ChatEntry = { id: uid('u_'), role: 'user', text: input.text, at: new Date().toISOString() };
    dispatch({ type: 'addChat', entry: userEntry });
    setBusy('reading');
    try {
      const res = await sendCapture(input, captureContext(state, today));
      dispatch({ type: 'applyCapture', userEntryId: userEntry.id, transcript: res.transcript || userEntry.text, items: res.items, today });
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const sendText = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    setDictated(false);
    submit({ text: value });
  };

  // Like dictation on a keyboard: speech becomes text in the box, the freelancer fixes it, then sends.
  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) return;
      setBusy('transcribing');
      try {
        const heard = (await transcribe(recorder.uri)).trim();
        if (heard) {
          setText((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard));
          setDictated(true);
        }
      } catch (e) {
        say(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (isDemoMode) {
      say('Voice notes need the real AI backend. In this demo, type your missions instead.');
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      say('Microphone access is needed to record voice notes.');
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
            {isDemoMode && (
              <View style={{ backgroundColor: colors.accentSoft, padding: 12, borderRadius: 12, marginBottom: 12 }}>
                <Text style={{ color: colors.accent }}>
                  {t('Demo mode: the AI is simulated with simple keyword matching. Type your missions, voice needs the real backend.')}
                </Text>
              </View>
            )}
            {!isBackendConfigured && !isDemoMode && (
              <View style={{ backgroundColor: colors.warnSoft, padding: 12, borderRadius: 12, marginBottom: 12 }}>
                <Text style={{ color: colors.warn }}>{t('The AI backend is not configured yet. See the README to add your Supabase URL and keys.')}</Text>
              </View>
            )}
            <BusinessSwitcher />
            {state.chat.length === 0 && (
              <Text style={styles.empty}>
                {t('Say or type what you did, like')}
                {'\n'}
                {t('“Chez Paul, a poster for the summer menu and a small revision on the wine list.”')}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ChatBubble entry={item} />}
      />
      {busy && (
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>{t(busy === 'transcribing' ? 'Transcribing…' : 'Reading your note…')}</Text>
      )}
      {dictated && !busy && !!text.trim() && (
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>{t('Check the text, then send.')}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={recorderState.isRecording ? t('Recording… {s}s · tap to stop', { s: seconds }) : t('Type a mission…')}
          placeholderTextColor={recorderState.isRecording ? colors.danger : colors.muted}
          editable={!recorderState.isRecording}
          multiline
          style={[styles.input, { flex: 1, maxHeight: 120 }]}
        />
        <Pressable
            accessibilityLabel={recorderState.isRecording ? 'Stop recording' : 'Record a voice note'}
            onPress={toggleRecording}
            disabled={!!busy}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: recorderState.isRecording ? colors.danger : text.trim() ? colors.card : colors.accent,
              borderWidth: 1,
              borderColor: recorderState.isRecording ? colors.danger : text.trim() ? colors.border : colors.accent,
              opacity: busy ? 0.4 : 1,
            }}
          >
            <Ionicons name={recorderState.isRecording ? 'stop' : 'mic'} size={22} color={text.trim() && !recorderState.isRecording ? colors.accent : '#fff'} />
          </Pressable>
          {!!text.trim() && !recorderState.isRecording && <Button title={t('Send')} onPress={sendText} disabled={!!busy} />}
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  const { state } = useStore();
  const t = useT();
  if (entry.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.userBubble, borderRadius: 16, padding: 12, marginBottom: 10 }}>
        <Text style={{ color: '#fff', fontSize: 15 }}>{entry.text}</Text>
      </View>
    );
  }
  const missions = state.missions.filter((m) => entry.missionIds?.includes(m.id));
  const totals = [...new Map(missions.map((m) => [`${m.clientId}|${m.businessId}`, m])).values()];
  return (
    <View style={{ alignSelf: 'flex-start', width: '92%', marginBottom: 14 }}>
      {!!entry.text && <Text style={{ color: entry.error ? colors.danger : colors.text, fontSize: 15 }}>{t(entry.text)}</Text>}
      {missions.length > 0 && <Text style={[styles.body, { fontWeight: '600' }]}>{t('✅ Added')}</Text>}
      {missions.map((m) => (
        <MissionCard key={m.id} mission={m} />
      ))}
      {totals.map((m) => (
        <RunningTotal key={`${m.clientId}|${m.businessId}`} clientId={m.clientId} businessId={m.businessId} />
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

function RunningTotal({ clientId, businessId }: { clientId: string; businessId: string }) {
  const { state } = useStore();
  const t = useT();
  const money = useMoney();
  const currency = businessById(state, businessId).currency;
  const client = state.clients.find((c) => c.id === clientId);
  const open = state.missions.filter((m) => m.clientId === clientId && m.businessId === businessId && m.status === 'confirmed' && m.unitPrice != null);
  const total = open.reduce((s, m) => s + Math.round((m.unitPrice ?? 0) * m.quantity), 0);
  if (!client || !open.length) return null;
  return (
    <Text style={[styles.muted, { marginTop: 6 }]}>
      {t('Not yet invoiced for {client}: {amount}', { client: client.name, amount: money(total, currency) })}
    </Text>
  );
}

function PendingClientCard({ entryId, pending }: { entryId: string; pending: PendingClient }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const candidates = pending.candidateIds.length
    ? state.clients.filter((c) => pending.candidateIds.includes(c.id))
    : state.clients.slice(0, 6);
  return (
    <View style={{ backgroundColor: colors.warnSoft, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <Text style={styles.body}>
        {t(pending.isNew ? 'New client “{name}” ({n} missions).' : 'I don’t know “{name}” ({n} missions). Who is it?', {
          name: pending.spokenName,
          n: pending.items.length,
        })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Button small title={t('Create “{name}”', { name: pending.spokenName })} onPress={() => dispatch({ type: 'createClientForPending', entryId, key: pending.key })} />
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
