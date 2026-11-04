# Evidence-linked invoice intake

The existing v1 text request remains supported for cached pages. The v2 request
uses the same protected `/invoice-draft` route and existing encrypted application
secret. No new bindings, credentials, storage, tracking or file-upload service.

- `read`: one inline JPEG/PNG, PDF (1–3 unencrypted pages) or mono 16 kHz PCM WAV
  (up to 60 seconds). Maximum prepared file: 4 MiB. Browser photos are redrawn
  without EXIF; audio files and MediaRecorder clips are converted locally to WAV.
- `reconcile`: 1–4 user-confirmed text sources, each at most 12,000 characters,
  at most 24,000 in total. Model output cites work, quantity and rate independently.
- Transcription is a suggestion. Evidence checks validate the text the user has
  checked against the original file, not pixels or the acoustic signal directly.
- Role checks reject using an hour/count as a unit price. Missing/conflicting
  values and possibly repeated work require explicit clarification or exclusion.
  Unconsumed clauses and all original source text remain available for review.
- No invoice mutation before the existing accounting, unmatched-note, review and
  replacement gates. User corrections are instructions, not model-verified facts.
- Each action needs separate consent and a server-verified Turnstile token. One
  provider attempt, no automatic retries, no tool execution or remote file URLs.
  Staging dummy verification continues to disable live inference.

The pure numeric checks and work-label association currently use English unit
wording and plain decimal numbers. Unsupported or ambiguous wording should be
corrected in the confirmed source text or clarified manually; it is not guessed.

Picard/Groq supplied a bounded, sanitized adversarial test proposal. Its span and
return-value contract mistakes were corrected and the resulting cases validated
locally. It is not an application inference provider. Private provider receipts
and test artifacts are excluded from the release source.
