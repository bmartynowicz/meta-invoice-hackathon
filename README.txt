MonkeeTools - scattered job details to an invoice you can check
PRIVATE REVIEWED-SOURCE CANDIDATE. Not yet publicly published or submitted.

Focused feature source for merged revision 9a6b27cc68f722a13b83b04bc28fd4e29446fcc0. The full private
MonkeeTools repository and its history are excluded. See PROVENANCE.json for
exact raw-source hashes, validation and the current release state.

Run with trusted Node24 (Node22 also supported by local checks):
  npm run setup:tooling
  npm install --ignore-scripts
  npm start
Open http://127.0.0.1:8767/ . Stop the process to stop the preview.
No model call occurs at startup. The local parser needs no account; file reading
and reconciliation require an approved Meta application connection. The existing
live product is https://monkeetools.pages.dev/ .

To test live locally, supply your OWN approved application key as MODEL_API_KEY
and explicitly set META_INVOICE_LIVE_APPROVED=1 in that process. Do not put a key
in browser code, the repository or this package. The verification harness is
loopback-only and caps its session at6 attempts, with no retries; it is not an
account-wide cost cap or a product quota. It is separate from hosted production,
which requires explicit consent and a server-verified real Turnstile token for
every request, with no arbitrary three-use product lock. Staging test keys cannot
authorize hosted live inference. No credentials or new account are provided here.

The new workflow: add work notes and an agreed quote; optionally select a photo,
PDF or audio clip (or record voice); explicitly request a transcription; check it
against the original and confirm; reconcile sources; resolve missing/conflicting
values or exclude work; confirm accounting and replacement; apply to the existing
editor and download the PDF. File reads do not change the invoice. The model does
not compute totals, save/send invoices or take payments. Evidence checks validate
confirmed text, not pixels or sound independently. English unit wording and plain
decimal numbers are currently checked conservatively; clarify unsupported input.

Limits: four text sources, 24,000 combined characters;4 MB prepared file; PDFs up
to3 unencrypted pages; audio up to60 seconds;4,096 completion tokens for v2;
30-second provider timeout; no automatic retries or persistent file-upload API.

Tests: npm test. Browser tests require a trusted installed Chrome, selected with
PLAYWRIGHT_CHROMIUM_EXECUTABLE; run npm run test:browser. All included tests use
synthetic responses and block external traffic. Passing them is not evidence of
an actual provider call. Hosted live verification receipts remain separate.

The prebuilt public app is a sanitized offline verification build using disabled
site-service endpoints/test licensing; some links to omitted site sections may
not work. It is not the production deployment bundle. Raw hosted transport and
evidence/UI source files are unchanged from the merged tree. The standalone
loopback wrapper and this packaging metadata are explicitly derivative helpers.

Third-party parser notices are preserved in backend/meta-invoice/third-party-notices.txt.
This candidate makes no new license grant for MonkeeTools code. Owner approval
is required for public publication and any license choice. No private feedback,
customer records, dashboards, account secrets, Git history or reports are included.
