/**
 * Patient-linked Operative Report Dictation (Modal)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';

import { colors, spacing, borderRadius, typography } from '../src/constants/theme';
import { usePatientsStore, HOSPITAL_NAMES } from '../src/stores/patientsStore';
import {
  usePatientDictationsStore,
  buildPatientDictationHeader,
  formatPatientDictationDate,
} from '../src/stores/patientDictationsStore';
import { useDictationStore, CustomProcedure, TranscriptPart } from '../src/stores/dictationStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { GatewayService } from '../src/services/gateway';
import { ElevenLabsService } from '../src/services/elevenlabs';
import { transcribeAudio } from '../src/services/whisper';
import { generateReport, regenerateWithCorrections, buildEmailMessage } from '../src/services/dictationService';
import { Avatar } from '../src/components/Avatar';
import { ImagePickerModal } from '../src/components/ImagePicker';
import {
  PROCEDURE_TEMPLATES,
  CATEGORY_LABELS,
  ProcedureCategory,
} from '../src/data/vascularProcedures';

const OLIVER_VOICE_ID = 'grLAj0YuamNRv9WBJxB4';
const ALL_CATEGORIES: ProcedureCategory[] = ['aortic', 'carotid', 'peripheral_arterial', 'venous', 'dialysis_access', 'other'];

type ScreenState = 'input' | 'generating' | 'review' | 'editing' | 'direct-editing';

type ScreenMode = 'new' | 'continue' | 'view';

const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractCptCodes = (report: string): string[] => {
  const matches = report.match(/\b\d{5}\b/g) || [];
  return Array.from(new Set(matches));
};

export default function PatientDictationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ patientId?: string; dictationId?: string; mode?: ScreenMode }>();

  const patientId = typeof params.patientId === 'string' ? params.patientId : '';
  const dictationId = typeof params.dictationId === 'string' ? params.dictationId : undefined;
  const mode: ScreenMode = (params.mode as ScreenMode) || 'new';

  const { patients } = usePatientsStore();
  const patient = patientId ? patients[patientId] : null;

  const {
    dictations,
    getDictationsForPatient,
    createDictation,
    updateDictation,
    finalizeDictation,
  } = usePatientDictationsStore();

  const {
    customProcedures,
    saveAsExample,
    addCustomProcedure,
    updateCustomProcedure,
    removeCustomProcedure,
  } = useDictationStore();

  const { gatewayUrl, gatewayToken, openaiApiKey, elevenlabsApiKey } = useSettingsStore();

  const activeDictation = dictationId ? dictations[dictationId] : null;
  const patientDictations = useMemo(() => (patientId ? getDictationsForPatient(patientId) : []), [getDictationsForPatient, patientId, dictations]);
  const isHistoryView = mode === 'view' && !dictationId;
  const isReadOnly = mode === 'view';

  const [screenState, setScreenState] = useState<ScreenState>('input');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editText, setEditText] = useState('');
  const [showAddProcedure, setShowAddProcedure] = useState(false);
  const [newProcName, setNewProcName] = useState('');
  const [newProcCategory, setNewProcCategory] = useState<ProcedureCategory>('other');
  const [editingCustomProc, setEditingCustomProc] = useState<CustomProcedure | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isReadingBack, setIsReadingBack] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const reviewScrollRef = useRef<ScrollView>(null);
  const ttsServiceRef = useRef<ElevenLabsService | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDictationRef = useRef<typeof activeDictation | null>(null);
  const pendingDuplicateSourceRef = useRef<string | null>(null);
  const lastAutosavedRef = useRef<string>('');
  const lastPartCountRef = useRef<number>(0);

  useEffect(() => {
    activeDictationRef.current = activeDictation || null;
  }, [activeDictation]);

  useEffect(() => {
    setEmailSent(false);
    setIsSendingEmail(false);
    setIsReadingBack(false);
  }, [activeDictation?.id]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeDictation || isReadOnly) return;
    const snapshot = JSON.stringify({
      transcriptParts: activeDictation.transcriptParts,
      selectedProcedures: activeDictation.selectedProcedures,
      generatedReport: activeDictation.generatedReport,
      dateOfOperation: activeDictation.dateOfOperation,
    });
    if (snapshot === lastAutosavedRef.current) return;

    const partCountChanged = activeDictation.transcriptParts.length !== lastPartCountRef.current;
    lastPartCountRef.current = activeDictation.transcriptParts.length;

    if (partCountChanged) {
      updateDictation(activeDictation.id, {
        transcriptParts: activeDictation.transcriptParts,
        selectedProcedures: activeDictation.selectedProcedures,
        generatedReport: activeDictation.generatedReport,
        dateOfOperation: activeDictation.dateOfOperation,
      });
      lastAutosavedRef.current = snapshot;
      return;
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const current = activeDictationRef.current;
      if (!current) return;
      updateDictation(current.id, {
        transcriptParts: current.transcriptParts,
        selectedProcedures: current.selectedProcedures,
        generatedReport: current.generatedReport,
        dateOfOperation: current.dateOfOperation,
      });
      lastAutosavedRef.current = snapshot;
    }, 10000);
  }, [activeDictation, isReadOnly, updateDictation]);

  // Ensure dictation exists for new mode without id (defensive)
  useEffect(() => {
    if (!patientId || dictationId || mode !== 'new') return;
    const newId = createDictation(patientId);
    router.replace({
      pathname: '/patient-dictation',
      params: { patientId, dictationId: newId, mode: 'new' },
    });
  }, [createDictation, dictationId, mode, patientId, router]);

  // Sync screen state with store
  useEffect(() => {
    if (!activeDictation) return;
    if (mode === 'view') {
      setScreenState(activeDictation.generatedReport ? 'review' : 'input');
      return;
    }
    if (isGenerating) setScreenState('generating');
    else if (activeDictation.generatedReport) {
      setScreenState('review');
      setTimeout(() => reviewScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    } else {
      setScreenState('input');
    }
  }, [activeDictation, isGenerating, mode]);

  // Ensure header transcript part exists and stays first
  useEffect(() => {
    if (!activeDictation || !patient) return;
    if (activeDictation.transcriptParts.length === 0 || !activeDictation.transcriptParts[0].content.startsWith('This is Dr. Aalami')) {
      const headerText = buildPatientDictationHeader(patient.name, patient.mrn, activeDictation.dateOfOperation);
      const headerPart: TranscriptPart = {
        id: `${Date.now()}-header`,
        type: 'text',
        content: headerText,
        timestamp: new Date().toISOString(),
      };
      updateDictation(activeDictation.id, {
        transcriptParts: [headerPart, ...activeDictation.transcriptParts],
      });
    }
  }, [activeDictation, patient, updateDictation]);

  const getGateway = useCallback(() => {
    if (!gatewayUrl || !gatewayToken) {
      Alert.alert('Setup Required', 'Please configure Gateway in Settings.');
      return null;
    }
    return new GatewayService({ baseUrl: gatewayUrl, token: gatewayToken } as any);
  }, [gatewayToken, gatewayUrl]);

  const getSuggestedProcedures = useCallback((chiefComplaint: string) => {
    const text = chiefComplaint.toLowerCase();
    const categories = new Set<string>();
    if (/\b(aaa|aneurysm|aortic)\b/.test(text)) categories.add('aortic');
    if (/\bcarotid\b/.test(text)) categories.add('carotid');
    if (/\b(pad|claudication|ischemia)\b/.test(text)) categories.add('peripheral_arterial');
    if (/\b(dialysis|fistula|graft)\b/.test(text)) categories.add('dialysis_access');
    if (/\b(dvt|varicose)\b/.test(text)) categories.add('venous');
    if (categories.size === 0) return [];
    return PROCEDURE_TEMPLATES
      .filter((proc) => categories.has(proc.category))
      .map((proc) => proc.name);
  }, []);

  // Bug fix: Do NOT auto-select procedures on new dictation.
  // Always start with zero procedures selected so the surgeon picks explicitly.

  const markAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const current = activeDictationRef.current;
      if (!current || isReadOnly) return;
      updateDictation(current.id, {
        transcriptParts: current.transcriptParts,
        selectedProcedures: current.selectedProcedures,
        generatedReport: current.generatedReport,
        dateOfOperation: current.dateOfOperation,
      });
    }, 10000);
  }, [isReadOnly, updateDictation]);

  // ─── Voice Recording ───
  const startRecording = async () => {
    if (isReadOnly) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Microphone access is required for dictation.');
        return;
      }
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {}
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      console.error('[PatientDictation] Failed to start recording', e);
      Alert.alert('Error', `Failed to start recording: ${e.message}`);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !activeDictation) return;
    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;
      if (!openaiApiKey) {
        Alert.alert('Setup Required', 'Please configure OpenAI API key in Settings.');
        return;
      }
      setIsTranscribing(true);
      const result = await transcribeAudio(uri, { apiKey: openaiApiKey });
      setIsTranscribing(false);
      if (result?.text?.trim()) {
        const part: TranscriptPart = {
          id: Date.now().toString(),
          type: 'voice',
          content: result.text.trim(),
          timestamp: new Date().toISOString(),
        };
        updateDictation(activeDictation.id, {
          transcriptParts: [...activeDictation.transcriptParts, part],
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => scrollViewRef.current?.scrollTo({ y: 0, animated: true }), 100);
      }
    } catch (e) {
      setIsTranscribing(false);
      console.error('[PatientDictation] Failed to stop/transcribe recording', e);
      Alert.alert('Error', 'Failed to transcribe audio.');
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // ─── Text Input ───
  const submitText = () => {
    if (!textDraft.trim() || !activeDictation) return;
    const part: TranscriptPart = {
      id: Date.now().toString(),
      type: 'text',
      content: textDraft.trim(),
      timestamp: new Date().toISOString(),
    };
    updateDictation(activeDictation.id, {
      transcriptParts: [...activeDictation.transcriptParts, part],
    });
    setTextDraft('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Image Input ───
  const handleImageSelected = (uri: string, base64?: string, mimeType?: string, caption?: string) => {
    if (!activeDictation) return;
    setShowImagePicker(false);
    const part: TranscriptPart = {
      id: Date.now().toString(),
      type: 'image',
      content: caption || 'Surgical image attached',
      imageBase64: base64,
      imageMimeType: mimeType,
      timestamp: new Date().toISOString(),
    };
    updateDictation(activeDictation.id, {
      transcriptParts: [...activeDictation.transcriptParts, part],
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Generate Report ───
  const handleGenerate = async () => {
    if (!activeDictation) return;
    const gw = getGateway();
    if (!gw) return;
    setIsGenerating(true);
    try {
      const report = await generateReport(gw, activeDictation.transcriptParts, activeDictation.selectedProcedures);
      updateDictation(activeDictation.id, { generatedReport: report });
    } catch (e: any) {
      console.error('[PatientDictation] Generate failed', e);
      Alert.alert('Error', e.message || 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Report Actions ───
  const handleEmail = async () => {
    if (!activeDictation?.generatedReport) return;
    const gw = getGateway();
    if (!gw || emailSent || isSendingEmail) return;
    setIsSendingEmail(true);
    try {
      const msg = buildEmailMessage(activeDictation.generatedReport, activeDictation.selectedProcedures);
      await gw.sendMessage(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEmailSent(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send email.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleReadBack = async () => {
    if (!activeDictation?.generatedReport || !elevenlabsApiKey) {
      Alert.alert('Setup Required', 'Please configure ElevenLabs API key in Settings.');
      return;
    }
    if (isReadingBack && ttsServiceRef.current) {
      await ttsServiceRef.current.stop();
      setIsReadingBack(false);
      return;
    }
    setIsReadingBack(true);
    try {
      const ttsService = new ElevenLabsService({ apiKey: elevenlabsApiKey, voiceId: OLIVER_VOICE_ID });
      ttsServiceRef.current = ttsService;
      await ttsService.speak({ text: activeDictation.generatedReport, voiceId: OLIVER_VOICE_ID });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to read back report.');
    } finally {
      setIsReadingBack(false);
      ttsServiceRef.current = null;
    }
  };

  const handleCopy = async () => {
    if (!activeDictation?.generatedReport) return;
    await Clipboard.setStringAsync(activeDictation.generatedReport);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Report copied to clipboard.');
  };

  const handleExportEncounter = async () => {
    if (!activeDictation?.generatedReport || !patient) return;
    const cptCodes = extractCptCodes(activeDictation.generatedReport);
    const exportText = [
      `Patient: ${patient.name}`,
      `MRN: ${patient.mrn}`,
      `DOB: ${patient.dob || 'Unknown'}`,
      `Date of Operation: ${formatPatientDictationDate(activeDictation.dateOfOperation)}`,
      `Hospital: ${HOSPITAL_NAMES[patient.hospital] || 'Unknown'}`,
      '',
      activeDictation.generatedReport,
      '',
      `CPT Codes: ${cptCodes.length > 0 ? cptCodes.join(', ') : 'None found'}`,
    ].join('\n');

    await Clipboard.setStringAsync(exportText);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Encounter bundle copied to clipboard.');
  };

  const handleEditRegenerate = () => {
    if (isReadOnly || !activeDictation?.generatedReport) return;
    Alert.alert('Edit Report', 'How would you like to edit?', [
      {
        text: 'Edit Text Directly',
        onPress: () => {
          setEditText(activeDictation.generatedReport || '');
          setScreenState('direct-editing');
        },
      },
      {
        text: 'Regenerate with AI',
        onPress: () => {
          setEditText('');
          setScreenState('editing');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveDirectEdit = () => {
    if (!activeDictation) return;
    if (editText.trim()) {
      updateDictation(activeDictation.id, { generatedReport: editText.trim() });
    }
    setScreenState('review');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRegenerate = async () => {
    if (!activeDictation?.generatedReport || !editText.trim()) return;
    const gw = getGateway();
    if (!gw) return;
    setScreenState('generating');
    setIsGenerating(true);
    try {
      const report = await regenerateWithCorrections(
        gw,
        activeDictation.generatedReport,
        editText.trim(),
        activeDictation.transcriptParts,
        activeDictation.selectedProcedures,
      );
      updateDictation(activeDictation.id, { generatedReport: report });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to regenerate.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveExample = () => {
    if (!activeDictation?.generatedReport) return;
    const procType = activeDictation.selectedProcedures.length > 0 ? activeDictation.selectedProcedures.join(', ') : 'General';
    saveAsExample(activeDictation.generatedReport, procType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', `Report saved as "${procType}" example.`);
  };

  const handleResetDraft = () => {
    if (!activeDictation || !patient) return;
    Alert.alert('Clear Draft', 'Clear transcript and start over?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          const headerText = buildPatientDictationHeader(patient.name, patient.mrn, activeDictation.dateOfOperation);
          const headerPart: TranscriptPart = {
            id: `${Date.now()}-header`,
            type: 'text',
            content: headerText,
            timestamp: new Date().toISOString(),
          };
          updateDictation(activeDictation.id, {
            transcriptParts: [headerPart],
            generatedReport: null,
            selectedProcedures: [],
          });
          setScreenState('input');
          setShowTextInput(false);
          setEmailSent(false);
        },
      },
    ]);
  };

  const handleFinalize = () => {
    if (!activeDictation) return;
    finalizeDictation(activeDictation.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const handleStartNewReport = (startFromPrevious: boolean) => {
    if (!patient) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newId = createDictation(patient.id);
    const suggested = patient.chiefComplaint ? getSuggestedProcedures(patient.chiefComplaint) : [];
    const now = new Date().toISOString();

    if (startFromPrevious && pendingDuplicateSourceRef.current) {
      const source = dictations[pendingDuplicateSourceRef.current];
      if (source?.generatedReport) {
        const baseParts = dictations[newId]?.transcriptParts || [];
        const nextParts = [
          ...baseParts,
          {
            id: `${Date.now()}-copy`,
            type: 'text',
            content: source.generatedReport,
            timestamp: now,
          } as TranscriptPart,
        ];
        updateDictation(newId, {
          transcriptParts: nextParts,
          selectedProcedures: suggested.length > 0 ? suggested : source.selectedProcedures,
        });
      }
    } else if (suggested.length > 0) {
      updateDictation(newId, { selectedProcedures: suggested });
    }

    pendingDuplicateSourceRef.current = null;
    setShowDuplicateModal(false);
    router.push({ pathname: '/patient-dictation', params: { patientId: patient.id, dictationId: newId, mode: 'new' } });
  };

  const openDuplicateModal = () => {
    const previous = patientDictations.find((d) => d.generatedReport);
    if (!previous) {
      handleStartNewReport(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pendingDuplicateSourceRef.current = previous.id;
    setShowDuplicateModal(true);
  };

  const updateOperationDate = (date: Date) => {
    if (!activeDictation || !patient) return;
    const iso = toISODate(date);
    const headerText = buildPatientDictationHeader(patient.name, patient.mrn, iso);
    const existingHeader = activeDictation.transcriptParts[0];
    const nextHeader: TranscriptPart = existingHeader
      ? { ...existingHeader, content: headerText }
      : {
          id: `${Date.now()}-header`,
          type: 'text',
          content: headerText,
          timestamp: new Date().toISOString(),
        };
    const rest = activeDictation.transcriptParts.slice(existingHeader ? 1 : 0);
    updateDictation(activeDictation.id, {
      dateOfOperation: iso,
      transcriptParts: [nextHeader, ...rest],
    });
    markAutosave();
  };

  const toggleProcedure = (name: string) => {
    if (!activeDictation || isReadOnly) return;
    const exists = activeDictation.selectedProcedures.includes(name);
    updateDictation(activeDictation.id, {
      selectedProcedures: exists
        ? activeDictation.selectedProcedures.filter((p) => p !== name)
        : [...activeDictation.selectedProcedures, name],
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markAutosave();
  };

  const removeTranscriptPart = (id: string, index: number) => {
    if (!activeDictation || isReadOnly) return;
    if (index === 0) return;
    updateDictation(activeDictation.id, {
      transcriptParts: activeDictation.transcriptParts.filter((p) => p.id !== id),
    });
    markAutosave();
  };

  // ─── Custom Procedure Management ───
  const handleAddCustomProcedure = () => {
    if (!newProcName.trim()) return;
    const proc: CustomProcedure = {
      id: Date.now().toString(),
      name: newProcName.trim(),
      category: newProcCategory,
      createdAt: new Date().toISOString(),
    };
    addCustomProcedure(proc);
    setNewProcName('');
    setNewProcCategory('other');
    setShowAddProcedure(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleLongPressCustom = (proc: CustomProcedure) => {
    if (isReadOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(proc.name, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit',
        onPress: () => {
          setEditingCustomProc(proc);
          setNewProcName(proc.name);
          setNewProcCategory(proc.category);
          setShowAddProcedure(true);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeCustomProcedure(proc.id);
          if (activeDictation?.selectedProcedures.includes(proc.name)) {
            toggleProcedure(proc.name);
          }
        },
      },
    ]);
  };

  const handleSaveEditedProcedure = () => {
    if (!newProcName.trim() || !editingCustomProc) return;
    const oldName = editingCustomProc.name;
    const newName = newProcName.trim();
    updateCustomProcedure(editingCustomProc.id, {
      name: newName,
      category: newProcCategory,
    });
    if (activeDictation?.selectedProcedures.includes(oldName) && oldName !== newName) {
      toggleProcedure(oldName);
      toggleProcedure(newName);
    }
    setEditingCustomProc(null);
    setNewProcName('');
    setNewProcCategory('other');
    setShowAddProcedure(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const renderProcedureTags = () => {
    if (!activeDictation) return null;
    return (
      <View style={styles.tagsSection}>
        <Text style={styles.tagsSectionTitle}>Procedures</Text>
        {ALL_CATEGORIES.map((cat) => {
          const builtInProcs = PROCEDURE_TEMPLATES.filter((p) => p.category === cat);
          const customProcs = customProcedures.filter((p) => p.category === cat);
          if (builtInProcs.length === 0 && customProcs.length === 0) return null;
          return (
            <View key={cat} style={styles.tagCategoryGroup}>
              <Text style={styles.tagCategoryLabel}>{CATEGORY_LABELS[cat]}</Text>
              <View style={styles.tagsRow}>
                {builtInProcs.map((proc) => {
                  const isSelected = activeDictation.selectedProcedures.includes(proc.name);
                  return (
                    <TouchableOpacity
                      key={proc.id}
                      style={[styles.tag, isSelected && styles.tagSelected]}
                      onPress={() => toggleProcedure(proc.name)}
                      disabled={isReadOnly}
                    >
                      <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                        {proc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {customProcs.map((proc) => {
                  const isSelected = activeDictation.selectedProcedures.includes(proc.name);
                  return (
                    <TouchableOpacity
                      key={proc.id}
                      style={[styles.tag, styles.tagCustom, isSelected && styles.tagSelected]}
                      onPress={() => toggleProcedure(proc.name)}
                      onLongPress={() => handleLongPressCustom(proc)}
                      disabled={isReadOnly}
                    >
                      <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                        {proc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
        {!isReadOnly && (
          <View style={styles.tagsRow}>
            <TouchableOpacity
              style={styles.tagAdd}
              onPress={() => {
                setEditingCustomProc(null);
                setNewProcName('');
                setNewProcCategory('other');
                setShowAddProcedure(true);
              }}
            >
              <Ionicons name="add" size={16} color={colors.primaryMuted} />
              <Text style={styles.tagAddText}>Add Procedure</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderAddProcedureModal = () => (
    <Modal
      visible={showAddProcedure}
      transparent
      animationType="slide"
      onRequestClose={() => { setShowAddProcedure(false); setEditingCustomProc(null); }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {editingCustomProc ? 'Edit Procedure' : 'Add Custom Procedure'}
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Procedure name"
            placeholderTextColor={colors.textTertiary}
            value={newProcName}
            onChangeText={setNewProcName}
            autoFocus
          />
          <Text style={styles.modalLabel}>Category</Text>
          <View style={styles.tagsRow}>
            {ALL_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.tag, newProcCategory === cat && styles.tagSelected]}
                onPress={() => setNewProcCategory(cat)}
              >
                <Text style={[styles.tagText, newProcCategory === cat && styles.tagTextSelected]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => { setShowAddProcedure(false); setEditingCustomProc(null); }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveButton, !newProcName.trim() && styles.sendButtonDisabled]}
              onPress={editingCustomProc ? handleSaveEditedProcedure : handleAddCustomProcedure}
              disabled={!newProcName.trim()}
            >
              <Text style={styles.modalSaveText}>
                {editingCustomProc ? 'Save' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!patientId || !patient) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Patient not found.</Text>
          <TouchableOpacity style={styles.generateButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.textInverse} />
            <Text style={styles.generateButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isHistoryView) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>{patient.name}</Text>
              <Text style={styles.headerSubtitle}>MRN {patient.mrn}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={openDuplicateModal}>
            <Ionicons name="add-circle" size={18} color={colors.primary} />
            <Text style={styles.headerActionText}>New Report</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {patientDictations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={42} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No reports yet</Text>
              <TouchableOpacity style={styles.generateButton} onPress={() => handleStartNewReport(false)}>
                <Ionicons name="mic" size={18} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Start Op Report</Text>
              </TouchableOpacity>
            </View>
          ) : (
            patientDictations.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.timelineItem}
                onPress={() => {
                  const nextMode = d.status === 'draft' ? 'continue' : 'view';
                  router.push({
                    pathname: '/patient-dictation',
                    params: { patientId: patient.id, dictationId: d.id, mode: nextMode },
                  });
                }}
              >
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineDate}>{formatPatientDictationDate(d.dateOfOperation)}</Text>
                  <View style={[styles.statusPill, d.status === 'final' ? styles.statusFinal : styles.statusDraft]}>
                    <Text style={styles.statusText}>{d.status === 'final' ? 'Final' : 'Draft'}</Text>
                  </View>
                </View>
                {d.selectedProcedures.length > 0 && (
                  <Text style={styles.timelineProcedures} numberOfLines={2}>
                    {d.selectedProcedures.join(', ')}
                  </Text>
                )}
                {d.generatedReport && (
                  <Text style={styles.timelinePreview} numberOfLines={2}>
                    {d.generatedReport}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {showDuplicateModal && (
          <Modal transparent animationType="fade" onRequestClose={() => setShowDuplicateModal(false)}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={80} tint="dark" style={styles.modalOverlayCenter}>
                <View style={styles.duplicateCard}>
                  <Text style={styles.duplicateTitle}>Start new report</Text>
                  <Text style={styles.duplicateSubtitle}>Would you like to copy the most recent report?</Text>
                  <View style={styles.duplicateActions}>
                    <TouchableOpacity style={styles.modalCancelButton} onPress={() => handleStartNewReport(false)}>
                      <Text style={styles.modalCancelText}>Start Fresh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSaveButton} onPress={() => handleStartNewReport(true)}>
                      <Text style={styles.modalSaveText}>Start from Previous</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={styles.modalOverlayCenter}>
                <View style={styles.duplicateCard}>
                  <Text style={styles.duplicateTitle}>Start new report</Text>
                  <Text style={styles.duplicateSubtitle}>Would you like to copy the most recent report?</Text>
                  <View style={styles.duplicateActions}>
                    <TouchableOpacity style={styles.modalCancelButton} onPress={() => handleStartNewReport(false)}>
                      <Text style={styles.modalCancelText}>Start Fresh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSaveButton} onPress={() => handleStartNewReport(true)}>
                      <Text style={styles.modalSaveText}>Start from Previous</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </Modal>
        )}
      </SafeAreaView>
    );
  }

  if (!activeDictation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Dictation not found.</Text>
          <TouchableOpacity style={styles.generateButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.textInverse} />
            <Text style={styles.generateButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const displayDate = formatPatientDictationDate(activeDictation.dateOfOperation);
  const selectedProcedures = activeDictation.selectedProcedures;
  const transcriptParts = activeDictation.transcriptParts;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>{patient.name}</Text>
              <Text style={styles.headerSubtitle}>MRN {patient.mrn}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.datePill}
              onPress={() => setShowDatePicker(true)}
              disabled={isReadOnly}
            >
              <Ionicons name="calendar" size={14} color={isReadOnly ? colors.textTertiary : colors.primary} />
              <Text style={[styles.datePillText, isReadOnly && styles.datePillTextDisabled]}>{displayDate}</Text>
            </TouchableOpacity>
            {!isReadOnly && (transcriptParts.length > 1 || activeDictation.generatedReport) && (
              <TouchableOpacity onPress={handleResetDraft} style={styles.headerButton}>
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {showDatePicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
              <BlurView intensity={70} tint="dark" style={styles.modalOverlayCenter}>
                <View style={styles.datePickerCard}>
                  <DateTimePicker
                    value={new Date(activeDictation.dateOfOperation + 'T00:00:00')}
                    mode="date"
                    display="inline"
                    onChange={(event, date) => {
                      if (date) updateOperationDate(date);
                    }}
                  />
                  <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.modalSaveText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Modal>
          ) : (
            <DateTimePicker
              value={new Date(activeDictation.dateOfOperation + 'T00:00:00')}
              mode="date"
              display="calendar"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) updateOperationDate(date);
              }}
            />
          )
        )}

        {/* ─── INPUT STATE ─── */}
        {screenState === 'input' && (
          <ScrollView ref={scrollViewRef} style={styles.flex} contentContainerStyle={styles.scrollContent}>
            {isTranscribing && (
              <View style={styles.transcribingBanner}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.transcribingText}>Transcribing audio...</Text>
              </View>
            )}
            {transcriptParts.length === 1 && !isTranscribing && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Start by selecting procedures below,</Text>
                <Text style={styles.emptyText}>then tap the avatar to dictate</Text>
              </View>
            )}

            {transcriptParts.map((part, index) => (
              <View key={part.id} style={styles.transcriptCard}>
                <View style={styles.transcriptCardHeader}>
                  <Ionicons
                    name={part.type === 'voice' ? 'mic' : part.type === 'image' ? 'camera' : 'text'}
                    size={16}
                    color={colors.primaryMuted}
                  />
                  <Text style={styles.transcriptType}>{index === 0 ? 'header' : part.type}</Text>
                  {!isReadOnly && index !== 0 && (
                    <TouchableOpacity
                      onPress={() => removeTranscriptPart(part.id, index)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.transcriptText}>{part.content}</Text>
              </View>
            ))}

            {transcriptParts.length > 1 && !isReadOnly && (
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerate}>
                <Ionicons name="document-text" size={20} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Generate Report</Text>
              </TouchableOpacity>
            )}

            {renderProcedureTags()}

            {selectedProcedures.length > 0 && (
              <View style={styles.selectedSummary}>
                <Text style={styles.selectedSummaryText}>
                  Selected: {selectedProcedures.join(', ')}
                </Text>
              </View>
            )}

            {showTextInput && !isReadOnly && (
              <View style={styles.textInputRow}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type additional notes..."
                  placeholderTextColor={colors.textTertiary}
                  value={textDraft}
                  onChangeText={setTextDraft}
                  multiline
                  autoFocus
                  onFocus={() => {
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendButton, !textDraft.trim() && styles.sendButtonDisabled]}
                  onPress={submitText}
                  disabled={!textDraft.trim()}
                >
                  <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* ─── GENERATING STATE ─── */}
        {screenState === 'generating' && (
          <View style={styles.generatingContainer}>
            <Avatar state="thinking" size={80} />
            <Text style={styles.generatingText}>Generating operative report...</Text>
            <Text style={styles.generatingSubtext}>Matching CPT/ICD-10 codes and formatting report...</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          </View>
        )}

        {/* ─── REVIEW STATE ─── */}
        {screenState === 'review' && activeDictation.generatedReport && (
          <ScrollView ref={reviewScrollRef} style={styles.flex} contentContainerStyle={styles.scrollContent}>
            <View style={styles.reportCard}>
              <Text style={styles.reportText} selectable>{activeDictation.generatedReport}</Text>
            </View>

            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, emailSent && styles.actionButtonSent]}
                onPress={handleEmail}
                disabled={emailSent || isSendingEmail}
              >
                {isSendingEmail ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={emailSent ? 'checkmark-circle' : 'mail'}
                    size={22}
                    color={emailSent ? '#22c55e' : colors.primary}
                  />
                )}
                <Text style={[styles.actionLabel, emailSent && styles.actionLabelSent]}>
                  {isSendingEmail ? 'Sending...' : emailSent ? 'Email Sent' : 'Email'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, isReadingBack && styles.actionButtonActive]}
                onPress={handleReadBack}
              >
                {isReadingBack ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="volume-high" size={22} color={colors.primary} />
                )}
                <Text style={styles.actionLabel}>
                  {isReadingBack ? 'Playing...' : 'Read Back'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
                <Ionicons name="copy" size={22} color={colors.primary} />
                <Text style={styles.actionLabel}>Copy</Text>
              </TouchableOpacity>
              {!isReadOnly && (
                <TouchableOpacity style={styles.actionButton} onPress={handleEditRegenerate}>
                  <Ionicons name="create" size={22} color={colors.primary} />
                  <Text style={styles.actionLabel}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.saveExampleButton} onPress={handleSaveExample}>
              <Ionicons name="bookmark" size={18} color={colors.primaryMuted} />
              <Text style={styles.saveExampleText}>Save as Example</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportButton} onPress={handleExportEncounter}>
              <Ionicons name="archive" size={18} color={colors.primaryMuted} />
              <Text style={styles.exportButtonText}>Export Encounter</Text>
            </TouchableOpacity>

            {!isReadOnly && activeDictation.status !== 'final' && (
              <TouchableOpacity style={styles.finalizeButton} onPress={handleFinalize}>
                <Ionicons name="checkmark-circle" size={20} color={colors.textInverse} />
                <Text style={styles.finalizeButtonText}>Finalize Report</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.newDictationButton} onPress={openDuplicateModal}>
              <Ionicons name="add-circle-outline" size={20} color={colors.textInverse} />
              <Text style={styles.newDictationButtonText}>New Report</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ─── EDITING STATE ─── */}
        {screenState === 'editing' && (
          <View style={styles.flex}>
            <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.editLabel}>What corrections should be made?</Text>
              <TextInput
                style={styles.editInput}
                placeholder="e.g., Change CPT 34802 to 34812, add drain details..."
                placeholderTextColor={colors.textTertiary}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
              />
            </ScrollView>
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancelButton}
                onPress={() => setScreenState('review')}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.generateButton, styles.editRegenButton, !editText.trim() && styles.sendButtonDisabled]}
                onPress={handleRegenerate}
                disabled={!editText.trim()}
              >
                <Ionicons name="refresh" size={18} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Regenerate</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── DIRECT EDITING STATE ─── */}
        {screenState === 'direct-editing' && (
          <View style={styles.flex}>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.directEditScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.editLabel}>Edit Report</Text>
              <TextInput
                style={styles.directEditInput}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                scrollEnabled={false}
              />
            </ScrollView>
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancelButton}
                onPress={() => setScreenState('review')}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.generateButton, styles.editRegenButton]}
                onPress={handleSaveDirectEdit}
              >
                <Ionicons name="checkmark" size={18} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Bottom Input Bar ─── */}
        {screenState === 'input' && !isReadOnly && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + 60 }] }>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={() => setShowTextInput(!showTextInput)}
            >
              <Ionicons
                name={showTextInput ? 'mic' : 'keypad-outline'}
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonRecording]}
              onPress={toggleRecording}
              onLongPress={startRecording}
            >
              <Avatar
                state={isRecording ? 'listening' : 'idle'}
                size={56}
                onPress={toggleRecording}
                isRecording={isRecording}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomButton}
              onPress={() => setShowImagePicker(true)}
            >
              <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {showImagePicker && (
          <ImagePickerModal
            onImageSelected={handleImageSelected}
            onCancel={() => setShowImagePicker(false)}
          />
        )}

        {renderAddProcedureModal()}

        {showDuplicateModal && !isHistoryView && (
          <Modal transparent animationType="fade" onRequestClose={() => setShowDuplicateModal(false)}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={80} tint="dark" style={styles.modalOverlayCenter}>
                <View style={styles.duplicateCard}>
                  <Text style={styles.duplicateTitle}>Start new report</Text>
                  <Text style={styles.duplicateSubtitle}>Would you like to copy the most recent report?</Text>
                  <View style={styles.duplicateActions}>
                    <TouchableOpacity style={styles.modalCancelButton} onPress={() => handleStartNewReport(false)}>
                      <Text style={styles.modalCancelText}>Start Fresh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSaveButton} onPress={() => handleStartNewReport(true)}>
                      <Text style={styles.modalSaveText}>Start from Previous</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={styles.modalOverlayCenter}>
                <View style={styles.duplicateCard}>
                  <Text style={styles.duplicateTitle}>Start new report</Text>
                  <Text style={styles.duplicateSubtitle}>Would you like to copy the most recent report?</Text>
                  <View style={styles.duplicateActions}>
                    <TouchableOpacity style={styles.modalCancelButton} onPress={() => handleStartNewReport(false)}>
                      <Text style={styles.modalCancelText}>Start Fresh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSaveButton} onPress={() => handleStartNewReport(true)}>
                      <Text style={styles.modalSaveText}>Start from Previous</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </Modal>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  headerActionText: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: typography.semibold,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePillText: {
    fontSize: typography.xs,
    color: colors.textPrimary,
  },
  datePillTextDisabled: {
    color: colors.textTertiary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 220,
  },
  transcribingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  transcribingText: {
    fontSize: typography.base,
    color: colors.primary,
    fontWeight: typography.medium as any,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.lg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  transcriptCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  transcriptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  transcriptType: {
    fontSize: typography.xs,
    color: colors.primaryMuted,
    textTransform: 'uppercase',
    fontWeight: typography.semibold,
    flex: 1,
  },
  transcriptText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  tagsSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tagsSectionTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  tagCategoryGroup: {
    marginBottom: spacing.md,
  },
  tagCategoryLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.primaryMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagSelected: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primary,
  },
  tagCustom: {
    borderStyle: 'dashed' as any,
  },
  tagText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  tagTextSelected: {
    color: colors.primary,
    fontWeight: typography.semibold,
  },
  tagAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    borderStyle: 'dashed' as any,
  },
  tagAddText: {
    fontSize: typography.sm,
    color: colors.primaryMuted,
  },
  selectedSummary: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  selectedSummaryText: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: typography.medium,
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  generateButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  generatingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingText: {
    fontSize: typography.lg,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  generatingSubtext: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  reportText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    width: 76,
    height: 76,
  },
  actionLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionButtonSent: {
    opacity: 0.6,
  },
  actionButtonActive: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionLabelSent: {
    color: '#22c55e',
  },
  saveExampleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  saveExampleText: {
    fontSize: typography.sm,
    color: colors.primaryMuted,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  exportButtonText: {
    fontSize: typography.sm,
    color: colors.primaryMuted,
  },
  finalizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  finalizeButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  newDictationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  newDictationButtonText: {
    fontSize: typography.base,
    fontWeight: typography.semibold as any,
    color: colors.textInverse,
  },
  editLabel: {
    fontSize: typography.lg,
    color: colors.textPrimary,
    fontWeight: typography.semibold,
    marginBottom: spacing.md,
  },
  editInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  directEditInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    minHeight: 400,
    textAlignVertical: 'top',
    lineHeight: 24,
  },
  directEditScrollContent: {
    padding: spacing.lg,
    paddingBottom: 300,
  },
  editActions: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  editCancelText: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  editRegenButton: {
    flex: 2,
    marginTop: 0,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bottomButton: {
    padding: spacing.md,
  },
  micButton: {
    borderRadius: borderRadius.full,
  },
  micButtonRecording: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    marginBottom: spacing.lg,
  },
  modalLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  modalCancelText: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  modalSaveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  modalSaveText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textInverse,
  },
  datePickerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
  },
  timelineItem: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineDate: {
    fontSize: typography.base,
    color: colors.textPrimary,
    fontWeight: typography.semibold,
  },
  timelineProcedures: {
    fontSize: typography.sm,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  timelinePreview: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusFinal: {
    backgroundColor: colors.successSubtle,
  },
  statusDraft: {
    backgroundColor: colors.warningSubtle,
  },
  statusText: {
    fontSize: typography.xs,
    color: colors.textPrimary,
  },
  duplicateCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
  },
  duplicateTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  duplicateSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  duplicateActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
