/**
 * Template Loader for OR Dictation
 * 
 * Maps procedure names/categories to sample operative reports.
 * Returns the most relevant 1-2 sample reports as style references.
 * 
 * Templates are stored as markdown files in src/data/templates/.
 * This module provides keyword-based matching to find the best
 * sample report for a given procedure.
 */

import { ProcedureCategory } from './vascularProcedures';

// Template sections extracted from markdown files.
// Each entry has keywords for matching and the sample report text.
interface TemplateEntry {
  category: ProcedureCategory | string;
  keywords: string[];
  title: string;
  content: string;
}

// We dynamically load templates at runtime from the templates directory.
// Since React Native can't require .md files directly, we use a build-time
// approach: the template content is read and cached on first access via
// the gateway (which has filesystem access).
//
// For now, we use a keyword-based index that maps procedures to categories,
// and the actual template content is fetched from the gateway at report
// generation time.

const PROCEDURE_CATEGORY_MAP: Record<string, string> = {
  // Aortic
  'evar': 'aortic',
  'tevar': 'aortic',
  'open aaa': 'aortic',
  'aortic aneurysm': 'aortic',
  'endovascular aneurysm': 'aortic',
  
  // Carotid
  'cea': 'carotid',
  'carotid endarterectomy': 'carotid',
  'carotid stent': 'carotid',
  'cas': 'carotid',
  
  // Peripheral
  'fem-pop': 'peripheral',
  'femoral popliteal': 'peripheral',
  'fem pop': 'peripheral',
  'angioplasty': 'peripheral',
  'angiogram': 'peripheral',
  'stenting': 'peripheral',
  'thrombectomy': 'peripheral',
  'embolectomy': 'peripheral',
  'fem-fem': 'peripheral',
  'femoral femoral': 'peripheral',
  'bypass': 'peripheral',
  'cfa endarterectomy': 'peripheral',
  'sfa': 'peripheral',
  'tibial': 'peripheral',
  'thrombolysis': 'peripheral',
  'pseudoaneurysm': 'peripheral',
  'lle angio': 'peripheral',
  'lower extremity': 'peripheral',
  
  // Venous
  'ivc filter': 'venous',
  'gsv closure': 'venous',
  'venaseal': 'venous',
  'rfa closure': 'venous',
  'varicose': 'venous',
  'sclerotherapy': 'venous',
  'microphlebectom': 'venous',
  'saphenous': 'venous',
  'dvt': 'venous',
  'pe thrombectomy': 'venous',
  'pulmonary embolism': 'venous',
  'inari': 'venous',
  'picc': 'venous',
  'picc line': 'venous',
  'vein closure': 'venous',
  'iliofemoral': 'venous',
  
  // Dialysis Access
  'av fistula': 'dialysis-access',
  'avf': 'dialysis-access',
  'av graft': 'dialysis-access',
  'avg': 'dialysis-access',
  'fistula creation': 'dialysis-access',
  'radiocephalic': 'dialysis-access',
  'brachiocephalic': 'dialysis-access',
  'brachiobasilic': 'dialysis-access',
  'dialysis catheter': 'dialysis-access',
  'tunneled catheter': 'dialysis-access',
  'tdc': 'dialysis-access',
  'dialysis access': 'dialysis-access',
  'declotting': 'dialysis-access',
  'trialysis': 'dialysis-access',
  'permcath': 'dialysis-access',
  
  // Other
  'bka': 'other',
  'aka': 'other',
  'below knee amputation': 'other',
  'above knee amputation': 'other',
  'amputation': 'other',
  'debridement': 'other',
  'wound': 'other',
  'temporal artery': 'other',
  'port-a-cath': 'other',
  'portacath': 'other',
  'port a cath': 'other',
  'groshong': 'other',
  'central line': 'other',
};

/**
 * Get the template category for a procedure name.
 */
export function getTemplateCategory(procedureName: string): string | null {
  const lower = procedureName.toLowerCase().trim();
  
  // Direct match
  if (PROCEDURE_CATEGORY_MAP[lower]) {
    return PROCEDURE_CATEGORY_MAP[lower];
  }
  
  // Partial match
  for (const [keyword, category] of Object.entries(PROCEDURE_CATEGORY_MAP)) {
    if (lower.includes(keyword) || keyword.includes(lower)) {
      return category;
    }
  }
  
  return null;
}

/**
 * Get all unique template categories for a list of procedures.
 */
export function getTemplateCategoriesForProcedures(procedures: string[]): string[] {
  const categories = new Set<string>();
  for (const proc of procedures) {
    const cat = getTemplateCategory(proc);
    if (cat) categories.add(cat);
  }
  return Array.from(categories);
}

/**
 * Get the template file path for a category.
 */
export function getTemplateFilePath(category: string): string {
  const fileMap: Record<string, string> = {
    'aortic': 'aortic.md',
    'carotid': 'carotid.md',
    'peripheral': 'peripheral.md',
    'venous': 'venous.md',
    'dialysis-access': 'dialysis-access.md',
    'other': 'other.md',
  };
  return fileMap[category] || '';
}

/**
 * Build a style reference instruction for the AI, pointing it to
 * use the sample reports as writing style guides.
 */
export function buildStyleReferencePrompt(categories: string[]): string {
  if (categories.length === 0) return '';
  
  const catNames = categories.map(c => {
    const labels: Record<string, string> = {
      'aortic': 'Aortic',
      'carotid': 'Carotid',
      'peripheral': 'Peripheral Arterial',
      'venous': 'Venous',
      'dialysis-access': 'Dialysis Access',
      'other': 'Other',
    };
    return labels[c] || c;
  });
  
  return `\nSTYLE REFERENCE: The following sample operative reports are from Dr. Aalami's actual practice. Match the writing style, tone, level of detail, terminology, and report structure as closely as possible when generating the new report.`;
}

// Re-export for backward compatibility
export function getTemplateForCategory(category: string): string | null {
  // This will be populated at runtime via gateway filesystem access
  return getTemplateFilePath(category);
}

export function getTemplateForProcedure(procedureName: string): string | null {
  const cat = getTemplateCategory(procedureName);
  if (!cat) return null;
  return getTemplateFilePath(cat);
}
