/** Shared report pipeline: current case evidence first, never historical defaults. */
import type { GatewayService } from './gateway';
import { useDictationStore, TranscriptPart } from '../stores/dictationStore';
import { analyzeCase, extractCaseImages, operativeRequest, DraftResult } from './operativeDrafting';

type Options={caseId?:string;onSource?:(part:TranscriptPart)=>void;confirmedSteps?:DraftResult['confirmedSteps'];onResult?:(result:DraftResult)=>void};
export async function generateReport(_gateway:GatewayService,parts:TranscriptPart[],selectedProcedures:string[],options:Options={}):Promise<string>{
  const sources=await extractCaseImages(parts,options.onSource);
  const analysis=await analyzeCase(options.caseId||'standalone',sources,selectedProcedures,useDictationStore.getState().customProcedures.map(p=>p.name));
  const result=await operativeRequest<DraftResult>('/draft',{sessionId:analysis.id,confirmedSteps:options.confirmedSteps||[],stylePreferences:useDictationStore.getState().stylePreferences});
  options.onResult?.(result);
  return result.report;
}
export async function regenerateWithCorrections(gateway:GatewayService,_previousReport:string,corrections:string,parts:TranscriptPart[],procedures:string[],options:Options={}):Promise<string>{
  const correction:TranscriptPart={id:`correction-${Date.now()}`,type:'text',sourceKind:'correction',content:corrections,timestamp:new Date().toISOString()};
  // Persist the correction as evidence before calling the model. Previous generated
  // prose is never promoted to a source for a subsequent draft.
  options.onSource?.(correction);
  return generateReport(gateway,[...parts,correction],procedures,options);
}
export function buildEmailMessage(report:string,_procedures:string[]):string{
  return `Please email the following operative report to aalami@gmail.com, Oliver.Aalami@sutterhealth.org, and Rajka.Campbell@sutterhealth.org with subject 'Operative Report - ${new Date().toLocaleDateString('en-US')}':\n\n${report}`;
}
