# MonkeeTools — job details to a reviewable invoice

Turn scattered job notes, a quote photo, a work-record PDF or a voice note into an invoice you can check before using.

**Live product:** https://monkeetools.pages.dev/

This repository contains the **reviewed 44-file hackathon source subset**, not the private MonkeeTools product repository or its history. The initial snapshot corresponds to production source revision `9a6b27cc68f722a13b83b04bc28fd4e29446fcc0`. Later review-presentation improvements may be visible on the live site; the source snapshot and provenance below identify exactly what is included here.

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

The retained snapshot passed 38 focused unit tests, 15 multimodal browser checks and no-key startup validation. Its canonical product revision passed the full Ubuntu browser suite. Those results do not replace proof of a real model request.

## What was built during the hackathon

MonkeeTools already had its invoice editor, history and PDF engine. The hackathon added optional server-side Meta interpretation, source-linked job-note review, multimodal intake, cross-source reconciliation, clarification gates and regression coverage. One sanitized Picard/Groq test proposal supplied adversarial cases, corrected and validated locally.

## Source and notices

`MANIFEST.json` records hashes for this focused snapshot. `PROVENANCE.json` distinguishes raw product source from the sanitized prebuilt preview and standalone local wrapper. The historical `README.txt` retains its pre-publication candidate label; this README records the actual public repository status.

Existing copyright and third-party notices are preserved, including `backend/meta-invoice/third-party-notices.txt`. **No new license grant is made for MonkeeTools code.** The prebuilt preview is an offline verification build, not a production deployment bundle. Private feedback, account credentials, customer recordings, unrelated backend services and repository history are excluded.
