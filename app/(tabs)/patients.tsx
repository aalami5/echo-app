/**
 * Patients Tab
 * 
 * On-call patient tracking organized by call day and hospital.
 * Features: Quick add, search, voice input, export.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  Animated,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../src/constants/theme';
import { 
  usePatientsStore, 
  Hospital, 
  HOSPITAL_NAMES, 
  Patient,
  CallDay 
} from '../../src/stores/patientsStore';
import { usePatientVoiceInput } from '../../src/hooks/usePatientVoiceInput';

// Hospital order for display
const HOSPITAL_ORDER: Hospital[] = ['SEQ', 'ECH', 'SMCMC', 'Mills', 'OTHER'];

export default function PatientsScreen() {
  const {
    patients,
    callDays,
    callDayOrder,
    searchQuery,
    addPatient,
    deletePatient,
    createCallDay,
    deleteCallDay,
    setSearchQuery,
    getPatientsByCallDay,
    getPatientsByHospital,
    searchPatients,
    exportToCSV,
    getRecentComplaints,
    getCommonComplaints,
  } = usePatientsStore();
  
  // Voice input for chief complaint
  const {
    isRecording,
    isTranscribing,
    audioLevel,
    duration,
    error: voiceError,
    startRecording: startVoice,
    stopAndTranscribe,
    cancelRecording: cancelVoice,
  } = usePatientVoiceInput();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedCallDays, setExpandedCallDays] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [showQuickComplaints, setShowQuickComplaints] = useState(false);
  
  // Get quick complaints data
  const recentComplaints = useMemo(() => getRecentComplaints(5), [patients]);
  const commonComplaints = useMemo(() => getCommonComplaints(), []);
  
  // Quick Add form state
  const [newPatient, setNewPatient] = useState({
    name: '',
    mrn: '',
    dob: '',
    hospital: 'SEQ' as Hospital,
    chiefComplaint: '',
  });
  
  // Animation refs
  const searchBarHeight = useRef(new Animated.Value(0)).current;
  
  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchPatients(searchQuery);
  }, [searchQuery, patients]);
  
  // Toggle call day expansion
  const toggleCallDay = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedCallDays(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  // Handle adding new patient
  const handleAddPatient = useCallback(() => {
    if (!newPatient.name.trim() || !newPatient.mrn.trim()) {
      Alert.alert('Required Fields', 'Please enter at least the patient name and MRN.');
      return;
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPatient(newPatient);
    
    // Reset form
    setNewPatient({
      name: '',
      mrn: '',
      dob: '',
      hospital: 'SEQ',
      chiefComplaint: '',
    });
    setShowAddModal(false);
  }, [newPatient, addPatient]);
  
  // Handle delete patient with confirmation
  const handleDeletePatient = useCallback((patient: Patient) => {
    Alert.alert(
      'Delete Patient',
      `Remove ${patient.name} from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deletePatient(patient.id);
          },
        },
      ]
    );
  }, [deletePatient]);
  
  // Handle export
  const handleExport = useCallback(async () => {
    const csv = exportToCSV();
    
    try {
      await Share.share({
        message: csv,
        title: 'Patient List Export',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Export error:', error);
    }
  }, [exportToCSV]);
  
  // Handle voice input for chief complaint
  const handleVoiceInput = useCallback(async () => {
    if (isRecording) {
      // Stop and transcribe
      const text = await stopAndTranscribe();
      if (text) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNewPatient(prev => ({ 
          ...prev, 
          chiefComplaint: prev.chiefComplaint 
            ? `${prev.chiefComplaint} ${text}` 
            : text 
        }));
      }
    } else {
      // Start recording
      await startVoice();
    }
  }, [isRecording, stopAndTranscribe, startVoice]);
  
  // Select quick complaint
  const selectQuickComplaint = useCallback((complaint: string) => {
    Haptics.selectionAsync();
    setNewPatient(prev => ({ ...prev, chiefComplaint: complaint }));
    setShowQuickComplaints(false);
  }, []);
  
  // Toggle search
  const toggleSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toValue = isSearching ? 0 : 50;
    setIsSearching(!isSearching);
    
    Animated.spring(searchBarHeight, {
      toValue,
      useNativeDriver: false,
      friction: 10,
    }).start();
    
    if (isSearching) {
      setSearchQuery('');
      Keyboard.dismiss();
    }
  }, [isSearching, searchBarHeight, setSearchQuery]);
  
  // Start new call day
  const handleNewCallDay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newId = createCallDay();
    setExpandedCallDays(prev => new Set([...prev, newId]));
  }, [createCallDay]);
  
  // Render patient row
  const renderPatient = useCallback((patient: Patient, showHospital = false) => (
    <TouchableOpacity
      key={patient.id}
      style={styles.patientRow}
      onLongPress={() => handleDeletePatient(patient)}
      delayLongPress={500}
    >
      <View style={styles.patientInfo}>
        <Text style={styles.patientName}>{patient.name}</Text>
        <View style={styles.patientDetails}>
          <Text style={styles.patientMRN}>MRN: {patient.mrn}</Text>
          {patient.dob && <Text style={styles.patientDOB}>DOB: {patient.dob}</Text>}
        </View>
        {patient.chiefComplaint && (
          <Text style={styles.patientComplaint}>{patient.chiefComplaint}</Text>
        )}
        {showHospital && (
          <Text style={styles.patientHospital}>{HOSPITAL_NAMES[patient.hospital]}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  ), [handleDeletePatient]);
  
  // Render hospital section
  const renderHospitalSection = useCallback((callDayId: string, hospital: Hospital) => {
    const hospitalPatients = getPatientsByHospital(callDayId, hospital);
    if (hospitalPatients.length === 0) return null;
    
    return (
      <View key={hospital} style={styles.hospitalSection}>
        <View style={styles.hospitalHeader}>
          <View style={[styles.hospitalDot, { backgroundColor: getHospitalColor(hospital) }]} />
          <Text style={styles.hospitalName}>{HOSPITAL_NAMES[hospital]}</Text>
          <Text style={styles.hospitalCount}>({hospitalPatients.length})</Text>
        </View>
        {hospitalPatients.map(p => renderPatient(p))}
      </View>
    );
  }, [getPatientsByHospital, renderPatient]);
  
  // Render call day section
  const renderCallDay = useCallback((callDayId: string) => {
    const callDay = callDays[callDayId];
    if (!callDay) return null;
    
    const isExpanded = expandedCallDays.has(callDayId);
    const patientCount = callDay.patientIds.length;
    
    return (
      <View key={callDayId} style={styles.callDaySection}>
        <TouchableOpacity 
          style={styles.callDayHeader}
          onPress={() => toggleCallDay(callDayId)}
        >
          <View style={styles.callDayInfo}>
            <Text style={styles.callDayDate}>{callDay.displayDate}</Text>
            <Text style={styles.callDayDay}>{callDay.dayOfWeek}</Text>
          </View>
          <View style={styles.callDayRight}>
            <Text style={styles.patientCount}>{patientCount} patient{patientCount !== 1 ? 's' : ''}</Text>
            <Ionicons 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={colors.textSecondary}
            />
          </View>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.callDayContent}>
            {HOSPITAL_ORDER.map(hospital => renderHospitalSection(callDayId, hospital))}
            {patientCount === 0 && (
              <Text style={styles.emptyText}>No patients added yet</Text>
            )}
          </View>
        )}
      </View>
    );
  }, [callDays, expandedCallDays, toggleCallDay, renderHospitalSection]);
  
  // Hospital selector
  const HospitalPicker = () => (
    <View style={styles.hospitalPicker}>
      {HOSPITAL_ORDER.filter(h => h !== 'OTHER').map(hospital => (
        <TouchableOpacity
          key={hospital}
          style={[
            styles.hospitalOption,
            newPatient.hospital === hospital && styles.hospitalOptionSelected,
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            setNewPatient(prev => ({ ...prev, hospital }));
          }}
        >
          <Text style={[
            styles.hospitalOptionText,
            newPatient.hospital === hospital && styles.hospitalOptionTextSelected,
          ]}>
            {hospital}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Patients</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleSearch}>
            <Ionicons 
              name={isSearching ? 'close' : 'search'} 
              size={22} 
              color={colors.textSecondary} 
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleExport}>
            <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Search Bar */}
      <Animated.View style={[styles.searchContainer, { height: searchBarHeight }]}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or MRN..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
      
      {/* Content */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Results */}
        {isSearching && searchQuery.trim() ? (
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>
              Search Results ({searchResults.length})
            </Text>
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No patients found</Text>
            ) : (
              searchResults.map(p => renderPatient(p, true))
            )}
          </View>
        ) : (
          <>
            {/* New Call Day Button */}
            <TouchableOpacity style={styles.newCallDayButton} onPress={handleNewCallDay}>
              <Ionicons name="add-circle" size={24} color={colors.primary} />
              <Text style={styles.newCallDayText}>Start New Call Day</Text>
            </TouchableOpacity>
            
            {/* Call Days List */}
            {callDayOrder.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyStateTitle}>No call days yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Start a new call day to begin tracking patients
                </Text>
              </View>
            ) : (
              callDayOrder.map(id => renderCallDay(id))
            )}
          </>
        )}
      </ScrollView>
      
      {/* FAB - Quick Add */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </TouchableOpacity>
      
      {/* Add Patient Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Patient</Text>
              <TouchableOpacity onPress={handleAddPatient}>
                <Text style={styles.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>
            
            {/* Form */}
            <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
              {/* Hospital Selector */}
              <Text style={styles.formLabel}>Hospital *</Text>
              <HospitalPicker />
              
              {/* Name */}
              <Text style={styles.formLabel}>Patient Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Last, First"
                placeholderTextColor={colors.textTertiary}
                value={newPatient.name}
                onChangeText={(text) => setNewPatient(prev => ({ ...prev, name: text }))}
                autoCapitalize="words"
              />
              
              {/* MRN */}
              <Text style={styles.formLabel}>MRN *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Medical Record Number"
                placeholderTextColor={colors.textTertiary}
                value={newPatient.mrn}
                onChangeText={(text) => setNewPatient(prev => ({ ...prev, mrn: text }))}
                keyboardType="number-pad"
              />
              
              {/* DOB */}
              <Text style={styles.formLabel}>Date of Birth</Text>
              <TextInput
                style={styles.formInput}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={colors.textTertiary}
                value={newPatient.dob}
                onChangeText={(text) => setNewPatient(prev => ({ ...prev, dob: text }))}
                keyboardType="numbers-and-punctuation"
              />
              
              {/* Chief Complaint */}
              <View style={styles.formLabelRow}>
                <Text style={styles.formLabel}>Chief Complaint</Text>
                <TouchableOpacity 
                  style={styles.quickComplaintsToggle}
                  onPress={() => setShowQuickComplaints(!showQuickComplaints)}
                >
                  <Ionicons 
                    name={showQuickComplaints ? 'chevron-up' : 'flash'} 
                    size={16} 
                    color={colors.primary} 
                  />
                  <Text style={styles.quickComplaintsToggleText}>Quick</Text>
                </TouchableOpacity>
              </View>
              
              {/* Quick Complaints Picker */}
              {showQuickComplaints && (
                <View style={styles.quickComplaintsContainer}>
                  {recentComplaints.length > 0 && (
                    <>
                      <Text style={styles.quickComplaintsSection}>Recent</Text>
                      <View style={styles.quickComplaintsList}>
                        {recentComplaints.map((complaint, idx) => (
                          <TouchableOpacity
                            key={`recent-${idx}`}
                            style={styles.quickComplaintChip}
                            onPress={() => selectQuickComplaint(complaint)}
                          >
                            <Text style={styles.quickComplaintText}>{complaint}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <Text style={styles.quickComplaintsSection}>Common</Text>
                  <View style={styles.quickComplaintsList}>
                    {commonComplaints.slice(0, 10).map((complaint, idx) => (
                      <TouchableOpacity
                        key={`common-${idx}`}
                        style={styles.quickComplaintChip}
                        onPress={() => selectQuickComplaint(complaint)}
                      >
                        <Text style={styles.quickComplaintText}>{complaint}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              
              {/* Chief Complaint Input with Voice Button */}
              <View style={styles.voiceInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.formInputMultiline, styles.voiceInput]}
                  placeholder="e.g., DVT consult, LE bypass evaluation"
                  placeholderTextColor={colors.textTertiary}
                  value={newPatient.chiefComplaint}
                  onChangeText={(text) => setNewPatient(prev => ({ ...prev, chiefComplaint: text }))}
                  multiline
                  numberOfLines={2}
                />
                <TouchableOpacity
                  style={[
                    styles.voiceButton,
                    isRecording && styles.voiceButtonRecording,
                    isTranscribing && styles.voiceButtonTranscribing,
                  ]}
                  onPress={handleVoiceInput}
                  onLongPress={cancelVoice}
                  disabled={isTranscribing}
                >
                  {isTranscribing ? (
                    <Ionicons name="hourglass" size={20} color={colors.textInverse} />
                  ) : (
                    <Ionicons 
                      name={isRecording ? 'stop' : 'mic'} 
                      size={20} 
                      color={isRecording ? colors.error : colors.primary} 
                    />
                  )}
                </TouchableOpacity>
              </View>
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={[styles.recordingDot, { opacity: 0.5 + audioLevel * 0.5 }]} />
                  <Text style={styles.recordingText}>Recording... {duration}s</Text>
                </View>
              )}
              {voiceError && (
                <Text style={styles.voiceError}>{voiceError}</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Helper function to get hospital color
function getHospitalColor(hospital: Hospital): string {
  const hospitalColors: Record<Hospital, string> = {
    SEQ: '#10B981',    // Green
    ECH: '#3B82F6',    // Blue
    SMCMC: '#F59E0B',  // Amber
    Mills: '#8B5CF6',  // Purple
    OTHER: '#6B7280',  // Gray
  };
  return hospitalColors[hospital];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  searchContainer: {
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.base,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  newCallDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySubtle,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  newCallDayText: {
    color: colors.primary,
    fontSize: typography.base,
    fontWeight: typography.semibold,
  },
  callDaySection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  callDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  callDayInfo: {
    flex: 1,
  },
  callDayDate: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  callDayDay: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  callDayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  patientCount: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  callDayContent: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  hospitalSection: {
    marginTop: spacing.md,
  },
  hospitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  hospitalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hospitalName: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  hospitalCount: {
    fontSize: typography.xs,
    color: colors.textTertiary,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  patientDetails: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  patientMRN: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  patientDOB: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  patientComplaint: {
    fontSize: typography.sm,
    color: colors.primaryMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  patientHospital: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyStateTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyStateSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  searchResults: {
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  modalCancel: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  modalSave: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.primary,
  },
  form: {
    flex: 1,
    padding: spacing.lg,
  },
  formLabel: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  hospitalPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hospitalOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hospitalOptionSelected: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primary,
  },
  hospitalOptionText: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textSecondary,
  },
  hospitalOptionTextSelected: {
    color: colors.primary,
  },
  // Voice input styles
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  quickComplaintsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primarySubtle,
    borderRadius: borderRadius.sm,
  },
  quickComplaintsToggleText: {
    fontSize: typography.xs,
    color: colors.primary,
    fontWeight: typography.medium,
  },
  quickComplaintsContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickComplaintsSection: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  quickComplaintsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickComplaintChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickComplaintText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  voiceInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  voiceInput: {
    flex: 1,
    marginBottom: 0,
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    marginTop: 0,
  },
  voiceButtonRecording: {
    backgroundColor: colors.errorSubtle,
    borderColor: colors.error,
  },
  voiceButtonTranscribing: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    fontSize: typography.sm,
    color: colors.error,
  },
  voiceError: {
    fontSize: typography.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
