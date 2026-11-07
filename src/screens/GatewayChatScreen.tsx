import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../components/Avatar';
import { NextMeeting } from '../components/NextMeeting';
import { ChatMessage } from '../components/ChatMessage';
import { ChatViewport } from '../components/ChatViewport';
import { AssistantAttachmentTray } from '../components/AssistantAttachmentTray';
import { useCalendar } from '../hooks/useCalendar';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { liveVoiceSession } from '../hooks/useRealtimeVoice';
import { colors } from '../constants/theme';
import type { Message } from '../types';
import { assistantApi, visibleHistory, loadSubmissions, newSubmissionId, saveSubmission, submit, Submission } from '../services/assistant';
import { boundedMessages } from '../services/chatUpdates';
import { linkedBriefId, OPENED_BRIEF_KEY } from '../services/briefNotification';
import { chatMessage, notificationInbox, readGatewayUpdates, readLinkedMessage, syncGatewayNotifications } from '../services/gatewayChat';
import { gatewayTimeline } from '../services/gatewayTimeline';
import { AssistantAttachment, prepareAttachment, uploadAttachments, removeLocalAttachments } from '../services/assistantMedia';
const DRAFT = 'echo-gateway-chat-draft-v110';
function Action({ label, icon, onPress, disabled = false }: { label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.action, disabled && { opacity: 0.45 }]}>
    {icon && <Ionicons name={icon} size={25} color={colors.textSecondary}/>}<Text style={s.label}>{label}</Text>
  </TouchableOpacity>;
}
export default function GatewayChatScreen() {
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ briefMessageId?: string; notificationMessageId?: string }>();
  const linked = linkedBriefId({ conversationId: 'home', chatMessageId: params.briefMessageId });
  const inboxRevision = useSyncExternalStore(notificationInbox.subscribe, notificationInbox.snapshot);
  const [history, setHistory] = useState<Message[]>([]), [updates, setUpdates] = useState<Message[]>([]), [inbox, setInbox] = useState<Message[]>([]);
  const [opened, setOpened] = useState<Message | null>(null), [outbox, setOutbox] = useState<Submission[]>([]);
  const [online, setOnline] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null), [notificationError, setNotificationError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false), [text, setText] = useState(''), [files, setFiles] = useState<AssistantAttachment[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingDraft = useRef<string | null>(null); pendingDraft.current = pendingId;
  const openedId = useRef<string | null>(null);
  const [draftReady, setDraftReady] = useState(false), [busy, setBusy] = useState(false), [working, setWorking] = useState(false);
  const [earlier, setEarlier] = useState(false), [more, setMore] = useState(false), [inboxMore, setInboxMore] = useState(false);
  const [newMessages, setNewMessages] = useState(false), [keyboard, setKeyboard] = useState(false);
  const alive = useRef(true), locked = useRef(false), refreshing = useRef(false), loadingUpdates = useRef(false);
  const page = useRef({ offset: 0, total: 0 }), inboxOffset = useRef(0), readingEarlier = useRef(false);
  const list = useRef<FlatList<Message>>(null), atBottom = useRef(true), input = useRef<TextInput>(null);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  useCalendar();
  const speech = useVoiceChat();
  const refresh = useCallback(async (reset = false) => {
    if (refreshing.current) return;
    refreshing.current = true; setLoading(true);
    try {
      const [h, activity, submissions] = await Promise.all([
        assistantApi('/conversations/home/history'),
        assistantApi('/conversations/home/activity'), loadSubmissions(),
      ]);
      if (!alive.current) return;
      if (h && (!readingEarlier.current || reset)) {
        setHistory(boundedMessages(visibleHistory(h.messages || [])).map(chatMessage));
        page.current = { offset: h.nextOffset || 0, total: h.totalMessages || 0 }; setMore(!!h.hasMore);
      }
      else if (h) {
        page.current.offset += Math.max(0, (h.totalMessages || 0) - page.current.total); page.current.total = h.totalMessages || 0;
      }
      const accepted = new Map((activity.submissions || []).filter((r: any) => r.state === 'accepted').map((r: any) => [r.id, r.receipt]));
      for (const row of submissions) if (row.state !== 'accepted' && accepted.has(row.id)) {
        row.state = 'accepted'; row.receipt = accepted.get(row.id); await saveSubmission(row);
      }
      if (pendingDraft.current && submissions.some(row => row.id === pendingDraft.current && row.state === 'accepted')) {
        setText(''); setFiles([]); setPendingId(null);
      }
      setOutbox(submissions.filter(row => row.conversationId === 'home' && row.state !== 'accepted'));
      setWorking(!!activity.session?.hasActiveRun); setOnline(true); setError(null);
    } catch (e: any) { if (alive.current) { setError(e.message); setOnline(false); } }
    finally { refreshing.current = false; if (alive.current) setLoading(false); }
  }, []);
  const refreshUpdates = useCallback(async () => {
    if (loadingUpdates.current) return;
    loadingUpdates.current = true;
    try {
      const rows = await readGatewayUpdates(() => alive.current);
      if (alive.current) { setUpdates(rows); setUpdateError(null); }
      // Keep discovered briefs available offline without reopening old caches.
      for (const row of rows) {
        if (!alive.current) break;
        const saved = await notificationInbox.get(row.id);
        if (!saved || saved.content !== row.content) await notificationInbox.put(row);
      }
    }
    catch (e: any) { if (alive.current) setUpdateError(e.message); }
    finally { loadingUpdates.current = false; }
  }, []);
  const sync = useCallback(async () => {
    try { await syncGatewayNotifications(); if (alive.current) setNotificationError(null); }
    catch (e: any) { if (alive.current) setNotificationError(e.message); }
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT);
        if (raw && raw.length > 64000) throw new Error('Saved Chat draft is too large. It has been preserved.');
        const draft = raw ? JSON.parse(raw) : {};
        if (current) { setText(typeof draft.text === 'string' ? draft.text : ''); setFiles(Array.isArray(draft.files) ? draft.files.slice(0, 5) : []); setShowInput(!!draft.text); setPendingId(typeof draft.pendingId === 'string' ? draft.pendingId : null); setDraftReady(true); }
      } catch (e: any) { if (current) setError(e.message); }
    })();
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    const value = JSON.stringify({ text, files, pendingId });
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => AsyncStorage.setItem(DRAFT, value)).catch(() => {
      if (alive.current) setError('Could not save your Chat draft. Keep this screen open.');
    });
  }, [draftReady, text, files, pendingId]);
  useEffect(() => {
    if (!focused) return;
    void refresh(); void refreshUpdates(); void sync();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 4000);
    const updatesTimer = setInterval(() => { if (AppState.currentState === 'active') { void refreshUpdates(); void sync(); } }, 60000);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { void refresh(); void refreshUpdates(); void sync(); }
    });
    return () => { clearInterval(timer); clearInterval(updatesTimer); foreground.remove(); };
  }, [focused, refresh, refreshUpdates, sync]);
  useEffect(() => {
    let current = true;
    void notificationInbox.page(readingEarlier.current ? inboxOffset.current : 0).then(p => {
      if (current) { setInbox(p.messages); setInboxMore(p.hasMore); if (!readingEarlier.current) inboxOffset.current = 0; }
    }).catch(e => { if (current) setNotificationError(e.message); });
    return () => { current = false; };
  }, [inboxRevision]);
  const openLinked = useCallback(async () => {
    const target = linked || params.notificationMessageId;
    if (!target || openedId.current === target) return;
    try {
      const row = linked ? await readLinkedMessage(linked) : await notificationInbox.get(params.notificationMessageId!);
      if (!row) throw new Error('This notification has not synced yet. Pull to refresh and try again.');
      if (alive.current) { openedId.current = target; setOpened(row); setError(null); if (linked) await AsyncStorage.setItem(OPENED_BRIEF_KEY, linked); }
    } catch (e: any) { if (alive.current) setError(e.message); }
  }, [linked, params.notificationMessageId]);
  useEffect(() => { void openLinked(); }, [openLinked, inboxRevision]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true)), hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const pending: Message[] = outbox.map(row => ({ id: row.id, role: 'user', content: `${row.message}\n\n${row.state === 'uncertain' ? 'Delivery not yet confirmed. Checking the existing receipt; not resending.' : 'Waiting for delivery confirmation.'}`, timestamp: new Date(Number(row.id.split('_')[1]) || 0).toISOString() }));
  const messages = gatewayTimeline(history, earlier ? inbox : [...updates, ...inbox], pending);
  const reversed = [...messages].reverse();
  const newest = reversed[0]?.id;
  useEffect(() => { if (atBottom.current && !earlier) list.current?.scrollToOffset({ offset: 0, animated: true }); else if (newest) setNewMessages(true); }, [newest]);
  const loadEarlier = async () => {
    if (refreshing.current) return;
    refreshing.current = true; setLoading(true);
    try {
      const h = more ? await assistantApi(`/conversations/home/history?offset=${page.current.offset}`) : null;
      const local = await notificationInbox.page(inboxOffset.current + inbox.length);
      if (!alive.current) return;
      readingEarlier.current = true; setEarlier(true);
      if (h) { setHistory(boundedMessages(visibleHistory(h.messages || [])).map(chatMessage)); page.current.offset = h.nextOffset || page.current.offset; setMore(!!h.hasMore); }
      else setHistory([]);
      inboxOffset.current += inbox.length; setInbox(local.messages); setInboxMore(local.hasMore); setError(null);
    } catch (e: any) { if (alive.current) setError(e.message); }
    finally { refreshing.current = false; if (alive.current) setLoading(false); }
  };
  const latest = async () => {
    readingEarlier.current = false; setEarlier(false); inboxOffset.current = 0; setNewMessages(false); atBottom.current = true;
    await refresh(true); const p = await notificationInbox.page(); setInbox(p.messages); setInboxMore(p.hasMore); void refreshUpdates();
  };
  const pickPhoto = async () => {
    if (locked.current || !draftReady || files.length >= 5) return;
    locked.current = true; setBusy(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 - files.length, quality: 1 });
      if (!picked.canceled) for (const asset of picked.assets.slice(0, 5 - files.length)) {
        const file = await prepareAttachment({ ...asset, name: asset.fileName || 'Photo' }, true); setFiles(old => [...old, file]);
      }
      setShowInput(true);
    } catch (e: any) { setError(e.message); }
    finally { locked.current = false; setBusy(false); }
  };
  const send = async () => {
    if (locked.current || !draftReady || pendingId || outbox.length || (!text.trim() && !files.length)) return;
    locked.current = true; setBusy(true);
    const body = text.trim() || 'Please review the attached photo.', selectedFiles = [...files];
    let attempted = false;
    try {
      await draftWrites.current;
      const ids = await uploadAttachments('home', selectedFiles, () => {});
      const item: Submission = { id: newSubmissionId(), conversationId: 'home', message: body, attachmentIds: ids, mode: 'followup', state: 'pending' };
      setPendingId(item.id);
      await (draftWrites.current = draftWrites.current.then(() => AsyncStorage.setItem(DRAFT, JSON.stringify({ text, files, pendingId: item.id }))));
      setOutbox(old => [...old, item]); attempted = true;
      await submit(item);
      setText(''); setFiles([]); setPendingId(null); await removeLocalAttachments(selectedFiles); await latest();
    } catch (e: any) {
      setError(e.message);
      if (attempted) {
        const saved = await loadSubmissions(); setOutbox(saved.filter(row => row.conversationId === 'home' && row.state !== 'accepted'));
        if (!saved.some(row => row.id === pendingDraft.current)) setPendingId(null);
      } else setPendingId(null);
    } finally { locked.current = false; setBusy(false); }
  };
  const readAloud = (body: string) => {
    if (['connecting', 'connected', 'reconnecting', 'paused', 'stopping'].includes(liveVoiceSession.getSnapshot().status)) { Alert.alert('Live is connected', 'End the Live call before playing a Chat message aloud.'); return; }
    if (speech.isSpeaking) void speech.stopSpeaking(); else void speech.speak(body).catch(e => setError(e.message));
  };
  const retry = () => { void refresh(); void refreshUpdates(); void sync(); void openLinked(); };
  return <ChatViewport>
    <View testID="gateway-chat-header" style={[s.header, keyboard && { paddingVertical: 6 }]}>
      {!keyboard && <View style={s.avatar}><Avatar state={working || busy ? 'thinking' : speech.isSpeaking ? 'speaking' : 'idle'} size={110}/></View>}
      <View style={s.online}><Ionicons name="wifi" size={19} color={online ? colors.primary : colors.textTertiary}/><View style={[s.dot, { backgroundColor: online ? colors.success : colors.textTertiary }]}/><Text style={s.label}>{online ? 'Online' : loading ? 'Connecting…' : 'Offline'}</Text></View>
      {!keyboard && <NextMeeting/>}
    </View>
    {!!(error || updateError || notificationError) && <View style={s.notice}><Text accessibilityRole="alert" style={s.error}>{error || updateError || notificationError}</Text><Action label="Retry" onPress={retry}/></View>}
    {opened && <View style={s.opened}><View style={s.notice}><Text style={s.label}>Opened notification</Text><Action label="Back to chat" onPress={() => setOpened(null)}/></View><FlatList data={[opened]} keyExtractor={r => r.id} renderItem={({ item }) => <ChatMessage message={item} onSpeak={readAloud}/>}/></View>}
    {!opened && <FlatList testID="gateway-chat-timeline" ref={list} data={reversed} inverted keyExtractor={row => row.id}
      contentContainerStyle={s.messages} renderItem={({ item }) => <ChatMessage message={item} onSpeak={readAloud}/>} keyboardShouldPersistTaps="handled"
      onScroll={e => { atBottom.current = e.nativeEvent.contentOffset.y < 80; }} scrollEventThrottle={100}
      refreshing={loading} onRefresh={retry}
      ListFooterComponent={(more || inboxMore) ? <Action label={loading ? 'Loading…' : 'Earlier messages'} disabled={loading} onPress={() => { void loadEarlier(); }}/> : null}
      ListEmptyComponent={<View style={s.empty}>{loading ? <ActivityIndicator color={colors.primary}/> : <Text style={s.label}>Your messages, morning briefs and reminders appear here.</Text>}</View>}/>
    }
    {(earlier || newMessages) && <Action label="Latest messages" onPress={() => { void latest().catch(e => setError(e.message)); }}/ >}
    {(!!outbox.length || !!pendingId) && <Action label="Check delivery" onPress={() => { void refresh(); }}/ >}
    {working && <Text style={s.thinking}>Echo is working…</Text>}
    <View style={s.composer}>
      <AssistantAttachmentTray files={files} disabled={busy} onRemove={id => {
        const removed = files.filter(f => f.id === id); setFiles(old => old.filter(f => f.id !== id)); void removeLocalAttachments(removed);
      }}/>
      {showInput && <View style={s.inputRow}><TextInput ref={input} accessibilityLabel="Message Echo" placeholder="Message Echo…" placeholderTextColor={colors.textTertiary} value={text} onChangeText={setText} multiline maxLength={8000} editable={draftReady && !busy && !pendingId && !outbox.length} style={s.input}/>
        <Action label={busy ? 'Sending…' : 'Send'} icon="arrow-up-circle" disabled={busy || !draftReady || !!pendingId || !!outbox.length || (!text.trim() && !files.length)} onPress={() => { void send(); }}/></View>}
      <View style={s.actions}><Action label="Photo" icon="image-outline" disabled={busy || !draftReady || files.length >= 5} onPress={() => { void pickPhoto(); }}/>
        <Action label={showInput ? 'Hide keyboard' : 'Type'} icon="keypad-outline" onPress={() => { if (showInput) { Keyboard.dismiss(); setShowInput(false); } else { setShowInput(true); setTimeout(() => input.current?.focus(), 50); } }}/></View>
    </View>
  </ChatViewport>;
}
const s = StyleSheet.create({
  header: { alignItems: 'center', paddingTop: 18, paddingBottom: 12, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { height: 145, justifyContent: 'center' }, online: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textSecondary, fontSize: 14 }, action: { minHeight: 44, minWidth: 60, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 8 },
  messages: { paddingVertical: 12 }, empty: { padding: 24, alignItems: 'center', transform: [{ scaleY: -1 }] },
  notice: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, error: { flex: 1, color: colors.error, fontSize: 13 },
  opened: { flex: 1 }, composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, input: { flex: 1, maxHeight: 120, minHeight: 48, borderRadius: 18, padding: 12, backgroundColor: colors.surface, color: colors.textPrimary, fontSize: 17 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 34 }, thinking: { color: colors.textSecondary, paddingHorizontal: 20, paddingVertical: 5 },
});
