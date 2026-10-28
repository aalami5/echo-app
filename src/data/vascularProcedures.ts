/**
 * Vascular Surgery Procedure Code Library
 * 
 * Comprehensive CPT, ICD-10, and work RVU reference for
 * common vascular surgery procedures performed by Oliver Aalami, MD.
 * 
 * Used by the OR Dictation feature as context/hints.
 * Web search (Perplexity) is the PRIMARY source for codes;
 * this library provides fallback references.
 * 
 * Sources: CMS 2026 Physician Fee Schedule, AMA CPT codebook
 */

export interface ProcedureCode {
  cpt: string;
  description: string;
  workRVU: number;
}

export interface DiagnosisCode {
  icd10: string;
  description: string;
}

export interface ProcedureTemplate {
  id: string;
  name: string;
  category: ProcedureCategory;
  commonCPT: ProcedureCode[];
  commonICD10: DiagnosisCode[];
  typicalSteps: string[];
  typicalAnesthesia: string;
  addOnCodes?: ProcedureCode[];
}

export type ProcedureCategory =
  | 'aortic'
  | 'carotid'
  | 'peripheral_arterial'
  | 'venous'
  | 'dialysis_access'
  | 'other';

export const CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  aortic: 'Aortic',
  carotid: 'Carotid',
  peripheral_arterial: 'Peripheral Arterial',
  venous: 'Venous',
  dialysis_access: 'Dialysis Access',
  other: 'Other',
};

