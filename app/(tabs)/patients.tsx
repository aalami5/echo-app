/**
 * Patients Tab
 * 
 * On-call patient tracking organized by call day and hospital.
 * Features: Quick add, search, voice input, export.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Image,
  ActivityIndicator,
  ActionSheetIOS,
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
import { usePatientScan, ScannedPatientData } from '../../src/hooks/usePatientScan';

// Hospital order for display
const HOSPITAL_ORDER: Hospital[] = ['SEQ', 'ECH', 'SMCMC', 'Mills', 'OTHER'];

export default function PatientsScreen() {
  const {
    patients,
    callDays,
    callDayOrder,
    searchQuery,
    pendingPatient,
    addPatient,
    updatePatient,
    deletePatient,
    createCallDay,
    deleteCallDay,
    setSearchQuery,
    clearPendingPatient,
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
  
  // Image scan for patient details
  const {
    isScanning,
    isProcessing,
    error: scanError,
    scannedData,
    imageUri: scannedImageUri,
    scanFromCamera,
    scanFromLibrary,
    clearScan,
  } = usePatientScan();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showScanConfirmModal, setShowScanConfirmModal] = useState(false);
  const [showPendingPatientModal, setShowPendingPatientModal] = useState(false);
  const [pendingScanData, setPendingScanData] = useState<ScannedPatientData | null>(null);
  const [expandedCallDays, setExpandedCallDays] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [showQuickComplaints, setShowQuickComplaints] = useState(false);
  const [showEditQuickComplaints, setShowEditQuickComplaints] = useState(false);
  const [showPendingQuickComplaints, setShowPendingQuickComplaints] = useState(false);
  const [pendingPatientEdits, setPendingPatientEdits] = useState<Omit<Patient, 'id' | 'timeSeen' | 'callDayId'> | null>(null);
  
  // Get quick complaints data
  const recentComplaints = useMemo(() => getRecentComplaints(5), [patients]);
  const commonComplaints = useMemo(() => getCommonComplaints(), []);
  
  // Quick Add form state
  const [newPatient, setNewPatient] = useState({
    name: '',
    mrn: '',
    dob: '',
    room: '',
    hospital: 'SEQ' as Hospital,
    chiefComplaint: '',
  });
  
  // Animation refs
  const searchBarHeight = useRef(new Animated.Value(0)).current;
  
  // Show pending patient modal when new patient arrives from WhatsApp
  useEffect(() => {
    if (pendingPatient && !showPendingPatientModal) {
      setPendingPatientEdits({ ...pendingPatient });
      setShowPendingPatientModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [pendingPatient, showPendingPatientModal]);
  
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
      room: '',
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
  
  // Handle scan from camera - apply directly to form
  const handleScanCamera = useCallback(async () => {
    setShowScanModal(false);
    const data = await scanFromCamera();
    if (data) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewPatient(prev => ({
        ...prev,
        name: data.name || prev.name,
        mrn: data.mrn || prev.mrn,
        dob: data.dob || prev.dob,
        room: data.room || prev.room,
        hospital: data.hospital || prev.hospital,
        chiefComplaint: data.chiefComplaint || prev.chiefComplaint,
      }));
      Alert.alert('Scan Complete', 'Patient details extracted. Review and edit as needed.');
    }
  }, [scanFromCamera]);
  
  // Handle scan from library - apply directly to form
  const handleScanLibrary = useCallback(async () => {
    setShowScanModal(false);
    const data = await scanFromLibrary();
    if (data) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewPatient(prev => ({
        ...prev,
        name: data.name || prev.name,
        mrn: data.mrn || prev.mrn,
        dob: data.dob || prev.dob,
        room: data.room || prev.room,
        hospital: data.hospital || prev.hospital,
        chiefComplaint: data.chiefComplaint || prev.chiefComplaint,
      }));
      Alert.alert('Scan Complete', 'Patient details extracted. Review and edit as needed.');
    }
  }, [scanFromLibrary]);
  
  // Apply scanned data to form
  const handleApplyScanData = useCallback(() => {
    if (!pendingScanData) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewPatient(prev => ({
      ...prev,
      name: pendingScanData.name || prev.name,
      mrn: pendingScanData.mrn || prev.mrn,
      dob: pendingScanData.dob || prev.dob,
      room: pendingScanData.room || prev.room,
      hospital: pendingScanData.hospital || prev.hospital,
      chiefComplaint: pendingScanData.chiefComplaint || prev.chiefComplaint,
    }));
    
    setShowScanConfirmModal(false);
    setPendingScanData(null);
    clearScan();
  }, [pendingScanData, clearScan]);
  
  // Cancel scan confirmation
  const handleCancelScan = useCallback(() => {
    setShowScanConfirmModal(false);
    setPendingScanData(null);
    clearScan();
  }, [clearScan]);
  
  // Handle edit patient - open edit modal
  const handleEditPatient = useCallback((patient: Patient) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingPatient({ ...patient });
    setShowEditModal(true);
  }, []);
  
  // Save edited patient
  const handleSaveEdit = useCallback(() => {
    if (!editingPatient) return;
    
    if (!editingPatient.name.trim() || !editingPatient.mrn.trim()) {
      Alert.alert('Required Fields', 'Please enter at least the patient name and MRN.');
      return;
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updatePatient(editingPatient.id, {
      name: editingPatient.name,
      mrn: editingPatient.mrn,
      dob: editingPatient.dob,
      room: editingPatient.room,
      hospital: editingPatient.hospital,
      chiefComplaint: editingPatient.chiefComplaint,
    });
    
    setShowEditModal(false);
    setEditingPatient(null);
  }, [editingPatient, updatePatient]);
  
  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setEditingPatient(null);
    setShowEditQuickComplaints(false);
  }, []);
  
  // Accept pending patient from WhatsApp
  const handleAcceptPendingPatient = useCallback(() => {
    if (!pendingPatientEdits) return;
    
    if (!pendingPatientEdits.name.trim() || !pendingPatientEdits.mrn.trim()) {
      Alert.alert('Required Fields', 'Please enter at least the patient name and MRN.');
      return;
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPatient(pendingPatientEdits);
    
    setShowPendingPatientModal(false);
    setPendingPatientEdits(null);
    clearPendingPatient();
    setShowPendingQuickComplaints(false);
  }, [pendingPatientEdits, addPatient, clearPendingPatient]);
  
  // Dismiss pending patient from WhatsApp
  const handleDismissPendingPatient = useCallback(() => {
    setShowPendingPatientModal(false);
    setPendingPatientEdits(null);
    clearPendingPatient();
    setShowPendingQuickComplaints(false);
  }, [clearPendingPatient]);
  
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
  
  // Render patient row - tap to edit, long press to delete
  const renderPatient = useCallback((patient: Patient, showHospital = false) => (
    <TouchableOpacity
      key={patient.id}
      style={styles.patientRow}
      onPress={() => handleEditPatient(patient)}
      onLongPress={() => handleDeletePatient(patient)}
      delayLongPress={500}
    >
      <View style={styles.patientInfo}>
        <View style={styles.patientNameRow}>
          <Text style={styles.patientName}>{patient.name}</Text>
          {patient.room && (
            <Text style={styles.patientRoom}>{patient.room}</Text>
          )}
        </View>
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
      <Ionicons name="pencil" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  ), [handleEditPatient, handleDeletePatient]);
  
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
  
  // Hospital selector with scan button
  const HospitalPicker = () => (
    <View style={styles.hospitalPickerRow}>
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
      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
              {
                options: ['Cancel', 'Take Photo', 'Photo Library'],
                cancelButtonIndex: 0,
                title: 'Scan Image',
                message: 'Take a photo or select an image to extract patient details',
              },
              (buttonIndex) => {
                if (buttonIndex === 1) {
                  handleScanCamera();
                } else if (buttonIndex === 2) {
                  handleScanLibrary();
                }
              }
            );
          } else {
            setShowScanModal(true);
          }
        }}
        disabled={isScanning || isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="camera" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
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
              
              {/* Room */}
              <Text style={styles.formLabel}>Room</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., CSU 2516-1, Room 302"
                placeholderTextColor={colors.textTertiary}
                value={newPatient.room}
                onChangeText={(text) => setNewPatient(prev => ({ ...prev, room: text }))}
                autoCapitalize="characters"
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
      
      {/* Edit Patient Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancelEdit}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCancelEdit}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Patient</Text>
              <TouchableOpacity onPress={handleSaveEdit}>
                <Text style={styles.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>
            
            {/* Form */}
            {editingPatient && (
              <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
                {/* Hospital Selector */}
                <Text style={styles.formLabel}>Hospital *</Text>
                <View style={styles.hospitalPicker}>
                  {HOSPITAL_ORDER.filter(h => h !== 'OTHER').map(hospital => (
                    <TouchableOpacity
                      key={hospital}
                      style={[
                        styles.hospitalOption,
                        editingPatient.hospital === hospital && styles.hospitalOptionSelected,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEditingPatient(prev => prev ? { ...prev, hospital } : null);
                      }}
                    >
                      <Text style={[
                        styles.hospitalOptionText,
                        editingPatient.hospital === hospital && styles.hospitalOptionTextSelected,
                      ]}>
                        {hospital}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Name */}
                <Text style={styles.formLabel}>Patient Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Last, First"
                  placeholderTextColor={colors.textTertiary}
                  value={editingPatient.name}
                  onChangeText={(text) => setEditingPatient(prev => prev ? { ...prev, name: text } : null)}
                  autoCapitalize="words"
                />
                
                {/* MRN */}
                <Text style={styles.formLabel}>MRN *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Medical Record Number"
                  placeholderTextColor={colors.textTertiary}
                  value={editingPatient.mrn}
                  onChangeText={(text) => setEditingPatient(prev => prev ? { ...prev, mrn: text } : null)}
                  keyboardType="number-pad"
                />
                
                {/* DOB */}
                <Text style={styles.formLabel}>Date of Birth</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor={colors.textTertiary}
                  value={editingPatient.dob}
                  onChangeText={(text) => setEditingPatient(prev => prev ? { ...prev, dob: text } : null)}
                  keyboardType="numbers-and-punctuation"
                />
                
                {/* Room */}
                <Text style={styles.formLabel}>Room</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., CSU 2516-1, Room 302"
                  placeholderTextColor={colors.textTertiary}
                  value={editingPatient.room}
                  onChangeText={(text) => setEditingPatient(prev => prev ? { ...prev, room: text } : null)}
                  autoCapitalize="characters"
                />
                
                {/* Chief Complaint */}
                <View style={styles.formLabelRow}>
                  <Text style={styles.formLabel}>Chief Complaint</Text>
                  <TouchableOpacity 
                    style={styles.quickComplaintsToggle}
                    onPress={() => setShowEditQuickComplaints(!showEditQuickComplaints)}
                  >
                    <Ionicons 
                      name={showEditQuickComplaints ? 'chevron-up' : 'flash'} 
                      size={16} 
                      color={colors.primary} 
                    />
                    <Text style={styles.quickComplaintsToggleText}>Quick</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Quick Complaints Picker */}
                {showEditQuickComplaints && (
                  <View style={styles.quickComplaintsContainer}>
                    {recentComplaints.length > 0 && (
                      <>
                        <Text style={styles.quickComplaintsSection}>Recent</Text>
                        <View style={styles.quickComplaintsList}>
                          {recentComplaints.map((complaint, idx) => (
                            <TouchableOpacity
                              key={`edit-recent-${idx}`}
                              style={styles.quickComplaintChip}
                              onPress={() => {
                                Haptics.selectionAsync();
                                setEditingPatient(prev => prev ? { ...prev, chiefComplaint: complaint } : null);
                                setShowEditQuickComplaints(false);
                              }}
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
                          key={`edit-common-${idx}`}
                          style={styles.quickComplaintChip}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setEditingPatient(prev => prev ? { ...prev, chiefComplaint: complaint } : null);
                            setShowEditQuickComplaints(false);
                          }}
                        >
                          <Text style={styles.quickComplaintText}>{complaint}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                
                <TextInput
                  style={[styles.formInput, styles.formInputMultiline]}
                  placeholder="e.g., DVT consult, LE bypass evaluation"
                  placeholderTextColor={colors.textTertiary}
                  value={editingPatient.chiefComplaint}
                  onChangeText={(text) => setEditingPatient(prev => prev ? { ...prev, chiefComplaint: text } : null)}
                  multiline
                  numberOfLines={2}
                />
                
                {/* Delete Button */}
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => {
                    Alert.alert(
                      'Delete Patient',
                      `Remove ${editingPatient.name} from the list?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            deletePatient(editingPatient.id);
                            handleCancelEdit();
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={styles.deleteButtonText}>Delete Patient</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Pending Patient Modal - from WhatsApp */}
      <Modal
        visible={showPendingPatientModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismissPendingPatient}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleDismissPendingPatient}>
                <Text style={styles.modalCancel}>Dismiss</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>📷 New Patient</Text>
              <TouchableOpacity onPress={handleAcceptPendingPatient}>
                <Text style={styles.modalSave}>Add</Text>
              </TouchableOpacity>
            </View>
            
            {/* Info Banner */}
            <View style={styles.pendingBanner}>
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
              <Text style={styles.pendingBannerText}>
                Patient info received from WhatsApp. Review and add to your list.
              </Text>
            </View>
            
            {/* Form */}
            {pendingPatientEdits && (
              <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
                {/* Hospital Selector */}
                <Text style={styles.formLabel}>Hospital *</Text>
                <View style={styles.hospitalPicker}>
                  {HOSPITAL_ORDER.filter(h => h !== 'OTHER').map(hospital => (
                    <TouchableOpacity
                      key={hospital}
                      style={[
                        styles.hospitalOption,
                        pendingPatientEdits.hospital === hospital && styles.hospitalOptionSelected,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPendingPatientEdits(prev => prev ? { ...prev, hospital } : null);
                      }}
                    >
                      <Text style={[
                        styles.hospitalOptionText,
                        pendingPatientEdits.hospital === hospital && styles.hospitalOptionTextSelected,
                      ]}>
                        {hospital}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Name */}
                <Text style={styles.formLabel}>Patient Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Last, First"
                  placeholderTextColor={colors.textTertiary}
                  value={pendingPatientEdits.name}
                  onChangeText={(text) => setPendingPatientEdits(prev => prev ? { ...prev, name: text } : null)}
                  autoCapitalize="words"
                />
                
                {/* MRN */}
                <Text style={styles.formLabel}>MRN *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Medical Record Number"
                  placeholderTextColor={colors.textTertiary}
                  value={pendingPatientEdits.mrn}
                  onChangeText={(text) => setPendingPatientEdits(prev => prev ? { ...prev, mrn: text } : null)}
                  keyboardType="number-pad"
                />
                
                {/* DOB */}
                <Text style={styles.formLabel}>Date of Birth</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor={colors.textTertiary}
                  value={pendingPatientEdits.dob}
                  onChangeText={(text) => setPendingPatientEdits(prev => prev ? { ...prev, dob: text } : null)}
                  keyboardType="numbers-and-punctuation"
                />
                
                {/* Room */}
                <Text style={styles.formLabel}>Room</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., CSU 2516-1, Room 302"
                  placeholderTextColor={colors.textTertiary}
                  value={pendingPatientEdits.room}
                  onChangeText={(text) => setPendingPatientEdits(prev => prev ? { ...prev, room: text } : null)}
                  autoCapitalize="characters"
                />
                
                {/* Chief Complaint */}
                <View style={styles.formLabelRow}>
                  <Text style={styles.formLabel}>Chief Complaint</Text>
                  <TouchableOpacity 
                    style={styles.quickComplaintsToggle}
                    onPress={() => setShowPendingQuickComplaints(!showPendingQuickComplaints)}
                  >
                    <Ionicons 
                      name={showPendingQuickComplaints ? 'chevron-up' : 'flash'} 
                      size={16} 
                      color={colors.primary} 
                    />
                    <Text style={styles.quickComplaintsToggleText}>Quick</Text>
                  </TouchableOpacity>
                </View>
                
                {/* Quick Complaints Picker */}
                {showPendingQuickComplaints && (
                  <View style={styles.quickComplaintsContainer}>
                    <Text style={styles.quickComplaintsSection}>Common</Text>
                    <View style={styles.quickComplaintsList}>
                      {commonComplaints.slice(0, 10).map((complaint, idx) => (
                        <TouchableOpacity
                          key={`pending-common-${idx}`}
                          style={styles.quickComplaintChip}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setPendingPatientEdits(prev => prev ? { ...prev, chiefComplaint: complaint } : null);
                            setShowPendingQuickComplaints(false);
                          }}
                        >
                          <Text style={styles.quickComplaintText}>{complaint}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                
                <TextInput
                  style={[styles.formInput, styles.formInputMultiline]}
                  placeholder="e.g., DVT consult, LE bypass evaluation"
                  placeholderTextColor={colors.textTertiary}
                  value={pendingPatientEdits.chiefComplaint}
                  onChangeText={(text) => setPendingPatientEdits(prev => prev ? { ...prev, chiefComplaint: text } : null)}
                  multiline
                  numberOfLines={2}
                />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Scan Image Modal */}
      <Modal
        visible={showScanModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowScanModal(false)}
      >
        <TouchableOpacity 
          style={styles.scanModalOverlay}
          activeOpacity={1}
          onPress={() => setShowScanModal(false)}
        >
          <View style={styles.scanModalContent}>
            <Text style={styles.scanModalTitle}>Scan Image</Text>
            <Text style={styles.scanModalSubtitle}>
              Take a photo or select an image to extract patient details
            </Text>
            
            <TouchableOpacity 
              style={styles.scanModalOption}
              onPress={handleScanCamera}
            >
              <Ionicons name="camera" size={24} color={colors.primary} />
              <Text style={styles.scanModalOptionText}>Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.scanModalOption}
              onPress={handleScanLibrary}
            >
              <Ionicons name="images" size={24} color={colors.primary} />
              <Text style={styles.scanModalOptionText}>Photo Library</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.scanModalCancel}
              onPress={() => setShowScanModal(false)}
            >
              <Text style={styles.scanModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Scan Confirmation Modal */}
      <Modal
        visible={showScanConfirmModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancelScan}
      >
        <View style={styles.confirmModalContainer}>
          <View style={styles.confirmModalHeader}>
            <TouchableOpacity onPress={handleCancelScan}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Confirm Details</Text>
            <TouchableOpacity onPress={handleApplyScanData}>
              <Text style={styles.modalSave}>Apply</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.confirmModalContent}>
            {scannedImageUri && (
              <Image 
                source={{ uri: scannedImageUri }} 
                style={styles.scannedImage}
                resizeMode="contain"
              />
            )}
            
            <Text style={styles.confirmSectionTitle}>Extracted Data</Text>
            <Text style={styles.confirmHint}>
              Edit any incorrect values before applying
            </Text>
            
            {pendingScanData && (
              <View style={styles.confirmFields}>
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>Name</Text>
                  <TextInput
                    style={styles.confirmFieldInput}
                    value={pendingScanData.name || ''}
                    onChangeText={(text) => setPendingScanData(prev => prev ? {...prev, name: text} : null)}
                    placeholder="Not detected"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>MRN</Text>
                  <TextInput
                    style={styles.confirmFieldInput}
                    value={pendingScanData.mrn || ''}
                    onChangeText={(text) => setPendingScanData(prev => prev ? {...prev, mrn: text} : null)}
                    placeholder="Not detected"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                  />
                </View>
                
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>Date of Birth</Text>
                  <TextInput
                    style={styles.confirmFieldInput}
                    value={pendingScanData.dob || ''}
                    onChangeText={(text) => setPendingScanData(prev => prev ? {...prev, dob: text} : null)}
                    placeholder="Not detected"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>Room</Text>
                  <TextInput
                    style={styles.confirmFieldInput}
                    value={pendingScanData.room || ''}
                    onChangeText={(text) => setPendingScanData(prev => prev ? {...prev, room: text} : null)}
                    placeholder="Not detected"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>Hospital</Text>
                  <Text style={styles.confirmFieldValue}>
                    {pendingScanData.hospital ? HOSPITAL_NAMES[pendingScanData.hospital] : 'Not detected'}
                  </Text>
                </View>
                
                <View style={styles.confirmField}>
                  <Text style={styles.confirmFieldLabel}>Chief Complaint</Text>
                  <TextInput
                    style={[styles.confirmFieldInput, styles.confirmFieldInputMultiline]}
                    value={pendingScanData.chiefComplaint || ''}
                    onChangeText={(text) => setPendingScanData(prev => prev ? {...prev, chiefComplaint: text} : null)}
                    placeholder="Not detected"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </View>
            )}
            
            {scanError && (
              <Text style={styles.scanErrorText}>{scanError}</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
      
      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>Analyzing image...</Text>
          </View>
        </View>
      )}
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
    flex: 1,
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
  // Patient row with room
  patientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  patientRoom: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.primary,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  // Hospital picker with scan button
  hospitalPickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  // Scan Modal
  scanModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 320,
  },
  scanModalTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  scanModalSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  scanModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySubtle,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  scanModalOptionText: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.primary,
  },
  scanModalCancel: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  scanModalCancelText: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  // Scan Confirmation Modal
  confirmModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  confirmModalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  scannedImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  confirmSectionTitle: {
    fontSize: typography.lg,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  confirmHint: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  confirmFields: {
    gap: spacing.md,
  },
  confirmField: {
    marginBottom: spacing.sm,
  },
  confirmFieldLabel: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  confirmFieldInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmFieldInputMultiline: {
    height: 60,
    textAlignVertical: 'top',
  },
  confirmFieldValue: {
    fontSize: typography.base,
    color: colors.textTertiary,
    fontStyle: 'italic',
    padding: spacing.md,
  },
  scanErrorText: {
    fontSize: typography.sm,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  // Processing Overlay
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  processingText: {
    fontSize: typography.base,
    color: colors.textPrimary,
    fontWeight: typography.medium,
  },
  // Pending patient banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySubtle,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  pendingBannerText: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.primary,
  },
  // Delete button in edit modal
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorSubtle,
  },
  deleteButtonText: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: colors.error,
  },
});
