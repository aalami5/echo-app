/** Keep review provenance outside the text used for dictation/copy/email. */
export interface RoutineDefault { section: string; text: string }

const headingPattern = /^\s*(?:\*\*([^*\n]+?)\*\*:?[ \t]*|(?:#{1,6} )?(Pre-operative Diagnosis|Post-operative Diagnosis|Procedure\(s\)|Surgeon|Assistant|Anesthesia|Specimens|Drains|Complications|Urine output|Estimated blood loss|Fluids|Contrast|Fluoroscopy|Findings|Indications|Description of Procedure|Disposition):?[ \t]*)$/gm;
function headings(report: string) {
  return Array.from(report.matchAll(new RegExp(headingPattern))).map(m => ({
    section: (m[1] || m[2]).replace(/:$/, '').trim(), start: m.index!, end: m.index! + m[0].length,
  }));
}
export function separateRoutineDefaults(report: string): { report: string; routineDefaults: RoutineDefault[] } {
  const sections = headings(report);
  const routineDefaults: RoutineDefault[] = [];
  const clean = report.replace(/\[Suggested:\s*([^\]\n]+)\]/g, (_match, value: string, offset: number) => {
    const section = sections.filter(s => s.start < offset).at(-1)?.section || 'Report';
    routineDefaults.push({ section, text: value.trim() });
    return value.trim();
  });
  return { report: clean, routineDefaults };
}

/** Reattach provenance ONLY for model input, scoped to the original section.
 * A changed/deleted manual passage is never restored from a default. */
export function reportForAIEditing(report: string, defaults: RoutineDefault[] = []): string {
  const sections = headings(report);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const d of defaults) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.section !== d.section || !d.text) continue;
      const end = sections[i + 1]?.start ?? report.length;
      const body = report.slice(s.end, end);
      // Existing inline markers already carry provenance; avoid nesting.
      if (body.includes(`[Suggested: ${d.text}]`)) continue;
      const at = body.indexOf(d.text);
      if (at < 0 || body.indexOf(d.text, at + d.text.length) !== -1) continue;
      const start = s.end + at;
      if (!edits.some(e => e.start === start)) edits.push({ start, end: start + d.text.length, text: `[Suggested: ${d.text}]` });
    }
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) report = report.slice(0, e.start) + e.text + report.slice(e.end);
  return report;
}
