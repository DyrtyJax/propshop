# Kling Avatar v2 adapter notes

Use the official Replicate model alias `kwaivgi/kling-avatar-v2`. Prefer `pro` for the proof unless the user chooses the lower-cost `std` mode.

Prepare:

- JPG, JPEG, or PNG reference, at least 300 px, at most 10 MB, with a visible unobstructed mouth;
- MP3, WAV, M4A, or AAC vocal clip at most 5 MB;
- front-facing medium close-up with no microphone or prop crossing the muzzle;
- a clean isolated vocal rather than the full mix.

Generate short shots and two takes before committing to a long render. The request builder estimates using `$0.11/second` for `pro` and `$0.056/second` for `std`; treat these as declared estimates and re-check provider pricing before a paid run.

With the Replicate JavaScript client, pass local files as `Buffer`, `File`, or `Blob`; do not put base64 media in a Propfile. Download output immediately, compute a hash, and retain the prediction ID because hosted output URLs can expire.

Never use generated clip audio in the master. Mute or strip it and place the canonical master song underneath the complete edit.
