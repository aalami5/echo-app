import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../constants/theme';
import { useChatStore } from '../stores/chatStore';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { ChatViewport } from '../components/ChatViewport';
import { assistantApi, AssistantMessage, Conversation, loadSubmissions, newSubmissionId, Submission, submit, visibleHistory, saveSubmission } from '../services/assistant';

const SELECTED = 'echo-assistant-conversation-v1';
function Button({ title, onPress, disabled, primary }: { title: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, primary && s.primary, disabled && { opacity: 0.45 }]}><Text style={[s.buttonText, primary && { color: colors.textInverse }]}>{title}</Text></TouchableOpacity>;
}
function MessageText({ text }: { text: string }) {
  // Readable selectable text with safe, tappable web citations. Local results
  // are opened through authenticated artifact cards, never arbitrary file URLs.
  const parts = text.split(/(https?:\/\/[^\s<>\)\]]+)/g);
  return <Text selectable style={s.body}>{parts.map((p, i) => /^https?:\/\//.test(p) ? <Text key={i} style={s.link} onPress={() => { void Linking.openURL(p); }}>{p}</Text> : p)}</Text>;
}
export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const [conversationId, setConversationId] = useState('home');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [activity, setActivity] = useState<any>({ tasks: [], artifacts: [], session: {} });
  const [stream, setStream] = useState<Record<string, string>>({});
  const [outbox, setOutbox] = useState<Submission[]>([]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<{ id: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'projects' | 'activity' | 'memory' | 'legacy' | null>(null);
  const [memory, setMemory] = useState<any>(null);
  const [memoryText, setMemoryText] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessages, setNewMessages] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const list = useRef<FlatList<AssistantMessage>>(null);
  const atBottom = useRef(true);
  const alive = useRef(true);
  const selected = useRef(conversationId); selected.current = conversationId;
  const cursor = useRef({ epoch: '', after: 0 });
  const refreshing = useRef(false);
  const loadingEarlier = useRef(false);
  const historyPosition = useRef({ nextOffset: 0, total: 0, hasMore: false });
  const voice = useRealtimeVoice(conversationId);
  const legacy = useChatStore(st => st.messages);
  const legacyHydrated = useChatStore(st => st.hasHydrated);
  const title = conversations.find(c => c.id === conversationId)?.title || 'Home';
  const refresh = useCallback(async (initial = false) => {
    if (refreshing.current || loadingEarlier.current) return;
    refreshing.current = true; const id = selected.current;
    try {
      const [h, a, e, q] = await Promise.all([
        assistantApi(`/conversations/${id}/history`), assistantApi(`/conversations/${id}/activity`),
        assistantApi(`/conversations/${id}/events?epoch=${cursor.current.epoch}&after=${cursor.current.after}`), loadSubmissions(),
      ]);
      if (!alive.current || selected.current !== id) return;
      const tail = visibleHistory(h.messages || []);
      setMessages(old => {
        if (initial) return tail;
        const map = new Map(old.map(m => [m.id, m])); tail.forEach(m => map.set(m.id, m)); return [...map.values()];
      });
      const pos = historyPosition.current;
      if (initial || pos.nextOffset === 0) {
        pos.nextOffset = h.nextOffset || 0; pos.hasMore = !!h.hasMore;
      } else if (h.totalMessages >= pos.total) {
        pos.nextOffset += h.totalMessages - pos.total;
      } else { pos.nextOffset = h.nextOffset || 0; pos.hasMore = !!h.hasMore; }
      pos.total = h.totalMessages || 0;
      setHistoryMore(pos.hasMore); setHistoryCount(pos.nextOffset);
      const accepted = new Map((a.submissions || []).filter((r: any) => r.state === 'accepted').map((r: any) => [r.id, r.receipt]));
      for (const pending of q) if (pending.state !== 'accepted' && accepted.has(pending.id)) {
        pending.state = 'accepted'; pending.receipt = accepted.get(pending.id); await saveSubmission(pending);
      }
      setActivity(a); setOutbox(q.filter(x => x.conversationId === id && x.state !== 'accepted'));
      void AsyncStorage.setItem(`echo-assistant-tail-${id}`, JSON.stringify(tail)).catch(() => {});
      cursor.current = { epoch: e.epoch, after: e.cursor };
      for (const event of e.events || []) {
        if (!event.voice) continue;
        if (event.state === 'error') setVoiceNotice(event.error);
        if (event.state === 'tool.call') setVoiceNotice('Echo is working on your request.');
        if (event.state === 'output.text.done') setVoiceNotice(null);
      }
      setStream(old => {
        const next = e.reset ? {} : { ...old };
        for (const event of e.events || []) {
          if (!event.runId) continue;
          if (event.state === 'delta' && event.text) next[event.runId] = event.text;
          if (['final', 'error', 'aborted'].includes(event.state)) delete next[event.runId];
        }
        if (!a.session?.hasActiveRun) return {};
        return next;
      });
      setError(null);
    } catch (e: any) { if (alive.current && selected.current === id) setError(e.message); }
    finally { refreshing.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const b = await assistantApi('/bootstrap'); const saved = await AsyncStorage.getItem(SELECTED);
        if (!alive.current) return;
        setConversations(b.conversations); const id = b.conversations.some((c: Conversation) => c.id === saved) ? saved! : 'home';
        selected.current = id; setConversationId(id); setReady(true);
      } catch (e: any) { setError(e.message); }
    })();
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setMessages([]); setStream({}); setActivity({ tasks: [], artifacts: [], session: {} });
    setVoiceNotice(null);
    cursor.current = { epoch: '', after: 0 };
    historyPosition.current = { nextOffset: 0, total: 0, hasMore: false };
    const id = conversationId;
    void AsyncStorage.getItem(`echo-assistant-tail-${id}`).then(raw => {
      if (raw && selected.current === id) setMessages(old => old.length ? old : JSON.parse(raw));
    }).catch(() => {});
    void refresh(true);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 1800);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [conversationId, ready, refresh]);
  useEffect(() => {
    if (!ready || !legacyHydrated || !legacy.length) return;
    // Snapshot the legacy cache once, retaining the existing on-device copy.
    void (async () => {
      const marker = await AsyncStorage.getItem('echo-assistant-legacy-archived-v1'); if (marker) return;
      const r = await assistantApi('/legacy-history', { messages: legacy });
      await AsyncStorage.setItem('echo-assistant-legacy-archived-v1', r.migrationId);
    })().catch(() => { /* Original remains available; retry next mount. */ });
  }, [ready, legacyHydrated, legacy]);
  const selectConversation = async (id: string) => {
    if (id === conversationId) { setSheet(null); return; }
    if (voice.status === 'connected' || voice.status === 'connecting' || sending || uploading) { Alert.alert('End the call first', 'Each Live Voice call stays with its selected conversation.'); return; }
    if (attachments.length || text.trim()) { Alert.alert('Keep your draft', 'Send your draft or clear it before switching conversations.'); return; }
    await AsyncStorage.setItem(SELECTED, id); selected.current = id; setConversationId(id); setSheet(null);
  };
  const send = async (retry?: Submission) => {
    if (sending || uploading || (!retry && !text.trim() && !attachments.length)) return;
    const item = retry || { id: newSubmissionId(), conversationId, message: text.trim() || 'Please review the attached files.', attachmentIds: attachments.map(f => f.id), mode: 'steer' as const, state: 'pending' as const };
    setSending(true); setError(null);
    try {
      await submit(item);
      if (!retry) { setText(''); setAttachments([]); }
      await refresh();
    } catch (e: any) {
      const saved = await loadSubmissions();
      if (!retry && saved.some(i => i.id === item.id)) { setText(''); setAttachments([]); }
      setOutbox(saved.filter(i => i.conversationId === conversationId && i.state !== 'accepted'));
      setError(e.message);
    } finally { setSending(false); }
  };
  const pickFile = async () => {
    if (attachments.length >= 5) { Alert.alert('Five files per message', 'Send these files before adding more.'); return; }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true }); if (result.canceled) return;
    setUploading(true);
    try {
      for (const file of result.assets.slice(0, 5 - attachments.length)) {
        if ((file.size || 0) > 6 * 1024 * 1024) throw new Error(`${file.name} exceeds 6 MB.`);
        const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const u = await assistantApi('/uploads', { conversationId, idempotencyKey: newSubmissionId(), content, name: file.name, mimeType: file.mimeType });
        setAttachments(old => [...old, { id: u.id, fileName: u.fileName }]);
      }
    } catch (e: any) { setError(e.message); } finally { setUploading(false); }
  };
  const loadEarlier = async () => {
    if (loadingEarlier.current || refreshing.current) return;
    loadingEarlier.current = true;
    try {
      const id = conversationId; const h = await assistantApi(`/conversations/${id}/history?offset=${historyCount}`);
      if (selected.current !== id) return;
      const rows = visibleHistory(h.messages || []);
      setMessages(old => { const m = new Map(rows.map(r => [r.id, r])); old.forEach(r => m.set(r.id, r)); return [...m.values()]; });
      historyPosition.current = { nextOffset: h.nextOffset || 0, total: h.totalMessages || 0, hasMore: !!h.hasMore };
      setHistoryCount(h.nextOffset || 0); setHistoryMore(!!h.hasMore);
    } catch (e: any) { setError(e.message); } finally { loadingEarlier.current = false; }
  };
  const openArtifact = async (artifact: any) => {
    try {
      const r = await assistantApi(`/conversations/${conversationId}/artifacts/${encodeURIComponent(artifact.id)}`);
      if (r.encoding === 'base64' && r.data) {
        const name = String(artifact.title || 'Echo-result').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 140);
        const uri = `${FileSystem.cacheDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, r.data, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: artifact.mimeType });
      } else if (r.url && /^https:\/\//.test(r.url)) await Linking.openURL(r.url);
      else Alert.alert('Download not available', 'Ask Echo to attach a downloadable copy in this conversation.');
    } catch (e: any) { setError(e.message); }
  };
  const openMemory = async () => {
    setSheet('memory'); try { setMemory(await assistantApi('/memory')); } catch (e: any) { setError(e.message); }
  };
  const requestMemory = async (action: 'remember' | 'correct' | 'forget') => {
    if (!memoryText.trim() || memoryBusy) return;
    setMemoryBusy(true);
    try {
      await assistantApi('/memory/request', { action, text: memoryText.trim(), idempotencyKey: newSubmissionId() });
      setMemoryText(''); setSheet(null); await selectConversation('home');
      Alert.alert('Request accepted', 'Echo will confirm the actual memory change in Home. Forgetting memory does not automatically delete original chats or backups.');
    } catch (e: any) { setError(e.message); } finally { setMemoryBusy(false); }
  };
  const active = activity.session?.hasActiveRun;
  const callActive = voice.isConnected || voice.status === 'connecting';
  return <ChatViewport>
    <View style={s.header}>
      <TouchableOpacity onPress={() => setSheet('projects')} accessibilityRole="button"><Text style={s.heading}>Echo · {title} ▾</Text><Text style={s.subtle}>One conversation, voice or text</Text></TouchableOpacity>
      <Button title="Inbox" onPress={() => setSheet('legacy')} /><Button title={active ? 'Activity •' : 'Activity'} onPress={() => setSheet('activity')} />
    </View>
    <View style={s.voiceCard}>
      <View style={{ flex: 1 }}><Text style={s.voiceTitle}>{voice.isConnected ? (voice.muted ? 'Live Voice · muted' : 'Live Voice · connected') : voice.status === 'connecting' ? 'Connecting your conversation…' : 'Talk with Echo'}</Text><Text style={s.subtle}>{callActive ? 'Transcript saved as you talk. Interrupt naturally.' : 'Recent chats, memory and project context—together.'}</Text></View>
      {voice.isConnected && <Button title={voice.muted ? 'Unmute' : 'Mute'} onPress={voice.toggleMute} />}
      <Button primary title={callActive ? 'End call' : 'Live Voice'} disabled={!ready || voice.status === 'stopping' || !voice.isSupported} onPress={() => { void (callActive ? voice.stop() : voice.start()); }} />
    </View>
    {(error || voice.error || voiceNotice) && <Text accessibilityRole="alert" style={s.error}>{voice.error || error || voiceNotice}</Text>}
    {!ready && <View style={s.connection}>{!error && <ActivityIndicator color={colors.primary}/>}<Button title="Reconnect" onPress={() => { void assistantApi('/bootstrap').then(b => { setConversations(b.conversations); setReady(true); setError(null); }).catch(e => setError(e.message)); }} /></View>}
    <FlatList ref={list} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={s.messages} data={messages} keyExtractor={m => m.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      onScroll={e => { const n = e.nativeEvent; atBottom.current = n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 100; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (atBottom.current) list.current?.scrollToEnd({ animated: false }); else setNewMessages(true); }}
      ListHeaderComponent={historyMore ? <Button title="Load earlier messages" onPress={() => { void loadEarlier(); }} /> : null}
      ListEmptyComponent={ready ? <View style={s.empty}><Text style={s.body}>Start a conversation here or tap Live Voice. You can continue it later without starting over.</Text><Button title="Earlier chats on this phone" onPress={() => setSheet('legacy')} /></View> : null}
      renderItem={({ item }) => <View style={[s.message, item.role === 'user' && s.userMessage]}><Text style={s.role}>{item.role === 'user' ? 'You' : 'Echo'}</Text><MessageText text={item.content}/><View style={s.row}><Button title="Copy" onPress={() => { void Clipboard.setStringAsync(item.content); }} /><Button title="Share" onPress={() => { void Share.share({ message: item.content }); }} /></View></View>}
      ListFooterComponent={<View>
        {Object.entries(stream).map(([id, content]) => <View key={id} style={s.message}><Text style={s.role}>Echo · responding</Text><MessageText text={content}/></View>)}
        {outbox.map(item => <View key={item.id} style={s.message}><Text style={s.error}>Delivery not confirmed—check Activity before retrying.</Text><Text selectable style={s.body}>{item.message}</Text><Button disabled={sending} title="Check / retry same request" onPress={() => { void send(item); }}/></View>)}
        {(activity.artifacts || []).map((a: any) => <View key={a.id} style={s.message}><Text style={s.role}>File</Text><Button title={a.title} onPress={() => { void openArtifact(a); }}/></View>)}
        {active && <Text style={s.subtle}>Echo is working. You can add instructions, end the call, or leave the app.</Text>}
      </View>}
    />
    {newMessages && <Button title="Jump to latest" onPress={() => { atBottom.current = true; setNewMessages(false); list.current?.scrollToEnd({ animated: true }); }} />}
    <View testID="chat-composer" style={s.composer}>
      {attachments.length > 0 && <ScrollView style={{ maxHeight: 72 }} keyboardShouldPersistTaps="handled">{attachments.map(a => <TouchableOpacity key={a.id} onPress={() => setAttachments(old => old.filter(x => x.id !== a.id))}><Text style={s.subtle}>{a.fileName} · uploaded, not yet reviewed · remove ×</Text></TouchableOpacity>)}</ScrollView>}
      <TextInput accessibilityLabel="Message Echo" style={[s.input, { minHeight: 44, maxHeight: 120 }]} multiline placeholder={active ? 'Add instructions to this work…' : 'Message Echo…'} placeholderTextColor={colors.textTertiary} value={text} onChangeText={setText} />
      <View style={s.row}><Button title={uploading ? 'Uploading…' : 'Attach'} disabled={!ready || uploading} onPress={() => { void pickFile(); }} /><Button title="Memory" onPress={() => { void openMemory(); }} /><View style={{ flex: 1 }}/><Button primary disabled={!ready || sending || uploading || (!text.trim() && !attachments.length)} title={sending ? 'Sending…' : active ? 'Add instructions' : 'Send'} onPress={() => { void send(); }} /></View>
    </View>
    <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
      <View style={[s.root, { padding: 20, paddingTop: 24, paddingBottom: Math.max(20, insets.bottom) }]}><View style={s.row}><Text style={[s.heading, { flex: 1 }]}>{sheet === 'projects' ? 'Conversations' : sheet === 'memory' ? 'What Echo remembers' : sheet === 'legacy' ? 'Inbox & earlier chats' : 'Activity'}</Text><Button title="Done" onPress={() => setSheet(null)}/></View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {sheet === 'projects' && <>
            {conversations.map(c => <Button key={c.id} title={c.title} onPress={() => { void selectConversation(c.id); }} />)}
            <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="New conversation name" placeholderTextColor={colors.textTertiary}/>
            <Button title="New conversation" disabled={!newTitle.trim() || callActive} onPress={() => { void assistantApi('/conversations', { title: newTitle }).then(c => { setConversations(old => [...old, c]); setNewTitle(''); return selectConversation(c.id); }).catch(e => setError(e.message)); }}/>
            <Button title="Earlier phone history" onPress={() => setSheet('legacy')} />
          </>}
          {sheet === 'activity' && <>
            <Text style={s.body}>{active ? 'Active work in this conversation' : 'No active response in this conversation'}</Text>
            {(activity.session?.activeRunIds || []).map((id: string) => <View key={id} style={s.message}><Text style={s.subtle}>Running · {id.slice(0, 12)}</Text><Button title="Stop this task" onPress={() => Alert.alert('Stop this task?', 'Completed actions are not undone. Ending Live Voice is separate.', [{ text: 'Keep working', style: 'cancel' }, { text: 'Stop task', style: 'destructive', onPress: () => { void assistantApi(`/conversations/${conversationId}/stop`, { runId: id }).then(() => refresh()).catch(e => setError(e.message)); } }])} /></View>)}
            {(activity.tasks || []).map((t: any) => <View key={t.id} style={s.message}><Text style={s.voiceTitle}>{t.title || 'Echo task'}</Text><Text style={s.body}>{t.status}</Text>{t.summary && <Text style={s.subtle}>{t.summary}</Text>}</View>)}
            {(activity.submissions || []).map((r: any) => <View key={r.id} style={s.message}><Text style={s.subtle}>Request {r.id.slice(-8)} · {r.state === 'accepted' ? 'Accepted by Echo (not proof of completion)' : 'Acknowledgement uncertain; do not send a duplicate action'}</Text></View>)}
            <Text style={s.subtle}>This view uses actual session and task status. Accepted work can continue while the app is closed. Scheduled responsibilities remain managed by Echo; ask to review or change them.</Text>
          </>}
          {sheet === 'legacy' && <><Text style={s.subtle}>Notifications and earlier chats are preserved here. They are not replayed as new requests. Previously unsaved voice calls cannot be recovered.</Text>{legacy.map(m => <View key={m.id} style={s.message}><Text style={s.role}>{m.role === 'user' ? 'You' : 'Echo'}</Text><MessageText text={m.content}/></View>)}</>}
          {sheet === 'memory' && <>
            <Text style={s.body}>Relevant private conversations can inform your replies automatically. Group conversations and patient/report storage are separate. Calls save text, not raw audio.</Text>
            <TextInput style={[s.input, { minHeight: 90 }]} multiline value={memoryText} onChangeText={setMemoryText} placeholder="A fact to remember, correct, or forget…" placeholderTextColor={colors.textTertiary}/>
            <View style={s.row}>{(['remember', 'correct', 'forget'] as const).map(action => <Button key={action} title={action.charAt(0).toUpperCase() + action.slice(1)} disabled={memoryBusy || !memoryText.trim()} onPress={() => { void requestMemory(action); }} />)}</View>
            <Text style={s.subtle}>Echo confirms changes in Home. Forgetting a saved fact is different from deleting original conversations and backups. These are curated sources, not every searchable chat.</Text>
            {!memory && <ActivityIndicator color={colors.primary}/>}
            {(memory?.sources || []).map((source: any) => <View key={source.path} style={s.message}><Text style={s.role}>{source.path}</Text><MessageText text={source.text}/></View>)}
          </>}
        </ScrollView>
      </View>
    </Modal>
  </ChatViewport>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  heading: { color: colors.textPrimary, fontSize: 21, fontWeight: '600' }, subtle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  voiceCard: { marginHorizontal: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surfaceElevated, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, voiceTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 5 },
  button: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceElevated, marginVertical: 4 }, primary: { backgroundColor: colors.primary }, buttonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  messages: { padding: 14, paddingBottom: 25 }, message: { padding: 14, backgroundColor: colors.bubbleEcho, borderRadius: 14, marginVertical: 7 }, userMessage: { backgroundColor: colors.bubbleUser, marginLeft: 28 }, role: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 }, body: { fontSize: 16, lineHeight: 25, color: colors.textPrimary }, link: { color: colors.primary, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, composer: { flexShrink: 0, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }, input: { color: colors.textPrimary, fontSize: 16, backgroundColor: colors.surface, padding: 12, borderRadius: 12, maxHeight: 160, marginVertical: 8 }, error: { color: colors.warning, padding: 12, fontSize: 14 }, empty: { padding: 25, gap: 20 }, connection: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
