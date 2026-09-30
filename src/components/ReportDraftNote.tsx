import React from 'react';
import { View, Text } from 'react-native';
import type { RoutineDefault } from '../utils/reportPresentation';
import { separateRoutineDefaults } from '../utils/reportPresentation';

/** Review-only UI, never concatenated into report, readback, clipboard or email. */
export function ReportDraftNote({ report, defaults = [] }: { report: string; defaults?: RoutineDefault[] }) {
  const items = [...defaults, ...separateRoutineDefaults(report).routineDefaults];
  const unique = items.filter((v, i) => items.findIndex(x => x.section === v.section && x.text === v.text) === i);
  if (!unique.length) return null;
  return <View style={{ marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#172b3a' }}>
    <Text style={{ color: '#d3e2ec', fontSize: 14, fontWeight: '600' }}>Drafting note — not read aloud</Text>
    <Text style={{ color: '#b5c7d7', fontSize: 13, marginTop: 5 }}>
      Routine wording used where the notes were silent:{'\n'}
      {unique.map(d => `${d.section}: ${d.text}`).join('\n')}{'\n'}
      Review these with the rest of the draft. Your edits take precedence.
    </Text>
  </View>;
}
