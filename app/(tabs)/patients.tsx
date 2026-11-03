import React from 'react';
import { AUTOMATIC_RECOVERY_PAUSED } from '../../src/services/startupRecovery';
import ReadOnlyPatientsScreen from '../../src/screens/ReadOnlyPatientsScreen';
import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../src/constants/theme';

export default function PatientsScreen() {
  const router = useRouter();
  if (AUTOMATIC_RECOVERY_PAUSED) return <ReadOnlyPatientsScreen headerAddon={<View style={{ gap: 12 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add patient and dictate" onPress={() => router.push('/new-patient-case' as any)} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10 }}>
      <Text style={{ color: colors.textInverse, fontWeight: '700', textAlign: 'center' }}>Add patient & dictate</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/new-patient-case', params: { list: '1' } } as any)}>
      <Text style={{ color: colors.primary, paddingVertical: 6 }}>Saved new dictations on this phone</Text>
    </TouchableOpacity>
  </View>} />;
  // Do not evaluate legacy clinical stores or editing workflows in safe-start.
  const LegacyPatientsScreen = require('../../src/screens/LegacyPatientsScreen').default;
  return <LegacyPatientsScreen />;
}
