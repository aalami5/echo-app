/**
 * OR Dictation Screen
 * 
 * Voice/text/photo input → AI-generated operative report
 * with ICD-10, CPT codes, and work RVUs.
 * 
 * Features:
 * - Tag-based procedure picker (pill/chip UI)
 * - Custom procedure tags (persist via AsyncStorage)
 * - Web search for CPT/ICD-10 codes via Gateway
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';
import { useDictationStore, CustomProcedure } from '../../src/stores/dictationStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { GatewayService } from '../../src/services/gateway';
import { ElevenLabsService } from '../../src/services/elevenlabs';
import { transcribeAudio } from '../../src/services/whisper';
import { generateReport, regenerateWithCorrections, buildEmailMessage } from '../../src/services/dictationService';
import { Avatar } from '../../src/components/Avatar';
import { ImagePickerModal } from '../../src/components/ImagePicker';
import {
  PROCEDURE_TEMPLATES,
  CATEGORY_LABELS,
  ProcedureCategory,
} from '../../src/data/vascularProcedures';

const OLIVER_VOICE_ID = 'grLAj0YuamNRv9WBJxB4';
const ALL_CATEGORIES: ProcedureCategory[] = ['aortic', 'carotid', 'peripheral_arterial', 'venous', 'dialysis_access', 'other'];

type ScreenState = 'input' | 'generating' | 'review' | 'editing';

export default function DictationScreen() {
  const insets = useSafeAreaInsets();
  const [screenState, setScreenState] = useState<ScreenState>('input');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editText, setEditText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showAddProcedure, setShowAddProcedure] = useState(false);
  const [newProcName, setNewProcName] = useState('');
  const [newProcCategory, setNewProcCategory] = useState<ProcedureCategory>('other');
  const [editingCustomProc, setEditingCustomProc] = useState<CustomProcedure | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isReadingBack, setIsReadingBack] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const ttsServiceRef = useRef<ElevenLabsService | null>(null);

  const {
    transcriptParts,
    generatedReport,
    isGenerating,
    selectedProcedures,
    customProcedures,
    addTranscriptPart,
    removeTranscriptPart,
    clearSession,
    setGeneratedReport,
    setIsGenerating,
    toggleProcedure,
    setEditingCorrections,
    saveAsExample,
    addCustomProcedure,
    updateCustomProcedure,
    removeCustomProcedure,
  } = useDictationStore();

  const { gatewayUrl, gatewayToken, openaiApiKey, elevenlabsApiKey } = useSettingsStore();

  const reviewScrollRef = useRef<ScrollView>(null);

  // Sync screen state with store
  useEffect(() => {
    if (isGenerating) setScreenState('generating');
    else if (generatedReport) {
      setScreenState('review');
      // Scroll to top when report loads
      setTimeout(() => reviewScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    }
  }, [isGenerating, generatedReport]);

  // Auto-scroll removed — user prefers staying at top after recording

  const getGateway = useCallback(() => {
    if (!gatewayUrl || !gatewayToken) {
      Alert.alert('Setup Required', 'Please configure Gateway in Settings.');
      return null;
    }
    return new GatewayService({ baseUrl: gatewayUrl, token: gatewayToken } as any);
  }, [gatewayUrl, gatewayToken]);

  // ─── Voice Recording ───
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Microphone access is required for dictation.');
        return;
      }
      // Unload any existing recording first
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
      // Small delay for iOS audio session setup
      await new Promise((resolve) => setTimeout(resolve, 100));
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      console.error('[Dictation] Failed to start recording', e);
      Alert.alert('Error', `Failed to start recording: ${e.message}`);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
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
        addTranscriptPart({
          id: Date.now().toString(),
          type: 'voice',
          content: result.text.trim(),
          timestamp: new Date().toISOString(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Scroll to top so user sees the new transcript
        setTimeout(() => scrollViewRef.current?.scrollTo({ y: 0, animated: true }), 100);
      }
    } catch (e) {
      setIsTranscribing(false);
      console.error('[Dictation] Failed to stop/transcribe recording', e);
      Alert.alert('Error', 'Failed to transcribe audio.');
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // ─── Text Input ───
  const submitText = () => {
    if (!textDraft.trim()) return;
    addTranscriptPart({
      id: Date.now().toString(),
      type: 'text',
      content: textDraft.trim(),
      timestamp: new Date().toISOString(),
    });
    setTextDraft('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Image Input ───
  const handleImageSelected = (uri: string, base64?: string, mimeType?: string, caption?: string) => {
    setShowImagePicker(false);
    addTranscriptPart({
      id: Date.now().toString(),
      type: 'image',
      content: caption || 'Surgical image attached',
      imageBase64: base64,
      imageMimeType: mimeType,
      timestamp: new Date().toISOString(),
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Generate Report ───
  const handleGenerate = async () => {
    const gw = getGateway();
    if (!gw) return;
    setIsGenerating(true);
    try {
      const report = await generateReport(gw, transcriptParts, selectedProcedures);
      setGeneratedReport(report);
    } catch (e: any) {
      console.error('[Dictation] Generate failed', e);
      Alert.alert('Error', e.message || 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Report Actions ───
  const handleEmail = async () => {
    const gw = getGateway();
    if (!gw || !generatedReport || emailSent || isSendingEmail) return;
    setIsSendingEmail(true);
    try {
      const msg = buildEmailMessage(generatedReport, selectedProcedures);
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
    if (!generatedReport || !elevenlabsApiKey) {
      Alert.alert('Setup Required', 'Please configure ElevenLabs API key in Settings.');
      return;
    }
    // If already reading back, stop it instead of starting another
    if (isReadingBack && ttsServiceRef.current) {
      await ttsServiceRef.current.stop();
      setIsReadingBack(false);
      return;
    }
    setIsReadingBack(true);
    try {
      const ttsService = new ElevenLabsService({ apiKey: elevenlabsApiKey, voiceId: OLIVER_VOICE_ID });
      ttsServiceRef.current = ttsService;
      await ttsService.speak({ text: generatedReport, voiceId: OLIVER_VOICE_ID });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to read back report.');
    } finally {
      setIsReadingBack(false);
      ttsServiceRef.current = null;
    }
  };

  const handleCopy = async () => {
    if (!generatedReport) return;
    await Clipboard.setStringAsync(generatedReport);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Report copied to clipboard.');
  };

  const handleEditRegenerate = () => {
    setEditText('');
    setScreenState('editing');
  };

  const handleRegenerate = async () => {
    const gw = getGateway();
    if (!gw || !generatedReport || !editText.trim()) return;
    setScreenState('generating');
    setIsGenerating(true);
    try {
      const report = await regenerateWithCorrections(
        gw, generatedReport, editText.trim(), transcriptParts, selectedProcedures,
      );
      setGeneratedReport(report);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to regenerate.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveExample = () => {
    if (!generatedReport) return;
    const procType = selectedProcedures.length > 0 ? selectedProcedures.join(', ') : 'General';
    saveAsExample(generatedReport, procType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', `Report saved as "${procType}" example.`);
  };

  const handleNewSession = () => {
    Alert.alert('New Session', 'Clear current dictation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearSession();
          setScreenState('input');
          setShowTextInput(false);
          setEmailSent(false);
        },
      },
    ]);
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
          // Also deselect if selected
          if (selectedProcedures.includes(proc.name)) {
            toggleProcedure(proc.name);
          }
        },
      },
    ]);
  };

  const handleSaveEditedProcedure = () => {
    if (!newProcName.trim() || !editingCustomProc) return;
    // If name changed, update selection
    const oldName = editingCustomProc.name;
    const newName = newProcName.trim();
    updateCustomProcedure(editingCustomProc.id, {
      name: newName,
      category: newProcCategory,
    });
    if (selectedProcedures.includes(oldName) && oldName !== newName) {
      toggleProcedure(oldName);
      toggleProcedure(newName);
    }
    setEditingCustomProc(null);
    setNewProcName('');
    setNewProcCategory('other');
    setShowAddProcedure(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ─── Procedure Tags Renderer ───
  const renderProcedureTags = () => {
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
                  const isSelected = selectedProcedures.includes(proc.name);
                  return (
                    <TouchableOpacity
                      key={proc.id}
                      style={[styles.tag, isSelected && styles.tagSelected]}
                      onPress={() => {
                        toggleProcedure(proc.name);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                        {proc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {customProcs.map((proc) => {
                  const isSelected = selectedProcedures.includes(proc.name);
                  return (
                    <TouchableOpacity
                      key={proc.id}
                      style={[styles.tag, styles.tagCustom, isSelected && styles.tagSelected]}
                      onPress={() => {
                        toggleProcedure(proc.name);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      onLongPress={() => handleLongPressCustom(proc)}
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
        {/* Add Procedure tag */}
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
      </View>
    );
  };

  // ─── Add/Edit Procedure Modal ───
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

  // ─── Render ───
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>OR Dictation</Text>
          {(transcriptParts.length > 0 || generatedReport) && (
            <TouchableOpacity onPress={handleNewSession} style={styles.headerButton}>
              <Ionicons name="refresh" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* ─── INPUT STATE ─── */}
        {screenState === 'input' && (
          <ScrollView ref={scrollViewRef} style={styles.flex} contentContainerStyle={styles.scrollContent}>
            {/* Transcribing indicator */}
            {isTranscribing && (
              <View style={styles.transcribingBanner}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.transcribingText}>Transcribing audio...</Text>
              </View>
            )}
            {transcriptParts.length === 0 && !isTranscribing && (
              <TouchableOpacity style={styles.emptyState} onPress={startRecording} activeOpacity={0.7}>
                <Ionicons name="mic-outline" size={48} color="#14b8a6" />
                <Text style={styles.emptyText}>Tap the mic to start dictating</Text>
                <Text style={styles.emptySubtext}>
                  Mix voice, text, and photos to build your transcript
                </Text>
              </TouchableOpacity>
            )}

            {transcriptParts.map((part) => (
              <View key={part.id} style={styles.transcriptCard}>
                <View style={styles.transcriptCardHeader}>
                  <Ionicons
                    name={part.type === 'voice' ? 'mic' : part.type === 'image' ? 'camera' : 'text'}
                    size={16}
                    color={colors.primaryMuted}
                  />
                  <Text style={styles.transcriptType}>{part.type}</Text>
                  <TouchableOpacity
                    onPress={() => removeTranscriptPart(part.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.transcriptText}>{part.content}</Text>
              </View>
            ))}

            {/* Generate button — directly after transcript entries */}
            {transcriptParts.length > 0 && (
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerate}>
                <Ionicons name="document-text" size={20} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Generate Report</Text>
              </TouchableOpacity>
            )}

            {/* Procedure tags */}
            {renderProcedureTags()}

            {/* Selected procedures summary */}
            {selectedProcedures.length > 0 && (
              <View style={styles.selectedSummary}>
                <Text style={styles.selectedSummaryText}>
                  Selected: {selectedProcedures.join(', ')}
                </Text>
              </View>
            )}

            {/* Text input area */}
            {showTextInput && (
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
                    // Scroll to bottom so text input is visible above keyboard
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
        {screenState === 'review' && generatedReport && (
          <ScrollView ref={reviewScrollRef} style={styles.flex} contentContainerStyle={styles.scrollContent}>
            <View style={styles.reportCard}>
              <Text style={styles.reportText}>{generatedReport}</Text>
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
              <TouchableOpacity style={styles.actionButton} onPress={handleEditRegenerate}>
                <Ionicons name="create" size={22} color={colors.primary} />
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveExampleButton} onPress={handleSaveExample}>
              <Ionicons name="bookmark" size={18} color={colors.primaryMuted} />
              <Text style={styles.saveExampleText}>Save as Example</Text>
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

        {/* ─── Bottom Input Bar ─── */}
        {screenState === 'input' && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + 60 }]}>
            <TouchableOpacity
              style={styles.bottomButton}
              onPress={() => setShowTextInput(!showTextInput)}
            >
              <Ionicons
                name={showTextInput ? 'mic' : 'text'}
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
                audioLevel={audioLevel}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomButton}
              onPress={() => setShowImagePicker(true)}
            >
              <Ionicons name="camera" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image Picker Modal */}
        {showImagePicker && (
          <ImagePickerModal
            onImageSelected={handleImageSelected}
            onCancel={() => setShowImagePicker(false)}
          />
        )}

        {/* Add/Edit Procedure Modal */}
        {renderAddProcedureModal()}
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
  headerTitle: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerButton: {
    padding: spacing.sm,
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
  },
  emptyText: {
    fontSize: typography.lg,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Transcript cards
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

  // ─── Procedure Tags ───
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

  // Generate
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

  // Text input
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

  // Generating
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

  // Report
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

  // Edit
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

  // Bottom bar
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
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
});