export const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  // ==================== AORTIC ====================
  {
    id: 'evar',
    name: 'EVAR',
    category: 'aortic',
    commonCPT: [
      { cpt: '34802', description: 'EVAR with modular bifurcated prosthesis, 1 docking limb', workRVU: 26.37 },
      { cpt: '34803', description: 'EVAR with modular bifurcated prosthesis, 2 docking limbs', workRVU: 28.89 },
      { cpt: '34812', description: 'Open femoral artery exposure for EVAR, unilateral', workRVU: 5.93 },
      { cpt: '34813', description: 'Femoral artery closure with device', workRVU: 3.51 },
    ],
    commonICD10: [
      { icd10: 'I71.4', description: 'Abdominal aortic aneurysm, without rupture' },
      { icd10: 'I71.3', description: 'Abdominal aortic aneurysm, ruptured' },
    ],
    typicalSteps: [
      'Bilateral groin access',
      'Guidewire and catheter placement',
      'Aortography',
      'Main body deployment',
      'Contralateral limb cannulation and deployment',
      'Completion angiography',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'General endotracheal anesthesia',
  },
  {
    id: 'tevar',
    name: 'TEVAR',
    category: 'aortic',
    commonCPT: [
      { cpt: '33880', description: 'TEVAR, covering left subclavian, initial', workRVU: 30.00 },
      { cpt: '33881', description: 'TEVAR, not covering left subclavian, initial', workRVU: 27.00 },
      { cpt: '34812', description: 'Open femoral artery exposure, unilateral', workRVU: 5.93 },
    ],
    commonICD10: [
      { icd10: 'I71.2', description: 'Thoracic aortic aneurysm, without rupture' },
      { icd10: 'I71.1', description: 'Thoracic aortic aneurysm, ruptured' },
      { icd10: 'I71.01', description: 'Dissection of thoracic aorta' },
    ],
    typicalSteps: [
      'Femoral artery access',
      'Guidewire traversal of aortic arch',
      'Aortography',
      'Device deployment',
      'Completion aortography',
      'Femoral closure',
    ],
    typicalAnesthesia: 'General endotracheal anesthesia',
  },
  {
    id: 'open_aaa',
    name: 'Open AAA Repair',
    category: 'aortic',
    commonCPT: [
      { cpt: '35081', description: 'Repair AAA, infrarenal, tube graft', workRVU: 37.04 },
      { cpt: '35082', description: 'Repair AAA, infrarenal, aortobifemoral graft', workRVU: 40.40 },
    ],
    commonICD10: [
      { icd10: 'I71.4', description: 'Abdominal aortic aneurysm, without rupture' },
      { icd10: 'I71.3', description: 'Abdominal aortic aneurysm, ruptured' },
    ],
    typicalSteps: [
      'Midline laparotomy',
      'Retroperitoneal dissection and aortic exposure',
      'Proximal and distal control',
      'Heparinization',
      'Aortotomy and thrombus evacuation',
      'Graft anastomosis',
      'De-clamping and flow assessment',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'General endotracheal anesthesia',
  },

  // ==================== CAROTID ====================
  {
    id: 'cea',
    name: 'Carotid Endarterectomy (CEA)',
    category: 'carotid',
    commonCPT: [
      { cpt: '35301', description: 'Thromboendarterectomy, carotid, by neck incision', workRVU: 23.16 },
    ],
    commonICD10: [
      { icd10: 'I65.21', description: 'Occlusion and stenosis of right carotid artery' },
      { icd10: 'I65.22', description: 'Occlusion and stenosis of left carotid artery' },
      { icd10: 'G45.9', description: 'Transient cerebral ischemic attack, unspecified' },
    ],
    typicalSteps: [
      'Oblique neck incision along SCM',
      'Exposure of common, internal, and external carotid arteries',
      'Systemic heparinization',
      'Carotid cross-clamp',
      'Arteriotomy',
      'Endarterectomy with plaque removal',
      'Patch angioplasty',
      'Restoration of flow',
      'Hemostasis and layered closure',
    ],
    typicalAnesthesia: 'General endotracheal anesthesia',
  },
  {
    id: 'cas',
    name: 'Carotid Artery Stenting (CAS)',
    category: 'carotid',
    commonCPT: [
      { cpt: '37215', description: 'Transcatheter stent placement, cervical carotid artery, with distal embolic protection', workRVU: 17.97 },
      { cpt: '36224', description: 'Selective catheter placement, internal carotid artery with angiography', workRVU: 5.79 },
    ],
    commonICD10: [
      { icd10: 'I65.21', description: 'Occlusion and stenosis of right carotid artery' },
      { icd10: 'I65.22', description: 'Occlusion and stenosis of left carotid artery' },
    ],
    typicalSteps: [
      'Femoral artery access',
      'Selective carotid catheterization',
      'Baseline angiography',
      'Embolic protection device deployment',
      'Stent deployment',
      'Completion angiography',
      'Femoral closure',
    ],
    typicalAnesthesia: 'Local anesthesia with conscious sedation',
  },

  // ==================== PERIPHERAL ARTERIAL ====================
  {
    id: 'fem_pop_bypass',
    name: 'Femoral-Popliteal Bypass',
    category: 'peripheral_arterial',
    commonCPT: [
      { cpt: '35556', description: 'Bypass graft, fem-pop (above knee), with vein', workRVU: 25.37 },
      { cpt: '35566', description: 'Bypass graft, fem-tibial, with vein', workRVU: 30.20 },
      { cpt: '35656', description: 'Bypass graft, fem-pop (above knee), prosthetic', workRVU: 22.92 },
    ],
    commonICD10: [
      { icd10: 'I70.211', description: 'Atherosclerosis, claudication, right leg' },
      { icd10: 'I70.212', description: 'Atherosclerosis, claudication, left leg' },
      { icd10: 'I70.261', description: 'Atherosclerosis with gangrene, right leg' },
      { icd10: 'I70.262', description: 'Atherosclerosis with gangrene, left leg' },
    ],
    typicalSteps: [
      'Groin incision — expose CFA, profunda, SFA',
      'Distal incision — expose popliteal artery',
      'Vein harvest or select prosthetic conduit',
      'Tunnel creation',
      'Heparinization',
      'Distal anastomosis',
      'Proximal anastomosis',
      'Completion arteriography',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'General or spinal anesthesia',
  },
  {
    id: 'lower_extremity_angioplasty',
    name: 'Lower Extremity Angioplasty/Stenting',
    category: 'peripheral_arterial',
    commonCPT: [
      { cpt: '37224', description: 'Revascularization, fem/pop artery, angioplasty', workRVU: 10.20 },
      { cpt: '37225', description: 'Revascularization, fem/pop artery, atherectomy', workRVU: 13.25 },
      { cpt: '37226', description: 'Revascularization, fem/pop artery, stent', workRVU: 12.80 },
      { cpt: '37228', description: 'Revascularization, tibial/peroneal artery, angioplasty', workRVU: 11.55 },
    ],
    commonICD10: [
      { icd10: 'I70.211', description: 'Atherosclerosis, claudication, right leg' },
      { icd10: 'I70.212', description: 'Atherosclerosis, claudication, left leg' },
      { icd10: 'I70.261', description: 'Atherosclerosis with gangrene, right leg' },
    ],
    typicalSteps: [
      'Arterial access',
      'Diagnostic angiography',
      'Wire traversal of lesion',
      'Balloon angioplasty ± atherectomy',
      'Stent placement if needed',
      'Completion angiography',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'Local anesthesia with conscious sedation',
  },
  {
    id: 'thrombectomy_embolectomy',
    name: 'Thrombectomy / Embolectomy',
    category: 'peripheral_arterial',
    commonCPT: [
      { cpt: '34201', description: 'Thrombectomy, femoral artery, by leg incision', workRVU: 14.96 },
      { cpt: '34203', description: 'Thrombectomy, popliteal-tibio-peroneal, by leg incision', workRVU: 17.56 },
    ],
    commonICD10: [
      { icd10: 'I74.3', description: 'Embolism and thrombosis of arteries of the lower extremities' },
      { icd10: 'I74.2', description: 'Embolism and thrombosis of arteries of the upper extremities' },
    ],
    typicalSteps: [
      'Expose target artery',
      'Systemic heparinization',
      'Arteriotomy',
      'Fogarty balloon catheter thrombectomy',
      'Back-bleeding and flushing',
      'Completion arteriography',
      'Arteriotomy closure',
      'Hemostasis and wound closure',
    ],
    typicalAnesthesia: 'General or local anesthesia with sedation',
  },
  {
    id: 'fem_fem_bypass',
    name: 'Femoral-Femoral Bypass',
    category: 'peripheral_arterial',
    commonCPT: [
      { cpt: '35661', description: 'Bypass graft, femoral-femoral', workRVU: 18.32 },
    ],
    commonICD10: [
      { icd10: 'I70.0', description: 'Atherosclerosis of aorta' },
      { icd10: 'I74.5', description: 'Embolism and thrombosis of iliac artery' },
    ],
    typicalSteps: [
      'Bilateral groin incisions',
      'Create subcutaneous suprapubic tunnel',
      'Heparinization',
      'Donor side anastomosis',
      'Graft tunneling',
      'Recipient side anastomosis',
      'Restore flow, check pulses',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'General or spinal anesthesia',
  },

  // ==================== VENOUS ====================
  {
    id: 'ivc_filter',
    name: 'IVC Filter Placement/Retrieval',
    category: 'venous',
    commonCPT: [
      { cpt: '37191', description: 'Insertion of IVC filter, endovascular', workRVU: 5.47 },
      { cpt: '37193', description: 'Retrieval of IVC filter', workRVU: 7.38 },
    ],
    commonICD10: [
      { icd10: 'I26.99', description: 'Other pulmonary embolism without acute cor pulmonale' },
      { icd10: 'I82.401', description: 'Acute DVT, right lower extremity' },
      { icd10: 'I82.402', description: 'Acute DVT, left lower extremity' },
    ],
    typicalSteps: [
      'Jugular or femoral venous access',
      'IVC venography',
      'Filter deployment at infrarenal IVC',
      'Completion venography',
      'Access site closure',
    ],
    typicalAnesthesia: 'Local anesthesia with conscious sedation',
  },

  // ==================== DIALYSIS ACCESS ====================
  {
    id: 'av_fistula',
    name: 'AV Fistula Creation',
    category: 'dialysis_access',
    commonCPT: [
      { cpt: '36818', description: 'AV fistula, upper arm (brachial-cephalic)', workRVU: 12.80 },
      { cpt: '36819', description: 'AV fistula, upper arm (brachial-basilic transposition)', workRVU: 16.50 },
      { cpt: '36820', description: 'AV fistula, forearm (radial-cephalic)', workRVU: 11.72 },
    ],
    commonICD10: [
      { icd10: 'N18.6', description: 'End stage renal disease' },
      { icd10: 'Z99.2', description: 'Dependence on renal dialysis' },
    ],
    typicalSteps: [
      'Arm incision — expose target artery and vein',
      'Vein mobilization',
      'Heparinization',
      'Arteriotomy',
      'Anastomosis',
      'Assess thrill and bruit',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'Local anesthesia with sedation or regional block',
  },
  {
    id: 'av_graft',
    name: 'AV Graft Placement',
    category: 'dialysis_access',
    commonCPT: [
      { cpt: '36830', description: 'Creation of AV fistula by non-autogenous graft', workRVU: 13.20 },
    ],
    commonICD10: [
      { icd10: 'N18.6', description: 'End stage renal disease' },
      { icd10: 'Z99.2', description: 'Dependence on renal dialysis' },
    ],
    typicalSteps: [
      'Arm incision(s)',
      'Tunnel creation for graft',
      'Heparinization',
      'Venous anastomosis',
      'Arterial anastomosis',
      'Assess thrill/bruit',
      'Hemostasis and closure',
    ],
    typicalAnesthesia: 'Local anesthesia with sedation or regional block',
  },
  {
    id: 'dialysis_access_thrombectomy',
    name: 'Dialysis Access Thrombectomy',
    category: 'dialysis_access',
    commonCPT: [
      { cpt: '36831', description: 'Thrombectomy, open, AV fistula without revision', workRVU: 9.50 },
      { cpt: '36832', description: 'Revision, open, AV fistula with thrombectomy', workRVU: 14.00 },
    ],
    commonICD10: [
      { icd10: 'T82.868A', description: 'Thrombosis due to vascular dialysis catheter, initial encounter' },
      { icd10: 'N18.6', description: 'End stage renal disease' },
    ],
    typicalSteps: [
      'Incision over fistula/graft',
      'Thrombectomy with Fogarty catheter',
      'Assess inflow and outflow',
      'Revision if needed',
      'Completion fistulography',
      'Closure',
    ],
    typicalAnesthesia: 'Local anesthesia with sedation',
  },

  // ==================== OTHER ====================
  {
    id: 'amputation_bka',
    name: 'Below-Knee Amputation (BKA)',
    category: 'other',
    commonCPT: [
      { cpt: '27880', description: 'Amputation, leg, through tibia and fibula', workRVU: 13.73 },
    ],
    commonICD10: [
      { icd10: 'I70.261', description: 'Atherosclerosis with gangrene, right leg' },
      { icd10: 'I70.262', description: 'Atherosclerosis with gangrene, left leg' },
      { icd10: 'E11.52', description: 'Type 2 DM with peripheral angiopathy with gangrene' },
    ],
    typicalSteps: [
      'Skin incision (fish-mouth or posterior flap)',
      'Anterior muscle group division',
      'Tibial and fibular osteotomy',
      'Posterior muscle group division',
      'Vessel ligation',
      'Nerve transection',
      'Bone smoothing',
      'Myodesis/myoplasty and flap closure',
      'Drain placement and dressing',
    ],
    typicalAnesthesia: 'General or spinal anesthesia',
  },
  {
    id: 'amputation_aka',
    name: 'Above-Knee Amputation (AKA)',
    category: 'other',
    commonCPT: [
      { cpt: '27590', description: 'Amputation, thigh, through femur', workRVU: 14.17 },
    ],
    commonICD10: [
      { icd10: 'I70.261', description: 'Atherosclerosis with gangrene, right leg' },
      { icd10: 'I70.262', description: 'Atherosclerosis with gangrene, left leg' },
      { icd10: 'E11.52', description: 'Type 2 DM with peripheral angiopathy with gangrene' },
    ],
    typicalSteps: [
      'Skin incision at distal thigh',
      'Anterior muscle group division',
      'Femoral osteotomy',
      'SFA ligation',
      'Sciatic nerve division',
      'Posterior flap creation',
      'Bone smoothing',
      'Myodesis and flap closure',
      'Drain placement and dressing',
    ],
    typicalAnesthesia: 'General or spinal anesthesia',
  },
  {
    id: 'wound_debridement',
    name: 'Wound Debridement',
    category: 'other',
    commonCPT: [
      { cpt: '11042', description: 'Debridement, subcutaneous tissue, first 20 sq cm', workRVU: 2.76 },
      { cpt: '11043', description: 'Debridement, muscle/fascia, first 20 sq cm', workRVU: 4.76 },
      { cpt: '11044', description: 'Debridement, bone, first 20 sq cm', workRVU: 6.05 },
    ],
    commonICD10: [
      { icd10: 'L97.519', description: 'Non-pressure chronic ulcer of right foot' },
      { icd10: 'L97.529', description: 'Non-pressure chronic ulcer of left foot' },
      { icd10: 'E11.621', description: 'Type 2 diabetes with foot ulcer' },
    ],
    typicalSteps: [
      'Wound assessment and measurement',
      'Sharp debridement of necrotic tissue',
      'Irrigation',
      'Wound culture if indicated',
      'Dressing application',
    ],
    typicalAnesthesia: 'Local anesthesia or bedside',
  },
];

export function getProceduresByCategory(category: ProcedureCategory): ProcedureTemplate[] {
  return PROCEDURE_TEMPLATES.filter((p) => p.category === category);
}

export function getProcedureById(id: string): ProcedureTemplate | undefined {
  return PROCEDURE_TEMPLATES.find((p) => p.id === id);
}

export function buildProcedureReference(template: ProcedureTemplate): string {
  const lines: string[] = [];
  lines.push(`PROCEDURE REFERENCE: ${template.name}`);
  lines.push('');
  lines.push('Common CPT Codes (use as hints, verify via web search):');
  template.commonCPT.forEach((c) => {
    lines.push(`  ${c.cpt} — ${c.description} (wRVU: ${c.workRVU})`);
  });
  if (template.addOnCodes?.length) {
    lines.push('Add-on Codes:');
    template.addOnCodes.forEach((c) => {
      lines.push(`  ${c.cpt} — ${c.description} (wRVU: ${c.workRVU})`);
    });
  }
  lines.push('');
  lines.push('Common ICD-10 Diagnoses (use as hints, verify via web search):');
  template.commonICD10.forEach((d) => {
    lines.push(`  ${d.icd10} — ${d.description}`);
  });
  lines.push('');
  lines.push(`Typical Anesthesia: ${template.typicalAnesthesia}`);
  lines.push('');
  lines.push('Typical Procedural Steps:');
  template.typicalSteps.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s}`);
  });
  return lines.join('\n');
}

export function getCategorySummary(): { category: ProcedureCategory; label: string; count: number }[] {
  const categories = Object.keys(CATEGORY_LABELS) as ProcedureCategory[];
  return categories.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    count: PROCEDURE_TEMPLATES.filter((p) => p.category === cat).length,
  }));
}
