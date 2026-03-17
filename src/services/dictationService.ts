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

import { getTemplateCategoriesForProcedures, buildStyleReferencePrompt } from '../data/templateLoader';
import { findBestTemplates, TemplateCategory } from '../data/templateContent';

const OR_SYSTEM_PROMPT = `You are a specialized assistant that converts surgical audio transcripts into complete, structured operative reports following a strict, standardized template. You extract key details from transcripts, format them exactly according to the structure below, and include ICD-10 diagnostic codes in the diagnosis sections and CPT procedure codes in the procedure sections. If information is missing or uncertain, follow the smart defaults below.

IMPORTANT — SMART DEFAULTS:
When the surgeon does NOT explicitly mention the following in their dictation, use these defaults automatically. Do NOT list these as "Open Items" — they are assumed unless stated otherwise:
- **Surgeon:** Oliver Aalami, MD (always default to this unless another surgeon is named)
- **Assistant:** None (assume no assistant unless one is explicitly mentioned)
- **Urine output:** No Foley (assume no Foley placed unless mentioned)
- **Specimens:** None (assume no specimens unless explicitly mentioned)
- **Drains:** None (assume no drains unless explicitly mentioned)
- **Complications:** None (assume no complications unless explicitly mentioned)
- **EBL:** TBD (only list as open item if truly relevant to the procedure)

These defaults reflect Dr. Aalami's standard practice. Only override them if the transcript explicitly states otherwise.

IMPORTANT — CPT/ICD-10 CODES:
Use ONLY the procedure reference codes provided below (from the local code library). Do NOT use web search for codes — it is too slow. If a CPT or ICD-10 code is not available in the provided reference, simply OMIT it — do NOT write "TBD" or any placeholder. Speed is critical — generate the report quickly without any external lookups.

STRICT TEMPLATE (use this exact structure for every operative report). Each heading should be BOLD.

**Pre-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Post-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Procedure:**
1. (pulled from the transcript) (CPT XXXXX)
2. (pulled from the transcript) (CPT XXXXX)

**Surgeon:** Oliver Aalami, MD
**Assistant:** (from transcript, or "None" if not mentioned)

**Anesthesia:** (pulled from the transcript)

**Specimens:** (from transcript, or "None" if not mentioned)

**Drains:** (from transcript, or "None" if not mentioned)

**Complications:** (from transcript, or "None" if not mentioned)

**Urine output:** (from transcript, or "No Foley" if not mentioned)

**EBL:** (from transcript, or "TBD" if not mentioned)

**Findings:** (this is obtained from the transcript)

**Indications:** (pulled from the transcript)

**Description of Procedure:** (pulled from the transcript and is the step-by-step descriptive operative procedure)

_____________

**Open Items:**
(list ONLY genuinely missing clinical details that affect the report — do NOT list items covered by smart defaults above)

---

Rules:
- Do NOT use web search for CPT/ICD-10 codes — use only the provided reference codes below
- If a code is not in the provided reference, use "TBD" as placeholder
- Include CPT codes for procedures when available from the provided reference; omit code if not available
- Include ICD-10 codes for diagnoses when available from the provided reference; omit code if not available
- Use professional, concise, and standardized medical language
- Follow the above structure exactly. Do not add or remove sections
- Apply smart defaults for any fields not mentioned in the transcript
- When a STYLE REFERENCE report is provided below, match its writing style, tone, level of detail, and phrasing patterns closely — this is how Dr. Aalami writes his reports
- Include an "Open Items" section at the end ONLY for genuinely missing clinical information
- SPEED IS CRITICAL — generate the report as fast as possible without external lookups
- The transcript will begin with an intro line like "This is Dr. Aalami dictating an operative report for [Patient], MRN [number], date of operation [date]." — ALWAYS include this line verbatim as the very first line of the generated report, before "Pre-operative Diagnosis"
- If a CPT or ICD-10 code is NOT available in the provided reference, simply OMIT the code entirely — do NOT write "TBD", "N/A", or any placeholder. Just list the procedure/diagnosis name without a code.
- In the "Open Items" section, do NOT list missing CPT/ICD-10 codes as open items. Only list genuinely missing CLINICAL information (e.g., missing operative details, unclear anatomy, etc.).`;

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
    userMessage += `\n\nUse the CPT codes and ICD-10 codes from the procedure references above. If a code is not available, simply omit it — do NOT write TBD. Do NOT search the web for codes.`;
  }

  // Add style reference from sample operative reports
  const categories = getTemplateCategoriesForProcedures(selectedProcedures);
  if (categories.length > 0) {
    const stylePrompt = buildStyleReferencePrompt(categories);
    userMessage += `\n\n${stylePrompt}`;
    
    // Find best matching sample reports for each selected procedure
    for (const procName of selectedProcedures) {
      for (const cat of categories) {
        const bestTemplates = findBestTemplates(procName, cat as TemplateCategory);
        for (const tmpl of bestTemplates) {
          userMessage += `\n\n--- SAMPLE REPORT: ${tmpl.title} ---\n${tmpl.content}`;
        }
      }
    }
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

  // Add style reference from sample operative reports
  const categories = getTemplateCategoriesForProcedures(selectedProcedures);
  if (categories.length > 0) {
    const stylePrompt = buildStyleReferencePrompt(categories);
    userMessage += `\n\n${stylePrompt}`;
    
    for (const procName of selectedProcedures) {
      for (const cat of categories) {
        const bestTemplates = findBestTemplates(procName, cat as TemplateCategory);
        for (const tmpl of bestTemplates) {
          userMessage += `\n\n--- SAMPLE REPORT: ${tmpl.title} ---\n${tmpl.content}`;
        }
      }
    }
  }

  if (learningContext) {
    userMessage += `\n\n${learningContext}`;
  }

  userMessage += `\n\n---\n\nORIGINAL TRANSCRIPT:\n${transcript}\n\nPREVIOUS REPORT:\n${originalReport}\n\nCORRECTIONS TO APPLY:\n${corrections}\n\nPlease regenerate the operative report incorporating these corrections. Use the provided reference codes only — do not search the web.`;

  const response = await gateway.sendMessage(userMessage);
  return response;
}

export function buildEmailMessage(report: string, selectedProcedures: string[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `Please email the following operative report to aalami@gmail.com, Oliver.Aalami@sutterhealth.org, and Rajka.Campbell@sutterhealth.org with subject 'Operative Report - ${date}':\n\n${report}`;
}
