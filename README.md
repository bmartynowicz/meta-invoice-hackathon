# MonkeeTools — job details to a reviewable invoice

Turn scattered job notes, a quote photo, a work-record PDF or a voice note into an invoice you can check before using.

**Live product:** https://monkeetools.pages.dev/

**Narrated demo:** https://x.com/MonkeeTools/status/2118145492630581301

This repository contains the **reviewed 44-file hackathon source subset**, not the private MonkeeTools product repository or its history. This snapshot corresponds to reviewed source revision `03da2283494ae672078054780f52fcb0fc16196f`, tree `22436db325f82e0b5a22d0e634ce976163f2df9e`. It includes visible microphone/upload actions, the multimodal Add your work entry, the simplified Add work → Review draft → Invoice & PDF flow, source-linked rate choices, current-invoice defaults and factual Powered by Meta attribution.

## How it works

1. Add notes or explicitly ask Meta Muse Spark 1.3 to read a selected photo, PDF or audio clip.
2. Check and correct each transcription against its original before reconciliation.
3. Review independently cited work, quantity and rate. Missing or conflicting values stay a human decision.
4. Confirm accounting details, then apply the draft to the existing invoice editor and download a locally generated PDF.

The model proposes details. It does not compute totals, save or send invoices, or take payments. File selection alone sends nothing. Hosted requests require explicit consent and a fresh server-verified human check; the application credential stays server-side.

## Demonstrated example

A synthetic quote says **$90/hour**; completed work lists **six hours and two landing pages at $150/page**; a voice note proposes **$95** and asks for confirmation. The real verification exposed that rate conflict and kept travel unpriced. A person chose the agreed $90 and excluded travel, producing **$840**. This is a demonstrated example, not a general accuracy or competitor benchmark.

## Run and test

Use Node 24 (Node 22 also passed local validation):

```sh
npm run setup:tooling
npm install --ignore-scripts
npm test
npm start
```

Open `http://127.0.0.1:8767/`. No provider request occurs at startup. The local parser needs no account. Live file reading and reconciliation require your own approved Meta application connection, supplied only to the server process. See `README.txt`, `PROVENANCE.json`, and `backend/meta-invoice/README.md` for the focused harness, bounds and privacy behavior. Browser tests use synthetic responses and block external traffic.

This exact focused package passed 41 unit tests, 21 multimodal browser checks and no-key startup validation. This source tree passed the full Ubuntu browser suite in PR #81. Main validation and deployment are separate release steps. Those results do not replace proof of a real model request.

## What was built during the hackathon

MonkeeTools already had its invoice editor, history and PDF engine. The hackathon added optional server-side Meta interpretation, source-linked job-note review, multimodal intake, cross-source reconciliation, clarification gates and regression coverage. One sanitized Picard/Groq test proposal supplied adversarial cases, corrected and validated locally.

## Source and notices

`MANIFEST.json` records hashes for this focused snapshot. `PROVENANCE.json` distinguishes raw product source from the sanitized prebuilt preview and standalone local wrapper. `README.txt` documents the focused local harness; this README records the public repository scope.

Existing copyright and third-party notices are preserved, including `backend/meta-invoice/third-party-notices.txt`. **No new license grant is made for MonkeeTools code.** The prebuilt preview is an offline verification build, not a production deployment bundle. Private feedback, account credentials, customer recordings, unrelated backend services and repository history are excluded.

