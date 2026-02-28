/**
 * OR Dictation Service
 * 
 * Builds the system prompt for operative report generation,
 * sends to Gateway, and handles email/save actions.
 */

import { GatewayService } from './gateway';
import { useDictationStore, TranscriptPart, CorrectionEntry, StylePreference, SavedExample } from '../stores/dictationStore';

const OR_SYSTEM_PROMPT = `You are a specialized assistant that converts surgical audio transcripts into complete, structured operative reports following a strict, standardized template. You extract key details from transcripts, format them exactly according to the structure below, and include ICD-10 diagnostic codes in the diagnosis sections and CPT procedure codes in the procedure sections. You also calculate and list total work RVUs in a separate section at the end. If information is missing or uncertain, follow the instructions in the appropriate section.

STRICT TEMPLATE (use this exact structure for every operative report). Each heading should be BOLD.

**Pre-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Post-operative Diagnosis:**
(pulled from the transcript) (ICD-10 XXX.XXX)

**Procedure:**
1. (pulled from the transcript) (CPT XXXXX)
2. (pulled from the transcript) (CPT XXXXX)

**Surgeon:** Oliver Aalami, MD
**Assistant:** (list this section only if mentioned in transcript)

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
- Always include a CPT code for EVERY procedure listed
- Always include ICD-10 codes for each diagnosis in both pre- and postoperative diagnosis sections
- If the correct code cannot be confidently determined, insert placeholders such as "[CPT TBD]" or "[ICD-10 TBD]"
- Never include RVU values in the main body of the report; they must only appear in the "CPT Codes & Work RVUs" section
- Use professional, concise, and standardized medical language
- Follow the above structure exactly. Do not add or remove sections
- Include an "Open Items" section at the end for missing data`;

function buildLearningContext(
  corrections: CorrectionEntry[],
  stylePreferences: StylePreference[],
  savedExamples: SavedExample[],
  procedureType: string | null,
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

  if (procedureType && savedExamples.length > 0) {
    const relevant = savedExamples
      .filter((e) => e.procedureType.toLowerCase().includes(procedureType.toLowerCase()))
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
      if (p.type === 'image') {
        return `[Image input]: ${p.content}`;
      }
      return p.content;
    })
    .join('\n\n');
}

export async function generateReport(
  gateway: GatewayService,
  transcriptParts: TranscriptPart[],
  procedureType: string | null,
): Promise<string> {
  const store = useDictationStore.getState();
  const learningContext = buildLearningContext(
    store.corrections,
    store.stylePreferences,
    store.savedExamples,
    procedureType,
  );

  const transcript = buildTranscriptText(transcriptParts);

  let userMessage = `${OR_SYSTEM_PROMPT}`;
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
  procedureType: string | null,
): Promise<string> {
  const store = useDictationStore.getState();
  const learningContext = buildLearningContext(
    store.corrections,
    store.stylePreferences,
    store.savedExamples,
    procedureType,
  );

  const transcript = buildTranscriptText(transcriptParts);

  let userMessage = `${OR_SYSTEM_PROMPT}`;
  if (learningContext) {
    userMessage += `\n\n${learningContext}`;
  }
  userMessage += `\n\n---\n\nORIGINAL TRANSCRIPT:\n${transcript}\n\nPREVIOUS REPORT:\n${originalReport}\n\nCORRECTIONS TO APPLY:\n${corrections}\n\nPlease regenerate the operative report incorporating these corrections.`;

  const response = await gateway.sendMessage(userMessage);
  return response;
}

export function buildEmailMessage(report: string, procedureType: string | null): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const procName = procedureType || 'Procedure';
  return `Please email the following operative report to aalami@gmail.com and Oliver.Aalami@sutterhealth.org with subject 'Operative Report - ${procName} - ${date}':\n\n${report}`;
}
