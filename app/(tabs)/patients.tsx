import React from 'react';
import { AUTOMATIC_RECOVERY_PAUSED } from '../../src/services/startupRecovery';
import FamiliarPatientsScreen from '../../src/screens/FamiliarPatientsScreen';

export default function PatientsScreen() {
  if (AUTOMATIC_RECOVERY_PAUSED) return <FamiliarPatientsScreen />;
  const LegacyPatientsScreen = require('../../src/screens/LegacyPatientsScreen').default;
  return <LegacyPatientsScreen />;
}
