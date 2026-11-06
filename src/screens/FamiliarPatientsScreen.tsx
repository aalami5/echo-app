import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Modal, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, usePreventRemove } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../constants/theme';
import { useSettingsStore } from '../stores/settingsStore';
import { useNewPatientCasesStore } from '../stores/newPatientCasesStore';
import { usePatientScan } from '../hooks/usePatientScan';
import { usePatientVoiceInput } from '../hooks/usePatientVoiceInput';
import { createCaseRepository, validOperationDate, type CaseSummary } from '../services/newPatientCases';
import { createPatientReader, displayedRows, HOSPITAL_LABELS, requestPatientMetadata, type PatientView, type Hospital } from '../services/readOnlyPatients';
import { createPatientViewRepository, mergePatientView, patientListItems, type FamiliarPatient, type SavedPatient, type PatientListItem } from '../services/familiarPatients';
import { patientStyles as styles } from './patientStyles';

const repository = createPatientViewRepository(AsyncStorage), cases = createCaseRepository(AsyncStorage);
const commonComplaints = ['DVT consult','PE consult','LE bypass evaluation','Carotid stenosis','AAA evaluation','Claudication','Critical limb ischemia','Wound care','Dialysis access','AV fistula evaluation'];
const hospitalColors = { SEQ:'#10B981', ECH:'#3B82F6', SMCMC:'#F59E0B', Mills:'#8B5CF6', OTHER:'#6B7280' };
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function emptyPatient(): SavedPatient { return { id:`newpatient-${Crypto.randomUUID()}`,name:'',mrn:'',dob:'',room:'',chiefComplaint:'',hospital:'SEQ',date:localDate(),callDayId:`newday-${localDate()}`,timeSeen:new Date().toISOString() }; }
function statusText(view: PatientView | null) {
  if (!view) return 'Loading older patients…';
  return [ ['Phone',view.local], ['Server',view.server] ].map(([name,r]) => {
    const result = r as PatientView['local'];
    return `${name}: ${result.status === 'ready' ? `${result.snapshot.rows.length} patients checked` : result.message}`;
  }).join('\n');
}
export default function FamiliarPatientsScreen() {
  const router = useRouter(), focused = useIsFocused();
  const gatewayUrl = useSettingsStore(s=>s.gatewayUrl), gatewayToken = useSettingsStore(s=>s.gatewayToken);
  const [active,setActive] = useState(AppState.currentState === 'active');
  const [view,setView] = useState<PatientView|null>(null), [saved,setSaved] = useState<SavedPatient[]>([]), [summaries,setSummaries] = useState<CaseSummary[]>([]);
  const [loading,setLoading] = useState(true), [loadError,setLoadError] = useState(''), [details,setDetails] = useState(false);
  const [query,setQuery] = useState(''), [searching,setSearching] = useState(false), [expanded,setExpanded] = useState<Set<string>>(()=>new Set([localDate()]));
  const [quick,setQuick] = useState(false);
  const [form,setForm] = useState<SavedPatient|null>(null), [editing,setEditing] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const [choosingReports,setChoosingReports] = useState<FamiliarPatient|null>(null);
  const reader = useRef<ReturnType<typeof createPatientReader>|null>(null), generation = useRef(0), saving = useRef(false), formGeneration = useRef(0);
  const scan = usePatientScan(), voice = usePatientVoiceInput();
  const openPatients = useNewPatientCasesStore(s=>s.patients);
  const openDictations = useNewPatientCasesStore(s=>s.dictations);
  const caseSaving = useNewPatientCasesStore(s=>s.saving), caseError = useNewPatientCasesStore(s=>s.saveError);
  usePreventRemove(!!form || busy || voice.isRecording || voice.isTranscribing || scan.isProcessing, () => Alert.alert('Patient entry open', 'Save or cancel the patient entry before leaving.'));
  useEffect(()=> { const subscription=AppState.addEventListener('change',s=>setActive(s==='active')); return ()=>subscription.remove(); },[]);
  useEffect(()=> { if(scan.error) setError(scan.error); },[scan.error]);
  const refresh = () => {
    const request=++generation.current;
    setLoading(true);setLoadError('');setView(null);setSaved([]);setSummaries([]);
    reader.current?.cancel();
    reader.current=createPatientReader({ readLocal:()=>SecureStore.getItemAsync('echo-patients'),
      readServer:signal=>requestPatientMetadata(gatewayUrl || 'https://echo.oppersmedical.com',gatewayToken || '',signal) }, result=> { if(request===generation.current) setView(result); });
    void reader.current.refresh();
    void Promise.allSettled([repository.list(),cases.list()]).then(results=> {
      if(request!==generation.current) return;
      const [patients,reports]=results;
      if(patients.status==='fulfilled') setSaved(patients.value);
      if(reports.status==='fulfilled') setSummaries(reports.value);
      if(patients.status==='rejected'||reports.status==='rejected') setLoadError('Some saved work could not be loaded. Nothing was changed. Tap Refresh to try again.');
      setLoading(false);
    });
  };
  useEffect(()=> {
    setView(null);setSaved([]);setSummaries([]);
    if(active&&focused) refresh();
    return ()=> { ++generation.current;reader.current?.cancel();reader.current=null; };
  },[active,focused,gatewayUrl,gatewayToken]);
  const presentation=useMemo(()=> {
    try { const rows=mergePatientView(view ? displayedRows(view):[],saved,summaries.map(s=>!s.patient&&openPatients[s.patientId]&&openDictations[s.id]?{...s,patient:openPatients[s.patientId]}:s));return {rows,items:patientListItems(rows,expanded,query),error:''}; }
    catch { return {rows:[],items:[],error:'The patient list could not be displayed safely. No records were changed.'}; }
  },[view,saved,summaries,expanded,query,openPatients,openDictations]);
  const closeForm=()=> { if(saving.current||voice.isTranscribing||scan.isProcessing||scan.isScanning) return; ++formGeneration.current;void voice.cancelRecording();setForm(null);setError('');scan.clearScan(); };
  const openForm=(patient?:FamiliarPatient)=> {
    ++formGeneration.current;setError('');setQuick(false);setEditing(!!patient);
    if(patient && !patient.hospital) { Alert.alert('Open the saved report first','This older new-case entry has no hospital in its list metadata. Open its report to check patient details before editing.');return; }
    setForm(patient ? {id:patient.id,name:patient.name,mrn:patient.mrn,dob:patient.dob,room:patient.room,chiefComplaint:patient.chiefComplaint,hospital:patient.hospital!,date:patient.date,callDayId:patient.callDayId,timeSeen:patient.timeSeen}:emptyPatient());
  };
  const savePatient=async()=> {
    if(!form||saving.current||voice.isRecording||voice.isTranscribing||scan.isProcessing||scan.isScanning) return;
    if(!form.name.trim()||!form.mrn.trim()||!validOperationDate(form.date)) { setError('Enter a patient name, MRN and valid visit date (YYYY-MM-DD).');return; }
    saving.current=true;setBusy(true);setError('');
    const value={...form,name:form.name.trim(),mrn:form.mrn.trim()};
    try {
      await repository.save(value);
      setSaved(old=>[value,...old.filter(p=>p.id!==value.id)]);
      setExpanded(old=>new Set([...old,value.date]));setQuery('');setSearching(false);setForm(null);
    } catch { setError('Patient not saved. Your form is still here. Tap Save to retry.'); }
    finally { saving.current=false;setBusy(false); }
  };
  const scanPatient=async(camera:boolean)=> {
    const request=formGeneration.current;
    const result=await (camera ? scan.scanFromCamera():scan.scanFromLibrary());
    if(result&&request===formGeneration.current) setForm(old=>old?{...old,...Object.fromEntries(Object.entries(result).filter(([,v])=>!!v))}:old);
  };
  const dictateComplaint=async()=> {
    const request=formGeneration.current;
    if(voice.isRecording) { const text=await voice.stopAndTranscribe();if(text&&request===formGeneration.current) setForm(old=>old?{...old,chiefComplaint:[old.chiefComplaint,text].filter(Boolean).join(' ')}:old); }
    else await voice.startRecording();
  };
  const openReport=(summary:CaseSummary)=> { setChoosingReports(null);router.push({pathname:'/patient-dictation',params:{patientId:summary.patientId,dictationId:summary.id,mode:summary.status==='final'?'view':'continue'}} as any); };
  const chooseNewReport=async(reportPatient:FamiliarPatient)=> {
    if(saving.current||caseSaving||caseError) return;
    if(!reportPatient.hospital) {Alert.alert('Patient details needed','Edit this patient and choose a hospital before starting a report.');return;}
    saving.current=true;setBusy(true);setError('');
    try {
      const {reports,source,archived,date,...patient}=reportPatient;
      const id=await useNewPatientCasesStore.getState().startForPatient({...patient,hospital:reportPatient.hospital},'');
      setChoosingReports(null);
      router.push({pathname:'/patient-dictation',params:{patientId:patient.id,dictationId:id,mode:'new'}} as any);
    } catch {Alert.alert('Could not open report','Save any unfinished report and try again. Your saved reports have not been changed.');}
    finally {saving.current=false;setBusy(false);}
  };
  const exportPatients=async()=> {
    const escape=(value:string)=>'"'+(/^[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
    const csv=[['Date','Hospital','Name','MRN','DOB','Room','Chief Complaint'],...presentation.rows.map(p=>[p.date,p.hospital?HOSPITAL_LABELS[p.hospital]:'Not available',p.name,p.mrn,p.dob,p.room,p.chiefComplaint])].map(row=>row.map(escape).join(',')).join('\n');
    try { await Share.share({message:csv,title:'Patient List Export'}); } catch { Alert.alert('Could not share','The patient list was not changed. Please try again.'); }
  };
  const renderItem=({item,index}:{item:PatientListItem;index:number})=> {
    if(item.kind==='date') {const d=new Date(`${item.date}T12:00:00`);return <TouchableOpacity style={[styles.callDayHeader,{backgroundColor:colors.surface,borderTopLeftRadius:12,borderTopRightRadius:12},!expanded.has(item.date)&&!query.trim()&&{borderBottomLeftRadius:12,borderBottomRightRadius:12,marginBottom:spacing.md}]} accessibilityRole="button" accessibilityLabel={`Patients for ${item.date}`} accessibilityState={{expanded:expanded.has(item.date)||!!query.trim()}} onPress={()=>setExpanded(old=>{const next=new Set(old);next.has(item.date)?next.delete(item.date):next.add(item.date);return next;})}>
      <View style={styles.callDayInfo}><Text style={styles.callDayDate}>{d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</Text><Text style={styles.callDayDay}>{d.toLocaleDateString('en-US',{weekday:'long'})}</Text></View>
      <View style={styles.callDayRight}><Text style={styles.patientCount}>{item.count} patient{item.count===1?'':'s'}</Text><Ionicons name={expanded.has(item.date)||query.trim()?'chevron-up':'chevron-down'} size={20} color={colors.textSecondary}/></View>
    </TouchableOpacity>; }
    if(item.kind==='hospital') return <View style={{backgroundColor:colors.surface,paddingHorizontal:spacing.md,paddingTop:spacing.md}}><View style={styles.hospitalHeader}><View style={[styles.hospitalDot,{backgroundColor:item.hospital?hospitalColors[item.hospital]:colors.textTertiary}]}/><Text style={styles.hospitalName}>{item.hospital?HOSPITAL_LABELS[item.hospital]:'Hospital not available in list'}</Text><Text style={styles.hospitalCount}>({item.count})</Text></View></View>;
    const patient=item.patient, draft=patient.reports.find(r=>r.status==='draft'), report=draft||patient.reports[0];
    const label=report ? report.status==='final'?'View Report':report.hasContent===false?'Op Report':'Continue Report':'Op Report';
    const actionStyle=report?.status==='final'?styles.opReportButtonView:report&&report.hasContent!==false?styles.opReportButtonDraft:styles.opReportButton;
    const textStyle=report?.status==='final'?styles.opReportButtonTextView:report&&report.hasContent!==false?styles.opReportButtonTextDraft:styles.opReportButtonText;
    const last = !presentation.items[index+1] || presentation.items[index+1].kind === 'date';
    return <View style={[{backgroundColor:colors.surface,paddingHorizontal:spacing.md},last&&{paddingBottom:spacing.sm,marginBottom:spacing.md,borderBottomLeftRadius:12,borderBottomRightRadius:12}]}><View style={styles.patientRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit patient ${patient.name}`} onPress={()=>openForm(patient)}><Text style={styles.patientName} numberOfLines={2}>{patient.name}</Text></TouchableOpacity>
      <View style={styles.patientBadgeRow}>{!!patient.room&&<Text style={styles.patientRoom}>{patient.room}</Text>}
        <TouchableOpacity style={actionStyle} accessibilityRole="button" accessibilityLabel={`${label} for ${patient.name}`} disabled={busy||caseSaving||!!caseError} onPress={()=>report?patient.reports.length>1?setChoosingReports(patient):openReport(report):chooseNewReport(patient)}>
          {draft&&draft.hasContent!==false&&<View style={styles.draftDot}/>}<Ionicons name={report?.status==='final'?'document-text-outline':draft&&draft.hasContent!==false?'time-outline':'mic'} size={14} color={report?.status==='final'?colors.primary:colors.textInverse}/><Text style={textStyle}>{label}</Text>
        </TouchableOpacity><View style={{flex:1}}/><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit details for ${patient.name}`} onPress={()=>openForm(patient)} style={styles.patientEditIcon}><Ionicons name="pencil" size={16} color={colors.textTertiary}/></TouchableOpacity>
      </View><View style={styles.patientDetails}><Text style={styles.patientMRN}>MRN: {patient.mrn}</Text>{!!patient.dob&&<Text style={styles.patientDOB}>DOB: {patient.dob}</Text>}</View>
      {!!patient.chiefComplaint&&<Text style={styles.patientComplaint} numberOfLines={2}>{patient.chiefComplaint}</Text>}
      {patient.archived&&<Text style={styles.patientHospital}>Older reports are not available yet</Text>}
      {patient.reports.length>0&&<TouchableOpacity accessibilityRole="button" onPress={()=>setChoosingReports(patient)}><Text style={styles.patientHospital}>{patient.reports.length} saved report{patient.reports.length===1?'':'s'} on this phone</Text></TouchableOpacity>}
    </View></View>;
  };
  if(!focused||!active) return <SafeAreaView style={styles.container}/>;
  const mediaBusy=voice.isRecording||voice.isTranscribing||scan.isScanning||scan.isProcessing;
  return <SafeAreaView style={styles.container} edges={['top']}>
    <View style={styles.header}><Text style={styles.title}>Patients</Text><View style={styles.headerActions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search patients" style={styles.headerButton} onPress={()=>{setSearching(!searching);setQuery('');}}><Ionicons name={searching?'close':'search'} size={22} color={colors.textSecondary}/></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share patient list" style={styles.headerButton} disabled={loading||!view||!!loadError||!!presentation.error} onPress={()=>void exportPatients()}><Ionicons name="share-outline" size={22} color={colors.textSecondary}/></TouchableOpacity>
    </View></View>
    {searching&&<View style={[styles.searchContainer,{paddingBottom:spacing.sm}]}><View style={styles.searchInputContainer}><Ionicons name="search" size={18} color={colors.textTertiary}/><TextInput style={styles.searchInput} accessibilityLabel="Search by name or MRN" placeholder="Search by name or MRN..." placeholderTextColor={colors.textTertiary} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" maxLength={200}/></View></View>}
    <View style={{paddingHorizontal:spacing.lg,paddingBottom:spacing.sm}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Patient list details" onPress={()=>setDetails(true)}><Text style={{color:colors.textSecondary,fontSize:12}}>New work is saved on this phone. Older reports remain unavailable.</Text></TouchableOpacity>
      {!!(loadError||presentation.error)&&<Text accessibilityRole="alert" style={styles.voiceError}>{loadError||presentation.error}</Text>}
      {view&&view.local.status!=='ready'&&view.server.status==='ready'&&<Text style={styles.voiceError}>Server copy only. Phone edits and removals could not be checked.</Text>}
      {view&&view.local.status!=='ready'&&view.server.status!=='ready'&&<Text style={styles.voiceError}>Older patients could not be loaded. Open list details to check sources.</Text>}
      {view&&view.local.status==='ready'&&view.server.status!=='ready'&&<Text style={styles.patientHospital}>Phone copy only. Server records could not be checked.</Text>}
      {!!caseError&&<TouchableOpacity onPress={()=>void useNewPatientCasesStore.getState().retrySave().then(()=>refresh()).catch(()=>{})}><Text style={styles.voiceError}>Report not saved — Retry save</Text></TouchableOpacity>}
    </View>
    {(loading||!view)&&<ActivityIndicator accessibilityLabel="Loading patient list" color={colors.primary}/>}
    <FlatList data={presentation.items} keyExtractor={item=>item.key} renderItem={renderItem} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contentContainer} onRefresh={refresh} refreshing={loading}
      ListEmptyComponent={loading||!view?null:<View style={styles.emptyState}><Ionicons name="people-outline" size={48} color={colors.textTertiary}/><Text style={styles.emptyStateTitle}>{query?'No patients found':loadError||presentation.error?'Patient list unavailable':'No patients in the available sources'}</Text><Text style={styles.emptyStateSubtitle}>Use + to add a patient.</Text></View>}/>
    <TouchableOpacity style={styles.fab} accessibilityLabel="Add patient" accessibilityRole="button" onPress={()=>openForm()}><Ionicons name="add" size={28} color={colors.textInverse}/></TouchableOpacity>
    <Modal visible={!!form} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
      <View style={styles.modalContainer}><View style={styles.modalContent}><View style={styles.modalHeader}>
        <TouchableOpacity disabled={busy||voice.isTranscribing||scan.isProcessing} onPress={closeForm}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity><Text style={styles.modalTitle}>{editing?'Edit Patient':'Add Patient'}</Text>
        <TouchableOpacity disabled={busy||mediaBusy} onPress={()=>void savePatient()}><Text style={styles.modalSave}>{busy?'Saving…':'Save'}</Text></TouchableOpacity>
      </View>{form&&<KeyboardAwareScrollView style={styles.form} keyboardShouldPersistTaps="handled" extraScrollHeight={120} enableOnAndroid>
        {!!error&&<Text accessibilityRole="alert" style={styles.voiceError}>{error}</Text>}
        <Text style={styles.formLabel}>Hospital *</Text><View style={styles.hospitalPickerRow}><View style={styles.hospitalPicker}>{(Object.keys(HOSPITAL_LABELS) as Hospital[]).map(h=><TouchableOpacity key={h} accessibilityRole="radio" accessibilityState={{selected:form.hospital===h}} accessibilityLabel={HOSPITAL_LABELS[h]} style={[styles.hospitalOption,form.hospital===h&&styles.hospitalOptionSelected]} onPress={()=>setForm({...form,hospital:h})}><Text style={[styles.hospitalOptionText,form.hospital===h&&styles.hospitalOptionTextSelected]}>{h}</Text></TouchableOpacity>)}</View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Scan patient details" style={styles.scanButton} disabled={mediaBusy||busy} onPress={()=>Alert.alert('Scan Image','Review the extracted details before saving.',[{text:'Cancel',style:'cancel'},{text:'Take Photo',onPress:()=>void scanPatient(true)},{text:'Photo Library',onPress:()=>void scanPatient(false)}])}>{scan.isProcessing?<ActivityIndicator/>:<Ionicons name="camera" size={22} color={colors.primary}/>}</TouchableOpacity></View>
        {([['name','Patient Name *','Last, First'],['mrn','MRN *','Medical Record Number'],['dob','Date of Birth','MM/DD/YYYY'],['room','Room','e.g., CSU 2516-1, Room 302'],['date','Visit date *','YYYY-MM-DD']] as const).map(([key,label,placeholder])=><View key={key}><Text style={styles.formLabel}>{label}</Text><TextInput style={styles.formInput} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.textTertiary} value={form[key]} onChangeText={value=>setForm({...form,[key]:value})} maxLength={key==='date'?10:300} editable={!busy} autoCorrect={false}/></View>)}
        <View style={styles.formLabelRow}><Text style={styles.formLabel}>Chief Complaint</Text><TouchableOpacity style={styles.quickComplaintsToggle} onPress={()=>setQuick(!quick)}><Ionicons name={quick?'chevron-up':'flash'} size={16} color={colors.primary}/><Text style={styles.quickComplaintsToggleText}>Quick</Text></TouchableOpacity></View>
        {quick&&<View style={styles.quickComplaintsContainer}><Text style={styles.quickComplaintsSection}>Recent & Common</Text><View style={styles.quickComplaintsList}>{[...new Set([...presentation.rows.map(p=>p.chiefComplaint).filter(Boolean).slice(0,5),...commonComplaints])].map(complaint=><TouchableOpacity key={complaint} style={styles.quickComplaintChip} onPress={()=>setForm({...form,chiefComplaint:[form.chiefComplaint,complaint].filter(Boolean).join(', ')})}><Text style={styles.quickComplaintText}>{complaint}</Text></TouchableOpacity>)}</View></View>}
        <View style={styles.voiceInputContainer}><TextInput accessibilityLabel="Chief complaint" style={[styles.formInput,styles.formInputMultiline,styles.voiceInput]} placeholder="e.g., DVT consult, LE bypass evaluation" placeholderTextColor={colors.textTertiary} value={form.chiefComplaint} onChangeText={value=>setForm({...form,chiefComplaint:value})} maxLength={8192} multiline editable={!busy}/><TouchableOpacity accessibilityRole="button" accessibilityLabel={voice.isRecording?'Stop complaint dictation':'Dictate chief complaint'} style={[styles.voiceButton,voice.isRecording&&styles.voiceButtonRecording]} onPress={()=>void dictateComplaint()} disabled={voice.isTranscribing||busy||scan.isProcessing}><Ionicons name={voice.isRecording?'stop':'mic'} size={20} color={colors.primary}/></TouchableOpacity></View>
        {voice.isRecording&&<Text style={styles.recordingText}>Recording... {voice.duration}s</Text>}{voice.isTranscribing&&<Text style={styles.recordingText}>Transcribing…</Text>}{!!voice.error&&<Text style={styles.voiceError}>{voice.error}</Text>}
        <Text style={styles.patientHospital}>Saved on this phone. Existing reports keep their original patient details.</Text>
      </KeyboardAwareScrollView>}</View></View>
    </Modal>
    <Modal visible={!!choosingReports} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setChoosingReports(null)}><View style={styles.modalContainer}><View style={styles.modalHeader}><TouchableOpacity onPress={()=>setChoosingReports(null)}><Text style={styles.modalCancel}>Done</Text></TouchableOpacity><Text style={styles.modalTitle}>Patient Reports</Text></View>
      <FlatList data={choosingReports?.reports??[]} keyExtractor={r=>r.id} renderItem={({item})=><TouchableOpacity style={styles.patientRow} onPress={()=>openReport(item)}><Text style={styles.patientName}>{item.date || 'Operation date not selected'}</Text><Text style={styles.patientMRN}>{item.status==='final'?'View Report':'Continue Report'} · {item.name} · MRN {item.mrn}</Text></TouchableOpacity>}/>
      {choosingReports?.hospital&&<TouchableOpacity style={styles.opReportButton} onPress={()=>chooseNewReport(choosingReports)}><Text style={styles.opReportButtonText}>New Op Report</Text></TouchableOpacity>}
    </View></Modal>
    <Modal visible={details} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setDetails(false)}><View style={styles.modalContainer}><View style={styles.modalHeader}><TouchableOpacity onPress={()=>setDetails(false)}><Text style={styles.modalCancel}>Done</Text></TouchableOpacity><Text style={styles.modalTitle}>Patient List</Text></View><View style={styles.form}><Text style={styles.patientMRN}>{statusText(view)}</Text><Text style={styles.patientComplaint}>Phone edits take precedence. New patients, edits and reports are saved on this phone only. Older reports remain preserved but unavailable. Reports are not sent automatically.</Text><TouchableOpacity onPress={refresh}><Text style={styles.modalSave}>Refresh</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}
