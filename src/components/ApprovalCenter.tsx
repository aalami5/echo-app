import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApprovalGateway } from '../services/approvalGateway';
import { Approval, ApprovalActions, Decision, actionable, approvalFingerprint, briefState, pendingApprovals } from '../services/approvalProtocol';
import { BriefActions, listBriefs } from '../services/briefWorkflow';
import { useApprovalUiStore } from '../stores/approvalUiStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { colors } from '../constants/theme';

export function ApprovalCenter() {
  const owner = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const url = useSettingsStore(s => s.gatewayUrl), token = useSettingsStore(s => s.gatewayToken);
  if (!owner || !url || !token) return null;
  return <OwnerApprovals key={`${owner}|${url}|${token}`} owner={owner} url={url} token={token} />;
}

function OwnerApprovals({ owner, url, token }: { owner: string; url: string; token: string }) {
  const insets = useSafeAreaInsets();
  const { visible, open, close } = useApprovalUiStore();
  const gateway = useMemo(() => new ApprovalGateway(url, token, owner), [url, token, owner]);
  const actions = useMemo(() => new ApprovalActions(gateway), [gateway]);
  const briefs = useMemo(() => new BriefActions(gateway), [gateway]);
  const preferenceKey = `echo-approval-connection:${owner}:${url}`;
  const [mode, setMode] = useState<'off' | 'approvals' | 'manage'>('off');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [requests, setRequests] = useState<Approval[]>([]), [jobs, setJobs] = useState<any[]>([]), [grants, setGrants] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [gmail, setGmail] = useState('aalami@gmail.com'), [time, setTime] = useState('07:30');
  const [timezone, setTimezone] = useState('America/Los_Angeles'), [destination, setDestination] = useState('');
  const [showCreate, setShowCreate] = useState(false), [retry, setRetry] = useState(0), [clock, setClock] = useState(Date.now());
  const seen = useRef(new Set<string>()), alive = useRef(true), busyRef = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    alive.current = true;
    AsyncStorage.getItem(preferenceKey).then(value => { if (alive.current && (value === 'approvals' || value === 'manage')) setMode(value); }).catch(() => {});
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { alive.current = false; gateway.close(); subscription.remove(); useApprovalUiStore.getState().close(); };
  }, [gateway, preferenceKey]);

  useEffect(() => {
    let cancelled = false, refreshing = false;
    setReady(false); setRequests([]); setJobs([]); setGrants([]);
    const refresh = async () => {
      if (cancelled || refreshing || !gateway.ready) return;
      refreshing = true;
      try {
        const next = await pendingApprovals(gateway);
        if (cancelled) return;
        setRequests(next);
        for (const request of next) {
          const key = approvalFingerprint(request);
          if (!seen.current.has(key)) { seen.current.add(key); open(); }
        }
        if (gateway.scopes.includes('operator.admin')) {
          const [schedules, permissions] = await Promise.all([listBriefs(gateway), gateway.request('exec.approval.grants.list', { limit: 500 })]);
          if (!cancelled) { setJobs(schedules); setGrants(permissions.grants || []); }
        }
      } catch (e) {
        if (!cancelled) { setRequests([]); setJobs([]); setGrants([]); setError(String((e as Error).message)); }
      } finally { refreshing = false; }
    };
    refreshRef.current = refresh;
    gateway.onChange = () => {
      if (cancelled) return;
      setReady(gateway.ready);
      if (gateway.ready) void refresh();
      else { setRequests([]); setError('Approval connection closed. Reconnect to refresh.'); }
    };
    if (active && mode !== 'off') {
      setError('');
      gateway.connect(mode === 'manage').then(() => {
        if (cancelled) return;
        setReady(true); setDeviceId(gateway.deviceId); void refresh();
      }).catch(e => { if (!cancelled) { setDeviceId(gateway.deviceId); setError(e.message); } });
    }
    const timer = setInterval(() => { setClock(Date.now()); void refresh(); }, 3000);
    return () => { cancelled = true; clearInterval(timer); gateway.onChange = () => {}; gateway.close(); };
  }, [gateway, mode, active, retry, open]);

  const chooseMode = async (value: 'off' | 'approvals' | 'manage') => {
    await AsyncStorage.setItem(preferenceKey, value); // connection preference only; never approval authority
    if (!alive.current) return;
    setMode(value); setRetry(r => r + 1);
  };
  const run = async (fn: () => Promise<unknown>, message: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); if (alive.current) setNotice(message); }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { busyRef.current = false; if (alive.current) { setBusy(false); await refreshRef.current(); } }
  };
  const decide = (request: Approval, decision: Decision) => run(() => actions.decide(request, decision), decision === 'deny' ? 'Request denied.' : 'Permission recorded. Execution and delivery still need verification.');
  const button = (label: string, onPress: () => void, disabled = false, primary = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress} style={[s.button, primary && s.primary, (busy || disabled) && s.disabled]}><Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text></TouchableOpacity>;
  const input = (label: string, value: string, onChangeText: (v: string) => void) => <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy} autoCapitalize="none" autoCorrect={false} style={s.input} /></View>;

  return <>
    {!visible && requests.length > 0 && active && <TouchableOpacity accessibilityLabel="Review pending permission" onPress={open} style={[s.badge, { top: insets.top + 8 }]}><Text style={s.buttonText}>Permission needed · Review</Text></TouchableOpacity>}
    <Modal visible={visible && active} transparent animationType="slide" onRequestClose={close}>
      <View style={s.backdrop}>
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Permissions & briefs</Text>{button('Not now', close)}</View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <Text style={s.body}>Your voice call stays connected. Closing this sheet never approves a request.</Text>
            {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
            {!ready ? <View style={s.card}>
              <Text style={s.subtitle}>Connect this approval device</Text>
              <Text style={s.body}>Pair this device in your trusted OpenClaw dashboard. Chat access alone does not grant permission to approve actions.</Text>
              {!!deviceId && <Text selectable style={s.code}>Device: {deviceId}</Text>}
              {button(mode === 'off' ? 'Connect approvals' : 'Reconnect approvals', () => { void chooseMode(mode === 'off' ? 'approvals' : mode); })}
            </View> : <Text style={s.body}>Approval connection ready</Text>}
            {ready && requests.length === 0 && <Text style={s.body}>No pending requests. Policy-denied actions cannot be approved here.</Text>}
            {requests.map(request => <View key={request.id} style={s.card}>
              <Text style={s.subtitle}>Review exact action</Text>
              <Text style={s.body}>{request.presentation.host || 'Gateway'} · {request.presentation.agentId || 'Agent'}</Text>
              <Text selectable style={s.code}>{request.presentation.commandText}</Text>
              {!!request.presentation.warningText && <Text style={s.error}>{request.presentation.warningText}</Text>}
              <Text style={s.body}>Expires in {Math.max(0, Math.ceil((request.expiresAtMs - clock) / 1000))} seconds</Text>
              {request.presentation.scope?.kind === 'standing-grant' && <Text style={s.body}>Recurring permission: this exact operation for {request.presentation.scope.automation}. {request.presentation.scope.expiresInDays !== undefined ? `Valid for ${request.presentation.scope.expiresInDays} days.` : 'Valid until revoked.'} Changed operations may need approval again.</Text>}
              {request.presentation.allowedDecisions.includes('allow-once') && button('Approve once', () => { void decide(request, 'allow-once'); }, !actionable(request, clock), true)}
              {request.presentation.scope?.kind === 'standing-grant' && request.presentation.allowedDecisions.includes('allow-always') && button('Allow this recurring operation', () => { void decide(request, 'allow-always'); }, !actionable(request, clock), true)}
              {button('Deny', () => { void decide(request, 'deny'); }, !actionable(request, clock))}
            </View>)}
            <View style={s.card}>
              <Text style={s.subtitle}>Morning brief</Text>
              {mode !== 'manage' ? <>
                <Text style={s.body}>Schedule management requires additional administrator authority, confirmed in your trusted dashboard. Existing briefs will be checked before any new schedule is created.</Text>
                {button('Connect schedule management', () => { void chooseMode('manage'); })}
              </> : <>
                <Text style={s.body}>Read and summarize only. Recurring permissions are per operation, not blanket inbox access. Expired sign-in, changed operations or policy denials still need attention.</Text>
                {jobs.map(job => <View style={s.card} key={job.id}>
                  <Text style={s.subtitle}>{job.name}</Text>
                  <Text style={s.body}>{briefState(job, grants)}{job.schedule?.expr ? `\n${job.schedule.expr} · ${job.schedule.tz || 'Gateway time zone'}` : ''}</Text>
                  <Text style={s.body}>Delivery: {job.delivery?.channel || 'Unspecified'} · {job.delivery?.to || 'Unspecified'}</Text>
                  <Text style={s.body}>Last run: {job.state?.lastStatus || 'Not verified'} · Delivery: {job.state?.lastDeliveryStatus || 'Not verified'}</Text>
                  {button(job.enabled ? 'Pause brief' : 'Resume brief', () => { void run(() => briefs.setEnabled(job, !job.enabled), 'Schedule updated. Check its next run for delivery.'); }, !ready)}
                  {grants.filter(g => g.cronJobId === job.id && g.revokedAtMs === null).map(g => <View key={g.grantId}>
                    <Text selectable style={s.code}>{g.command}</Text>
                    {button('Revoke recurring permission', () => { void run(() => briefs.revoke(g.grantId), 'Permission revoked. Future runs need permission again.'); }, !ready)}
                  </View>)}
                </View>)}
                {ready && jobs.length === 0 && !showCreate && button('Set up a daily Gmail brief', () => setShowCreate(true))}
                {ready && jobs.length === 0 && showCreate && <>
                  {input('Gmail account', gmail, setGmail)}{input('Daily time (24-hour HH:MM)', time, setTime)}{input('Time zone', timezone, setTimezone)}{input('Your private WhatsApp number (+country code)', destination, setDestination)}
                  <Text style={s.body}>Gmail only; Stanford is not connected for this workflow. Up to 60 messages from the last 24 hours. No replies, forwarding or deletion. One daily summary goes to the private number above, even when Echo is closed. A genuine pending request may require one recurring-operation approval after scheduling.</Text>
                  {button('Schedule daily brief', () => { void run(async () => {
                    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Use HH:MM for the time.');
                    const [hour, minute] = time.split(':').map(Number);
                    await briefs.create({ hour, minute, timezone, gmail, includeStanford: false, destination });
                  }, 'Schedule recorded. Recurring permission and first delivery must still be confirmed.'); }, !ready, true)}
                </>}
              </>}
            </View>
            {ready && button('Refresh status', () => { void refreshRef.current(); })}
            {mode !== 'off' && button('Disconnect this approval connection', () => { void chooseMode('off'); })}
            <Text style={s.body}>Disconnecting does not revoke saved grants or pause schedules. Use their controls above first, or manage them in your trusted dashboard.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  sheet: { maxHeight: '88%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  content: { paddingBottom: 20, gap: 12 }, title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  subtitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '600' }, body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  error: { color: '#fca5a5', fontSize: 15, lineHeight: 22 }, label: { color: colors.textSecondary, marginTop: 8, marginBottom: 4 },
  code: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 }, card: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  input: { color: colors.textPrimary, backgroundColor: colors.background, borderRadius: 8, padding: 12, minHeight: 44 },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 22, backgroundColor: colors.surfaceElevated },
  buttonText: { color: colors.textPrimary, fontWeight: '600', textAlign: 'center' }, primary: { backgroundColor: colors.primary }, primaryText: { color: colors.textInverse }, disabled: { opacity: 0.4 },
  badge: { position: 'absolute', alignSelf: 'center', backgroundColor: colors.surfaceElevated, borderRadius: 20, padding: 12, zIndex: 100 },
});
