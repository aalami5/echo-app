/** A recording lease prevents personal Live Voice from acquiring a clinical microphone. */
const clinicalOwners = new Set<object>();
export function claimClinicalAudio(owner: object) { clinicalOwners.add(owner); }
export function releaseClinicalAudio(owner: object) { clinicalOwners.delete(owner); }
export function hasClinicalAudioLease() { return clinicalOwners.size > 0; }
