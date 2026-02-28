/**
 * OR Dictation Service
 * 
 * Builds system prompt for operative report generation,
 * sends to Gateway, and handles email/save actions.
 * 
 * KEY CHANGE: Instructs the AI to use web search (Perplexity)
 * as the PRIMARY source for CPT/ICD-10 codes.
 */

import { GatewayService } from './gateway';
import { useDictationStore, TranscriptPart, CorrectionEntry, StylePreference, SavedExample } from '../stores/dictationStore';
import { getProcedureById, PROCEDURE_TEMPLATES, buildProcedureReference, ProcedureTemplate } from '../data/vascularProcedures';

const OR_SYSTEM_PROMPT = `You are a specialized assistant that converts surgical audio transcripts into complete, structured operative reports following a strict, standardized template. You extract key details from transcripts, format them exactly according to the structure below, and include ICD-10 diagnostic codes in the diagnosis sections and CPT procedure codes in the procedure sections. You also calculate and list total work RVUs in a separate section at the end. If information is missing or uncertain, follow the instructions in the appropriate section.

IMPORTANT — CPT/ICD-10 CODE LOOKUP:
You MUST use web search to look up and verify ALL CPT and ICD-10 codes before including them in the report. Search for the current, correct codes for each procedure and diagnosis mentioned. The local procedure reference codes (if provided below) are hints only — web search results take priority. Always use the most current codes from your search.

STRICT TEMPLATE (use this exact structure for every operative report). Each heading should be BOLD.

**Pre-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Post-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Procedure:**
1. (pulled from the transcript) (CPT XXXXX)
2. (pulled from the transcript) (CPT XXXXX)

**Surgeon:** Oliver Aalami, MD
**Assistant:** (if an assistant is mentioned in the transcript, list them here; if NO assistant is mentioned, put "none")

**Anesthesia:** (pulled from the transcript)

**Specimens:** ("none" if not mentioned)

**Drains:** ("none" if not mentioned)

**Complications:** ("none" if not mentioned)

**Urine output:** ("no foley" if not mentioned)

**EBL:** (put in "TBD" if not mentioned)

**Findings:** (this is obtained from the transcript)

**Indications:** (pulled from the transcript)

**Description of Procedure:** (pulled from the transcript and is the step-by-step descriptive operative procedure)

_____________

**CPT Codes & Work RVUs:**
(list procedure with associated CPT codes and associated work RVU)
**Total work RVU:** (sum up total work RVUs)

_____________

**Open Items:**
(list all the missing or open items needed to be filled out)

---

Rules:
- ALWAYS use web search to verify CPT and ICD-10 codes — do not rely solely on memory or provided references
- Always include a CPT code for EVERY procedure listed
- Always include ICD-10 codes for each diagnosis in both pre- and postoperative diagnosis sections
- If the correct code cannot be confidently determined even after search, insert placeholders such as "[CPT TBD]" or "[ICD-10 TBD]"
- Never include RVU values in the main body of the report; they must only appear in the "CPT Codes & Work RVUs" section
- Use professional, concise, and standardized medical language
- Follow the above structure exactly. Do not add or remove sections
- Include an "Open Items" section at the end for missing data`;

function buildLearningContext(
  corrections: CorrectionEntry[],
  stylePreferences: StylePreference[],
  savedExamples: SavedExample[],
  selectedProcedures: string[],
): string {
  const parts: string[] = [];

  if (corrections.length > 0) {
    parts.push('LEARNED CORRECTIONS (apply these code corrections automatically):');
    corrections.forEach((c) => {
      parts.push(`- When context is "${c.context}": use "${c.corrected}" instead of "${c.original}"`);
    });
  }

  if (stylePreferences.length > 0) {
    parts.push('\nSTYLE PREFERENCES (follow these formatting preferences):');
    stylePreferences.forEach((s) => {
      parts.push(`- Section "${s.section}": ${s.preference}`);
    });
  }

  if (selectedProcedures.length > 0 && savedExamples.length > 0) {
    const relevant = savedExamples
      .filter((e) => selectedProcedures.some(p => 
        e.procedureType.toLowerCase().includes(p.toLowerCase()) ||
        p.toLowerCase().includes(e.procedureType.toLowerCase())
      ))
      .slice(-2);
    if (relevant.length > 0) {
      parts.push('\nEXAMPLE REPORTS FOR REFERENCE:');
      relevant.forEach((e, i) => {
        parts.push(`\n--- Example ${i + 1} (${e.procedureType}) ---\n${e.report}`);
      });
    }
  }

  return parts.join('\n');
}

