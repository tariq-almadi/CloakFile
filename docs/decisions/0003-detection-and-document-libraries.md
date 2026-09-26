# 0003 · Detection and document-processing libraries

**Status:** Accepted for detection and PDF (implemented) · **Open for DOCX**

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

## Decided: PDF

**Status:** Implemented · layout-preserving editing deferred

The behaviour below is what ships in the repository: extract with pdf.js,
rebuild with `@cantoo/pdf-lib`, verify with pdf.js re-extraction plus a pdf-lib
structural sweep in `@cloakfile/verification`. Every claim was verified against
hand-built fixtures in `tests/fixtures/pdf.ts`, not assumed from library docs.

### Where it lives

| Concern | Module |
| --- | --- |
| Hardened pdf.js load | `packages/document-processing/src/formats/pdf/pdfjs-loader.ts` |
| Page/object limits, timeouts | `pdf-guard.ts` · constants in `@cloakfile/shared` |
| Image-only pages (no image decode) | `pdf-structure.ts` |
| Multi-channel extraction | `pdf-extractor.ts` |
| Form-feed flatten / split | `text-blocks.ts` |
| New-document generation | `pdf-generator.ts` |
| WinAnsi substitution | `pdf-fonts.ts` |
| Capability flags | `capabilities.ts` (`preservesLayout: false`, `content-removal`) |
| Independent object sweep | `structural-sweep.ts` (exported for verification) |
| Verification checks | `packages/verification/src/verifier.ts` (`deep-streams`, `structural-channels`, `unreadable-content`) |
| End-to-end PDF tests | `tests/integration/pdf-channels.test.ts` |

### The constraint that drives the decision

A PDF stores glyph-drawing instructions, not text. Embedding Arial as a subset
font and drawing `John Doe` produces a content stream whose show-text operand
is:

```
/ArialMT-7098480789 14 Tf 1 0 0 1 20 50 Tm <00010002000300040005000600020007> Tj
```

Those are glyph IDs. The string `John Doe` does not appear anywhere in the file.
`pdf.js` recovers it only by going through the font's `ToUnicode` CMap.

Two consequences follow, and both are load-bearing:

1. **Byte-level search cannot verify a PDF.** Re-saving a test file moved an
   annotation and the `/Info` author into a Flate-compressed object stream. A
   `latin1` search of the output reported both absent; a semantic read returned
   both intact and readable. A verifier that searched bytes would have certified
   a leaking document as clean. **The verifier must decompress and parse.**
2. **A placeholder cannot always be written in the original font.** That subset
   contains seven glyphs and none of `[`, `]`, `_`, `P`, `0`, `1`.

### Adopted

| Package           | Version  | Licence    | Role                                         |
| ----------------- | -------- | ---------- | -------------------------------------------- |
| `pdfjs-dist`      | ^6.3.289 | Apache-2.0 | Extraction                                   |
| `@cantoo/pdf-lib` | ^2.11.1  | MIT        | Generation, structural sweep                 |
| `@cantoo/fontkit` | ^2.0.12  | MIT        | Reserved for future Unicode font embed only  |

`pdfjs-dist` has **zero required dependencies**. `@napi-rs/canvas` is optional
and is never loaded for text extraction. Standard font data ships inside the
package, so nothing is fetched at runtime and the no-egress rule holds.

`@cantoo/pdf-lib` published eight releases between 2026-08-12 and 2026-09-15.

The generator embeds **Standard 14 Helvetica** only; it does not register
fontkit today. Non–WinAnsi characters are counted and replaced with `?`
(`pdf-fonts.ts`), with a user-visible warning.

**`@pdf-lib/fontkit` is broken and must not be used**, despite being the
companion package the upstream docs tell you to register. Subsetting Arial
throws `TypeError: Cannot read properties of undefined (reading 'pos')`. Last
publish 2022-04-06. `@cantoo/fontkit` is the maintained substitute when we
embed a custom TTF.

### Rejected

| Candidate                    | Reason                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `pdf-lib` (Hopding)          | Last publish **2022-05-12**; use `@cantoo/pdf-lib` instead                                           |
| `unpdf`, `pdf-parse`         | pdf.js wrappers; extraction goes through our hardened loader instead                                 |
| `ts-pdf-edit`, in-place tools| Overlay fallback is visual redaction; subset-font silent failure                                   |
| `mupdf`                      | **AGPL-3.0-or-later.** Technically the best tool here; the licence is disqualifying without purchase |
| `node-poppler`, `node-qpdf2` | System binaries, subprocess surface, deployment burden; `node-qpdf2` unpublished since 2023          |
| PDFium via WASM              | No document rewriting. Retained as a candidate **third** verifier                                    |

