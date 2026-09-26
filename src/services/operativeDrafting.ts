import { ensureGatewayConfig, refreshGatewayConfig } from './gatewayBootstrap';
import { useSettingsStore } from '../stores/settingsStore';
import type { TranscriptPart } from '../stores/dictationStore';

export interface TechniqueSuggestion { procedure:string; profileId:string|null; version:number; origin:string; steps:string[] }
export interface CaseFact { id:string; field:string; value:string; sourceId:string; quote:string }
export interface CaseAnalysis { id:string; caseId:string; procedures:string[]; facts:CaseFact[]; review:string[]; suggestions:TechniqueSuggestion[]; policyVersion:string }
export interface DraftResult { facts:CaseFact[]; report:string; review:string[]; statements:{section:string;text:string;evidence:string[]}[]; confirmedSteps:{id:string;text:string;procedure:string;profileId?:string;version:number}[]; sessionId:string; policyVersion:string; createdAt:string }
export interface ReportReview { facts?:CaseFact[]; sourceFingerprint?:string; manuallyEdited?:boolean; sessionId:string; policyVersion:string; review:string[]; statements:DraftResult['statements']; confirmedSteps:DraftResult['confirmedSteps']; reviewedAt?:string }

export async function operativeRequest<T>(path:string,body?:unknown):Promise<T>{
  if(!await ensureGatewayConfig())throw Error('Connect Echo in Settings before drafting.');
  for(let attempt=0;attempt<2;attempt++){
    const {gatewayUrl,gatewayToken}=useSettingsStore.getState();
    if(!gatewayUrl||!gatewayToken)throw Error('Connect Echo in Settings before drafting.');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),330000);
    try{
      const r=await fetch(`${gatewayUrl.replace(/\/+$/,'')}/patients/operative${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${gatewayToken}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      if((r.status===401||r.status===403)&&attempt===0&&await refreshGatewayConfig())continue;
      const result=await r.json().catch(()=>null);
      if(!r.ok)throw Error(result?.error||'Operative drafting is unavailable. Your notes are saved; try again.');
      if(!result)throw Error('The draft response could not be read.');
      return result;
    }catch(e){if(controller.signal.aborted)throw Error('Drafting took too long. Your notes are saved; please retry.');throw e;}
    finally{clearTimeout(timer);}
  }
  throw Error('Reconnect Echo in Settings and try again.');
}
export function sourceFingerprint(parts:TranscriptPart[]):string{
  return JSON.stringify(parts.map(p=>[p.id,p.type,p.content,p.timestamp,p.sourceKind,p.ocrText,p.ocrWarnings]));
}
export async function extractCaseImages(parts:TranscriptPart[],onExtracted?:(part:TranscriptPart)=>void):Promise<TranscriptPart[]>{
  const out:TranscriptPart[]=[];
  for(const part of parts){
    if(part.type!=='image'||part.ocrText){out.push(part);continue;}
    if(!part.imageBase64||!part.imageMimeType)throw Error('This screenshot has no saved extracted text or image. Reattach it before generating.');
    const result=await operativeRequest<{text:string;warnings:string[]}>('/ocr',{imageBase64:part.imageBase64,mimeType:part.imageMimeType});
    const extracted={...part,ocrText:result.text,ocrWarnings:result.warnings};
    onExtracted?.(extracted);out.push(extracted);
  }
  return out;
}
export function caseSources(parts:TranscriptPart[]){
  return parts.map(p=>({id:p.id,kind:p.sourceKind==='historical'||p.id.endsWith('-copy')?'historical':p.id.endsWith('-header')?'header':p.sourceKind==='correction'?'correction':p.type==='image'?'ocr':p.type,text:p.type==='image'?`${p.content}\n${p.ocrText||''}`:p.content,warnings:p.ocrWarnings||[]}));
}
export async function analyzeCase(caseId:string,parts:TranscriptPart[],selectedProcedures:string[],customProcedures:string[]){
  return operativeRequest<CaseAnalysis>('/analyze',{caseId,sources:caseSources(parts),selectedProcedures,customProcedures});
}