function buildTranscriptText(parts: TranscriptPart[]): string {
  return parts
    .map((p) => {
      if (p.type === 'image') return `[Image input]: ${p.content}`;
      return p.content;
    })
    .join('\n\n');
}

function findProcedureTemplate(procedureName: string): ProcedureTemplate | undefined {
  const lower = procedureName.toLowerCase().trim();
  const byId = getProcedureById(lower);
  if (byId) return byId;
  return PROCEDURE_TEMPLATES.find((t) => {
    const tName = t.name.toLowerCase();
    return tName.includes(lower) || lower.includes(t.id) ||
      (lower === 'evar' && t.id === 'evar') ||
      (lower === 'tevar' && t.id === 'tevar') ||
      (lower === 'cea' && t.id === 'cea') ||
      (lower === 'cas' && t.id === 'cas') ||
      (lower.includes('carotid') && lower.includes('endart') && t.id === 'cea') ||
      (lower.includes('fem') && lower.includes('pop') && t.id === 'fem_pop_bypass') ||
      (lower.includes('fistula') && t.id === 'av_fistula') ||
      (lower.includes('debridement') && t.id === 'wound_debridement');
  });
}

export async function generateReport(
  gateway: GatewayService,
  transcriptParts: TranscriptPart[],
  selectedProcedures: string[],
): Promise<string> {
  const store = useDictationStore.getState();
  const learningContext = buildLearningContext(
    store.corrections,
    store.stylePreferences,
    store.savedExamples,
    selectedProcedures,
  );

  const transcript = buildTranscriptText(transcriptParts);

  let userMessage = `${OR_SYSTEM_PROMPT}`;

  // Add procedure references as hints
  for (const procName of selectedProcedures) {
    const template = findProcedureTemplate(procName);
    if (template) {
      userMessage += `\n\n${buildProcedureReference(template)}`;
    }
  }

  // Also include custom procedure templates if they exist
  const customProcs = store.customProcedures.filter(cp => 
    selectedProcedures.includes(cp.name) && cp.template
  );
  for (const cp of customProcs) {
    userMessage += `\n\nCUSTOM PROCEDURE REFERENCE: ${cp.name}\n${cp.template}`;
  }

  if (selectedProcedures.length > 0) {
    userMessage += `\n\nSelected procedures: ${selectedProcedures.join(', ')}`;
    userMessage += `\n\nUse web search to verify and find the correct CPT codes, ICD-10 codes, and work RVUs for the above procedures. The reference codes above are hints only.`;
  }

  if (learningContext) {
    userMessage += `\n\n${learningContext}`;
  }

  userMessage += `\n\n---\n\nPLEASE GENERATE AN OPERATIVE REPORT FROM THE FOLLOWING TRANSCRIPT:\n\n${transcript}`;

  const response = await gateway.sendMessage(userMessage);
  return response;
}

export async function regenerateWithCorrections(
  gateway: GatewayService,
  originalReport: string,
  corrections: string,
  transcriptParts: TranscriptPart[],
  selectedProcedures: string[],
): Promise<string> {
  const store = useDictationStore.getState();
  const learningContext = buildLearningContext(
    store.corrections,
    store.stylePreferences,
    store.savedExamples,
    selectedProcedures,
  );

  const transcript = buildTranscriptText(transcriptParts);

  let userMessage = `${OR_SYSTEM_PROMPT}`;

  for (const procName of selectedProcedures) {
    const template = findProcedureTemplate(procName);
    if (template) {
      userMessage += `\n\n${buildProcedureReference(template)}`;
    }
  }

  if (learningContext) {
    userMessage += `\n\n${learningContext}`;
  }

  userMessage += `\n\n---\n\nORIGINAL TRANSCRIPT:\n${transcript}\n\nPREVIOUS REPORT:\n${originalReport}\n\nCORRECTIONS TO APPLY:\n${corrections}\n\nPlease regenerate the operative report incorporating these corrections. Use web search to verify any CPT/ICD-10 codes.`;

  const response = await gateway.sendMessage(userMessage);
  return response;
}

export function buildEmailMessage(report: string, selectedProcedures: string[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const procName = selectedProcedures.length > 0 ? selectedProcedures.join(', ') : 'Procedure';
  return `Please email the following operative report to aalami@gmail.com and Oliver.Aalami@sutterhealth.org with subject 'Operative Report - ${procName} - ${date}':\n\n${report}`;
}
