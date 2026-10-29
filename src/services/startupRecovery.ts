// Owner-requested containment after build98 loaded a 256MB store twice at launch.
// Do not disable until a bounded, data-preserving recovery path is verified.
export const AUTOMATIC_RECOVERY_PAUSED = true;
export const RECOVERY_PAUSED_MESSAGE = 'Saved patient-linked dictations are preserved on this phone but are not loaded in safe-start mode. Recovery and editing are paused to prevent another crash. Do not uninstall Echo or clear its storage.';
export function requireClinicalRecovery() {
  if (AUTOMATIC_RECOVERY_PAUSED) throw new Error(RECOVERY_PAUSED_MESSAGE);
}
