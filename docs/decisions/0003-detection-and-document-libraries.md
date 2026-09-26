# 0003 · Detection and document-processing libraries

**Status:** Accepted for detection · **Open for PDF and DOCX**

Every library below was checked against the npm registry for its current version
and last publish date before being adopted, and the two runtime APIs this
project depends on were exercised against real input rather than assumed.

## Adopted

### `libphonenumber-js` ^1.13.14 — phone numbers

International phone formatting cannot be expressed as one regular expression:
the same digits are valid in one country and not another, national prefixes
differ, and length rules are per-region. This is the JavaScript port of Google's
libphonenumber metadata, which is the reference implementation for the problem.
Actively maintained (published within days of this decision).

**API verified.** `findPhoneNumbersInText(text, region)` returns matches with
`startsAt` / `endsAt` character offsets that slice back correctly — exactly the
shape the detector interface needs. Confirmed that omitting the region still
finds unambiguous `+E.164` numbers.

### `compromise` ^14.17.0 — names and organizations

Rules-and-lexicon NLP: fast, fully offline, no native dependencies, no model
download. That combination is what this product needs, since sending text to a
hosted NER service is precisely what we refuse to do.

**Treated as one detector among many, not as the PII engine.** It is the least
precise detector in the system, marked `experimental`, scored at 0.55–0.60
against 0.95+ for checksum-validated detectors, and always surfaced for user
review.

**API verified, and two behaviours shaped the implementation:**

1. `.out('array')` returns matches that include surrounding punctuation —
   `"Jane Smith."` with the sentence stop, and `"John Doe` with the opening
   quotation mark when the text is JSON. Replacing those characters produced
   structurally invalid JSON. The detector now trims non-alphanumerics from both
   ends.
2. It returns **both** `"John"` and `"John Doe"` for the same text. Rather than
   special-casing this, the engine's longest-span overlap rule resolves it,
   which is why `John Doe's` becomes `[PERSON_001]'s`.

The result is typed loosely by the library, so it is validated at the boundary
(`toStringArray`) instead of asserted.

### `zod` ^4.6.5 — schema validation

Validates untrusted input at the HTTP boundary and at configuration load, and
generates the client types from the same declaration, so the two cannot drift.
Response arrays are declared `.readonly()` to match the domain types.

### `fastify` ^5.12.5 — HTTP framework, over Express

- **First-class, well-maintained file handling.** `@fastify/multipart` streams
  and enforces size limits _as bytes arrive_, which is the correct place to stop
  an oversized upload — before a buffer is allocated. Express needs `multer`,
  which defaults to writing temporary files to disk, the exact behaviour this
  design avoids.
- **Security plugins are first-party.** `@fastify/helmet`, `@fastify/cors` and
  `@fastify/rate-limit` are maintained alongside the framework.
- **Schema-based validation and serialisation** fit a project where the response
  shape is a privacy control.
- **`app.inject()`** drives the real server in tests without opening a socket,
  which is how the endpoint tests run.

Express is not wrong, but for a file-processing service its defaults point the
wrong way.

## Deliberately not adopted

### No `file-type` — signature sniffing is implemented in-repo

Five formats need recognising. `detect-format.ts` is about a hundred readable
lines with full control over the behaviour. For a security product a dependency
is attack surface, and this one is small, auditable and unlikely to change.

The same reasoning applies to the ZIP central-directory guard and the multipart
body builder in the endpoint tests.

### No LLM SDK

The core pipeline makes no external call. This is enforced structurally:
`eslint.config.js` bans `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`
and the HTTP clients inside `packages/`.

## Open: PDF

**No library has been selected, and this must be decided deliberately.**

| Candidate         | Last publish | Assessment                                                                                                                                        |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pdf-lib`         | **2022**     | The obvious choice, and **unmaintained for over three years**. Not appropriate for a security product without a conscious acceptance of that risk |
| `@cantoo/pdf-lib` | Recent       | Actively maintained fork of `pdf-lib`. The leading candidate                                                                                      |
| `pdfjs-dist`      | Recent       | Mozilla's viewer engine. Strong at _extraction_; it is not a writer                                                                               |
| `unpdf`           | Recent       | Serverless-oriented wrapper around pdf.js. Extraction only                                                                                        |

A likely shape is extraction with `pdfjs-dist` and reconstruction with a
maintained writer, but **this has not been validated.** Whoever takes on PDF
should prototype both halves, confirm the reconstruction API can rebuild a page
content stream (not merely overlay it), and record the outcome here.

**What must not happen:** adopting a library because it can draw a black
rectangle. That is `visual-redaction`, and this product does not ship it.

## Open: DOCX

`mammoth` (DOCX → HTML/text) and `docx` (document generation) are both
maintained, but neither obviously fits, because the requirement is to **modify**
an existing document in place rather than convert or author one. Preserving
styling, tables and numbering probably means manipulating the OOXML parts
directly with a ZIP library and an XML parser.

**Hard requirement on whatever XML parser is chosen:** external entity
resolution and DTD processing must be disabled, and this must be verified rather
than assumed from a default (THREAT-MODEL T-13).
