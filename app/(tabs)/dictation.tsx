/**
 * OR Dictation Screen
 * 
 * Voice/text/photo input → AI-generated operative report
 * with ICD-10, CPT codes, and work RVUs.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';
import { useDictationStore, TranscriptPart } from '../../src/stores/dictationStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { GatewayService } from '../../src/services/gateway';
import { ElevenLabsService, VOICES } from '../../src/services/elevenlabs';
import { transcribeAudio } from '../../src/services/whisper';
import { generateReport, regenerateWithCorrections, buildEmailMessage } from '../../src/services/dictationService';
import { Avatar } from '../../src/components/Avatar';
import { ImagePickerModal } from '../../src/components/ImagePicker';

const OLIVER_VOICE_ID = 'grLAj0YuamNRv9WBJxB4';

type ScreenState = 'input' | 'generating' | 'review' | 'editing';

export default function DictationScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('input');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editText, setEditText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const {
    transcriptParts,
    generatedReport,
    isGenerating,
    currentProcedureType,
    addTranscriptPart,
    removeTranscriptPart,
    clearSession,
    setGeneratedReport,
    setIsGenerating,
    setCurrentProcedureType,
    saveAsExample,
    loadPersistedData,
  } = useDictationStore();

  const { gatewayUrl, gatewayToken, openaiApiKey, elevenlabsApiKey } = useSettingsStore();

  useEffect(() => {
    loadPersistedData();
  }, []);

  useEffect(() => {
    if (isGenerating) setScreenState('generating');
    else if (generatedReport) setScreenState('review');
  }, [isGenerating, generatedReport]);

  const getGateway = useCallback(() => {
    if (!gatewayUrl || !gatewayToken) {
      Alert.alert('Setup Required', 'Please configure Gateway in Settings.');
      return null;
    }
    return new GatewayService({ baseUrl: gatewayUrl, token: gatewayToken } as any);
  }, [gatewayUrl, gatewayToken]);

  // Voice recording
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Microphone access is required for dictation.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error('[Dictation] Failed to start recording', e);
      Alert.alert('Error', 'Failed to start recording.');
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

      // Transcribe with Whisper
      const result = await transcribeAudio(uri, { apiKey: openaiApiKey });
      if (result && result.text && result.text.trim()) {
        addTranscriptPart({
          id: Date.now().toString(),
          type: 'voice',
          content: result.text.trim(),
          timestamp: new Date().toISOString(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error('[Dictation] Failed to stop/transcribe recording', e);
      Alert.alert('Error', 'Failed to transcribe audio.');
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Text input
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

  // Image input
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

  // Generate report
  const handleGenerate = async () => {
    const gw = getGateway();
    if (!gw) return;
    setIsGenerating(true);
    try {
      const report = await generateReport(gw, transcriptParts, currentProcedureType);
      setGeneratedReport(report);
    } catch (e: any) {
      console.error('[Dictation] Generate failed', e);
      Alert.alert('Error', e.message || 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Actions
  const handleEmail = async () => {
    const gw = getGateway();
    if (!gw || !generatedReport) return;
    try {
      const msg = buildEmailMessage(generatedReport, currentProcedureType);
      await gw.sendMessage(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent', 'Email request sent to Echo.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send email.');
    }
  };

  const handleReadBack = async () => {
    if (!generatedReport || !elevenlabsApiKey) {
      Alert.alert('Setup Required', 'Please configure ElevenLabs API key in Settings.');
      return;
    }
    try {
      const ttsService = new ElevenLabsService({ apiKey: elevenlabsApiKey, voiceId: OLIVER_VOICE_ID });
      await ttsService.speak({ text: generatedReport, voiceId: OLIVER_VOICE_ID });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to read back report.');
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
        gw,
        generatedReport,
        editText.trim(),
        transcriptParts,
        currentProcedureType,
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
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt(
        'Save as Example',
        'Enter procedure type (e.g., "EVAR", "Carotid Endarterectomy"):',
        (procType: string) => {
          if (procType?.trim()) {
            saveAsExample(generatedReport, procType.trim());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Saved', 'Report saved as learning example.');
          }
        },
      );
    } else {
      const procType = currentProcedureType || 'General';
      saveAsExample(generatedReport, procType);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', `Report saved as "${procType}" example.`);
    }
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
        },
      },
    ]);
  };

  // Render
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
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

        {/* Content */}
        {screenState === 'input' && (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
            {/* Transcript parts */}
            {transcriptParts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="mic-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyText}>Tap the mic to start dictating</Text>
                <Text style={styles.emptySubtext}>
                  Mix voice, text, and photos to build your transcript
                </Text>
              </View>
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

            {/* Procedure type input */}
            {transcriptParts.length > 0 && (
              <View style={styles.procTypeRow}>
                <TextInput
                  style={styles.procTypeInput}
                  placeholder="Procedure type (optional, e.g. EVAR)"
                  placeholderTextColor={colors.textTertiary}
                  value={currentProcedureType || ''}
                  onChangeText={setCurrentProcedureType}
                />
              </View>
            )}

            {/* Generate button */}
            {transcriptParts.length > 0 && (
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerate}>
                <Ionicons name="document-text" size={20} color={colors.textInverse} />
                <Text style={styles.generateButtonText}>Generate Report</Text>
              </TouchableOpacity>
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

        {screenState === 'generating' && (
          <View style={styles.generatingContainer}>
            <Avatar state="thinking" size={80} />
            <Text style={styles.generatingText}>Generating operative report...</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          </View>
        )}

        {screenState === 'review' && generatedReport && (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
            <View style={styles.reportCard}>
              <Text style={styles.reportText}>{generatedReport}</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
                <Ionicons name="mail" size={22} color={colors.primary} />
                <Text style={styles.actionLabel}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleReadBack}>
                <Ionicons name="volume-high" size={22} color={colors.primary} />
                <Text style={styles.actionLabel}>Read Back</Text>
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

        {/* Bottom input bar (input state only) */}
        {screenState === 'input' && (
          <View style={styles.bottomBar}>
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
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
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
  procTypeRow: {
    marginVertical: spacing.md,
  },
  procTypeInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
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
  micButtonRecording: {
    // Recording state handled by Avatar component
  },
});
