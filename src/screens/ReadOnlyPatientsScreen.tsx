import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, typography } from '../constants/theme';
import { useSettingsStore } from '../stores/settingsStore';
import { createPatientReader, displayedRows, patientSections, requestPatientMetadata, type PatientView, type SourceResult } from '../services/readOnlyPatients';

function sourceLabel(name: string, result: SourceResult) {
  return result.status === 'ready' ? `${name}: ${result.snapshot.rows.length} records · checked ${new Date(result.checkedAt).toLocaleTimeString()}` : `${name}: ${result.message}`;
}

export default function ReadOnlyPatientsScreen() {
  const gatewayUrl = useSettingsStore(state => state.gatewayUrl);
  const gatewayToken = useSettingsStore(state => state.gatewayToken);
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [view, setView] = useState<PatientView | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const reader = useRef<ReturnType<typeof createPatientReader> | null>(null);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    setView(null); setQuery('');
    if (!active || !focused) { setLoading(false); return; }
    setLoading(true);
    const current = createPatientReader({
      readLocal: () => SecureStore.getItemAsync('echo-patients'),
      readServer: signal => requestPatientMetadata(gatewayUrl || 'https://echo.oppersmedical.com', gatewayToken || '', signal),
    }, result => { setView(result); setLoading(false); });
    reader.current = current;
    void current.refresh();
    return () => { current.cancel(); reader.current = null; };
  }, [active, focused, gatewayUrl, gatewayToken]);

  const presentation = useMemo(() => {
    if (!view) return { sections: [], count: 0, error: '' };
    try {
      const rows = displayedRows(view);
      return { sections: patientSections(rows, query), count: rows.length, error: '' };
    } catch {
      return { sections: [], count: 0, error: 'The combined list exceeds the safe viewing limit. No records were truncated or changed.' };
    }
  }, [view, query]);
  const refresh = () => {
    if (!reader.current) return;
    setLoading(true); setView(null);
    void reader.current.refresh();
  };
  const hasReadableSource = view && (view.local.status === 'ready' || view.server.status === 'ready');
  // Do not leave patient text mounted behind another tab or while backgrounded.
  if (!active || !focused) return <SafeAreaView style={styles.screen} />;
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}>
      <View style={styles.heading}><Text style={styles.title}>Patients</Text>
        <TouchableOpacity onPress={refresh} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh patient list">
          <Text style={[styles.refresh, loading && styles.disabled]}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.notice}>Read-only view. Editing, reports and dictations remain paused. Saved records are not changed.</Text>
      {view && <>
        <Text style={styles.status}>{sourceLabel('Phone', view.local)}</Text>
        <Text style={styles.status}>{sourceLabel('Server', view.server)}</Text>
        {view.local.status === 'ready' && view.server.status === 'ready' &&
          <Text style={styles.status}>Phone edits and removal markers take precedence in this view.</Text>}
        {view.local.status !== 'ready' && view.server.status === 'ready' &&
          <Text style={styles.warning}>Server copy only. Phone edits and removals could not be checked; this may not match your phone’s last list.</Text>}
        {view.server.status !== 'ready' && view.local.status === 'ready' &&
          <Text style={styles.warning}>Phone copy only. Server records could not be checked.</Text>}
      </>}
      <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search patients, MRN, hospital or date"
        placeholderTextColor={colors.textTertiary} accessibilityLabel="Search read-only patients" autoCorrect={false} autoCapitalize="none" maxLength={200} />
      {!loading && hasReadableSource && !presentation.error && <Text style={styles.status}>{presentation.count} patients available to view</Text>}
      {!!presentation.error && <Text style={styles.warning}>{presentation.error}</Text>}
    </View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading patient metadata" color={colors.primary} /> :
      <SectionList sections={presentation.sections} keyExtractor={item => item.id}
        initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list} stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => <View style={styles.row}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.detail}>MRN: {item.mrn || 'Not recorded'}{item.room ? ` · Room: ${item.room}` : ''}</Text>
          {!!item.dob && <Text style={styles.detail}>DOB: {item.dob}</Text>}
          {!!item.chiefComplaint && <Text style={styles.detail}>{item.chiefComplaint}</Text>}
          <Text style={styles.status}>{item.source === 'phone' ? 'Phone record' : 'Server record'}</Text>
        </View>}
        ListEmptyComponent={<Text style={styles.empty}>{presentation.error ? 'List not displayed.' : !hasReadableSource ?
          'Patient records could not be loaded. Review the source status above, then try Refresh.' : query.trim() ?
            'No matches in the available records.' : 'No patients found in the sources successfully checked. See source status above.'}</Text>} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.sm }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '700' },
  refresh: { color: colors.primary, fontSize: typography.base, padding: spacing.sm }, disabled: { opacity: 0.4 },
  notice: { color: colors.textSecondary, fontSize: typography.sm }, status: { color: colors.textSecondary, fontSize: typography.xs },
  warning: { color: colors.textPrimary, fontSize: typography.sm },
  search: { color: colors.textPrimary, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 8, fontSize: typography.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: { color: colors.primary, backgroundColor: colors.background, paddingVertical: spacing.md, fontWeight: '600' },
  row: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  name: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: typography.sm }, empty: { color: colors.textSecondary, padding: spacing.lg },
});
