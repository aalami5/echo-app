import { VoiceCallView, VoiceIconButton, voicePresentation } from '../components/VoiceCallView';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AssistantCamera } from '../components/AssistantCamera';
import { AssistantAttachmentTray } from '../components/AssistantAttachmentTray';
import { AssistantAttachment, MAX_ATTACHMENTS, prepareAttachment, uploadAttachments, removeLocalAttachments } from '../services/assistantMedia';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../constants/theme';
import { useChatStore } from '../stores/chatStore';
import { useRealtimeVoice, liveVoiceSession } from '../hooks/useRealtimeVoice';
import { ChatViewport } from '../components/ChatViewport';
import { assistantApi, AssistantMessage, Conversation, loadSubmissions, newSubmissionId, Submission, submit, visibleHistory, saveSubmission } from '../services/assistant';
import { createConversationTailCache } from '../services/conversationTailCache';

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
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [mediaPicking, setMediaPicking] = useState(false);
  const [mediaMenu, setMediaMenu] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [uploadProgress, setUploadProgress] = useState('');
  const mediaLock = useRef(false);
  const sendLock = useRef(false);
  const focused = useIsFocused();
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'projects' | 'activity' | 'memory' | 'legacy' | 'more' | null>(null);
  const [memory, setMemory] = useState<any>(null);
  const [memoryText, setMemoryText] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessages, setNewMessages] = useState(false);
  const [voiceView, setVoiceView] = useState(true);
  const [voiceCaption, setVoiceCaption] = useState('');
  const pendingVoice = useRef(false);
  const dismissSheet = () => { if (pendingVoice.current) { pendingVoice.current = false; setVoiceView(true); } };
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const list = useRef<FlatList<AssistantMessage>>(null);
  const atBottom = useRef(true);
  const alive = useRef(true);
  const selected = useRef(conversationId); selected.current = conversationId;
  const cursor = useRef({ epoch: '', after: 0 });
  const refreshing = useRef(false);
  const loadingEarlier = useRef(false);
  const [tailCache] = useState(() => createConversationTailCache(AsyncStorage));
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
      void tailCache.save(id, tail).catch(() => {});
      cursor.current = { epoch: e.epoch, after: e.cursor };
      for (const event of e.events || []) {
        if (!event.voice || event.at < liveVoiceSession.getSnapshot().startedAt) continue;
        if (event.state === 'output.text.done' && event.text) setVoiceCaption(event.text);
        if (event.state === 'error') setVoiceNotice(event.error);
        if (event.state === 'tool.call') setVoiceNotice('Echo is working on your request.');
        if (['tool.result', 'tool.error', 'output.text.done', 'session.closed'].includes(event.state)) setVoiceNotice(null);
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
  }, [tailCache]);
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
    let cacheReadActive = true;
    void tailCache.read(id).then(cached => {
      if (cacheReadActive && selected.current === id) setMessages(old => old.length ? old : cached);
    }).catch(() => {});
    void refresh(true);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 1800);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { cacheReadActive = false; clearInterval(timer); sub.remove(); };
  }, [conversationId, ready, refresh, tailCache]);
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
    if (voice.isActive || sending || uploading || mediaPicking || cameraOpen) { Alert.alert('Disconnect first', 'Each Live Voice connection stays with its selected conversation.'); return; }
    if (attachments.length || text.trim()) { Alert.alert('Keep your draft', 'Send your draft or clear it before switching conversations.'); return; }
    setDraftReady(false); await AsyncStorage.setItem(SELECTED, id); selected.current = id; setConversationId(id); setSheet(null);
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => { if (!focused || AppState.currentState === 'background') { setCameraOpen(false); setMediaMenu(false); } }, [focused, foreground]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        await draftWrites.current;
        const raw = await AsyncStorage.getItem(`echo-assistant-draft-${conversationId}`);
        const draft = raw ? JSON.parse(raw) : { text: '', attachments: [] };
        const pending = await loadSubmissions();
        const consumed = new Set(pending.filter(p => p.conversationId === conversationId).flatMap(p => p.attachmentIds));
        if (cancelled || selected.current !== conversationId) return;
        setText(typeof draft.text === 'string' ? draft.text : '');
        setAttachments((draft.attachments || []).filter((f: AssistantAttachment) => f.uri?.startsWith(`${FileSystem.documentDirectory}assistant-drafts/`) && !consumed.has(f.id)).slice(0, MAX_ATTACHMENTS));
      } catch { if (!cancelled) setMediaError('Could not restore your attachment draft. Please select the files again.'); }
      finally { if (!cancelled) setDraftReady(true); }
    })();
    return () => { cancelled = true; };
  }, [ready, conversationId]);
  useEffect(() => {
    if (!draftReady) return;
    const key = `echo-assistant-draft-${conversationId}`, value = JSON.stringify({ text, attachments });
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => AsyncStorage.setItem(key, value)).catch(() => { if (alive.current) setMediaError('Could not save this draft on your phone. Keep this screen open until you send it.'); });
  }, [draftReady, conversationId, text, attachments]);
  const mediaBusy = mediaPicking || uploading || sending || !draftReady;
  const addPhoto = async (asset: { uri: string; width: number; height: number; fileName?: string | null; mimeType?: string }) => {
    const prepared = await prepareAttachment({ ...asset, name: asset.fileName || 'Camera photo' }, true);
    setAttachments(old => [...old, prepared]);
  };
  const capturePhoto = async (photo: { uri: string; width: number; height: number }) => {
    if (mediaLock.current || sendLock.current || !draftReady) return;
    mediaLock.current = true; setMediaPicking(true);
    try { await addPhoto(photo); setCameraOpen(false); }
    finally { mediaLock.current = false; setMediaPicking(false); }
  };
  const openCamera = () => {
    if (mediaBusy || !ready) return;
    if (attachments.length >= MAX_ATTACHMENTS) { Alert.alert('Five attachments per message', 'Send or remove an attachment first.'); return; }
    setMediaMenu(false); setCameraOpen(true);
  };
  const pickMedia = async (source: 'files' | 'photos') => {
    if (mediaLock.current || sendLock.current || !ready || !draftReady) return;
    if (attachments.length >= MAX_ATTACHMENTS) { Alert.alert('Five attachments per message', 'Send or remove an attachment first.'); return; }
    mediaLock.current = true; setMediaPicking(true); setMediaMenu(false); setMediaError(null);
    try {
      const remaining = MAX_ATTACHMENTS - attachments.length;
      if (source === 'files') {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
        if (!result.canceled) for (const asset of result.assets.slice(0, remaining)) {
          const f = await prepareAttachment(asset, !!asset.mimeType?.startsWith('image/'));
          setAttachments(old => [...old, f]);
        }
      } else {
        // System photo picker grants access only to the chosen items; no broad library permission.
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1 });
        if (!result.canceled) for (const asset of result.assets.slice(0, remaining)) await addPhoto(asset);
      }
    } catch (e: any) { setMediaError(e.message || 'Could not open your photos. Try Files, or check photo access in Settings.'); }
    finally { mediaLock.current = false; setMediaPicking(false); }
  };
  const removeAttachment = (id: string) => {
    if (sendLock.current || mediaLock.current) return;
    const removed = attachments.filter(a => a.id === id);
    setAttachments(old => old.filter(a => a.id !== id)); void removeLocalAttachments(removed);
  };
  const send = async (retry?: Submission) => {
    if (!draftReady || sendLock.current || mediaLock.current || uploading || (!retry && !text.trim() && !attachments.length)) return;
    sendLock.current = true; setSending(true); setError(null); setMediaError(null);
    let item: Submission | undefined = retry;
    const files = attachments;
    const clearDraft = () => { setText(''); setAttachments([]); void removeLocalAttachments(files); };
    try {
      if (!item) {
        setUploading(files.length > 0);
        const ids = await uploadAttachments(conversationId, files, (done, total) => setUploadProgress(total ? `Uploading ${done}/${total}…` : ''));
        setUploading(false);
        item = { id: newSubmissionId(), conversationId, message: text.trim() || 'Please review the attached files.', attachmentIds: ids, mode: 'steer', state: 'pending' };
      }
      await submit(item);
      if (!retry) clearDraft();
      await refresh();
    } catch (e: any) {
      // Failed uploads retain local selections. An uncertain send retries the SAME receipt, never a duplicate.
      if (item) {
        const saved = await loadSubmissions();
        if (!retry && saved.some(i => i.id === item!.id)) clearDraft();
        setOutbox(saved.filter(i => i.conversationId === conversationId && i.state !== 'accepted'));
      }
      setMediaError(e.message);
    } finally { sendLock.current = false; setSending(false); setUploading(false); setUploadProgress(''); }
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
  const reconnect = () => { setError(null); void assistantApi('/bootstrap').then(b => { setConversations(b.conversations); setReady(true); setError(null); }).catch(e => setError(e.message)); };
  const active = activity.session?.hasActiveRun;
  const callActive = voice.isActive;
  const voiceState = voicePresentation(voice, !!active || voiceNotice === 'Echo is working on your request.');
  useEffect(() => { setVoiceCaption(''); }, [voice.startedAt]);
  const caption = callActive ? voiceCaption : undefined;
  const attachmentTray = <AssistantAttachmentTray files={attachments} disabled={mediaBusy} onRemove={removeAttachment}/>;
  const mediaControls = <View style={s.mediaMenu}>
    <Text style={s.subtle}>Add to Echo · {title}</Text>
    <View style={s.mediaIcons}>
      <VoiceIconButton icon="camera-outline" label="Camera" disabled={mediaBusy} onPress={openCamera}/>
      <VoiceIconButton icon="images-outline" label="Photo Library" disabled={mediaBusy} onPress={() => {void pickMedia('photos');}}/>
      <VoiceIconButton icon="document-outline" label="Files" disabled={mediaBusy} onPress={() => {void pickMedia('files');}}/>
      <VoiceIconButton icon="close" label="Cancel" onPress={() => setMediaMenu(false)}/>
    </View>
  </View>;
  const cameraPanel = cameraOpen && focused && foreground ? <AssistantCamera busy={mediaPicking} onCapture={capturePhoto} onClose={() => setCameraOpen(false)}/> : undefined;
  const voiceDraft = <>
    {mediaMenu && mediaControls}
    {attachmentTray}
    {mediaPicking && <Text style={s.subtle}>Preparing attachment…</Text>}
    {!!(mediaError || error) && ready && <Text accessibilityRole="alert" style={s.error}>{mediaError || error}</Text>}
    {outbox.length > 0 && <Button title="Delivery not confirmed · check in Text" onPress={() => setVoiceView(false)}/>}
    {(attachments.length > 0 || text.trim()) && <View><Text numberOfLines={2} style={s.subtle}>{text.trim() || `Send to Echo · ${title}`}</Text><Button primary title={sending ? uploadProgress || 'Sending…' : 'Send to Echo'} disabled={mediaBusy || !ready} onPress={() => {void send();}}/></View>}
  </>;
  return <ChatViewport>
    {voiceView ? <VoiceCallView visible={focused} title={title} voice={voice} working={!!active || voiceNotice === 'Echo is working on your request.'} ready={ready} connectionError={error} onRetry={reconnect} caption={caption} onText={() => {setCameraOpen(false);setMediaMenu(false);setVoiceView(false);}} onMore={() => setSheet('more')} onAttach={() => setMediaMenu(value => !value)} onHangUp={() => {setCameraOpen(false);setMediaMenu(false);void voice.stop();}} mediaDisabled={!ready || mediaBusy || cameraOpen} content={cameraPanel} draftContent={voiceDraft}/> : <>
    <ScrollView style={s.conversationControls} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => setSheet('projects')} accessibilityRole="button" accessibilityLabel="Select conversation" style={{ flex: 1 }}><Text style={s.heading}>Echo · {title} ▾</Text></TouchableOpacity>
      <VoiceIconButton icon="ellipsis-horizontal" label="More options" onPress={() => setSheet('more')}/>
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={callActive ? 'Return to Live Voice' : 'Open Live Voice'} onPress={() => setVoiceView(true)} style={s.voiceCard}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: voiceState.color }}/>
      <Text style={[s.voiceTitle, { flex: 1, marginBottom: 0 }]}>{callActive ? voiceState.label : 'Talk with Echo'}</Text>
      <Text style={s.subtle}>{callActive ? 'Live Voice' : 'Live Voice'} ›</Text>
    </TouchableOpacity>
    {(mediaError || error || voice.error || voiceNotice) && <Text accessibilityRole="alert" style={s.error}>{voice.error || mediaError || error || voiceNotice}</Text>}
    {!ready && <View style={s.connection}>{!error && <ActivityIndicator color={colors.primary}/>}<Button title="Reconnect" onPress={reconnect} /></View>}
    </ScrollView>
    {cameraPanel || <FlatList ref={list} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={s.messages} data={messages} keyExtractor={m => m.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      onScroll={e => { const n = e.nativeEvent; atBottom.current = n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 100; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (atBottom.current) list.current?.scrollToEnd({ animated: false }); else setNewMessages(true); }}
      ListHeaderComponent={historyMore ? <Button title="Load earlier messages" onPress={() => { void loadEarlier(); }} /> : null}
      ListEmptyComponent={ready ? <View style={s.empty}><Text style={s.body}>Start a conversation here or tap Live Voice. You can continue it later without starting over.</Text><Button title="Earlier chats on this phone" onPress={() => setSheet('legacy')} /></View> : null}
      renderItem={({ item }) => <TouchableOpacity activeOpacity={0.9} accessibilityHint="Long press for copy and share" onLongPress={() => Alert.alert('Message options', undefined, [{ text: 'Copy', onPress: () => { void Clipboard.setStringAsync(item.content); } }, { text: 'Share', onPress: () => { void Share.share({ message: item.content }); } }, { text: 'Cancel', style: 'cancel' }])} style={[s.message, item.role === 'user' && s.userMessage]}><Text style={s.role}>{item.role === 'user' ? 'You' : 'Echo'}</Text><MessageText text={item.content}/></TouchableOpacity>}
      ListFooterComponent={<View>
        {Object.entries(stream).map(([id, content]) => <View key={id} style={s.message}><Text style={s.role}>Echo · responding</Text><MessageText text={content}/></View>)}
        {outbox.map(item => <View key={item.id} style={s.message}><Text style={s.error}>Delivery not confirmed—check Activity before retrying.</Text><Text selectable style={s.body}>{item.message}</Text><Button disabled={sending} title="Check / retry same request" onPress={() => { void send(item); }}/></View>)}
        {(activity.artifacts || []).map((a: any) => <View key={a.id} style={s.message}><Text style={s.role}>File</Text><Button title={a.title} onPress={() => { void openArtifact(a); }}/></View>)}
        {active && <Text style={s.subtle}>Echo is working. You can add instructions, disconnect, or leave the app.</Text>}
      </View>}
    />}
    {newMessages && <Button title="Jump to latest" onPress={() => { atBottom.current = true; setNewMessages(false); list.current?.scrollToEnd({ animated: true }); }} />}
    <View testID="chat-composer" style={s.composer}>
      {mediaMenu && mediaControls}
      {attachmentTray}
      {(mediaPicking || uploading) && <Text style={s.subtle}>{uploadProgress || 'Preparing attachment…'}</Text>}
      <TextInput accessibilityLabel="Message Echo" editable={!sending && draftReady} style={[s.input, { minHeight: 44, maxHeight: 120 }]} multiline placeholder={active ? 'Add instructions to this work…' : 'Message Echo…'} placeholderTextColor={colors.textTertiary} value={text} onChangeText={setText} />
      <View style={s.row}><VoiceIconButton icon="add" label="Add attachment" disabled={!ready || mediaBusy || cameraOpen} onPress={() => setMediaMenu(value => !value)} /><View style={{ flex: 1 }}/><Button primary disabled={!ready || mediaBusy || (!text.trim() && !attachments.length)} title={sending ? 'Sending…' : active ? 'Add instructions' : 'Send'} onPress={() => { void send(); }} /></View>
    </View>
    </>}
    <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onDismiss={dismissSheet} onRequestClose={() => setSheet(null)}>
      <View style={[s.root, { padding: 20, paddingTop: 24, paddingBottom: Math.max(20, insets.bottom) }]}><View style={s.row}><Text style={[s.heading, { flex: 1 }]}>{sheet === 'more' ? 'More' : sheet === 'projects' ? 'Conversations' : sheet === 'memory' ? 'What Echo remembers' : sheet === 'legacy' ? 'Inbox & earlier chats' : 'Activity'}</Text><Button title="Done" onPress={() => setSheet(null)}/></View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {sheet === 'more' && <>
            <Button title={callActive ? 'Return to Live Voice' : 'Live Voice'} onPress={() => { pendingVoice.current = true; setSheet(null); if (Platform.OS !== 'ios') dismissSheet(); }}/>
            <Button title="Conversations" onPress={() => setSheet('projects')}/>
            <Button title={active ? 'Activity · working' : 'Activity'} onPress={() => setSheet('activity')}/>
            <Button title="Memory" onPress={() => { void openMemory(); }}/>
            <Button title="Inbox & earlier chats" onPress={() => setSheet('legacy')}/>
          </>}
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
          {sheet === 'legacy' && <><Text style={s.subtle}>Notifications and earlier chats are preserved here. They are not replayed as new requests. Previously unsaved voice conversations cannot be recovered.</Text>{legacy.map(m => <View key={m.id} style={s.message}><Text style={s.role}>{m.role === 'user' ? 'You' : 'Echo'}</Text><MessageText text={m.content}/></View>)}</>}
          {sheet === 'memory' && <>
            <Text style={s.body}>Relevant private conversations can inform your replies automatically. Group conversations and patient/report storage are separate. Voice conversations save text, not raw audio.</Text>
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
  mediaMenu: { padding: 10, borderRadius: 14, backgroundColor: colors.surface, marginBottom: 6 },
  mediaIcons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignItems: 'center', gap: 8, paddingTop: 8 },
  conversationControls: { flexGrow: 0, flexShrink: 1, maxHeight: '45%' },
  root: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  heading: { color: colors.textPrimary, fontSize: 21, fontWeight: '600' }, subtle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  voiceCard: { marginHorizontal: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surfaceElevated, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, voiceTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 5 },
  button: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceElevated, marginVertical: 4 }, primary: { backgroundColor: colors.primary }, buttonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  messages: { padding: 14, paddingBottom: 25 }, message: { padding: 14, backgroundColor: colors.bubbleEcho, borderRadius: 14, marginVertical: 7 }, userMessage: { backgroundColor: colors.bubbleUser, marginLeft: 28 }, role: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 }, body: { fontSize: 16, lineHeight: 25, color: colors.textPrimary }, link: { color: colors.primary, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, composer: { flexShrink: 0, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }, input: { color: colors.textPrimary, fontSize: 16, backgroundColor: colors.surface, padding: 12, borderRadius: 12, maxHeight: 160, marginVertical: 8 }, error: { color: colors.warning, padding: 12, fontSize: 14 }, empty: { padding: 25, gap: 20 }, connection: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
