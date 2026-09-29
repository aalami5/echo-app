/** Draft first, then edit the displayed report. No historical-case comparison. */
import type { GatewayService } from './gateway';
import { useDictationStore, TranscriptPart } from '../stores/dictationStore';
import { caseSources, extractCaseImages, operativeRequest, DraftResult, sourceFingerprint } from './operativeDrafting';

type Options={caseId?:string;onSource?:(part:TranscriptPart)=>void;onProgress?:(stage:string)=>void;getCurrentParts?:()=>TranscriptPart[];onResult?:(result:DraftResult,fingerprint:string)=>void};
async function compose(parts:TranscriptPart[],selectedProcedures:string[],options:Options,previousReport?:string,editInstructions?:string):Promise<string>{
  const sources=await extractCaseImages(parts,options.onSource,options.onProgress);
  const fingerprint=sourceFingerprint(sources);
  const result=await operativeRequest<DraftResult>('/compose',{caseId:options.caseId||'standalone',sources:caseSources(sources),selectedProcedures,previousReport,editInstructions,stylePreferences:useDictationStore.getState().stylePreferences},options.onProgress);
  if(options.getCurrentParts&&sourceFingerprint(options.getCurrentParts())!==fingerprint)throw Error('Your notes changed while drafting. Generate again to include those changes; the existing report is unchanged.');
  options.onResult?.(result,fingerprint);
  return result.report;
}
export async function generateReport(_gateway:GatewayService,parts:TranscriptPart[],selectedProcedures:string[],options:Options={}):Promise<string>{
  return compose(parts,selectedProcedures,options);
}
export async function regenerateWithCorrections(_gateway:GatewayService,previousReport:string,corrections:string,parts:TranscriptPart[],procedures:string[],options:Options={}):Promise<string>{
  const correction:TranscriptPart={id:`correction-${Date.now()}`,type:'text',sourceKind:'correction',content:corrections,timestamp:new Date().toISOString()};
  const updatedParts=[...parts,correction];
  options.onSource?.(correction);
  return compose(updatedParts,procedures,options,previousReport,corrections);
}
export function buildEmailMessage(report:string,_procedures:string[]):string{
  return `Please email the following operative report to aalami@gmail.com, Oliver.Aalami@sutterhealth.org, and Rajka.Campbell@sutterhealth.org with subject 'Operative Report - ${new Date().toLocaleDateString('en-US')}':\n\n${report}`;
}
