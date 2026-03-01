#!/usr/bin/env node
/**
 * Build Templates Script
 * 
 * Converts markdown template files into a TypeScript module
 * that can be imported directly in React Native.
 * 
 * Run: node scripts/build-templates.js
 * Output: src/data/templateContent.ts
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'src', 'data', 'templates');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'templateContent.ts');

const CATEGORIES = ['aortic', 'carotid', 'peripheral', 'venous', 'dialysis-access', 'other'];

function extractSampleReports(markdown) {
  // Split by ## headers to get individual procedure sections
  const sections = markdown.split(/^## /gm).filter(s => s.trim());
  const reports = [];
  
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    
    // Skip the file header (starts with category name + "Operative Report Templates")
    if (title.includes('Operative Report Templates')) continue;
    
    // Get the full section content
    const content = section.trim();
    if (content.length > 100) { // Only include sections with real content
      reports.push({ title, content });
    }
  }
  
  return reports;
}

let output = `/**
 * Auto-generated template content from markdown files.
 * Run \`node scripts/build-templates.js\` to regenerate.
 * 
 * Generated: ${new Date().toISOString()}
 */

export interface TemplateReport {
  title: string;
  content: string;
}

export type TemplateCategory = ${CATEGORIES.map(c => `'${c}'`).join(' | ')};

`;

const allTemplates = {};

for (const category of CATEGORIES) {
  const filePath = path.join(TEMPLATE_DIR, `${category}.md`);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} not found, skipping`);
    continue;
  }
  
  const markdown = fs.readFileSync(filePath, 'utf-8');
  const reports = extractSampleReports(markdown);
  
  console.log(`${category}: ${reports.length} procedure sections found`);
  allTemplates[category] = reports;
}

// Write each category as a const
for (const [category, reports] of Object.entries(allTemplates)) {
  const varName = category.replace(/-/g, '_').toUpperCase() + '_TEMPLATES';
  output += `export const ${varName}: TemplateReport[] = ${JSON.stringify(reports, null, 2)};\n\n`;
}

// Write the lookup map
output += `export const TEMPLATE_MAP: Record<TemplateCategory, TemplateReport[]> = {\n`;
for (const category of CATEGORIES) {
  const varName = category.replace(/-/g, '_').toUpperCase() + '_TEMPLATES';
  output += `  '${category}': ${varName},\n`;
}
output += `};\n\n`;

// Helper function to find best matching template
output += `/**
 * Find the best matching sample report(s) for a procedure.
 * Returns up to 2 most relevant reports to use as style references.
 */
export function findBestTemplates(procedureName: string, category: TemplateCategory): TemplateReport[] {
  const templates = TEMPLATE_MAP[category] || [];
  if (templates.length === 0) return [];
  
  const lower = procedureName.toLowerCase();
  
  // Score each template by keyword match
  const scored = templates.map(t => {
    const tLower = t.title.toLowerCase();
    let score = 0;
    
    // Exact title match
    if (tLower.includes(lower) || lower.includes(tLower)) score += 10;
    
    // Word overlap
    const procWords = lower.split(/\\s+/);
    for (const word of procWords) {
      if (word.length > 2 && tLower.includes(word)) score += 2;
    }
    
    return { template: t, score };
  });
  
  // Sort by score descending, return top 2
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).filter(s => s.score > 0).map(s => s.template);
}
`;

fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
console.log(`\\nGenerated: ${OUTPUT_FILE}`);
console.log(`Total size: ${(output.length / 1024).toFixed(1)} KB`);
