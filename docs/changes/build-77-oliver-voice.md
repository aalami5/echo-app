# Build 77 — Correct Oliver's cloned voice ID

The physical-phone report Read Back error was ElevenLabs HTTP 404: the configured
voice `grLAj0YuamNRv9WBJxB4` was not found. This is evidence of an unavailable voice,
not proof of an expired API key. Oliver supplied his current voice ID on September
21, 2026: `Hz3QgvkT6FlLPBkkLGlK`.

Updated the shared Oliver voice mapping. Both patient-report and general dictation
Read Back use this constant; selecting Oliver for chat also uses the corrected
mapping. Other voices and credentials are unchanged. Patient data, report text,
sync, and email receipts are untouched.

This app does not have an OTA update configuration; install Build 77 in place
from TestFlight. Do not delete Echo. Native playback with the phone's saved key
must still be verified after installation. A valid voice ID alone does not prove
that the saved API key has access to that voice.
