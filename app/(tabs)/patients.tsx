import React from 'react';
import { AUTOMATIC_RECOVERY_PAUSED } from '../../src/services/startupRecovery';
import ReadOnlyPatientsScreen from '../../src/screens/ReadOnlyPatientsScreen';

export default function PatientsScreen() {
  if (AUTOMATIC_RECOVERY_PAUSED) return <ReadOnlyPatientsScreen />;
  // Do not evaluate legacy clinical stores or editing workflows in safe-start.
  const LegacyPatientsScreen = require('../../src/screens/LegacyPatientsScreen').default;
  return <LegacyPatientsScreen />;
}
