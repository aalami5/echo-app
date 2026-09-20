import { create } from 'zustand';
import { usePatientsStore } from '../stores/patientsStore';
import { usePatientDictationsStore } from '../stores/patientDictationsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { syncPatients } from './patientSync';
import { syncFinalizedDictations } from './dictationSync';

export const useClinicalRestoreStatus = create<{busy:boolean; error:string|null; lastRestored:string|null}>()(() => ({busy:false,error:null,lastRestored:null}));
let inFlight: Promise<void> | null = null;

// Restore only records missing locally. Existing phone content is never replaced.
// Deliberate local removals remain hidden on that device; server history survives.
export function restoreClinicalData(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    useClinicalRestoreStatus.setState({busy:true,error:null});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      for (const store of [usePatientsStore, usePatientDictationsStore]) {
        if (!store.persist.hasHydrated()) await store.persist.rehydrate();
      }
      const {gatewayUrl,gatewayToken}=useSettingsStore.getState();
      if (!gatewayUrl || !gatewayToken) throw new Error('Sign in and connect Echo before restoring saved cases.');
      const base=gatewayUrl.replace(/\/+$/,'');
      const request=async (url:string) => {
        const r=await fetch(base+url,{headers:{Authorization:`Bearer ${gatewayToken}`},signal:controller.signal});
        if (!r.ok) throw new Error(r.status===401 || r.status===403 ? 'Your connection needs to be refreshed in Settings. Local cases are unchanged.' : 'Saved cases are temporarily unavailable. Local cases are unchanged.');
        return r.json();
      };
      const [patients,reports]=await Promise.all([request('/patients/list'),request('/patients/dictations/list')]);
      // Validate BOTH datasets before touching either local store.
      if (!patients.patients || !patients.callDays || !Array.isArray(patients.callDayOrder) || !reports.dictations || Array.isArray(reports.dictations)) throw new Error('The server returned an invalid backup. Local cases are unchanged.');
      for (const [id,p] of Object.entries(patients.patients) as [string,any][]) {
        if (!p || p.id!==id || typeof p.name!=='string' || !patients.callDays[p.callDayId]) throw new Error('The patient backup needs repair. Local cases are unchanged.');
      }
      for (const [id,r] of Object.entries(reports.dictations) as [string,any][]) {
        if (!r || r.id!==id || typeof r.patientId!=='string' || !Array.isArray(r.transcriptParts)) throw new Error('The report backup needs repair. Local cases are unchanged.');
      }
      usePatientsStore.getState().restoreMissing(patients);
      usePatientDictationsStore.getState().restoreMissing(reports.dictations);
      useClinicalRestoreStatus.setState({lastRestored:new Date().toISOString()});
    } catch (error) {
      useClinicalRestoreStatus.setState({error:error instanceof Error ? error.message : 'Could not restore saved cases.'});
      throw error;
    } finally {clearTimeout(timer);useClinicalRestoreStatus.setState({busy:false});}
  })().finally(()=>{inFlight=null;});
  return inFlight;
}

export async function backupClinicalData(): Promise<void> {
  const {patients,callDays,callDayOrder}=usePatientsStore.getState();
  const results=await Promise.all([
    syncPatients({patients,callDays,callDayOrder}),
    syncFinalizedDictations(usePatientDictationsStore.getState().dictations),
  ]);
  if(results.some(r=>!r.success)) {
    useClinicalRestoreStatus.setState({error:'Cases remain on this device. Server backup is pending; keep this phone until it completes.'});
  }
}
