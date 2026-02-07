/**
 * Patients Store
 * 
 * Stores patient list data for on-call tracking.
 * Data is stored locally with secure storage (PHI security).
 * Syncs to remote server for search/backup.
 * Organized by call day, grouped by hospital.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { syncPatients } from '../services/patientSync';

// Simple UUID generator (no external dependency)
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Hospital codes matching Oliver's clinical locations
export type Hospital = 'SEQ' | 'ECH' | 'SMCMC' | 'Mills' | 'OTHER';

export const HOSPITAL_NAMES: Record<Hospital, string> = {
  SEQ: 'Sequoia Hospital',
  ECH: 'El Camino Hospital',
  SMCMC: 'San Mateo County Medical Center',
  Mills: 'Mills Peninsula',
  OTHER: 'Other',
};

export interface Patient {
  id: string;
  name: string;
  mrn: string;              // Medical Record Number
  dob: string;              // Date of Birth (MM/DD/YYYY)
  room: string;             // Room/Bed (e.g., "CSU 2516-1")
  hospital: Hospital;
  chiefComplaint: string;
  timeSeen: string;         // ISO timestamp when added
  callDayId: string;        // Reference to call day
}

export interface CallDay {
  id: string;
  date: string;             // ISO date string (YYYY-MM-DD)
  displayDate: string;      // Human readable (e.g., "Feb 6, 2026")
  dayOfWeek: string;        // e.g., "Thursday"
  patientIds: string[];     // Patient IDs for this call day
}

interface PatientsState {
  // Data
  patients: Record<string, Patient>;      // Indexed by patient ID
  callDays: Record<string, CallDay>;      // Indexed by call day ID
  callDayOrder: string[];                 // Ordered list of call day IDs (newest first)
  
  // UI State
  searchQuery: string;
  activeCallDayId: string | null;         // Currently selected call day for adding
  pendingPatient: Omit<Patient, 'id' | 'timeSeen' | 'callDayId'> | null;  // Patient from WhatsApp pending add
  
  // Actions
  addPatient: (patient: Omit<Patient, 'id' | 'timeSeen' | 'callDayId'>, callDayId?: string) => string;
  setPendingPatient: (patient: Omit<Patient, 'id' | 'timeSeen' | 'callDayId'> | null) => void;
  clearPendingPatient: () => void;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  deletePatient: (id: string) => void;
  
  createCallDay: (date?: Date) => string;
  deleteCallDay: (id: string) => void;
  
  setSearchQuery: (query: string) => void;
  setActiveCallDay: (id: string | null) => void;
  
  // Getters
  getPatientsByCallDay: (callDayId: string) => Patient[];
  getPatientsByHospital: (callDayId: string, hospital: Hospital) => Patient[];
  searchPatients: (query: string) => Patient[];
  getTodayCallDay: () => CallDay | null;
  
  // Export
  exportToCSV: () => string;
  
  // Quick add helpers
  getRecentComplaints: (limit?: number) => string[];
  getCommonComplaints: () => string[];
  
  // Maintenance
  fixCallDayLabels: () => void;
  mergeDuplicateDates: () => void;
  reorganizePatientsByTimeSeen: () => void;
}

// Helper to format date for display
const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

const getDayOfWeek = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

const getISODate = (date: Date): string => {
  // Use local timezone, not UTC, to avoid date mismatches
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Custom storage adapter using SecureStore for persistence (PHI security)
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (e) {
      console.log('[Patients] SecureStore get error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.log('[Patients] SecureStore set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {
      console.log('[Patients] SecureStore remove error:', e);
    }
  },
};

export const usePatientsStore = create<PatientsState>()(
  persist(
    (set, get) => ({
      // Initial state
      patients: {},
      callDays: {},
      callDayOrder: [],
      searchQuery: '',
      activeCallDayId: null,
      pendingPatient: null,
      
      // Actions
      setPendingPatient: (patient) => set({ pendingPatient: patient }),
      clearPendingPatient: () => set({ pendingPatient: null }),
      
      addPatient: (patientData, callDayId) => {
        const state = get();
        const today = getISODate(new Date());
        
        console.log('[Patients] Adding patient, today is:', today);
        console.log('[Patients] Explicit callDayId:', callDayId);
        console.log('[Patients] Existing call days:', Object.values(state.callDays).map(cd => cd.date));
        
        // Determine target call day:
        // 1. If explicit callDayId provided, use it
        // 2. Otherwise, ALWAYS use today's date (create if needed)
        let targetCallDayId = callDayId;
        
        if (!targetCallDayId) {
          // Find or create today's call day
          const existingToday = Object.values(state.callDays).find(cd => cd.date === today);
          console.log('[Patients] Found existing today group:', existingToday?.id, existingToday?.date);
          
          if (existingToday) {
            targetCallDayId = existingToday.id;
          } else {
            // Create new call day for today
            console.log('[Patients] Creating new call day for:', today);
            targetCallDayId = get().createCallDay();
          }
        }
        
        console.log('[Patients] Final targetCallDayId:', targetCallDayId);
        
        const patientId = generateUUID();
        const newPatient: Patient = {
          ...patientData,
          id: patientId,
          timeSeen: new Date().toISOString(),
          callDayId: targetCallDayId,
        };
        
        set((state) => ({
          patients: {
            ...state.patients,
            [patientId]: newPatient,
          },
          callDays: {
            ...state.callDays,
            [targetCallDayId!]: {
              ...state.callDays[targetCallDayId!],
              patientIds: [...state.callDays[targetCallDayId!].patientIds, patientId],
            },
          },
          activeCallDayId: targetCallDayId,
        }));
        
        // Sync to server (async, non-blocking)
        const newState = get();
        syncPatients({
          patients: newState.patients,
          callDays: newState.callDays,
          callDayOrder: newState.callDayOrder,
        }).catch(e => console.log('[Patients] Sync error:', e));
        
        return patientId;
      },
      
      updatePatient: (id, updates) => {
        set((state) => ({
          patients: {
            ...state.patients,
            [id]: {
              ...state.patients[id],
              ...updates,
            },
          },
        }));
        
        // Sync to server (async, non-blocking)
        const newState = get();
        syncPatients({
          patients: newState.patients,
          callDays: newState.callDays,
          callDayOrder: newState.callDayOrder,
        }).catch(e => console.log('[Patients] Sync error:', e));
      },
      
      deletePatient: (id) => {
        const patient = get().patients[id];
        if (!patient) return;
        
        set((state) => {
          const { [id]: removed, ...remainingPatients } = state.patients;
          const callDay = state.callDays[patient.callDayId];
          
          return {
            patients: remainingPatients,
            callDays: callDay ? {
              ...state.callDays,
              [patient.callDayId]: {
                ...callDay,
                patientIds: callDay.patientIds.filter(pid => pid !== id),
              },
            } : state.callDays,
          };
        });
        
        // Sync to server (async, non-blocking)
        const newState = get();
        syncPatients({
          patients: newState.patients,
          callDays: newState.callDays,
          callDayOrder: newState.callDayOrder,
        }).catch(e => console.log('[Patients] Sync error:', e));
      },
      
      createCallDay: (date = new Date()) => {
        const isoDate = getISODate(date);
        const state = get();
        
        // Check if call day already exists for this date - STRICT CHECK
        const existing = Object.values(state.callDays).find(cd => cd.date === isoDate);
        if (existing) {
          // Ensure it's active and in order array (deduplicated)
          set((s) => ({
            callDayOrder: [existing.id, ...s.callDayOrder.filter(id => id !== existing.id)],
            activeCallDayId: existing.id,
          }));
          return existing.id;
        }
        
        const callDayId = generateUUID();
        const newCallDay: CallDay = {
          id: callDayId,
          date: isoDate,
          displayDate: formatDisplayDate(date),
          dayOfWeek: getDayOfWeek(date),
          patientIds: [],
        };
        
        set((state) => {
          // Double-check no duplicate was created in the meantime
          const stillNoExisting = !Object.values(state.callDays).find(cd => cd.date === isoDate);
          if (!stillNoExisting) {
            // Another call day was created for this date, abort
            const existingNow = Object.values(state.callDays).find(cd => cd.date === isoDate)!;
            return {
              activeCallDayId: existingNow.id,
              callDayOrder: [existingNow.id, ...state.callDayOrder.filter(id => id !== existingNow.id)],
            };
          }
          
          return {
            callDays: {
              ...state.callDays,
              [callDayId]: newCallDay,
            },
            // Ensure no duplicates in order array
            callDayOrder: [callDayId, ...state.callDayOrder.filter(id => id !== callDayId)],
            activeCallDayId: callDayId,
          };
        });
        
        return callDayId;
      },
      
      deleteCallDay: (id) => {
        const callDay = get().callDays[id];
        if (!callDay) return;
        
        set((state) => {
          const { [id]: removed, ...remainingCallDays } = state.callDays;
          
          // Remove all patients from this call day
          const remainingPatients = { ...state.patients };
          callDay.patientIds.forEach(pid => {
            delete remainingPatients[pid];
          });
          
          return {
            callDays: remainingCallDays,
            callDayOrder: state.callDayOrder.filter(cdId => cdId !== id),
            patients: remainingPatients,
            activeCallDayId: state.activeCallDayId === id ? null : state.activeCallDayId,
          };
        });
        
        // Sync to server (async, non-blocking)
        const newState = get();
        syncPatients({
          patients: newState.patients,
          callDays: newState.callDays,
          callDayOrder: newState.callDayOrder,
        }).catch(e => console.log('[Patients] Sync error:', e));
      },
      
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      setActiveCallDay: (id) => set({ activeCallDayId: id }),
      
      // Getters
      getPatientsByCallDay: (callDayId) => {
        const state = get();
        const callDay = state.callDays[callDayId];
        if (!callDay) return [];
        return callDay.patientIds.map(id => state.patients[id]).filter(Boolean);
      },
      
      getPatientsByHospital: (callDayId, hospital) => {
        return get().getPatientsByCallDay(callDayId).filter(p => p.hospital === hospital);
      },
      
      searchPatients: (query) => {
        const state = get();
        const normalizedQuery = query.toLowerCase().trim();
        if (!normalizedQuery) return [];
        
        return Object.values(state.patients).filter(patient => 
          patient.name.toLowerCase().includes(normalizedQuery) ||
          patient.mrn.toLowerCase().includes(normalizedQuery) ||
          patient.chiefComplaint.toLowerCase().includes(normalizedQuery)
        );
      },
      
      getTodayCallDay: () => {
        const state = get();
        const today = getISODate(new Date());
        return Object.values(state.callDays).find(cd => cd.date === today) || null;
      },
      
      // Quick add helpers
      getRecentComplaints: (limit = 10) => {
        const state = get();
        const complaints = Object.values(state.patients)
          .filter(p => p.chiefComplaint && p.chiefComplaint.trim())
          .sort((a, b) => new Date(b.timeSeen).getTime() - new Date(a.timeSeen).getTime())
          .map(p => p.chiefComplaint.trim())
          .slice(0, limit * 2); // Get more to filter duplicates
        
        // Return unique complaints, preserving order
        const seen = new Set<string>();
        const unique: string[] = [];
        for (const c of complaints) {
          const lower = c.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            unique.push(c);
          }
          if (unique.length >= limit) break;
        }
        return unique;
      },
      
      getCommonComplaints: () => {
        // Common vascular surgery chief complaints
        return [
          'DVT consult',
          'PE consult',
          'LE bypass evaluation',
          'Carotid stenosis',
          'AAA evaluation',
          'Claudication',
          'Critical limb ischemia',
          'Wound care',
          'Dialysis access',
          'AV fistula evaluation',
          'Varicose veins',
          'Chronic venous insufficiency',
          'Acute limb ischemia',
          'Mesenteric ischemia',
          'Aortic dissection',
        ];
      },
      
      // Maintenance: fix any incorrect displayDate/dayOfWeek based on actual date
      fixCallDayLabels: () => {
        const state = get();
        let hasChanges = false;
        const fixedCallDays: Record<string, CallDay> = {};
        
        for (const [id, callDay] of Object.entries(state.callDays)) {
          // Parse the date and regenerate displayDate/dayOfWeek
          const [year, month, day] = callDay.date.split('-').map(Number);
          const dateObj = new Date(year, month - 1, day); // Local timezone
          const correctDisplayDate = formatDisplayDate(dateObj);
          const correctDayOfWeek = getDayOfWeek(dateObj);
          
          if (callDay.displayDate !== correctDisplayDate || callDay.dayOfWeek !== correctDayOfWeek) {
            console.log(`[Patients] Fixing labels for ${callDay.date}: "${callDay.displayDate}" → "${correctDisplayDate}"`);
            fixedCallDays[id] = {
              ...callDay,
              displayDate: correctDisplayDate,
              dayOfWeek: correctDayOfWeek,
            };
            hasChanges = true;
          } else {
            fixedCallDays[id] = callDay;
          }
        }
        
        if (hasChanges) {
          set({ callDays: fixedCallDays });
          
          // Sync fixed data to server
          const newState = get();
          syncPatients({
            patients: newState.patients,
            callDays: newState.callDays,
            callDayOrder: newState.callDayOrder,
          }).catch(e => console.log('[Patients] Sync error:', e));
        }
      },
      
      // Maintenance: merge any duplicate date groups
      mergeDuplicateDates: () => {
        const state = get();
        const dateToCallDay = new Map<string, string>();
        const mergedCallDays: Record<string, CallDay> = {};
        const mergedPatients = { ...state.patients };
        const finalOrder: string[] = [];
        let hadDuplicates = false;
        
        for (const id of state.callDayOrder) {
          const callDay = state.callDays[id];
          if (!callDay) continue;
          
          if (dateToCallDay.has(callDay.date)) {
            // Duplicate date found - merge patients into existing call day
            hadDuplicates = true;
            const existingId = dateToCallDay.get(callDay.date)!;
            const existingCallDay = mergedCallDays[existingId];
            
            // Move patients to existing call day
            for (const patientId of callDay.patientIds) {
              if (mergedPatients[patientId]) {
                mergedPatients[patientId] = {
                  ...mergedPatients[patientId],
                  callDayId: existingId,
                };
                if (!existingCallDay.patientIds.includes(patientId)) {
                  existingCallDay.patientIds.push(patientId);
                }
              }
            }
            console.log(`[Patients] Merged duplicate ${callDay.date} into ${existingId}`);
          } else {
            // First occurrence of this date
            dateToCallDay.set(callDay.date, id);
            mergedCallDays[id] = { ...callDay };
            finalOrder.push(id);
          }
        }
        
        if (hadDuplicates) {
          // Sort by date (newest first)
          finalOrder.sort((a, b) => {
            const dateA = mergedCallDays[a]?.date || '';
            const dateB = mergedCallDays[b]?.date || '';
            return dateB.localeCompare(dateA);
          });
          
          set({
            callDayOrder: finalOrder,
            callDays: mergedCallDays,
            patients: mergedPatients,
          });
          
          // Sync cleaned data to server
          syncPatients({
            patients: mergedPatients,
            callDays: mergedCallDays,
            callDayOrder: finalOrder,
          }).catch(e => console.log('[Patients] Sync error:', e));
        }
      },
      
      // Maintenance: reorganize patients into correct date groups based on timeSeen
      reorganizePatientsByTimeSeen: () => {
        const state = get();
        const updatedPatients: Record<string, Patient> = {};
        const updatedCallDays: Record<string, CallDay> = {};
        const dateToCallDayId: Map<string, string> = new Map();
        let hasChanges = false;
        
        console.log('[Patients] Reorganizing patients by timeSeen...');
        
        // First, create/find call days for each patient based on their timeSeen
        for (const patient of Object.values(state.patients)) {
          // Parse timeSeen to get local date
          const seenDate = new Date(patient.timeSeen);
          const patientDate = getISODate(seenDate);
          
          console.log(`[Patients] Patient ${patient.name}: timeSeen=${patient.timeSeen} → date=${patientDate}`);
          
          // Find or create call day for this date
          let callDayId = dateToCallDayId.get(patientDate);
          
          if (!callDayId) {
            // Look for existing call day with this date
            const existingCallDay = Object.values(state.callDays).find(cd => cd.date === patientDate);
            
            if (existingCallDay) {
              callDayId = existingCallDay.id;
              updatedCallDays[callDayId] = { ...existingCallDay, patientIds: [] };
            } else {
              // Create new call day
              callDayId = generateUUID();
              const dateObj = new Date(seenDate.getFullYear(), seenDate.getMonth(), seenDate.getDate());
              updatedCallDays[callDayId] = {
                id: callDayId,
                date: patientDate,
                displayDate: formatDisplayDate(dateObj),
                dayOfWeek: getDayOfWeek(dateObj),
                patientIds: [],
              };
              console.log(`[Patients] Created new call day for ${patientDate}`);
            }
            dateToCallDayId.set(patientDate, callDayId);
          }
          
          // Check if patient needs to move
          if (patient.callDayId !== callDayId) {
            console.log(`[Patients] Moving ${patient.name} from ${patient.callDayId} to ${callDayId}`);
            hasChanges = true;
          }
          
          // Update patient with correct callDayId
          updatedPatients[patient.id] = {
            ...patient,
            callDayId: callDayId,
          };
          
          // Add patient to call day
          if (!updatedCallDays[callDayId]) {
            const existingCallDay = state.callDays[callDayId];
            if (existingCallDay) {
              updatedCallDays[callDayId] = { ...existingCallDay, patientIds: [] };
            }
          }
          if (updatedCallDays[callDayId]) {
            updatedCallDays[callDayId].patientIds.push(patient.id);
          }
        }
        
        // Include any call days that have no patients (keep them)
        for (const [id, callDay] of Object.entries(state.callDays)) {
          if (!updatedCallDays[id]) {
            updatedCallDays[id] = { ...callDay, patientIds: [] };
          }
        }
        
        // Sort call day order by date (newest first)
        const newOrder = Object.keys(updatedCallDays).sort((a, b) => {
          const dateA = updatedCallDays[a]?.date || '';
          const dateB = updatedCallDays[b]?.date || '';
          return dateB.localeCompare(dateA);
        });
        
        console.log(`[Patients] Reorganization complete. Changes: ${hasChanges}`);
        console.log(`[Patients] Call days:`, Object.values(updatedCallDays).map(cd => `${cd.date}: ${cd.patientIds.length} patients`));
        
        // Always apply (to fix patientIds arrays even if callDayId didn't change)
        set({
          patients: updatedPatients,
          callDays: updatedCallDays,
          callDayOrder: newOrder,
        });
        
        // Sync to server
        syncPatients({
          patients: updatedPatients,
          callDays: updatedCallDays,
          callDayOrder: newOrder,
        }).catch(e => console.log('[Patients] Sync error:', e));
      },
      
      // Export
      exportToCSV: () => {
        const state = get();
        const headers = ['Call Date', 'Day', 'Hospital', 'Room', 'Patient Name', 'MRN', 'DOB', 'Chief Complaint', 'Time Seen'];
        const rows: string[][] = [headers];
        
        // Sort call days by date (newest first)
        const sortedCallDays = [...state.callDayOrder]
          .map(id => state.callDays[id])
          .filter(Boolean);
        
        sortedCallDays.forEach(callDay => {
          const patients = get().getPatientsByCallDay(callDay.id);
          
          // Sort patients by hospital, then by time seen
          const sortedPatients = [...patients].sort((a, b) => {
            if (a.hospital !== b.hospital) {
              return a.hospital.localeCompare(b.hospital);
            }
            return new Date(a.timeSeen).getTime() - new Date(b.timeSeen).getTime();
          });
          
          sortedPatients.forEach(patient => {
            rows.push([
              callDay.displayDate,
              callDay.dayOfWeek,
              HOSPITAL_NAMES[patient.hospital],
              patient.room || '',
              patient.name,
              patient.mrn,
              patient.dob,
              patient.chiefComplaint,
              new Date(patient.timeSeen).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }),
            ]);
          });
        });
        
        // Convert to CSV string
        return rows.map(row => 
          row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
        ).join('\n');
      },
    }),
    {
      name: 'echo-patients',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        patients: state.patients,
        callDays: state.callDays,
        callDayOrder: state.callDayOrder,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        
        // Run cleanup after a short delay to ensure store is ready
        setTimeout(() => {
          // This is the master fix - reorganize all patients by their timeSeen
          usePatientsStore.getState().reorganizePatientsByTimeSeen();
          console.log('[Patients] Rehydration cleanup complete');
        }, 100);
      },
    }
  )
);