### Node baseline raised to 22.13.0

`pdfjs-dist@6` declares `engines: >=22.13.0 || >=24`. At the previous 22.12.0
baseline npm did not fail — it silently resolved to `pdfjs-dist@5`, which means
running a different PDF engine than the one this project was tested against.
This is the same trap as the rolldown incident in ADR 0002. The baseline is
raised deliberately, `.nvmrc` pins 22.23.3, and CI runs the matrix against both
the floor and the pin.

### Architecture: rebuild, do not edit in place

Extract with pdf.js across every text channel the implementation reads (page
text including `3 Tr`, annotation bodies, form field values); author a **new**
document with `@cantoo/pdf-lib` that carries nothing over from the original.
Metadata, XMP, attachments, outlines, and JavaScript are not copied — they are
reported in extraction warnings and absent from the output.

The layout-preserving alternative — decode glyphs, splice the text, re-encode
into the original font — was rejected because it fails on subset fonts, needs
full line re-layout to avoid overflow, and, decisively, **fails partially while
appearing to succeed**. Rebuilding fails loudly instead. `preservesLayout` was
already `false` in the Phase 1 capability flags; this is the design those flags
were describing.

`PDF_CAPABILITIES.supportedModes` narrows to `['content-removal']`, because the
output is a new document rather than an edited original.

### pdf.js must be configured, never defaulted

Checked against the shipped bundle rather than the documentation, because the
two differ. `maxImageSize` defaults to `-1`, meaning unlimited, so it is set.
`enableScripting`, `enableXfa` and `useSystemFonts` default safely under Node
but are passed explicitly anyway.

`isEvalSupported` is **not** passed, despite being the option most often cited
for CVE-2024-4367. It existed in v5, where it defaulted to `true`; v6 removed
eval-based font and CMap compilation outright and the identifier does not
appear anywhere in the shipped bundle. Passing it would be a type error and a
false sense of security. This is why the version floor in the table above is a
security boundary and not a preference.

All document loading goes through a single `pdfjs-loader.ts`. This is the same
rule this ADR already applies to XML parsers (THREAT-MODEL T-13): a security
default is verified and pinned, never inherited.

### Verifier independence

`packages/verification` remains the authority on whether sanitization passed.
Two additions make it independent of the generator rather than merely downstream
of it:

- **Channels the generator never writes.** `structural-channels` asserts the
  output has zero annotations, no `/AcroForm`, no embedded files, no XMP, no
  JavaScript, no outlines, and no descriptive `/Info` entries. The generator
  makes no claim about these, so a generator bug cannot hide the failure.
- **A structural sweep built on pdf-lib, not pdf.js.** Enumerate every indirect
  object, decompress every stream, and search the decoded content. A genuinely
  separate code path over the same bytes, so a pdf.js decoding blind spot is not
  shared by both halves.

### What this cannot do

| Case                              | Outcome                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Simple text PDFs                  | Sanitized                                                                                                      |
| Complex positioning, subset fonts | Sanitized; **layout not preserved**                                                                            |
| Scanned, image-only pages         | **Refused as `inconclusive`.** Never reported as sanitized                                                     |
| OCR text layers                   | Extracted and sanitized in the rebuilt text. The scan image is not altered; the user is warned. Image-only pages force `inconclusive` |
| Forms and annotations             | **Removed, not sanitized**                                                                                     |
| Embedded files                    | **Removed, not sanitized**                                                                                     |

Digital signatures are destroyed. Images are dropped. There is no OCR.

### Verified behaviours, for the record

- Replacing a page's `/Contents` and saving removed the original characters from
  the output bytes, and pdf.js re-extracted the placeholder text. True text
  replacement confirmed end to end.
- A full pdf-lib re-save **discards prior incremental revisions**.
- A full pdf-lib re-save **retains unreferenced orphan objects** —
  `enumerateIndirectObjects()` returned all 11 objects of the test file,
  including one referenced from nowhere. pdf-lib does not garbage-collect.
  Rebuilding sidesteps this entirely.
- `getTextContent()` **does** return invisible `3 Tr` text.
- `getTextContent()` does **not** return annotations, form field values,
  `/Info`, XMP or attachments. Each needs its own API call, and a handler built
  on page text alone would miss five of the six channels that carry text.

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
