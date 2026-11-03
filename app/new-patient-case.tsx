import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNewPatientCasesStore } from '../src/stores/newPatientCasesStore';
import { HOSPITAL_LABELS, type Hospital } from '../src/services/readOnlyPatients';
import { validOperationDate } from '../src/services/newPatientCases';
import { colors } from '../src/constants/theme';

function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export default function NewPatientCaseScreen() {
  const router = useRouter(), params = useLocalSearchParams<{ list?: string }>();
  const [listing, setListing] = useState(params.list === '1');
  const [name, setName] = useState(''), [mrn, setMrn] = useState(''), [dob, setDob] = useState('');
  const [date, setDate] = useState(localDate), [hospital, setHospital] = useState<Hospital>('OTHER');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const starting = useRef(false);
  const { summaries, refresh, start } = useNewPatientCasesStore();
  const load = async () => { setBusy(true); setError(''); try { await refresh(); setLoaded(true); } catch { setError('Saved new dictations could not be loaded. No data was changed. Try again.'); } finally { setBusy(false); } };
  useEffect(() => { if (listing) void load(); }, [listing]);
  const begin = async () => {
    if (starting.current) return;
    if (!name.trim() || !mrn.trim() || !validOperationDate(date)) { setError('Enter the patient name, MRN and a valid operation date (YYYY-MM-DD).'); return; }
    starting.current = true; setBusy(true); setError('');
    try {
      const id = await start({ name, mrn, dob, room: '', chiefComplaint: '', hospital }, date);
      const patientId = useNewPatientCasesStore.getState().dictations[id].patientId;
      router.replace({ pathname: '/patient-dictation', params: { patientId, dictationId: id, mode: 'continue' } } as any);
    } catch { setError('Could not start a new case. If another case has unsaved changes, reopen it and Retry save first.'); }
    finally { starting.current = false; setBusy(false); }
  };
  return <SafeAreaView style={s.screen}>
    <View style={s.header}><TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Text style={s.link}>Back</Text></TouchableOpacity>
      <Text style={s.title}>{listing ? 'Saved new dictations' : 'Add patient & dictate'}</Text></View>
    <Text style={s.notice}>New cases are saved separately on this phone. Older patients and reports are not changed. New cases are not yet backed up to the server.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {listing ? <>
      <TouchableOpacity onPress={() => void load()} disabled={busy}><Text style={s.link}>Refresh</Text></TouchableOpacity>
      {busy && <ActivityIndicator />}
      <FlatList data={summaries} keyExtractor={item => item.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
        ListEmptyComponent={loaded && !error && !busy ? <Text style={s.notice}>No new dictations saved on this phone yet.</Text> : null}
        renderItem={({ item }) => <TouchableOpacity style={s.card} accessibilityRole="button" onPress={() => router.push({ pathname: '/patient-dictation', params: { patientId: item.patientId, dictationId: item.id, mode: item.status === 'final' ? 'view' : 'continue' } } as any)}>
          <Text style={s.title}>{item.name}</Text><Text style={s.label}>MRN {item.mrn} · {item.date} · {item.status === 'final' ? 'Final' : 'Draft'}</Text>
        </TouchableOpacity>} />
      <TouchableOpacity style={s.button} onPress={() => { setListing(false); setError(''); }}><Text style={s.buttonText}>Add patient & dictate</Text></TouchableOpacity>
    </> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40, gap: 10 }}>
        <Text style={s.label}>Patient name</Text><TextInput accessibilityLabel="Patient name" style={s.input} value={name} onChangeText={setName} maxLength={300} autoCorrect={false} />
        <Text style={s.label}>Medical record number</Text><TextInput accessibilityLabel="Medical record number" style={s.input} value={mrn} onChangeText={setMrn} maxLength={300} autoCorrect={false} autoCapitalize="none" />
        <Text style={s.label}>Date of birth (optional)</Text><TextInput accessibilityLabel="Date of birth" style={s.input} value={dob} onChangeText={setDob} maxLength={100} />
        <Text style={s.label}>Operation date (YYYY-MM-DD)</Text><TextInput accessibilityLabel="Operation date" style={s.input} value={date} onChangeText={setDate} maxLength={10} keyboardType="numbers-and-punctuation" />
        <Text style={s.label}>Hospital</Text><View style={{ gap: 8 }}>{Object.entries(HOSPITAL_LABELS).map(([id, label]) => <TouchableOpacity key={id} accessibilityRole="radio" accessibilityState={{ selected: hospital === id }} onPress={() => setHospital(id as Hospital)} style={[s.card, hospital === id && { borderColor: colors.primary, borderWidth: 1 }]}><Text style={s.label}>{hospital === id ? '● ' : '○ '}{label}</Text></TouchableOpacity>)}</View>
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={s.button} onPress={() => void begin()}><Text style={s.buttonText}>{busy ? 'Opening…' : 'Start dictation'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setListing(true); setError(''); }}><Text style={s.link}>Saved new dictations on this phone</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 18, gap: 12 }, header: { gap: 16 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '600' }, notice: { color: colors.textSecondary, fontSize: 13 },
  label: { color: colors.textPrimary, fontSize: 15 }, input: { backgroundColor: colors.surface, color: colors.textPrimary, padding: 12, borderRadius: 8 },
  link: { color: colors.primary, paddingVertical: 10 }, error: { color: colors.textPrimary, padding: 12, borderColor: colors.primary, borderWidth: 1 },
  card: { backgroundColor: colors.surface, padding: 12, borderRadius: 8, marginBottom: 6, gap: 6 },
  button: { backgroundColor: colors.primary, padding: 16, borderRadius: 10, marginTop: 10 }, buttonText: { color: colors.textInverse, fontWeight: '700', textAlign: 'center' },
});
