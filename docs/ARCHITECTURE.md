# Architecture

## Contents

1. [The problem, stated precisely](#1-the-problem-stated-precisely)
2. [Why a monorepo](#2-why-a-monorepo)
3. [Package graph](#3-package-graph)
4. [The pipeline](#4-the-pipeline)
5. [Detection architecture](#5-detection-architecture)
6. [Anonymization architecture](#6-anonymization-architecture)
7. [Document processing architecture](#7-document-processing-architecture)
8. [Verification as a first-class concept](#8-verification-as-a-first-class-concept)
9. [The privacy boundary](#9-the-privacy-boundary)
10. [Error handling](#10-error-handling)
11. [No external AI in the core pipeline](#11-no-external-ai-in-the-core-pipeline)
12. [Extension points](#12-extension-points)

---

## 1. The problem, stated precisely

Given a document containing sensitive information, produce a **new document**
in which each sensitive value has been replaced by a stable placeholder, such
that:

- the original value is not recoverable from the output bytes;
- the same value maps to the same placeholder everywhere in the document;
- the output remains a valid document of its original type;
- the claim of sanitization is **verified**, not assumed;
- the original document never leaves infrastructure we control.

Everything below follows from those five requirements.

---

## 2. Why a monorepo

Several people will work on this at once, on parts that are technically very
different: a React UI, an HTTP boundary, regular-expression and NLP detection,
and binary document formats. The structure has to let them move independently
while still sharing one definition of the domain.

**A monorepo with npm workspaces was chosen because:**

- **The contract must not drift.** `PIIType`, `Detection` and the HTTP payload
  shapes are used by the detection engine, the API and the browser. In separate
  repositories they would be duplicated or versioned, and a mismatch between
  what the server sends and what the client expects in a privacy product means
  showing the user the wrong thing about their own data. One `@sds/shared`
  package, compiled once, removes that class of bug.
- **The round-trip test needs everything at once.** The central safety property
  — detect, anonymize, generate, re-extract, verify — spans four packages. It
  has to be runnable in one command against one consistent set of sources.
- **Refactoring stays cheap.** The detector interface will change as detectors
  are added. In a monorepo that is one atomic commit and one CI run.
- **One toolchain.** A single TypeScript config, ESLint config and test runner,
  so a contributor learns the setup once.

**npm workspaces rather than a heavier tool** (Turborepo, Nx, pnpm): there are
eight workspaces and a fast build. TypeScript project references already give
correct, incremental, dependency-ordered builds via `tsc -b`. Adding a build
orchestrator would be a dependency and a concept to learn without a problem to
solve. If build times become painful, that is the moment to revisit it.

**Why packages are separate rather than folders in `apps/api`:** the boundary
is enforced by the module system, not by convention. `packages/detection`
cannot import from `apps/api`, so detection logic cannot quietly grow a
dependency on an HTTP request object. That is what keeps detectors testable and
keeps file processing out of controllers.

---

## 3. Package graph

```
                      ┌──────────────┐
                      │ @sds/shared  │   types, errors, wire contract,
                      └──────┬───────┘   preview policy. No dependencies.
          ┌──────────────┬───┴────┬──────────────────┐
          │              │        │                  │
  ┌───────▼──────┐ ┌─────▼──────┐ │      ┌───────────▼──────────┐
  │ @sds/        │ │ @sds/      │ │      │ @sds/document-       │
  │ detection    │ │ anonymiz.  │ │      │ processing           │
  └───────┬──────┘ └─────┬──────┘ │      └───────────┬──────────┘
          │              │        │                  │
          │              │        │      ┌───────────▼──────────┐
          │              │        │      │ @sds/verification    │
          │              │        │      └───────────┬──────────┘
          └──────────────┴────────┴──────────────────┘
                              │
                     ┌────────▼─────────┐
                     │ @sds/pipeline    │  composes everything; no HTTP
                     └────────┬─────────┘
                              │
                     ┌────────▼─────────┐        ┌──────────────┐
                     │ apps/api         │        │ apps/web     │
                     │ (Fastify)        │◄──────►│ (React)      │
                     └──────────────────┘  HTTP  └──────┬───────┘
                                                        │
                                            @sds/shared ┘ (types only)
```

The graph is acyclic and shallow. `@sds/shared` has no dependencies, so it can
be imported by the browser without dragging server code into the bundle.

| Package               | Responsibility                                              | Must not                               |
| --------------------- | ----------------------------------------------------------- | -------------------------------------- |
| `shared`              | Domain types, error taxonomy, HTTP contract, preview policy | Depend on anything                     |
| `detection`           | Find PII in text                                            | Know about files, HTTP or placeholders |
| `anonymization`       | Allocate placeholders, rewrite text                         | Know about files or HTTP               |
| `document-processing` | Bytes ↔ text, per format                                    | Know about PII or placeholders         |
| `verification`        | Prove the output is clean                                   | Trust intermediate state               |
| `pipeline`            | Orchestrate the flow                                        | Know about HTTP, sessions or storage   |
| `api`                 | HTTP, uploads, sessions, headers                            | Contain file-processing logic          |
| `web`                 | Render                                                      | Contain business logic                 |

---

## 4. The pipeline

```
  UPLOAD
     │  multipart, one file, size-capped by the parser as it streams
     ▼
  VALIDATE ─────────────────── apps/api/services/upload-validation.ts
     │  size → content signature → filename normalisation (in that order)
     ▼
  EXTRACT ──────────────────── @sds/document-processing
     │  bytes → { text, segments, capabilities, warnings }
     ▼
  DETECT ───────────────────── @sds/detection
     │  run detectors → resolve overlaps → assign ids
     ▼
  ASSIGN PLACEHOLDERS ──────── @sds/anonymization
     │  canonicalise → allocate → group
     ▼
  ┌──────────────────────────────────────────────┐
  │  USER REVIEW                                 │
  │  The client sees placeholders + masked        │
  │  previews. It never sees an original value.  │
  └──────────────────────────────────────────────┘
     │  the user may exclude any placeholder
     ▼
  ANONYMIZE ────────────────── @sds/anonymization
     │  replace right-to-left so offsets stay valid
     ▼
  GENERATE ─────────────────── @sds/document-processing
     │  build a NEW file from the sanitized content
     ▼
  VERIFY ───────────────────── @sds/verification
     │  re-extract the generated bytes, search for the originals
     │  FAIL or INCONCLUSIVE → refuse to release
     ▼
  DOWNLOAD → DELETE
```

Two properties are load-bearing:

**The pipeline is split in half around the human.** `analyze` is read-only and
`sanitize` is the write half. Both are pure functions of their inputs, so the
whole flow is testable without a server. The session store exists only to hold
state across the gap between them.

**The original is destroyed last.** `sanitize` requires the original bytes as
an argument, so the caller must still hold them when generation runs. Discarding
the original earlier would make any failure unrecoverable for the user.

---

## 5. Detection architecture

### The interface

```ts
interface Detector {
  readonly name: string;
  readonly types: readonly PIIType[];
  readonly maturity: 'reference' | 'experimental' | 'stub';
  detect(input: DetectionInput): MaybePromise<readonly RawDetection[]>;
}
```

A detector receives **text and nothing else**, and returns spans. It has no
access to the file, the network, the session or the placeholder map. That makes
each detector a pure function — trivial to unit test, and structurally unable to
become an exfiltration path.

Two deliberate deviations from the interface originally sketched:

- **`types` is a list.** One NLP parse yields both people and organizations.
  Forcing one type per detector would mean parsing twice.
- **`maturity` exists.** It is how the system tells the truth about itself. It
  flows through the capabilities endpoint into the UI, so a category with no
  real detector is shown as unavailable instead of as a checkbox that silently
  does nothing.

### Hybrid by design

compromise is **one detector among many**, and the least trusted one. The
detectors in place use whichever technique actually fits the data:

| Detector                                            | Technique                                             | Confidence | Maturity     |
| --------------------------------------------------- | ----------------------------------------------------- | ---------- | ------------ |
| `credit-card`                                       | Candidate scan → normalise → **Luhn** → issuer prefix | 0.75–0.98  | reference    |
| `phone`                                             | **libphonenumber-js** metadata, region-aware          | 0.70–0.95  | reference    |
| `email`                                             | Bounded regex + TLD plausibility                      | 0.95       | reference    |
| `ssn-us`                                            | Regex + **SSA structural rules** + keyword context    | 0.70–0.90  | reference    |
| `ip-address`                                        | Range-checked dotted quad / IPv6                      | 0.85–0.90  | reference    |
| `url`                                               | Schemed URLs only                                     | 0.90       | reference    |
| `custom-regex`                                      | User pattern through a **ReDoS guard**                | 1.00       | reference    |
| `nlp-entity`                                        | **compromise** lexicon NLP                            | 0.55–0.60  | experimental |
| address, government ID, bank account, date of birth | —                                                     | —          | **stub**     |

The confidence spread is the point. A Luhn-validated card scores 0.98; a
capitalised word that might be a name scores 0.60. Overlap resolution uses that,
and so does the reviewer.

### The engine

`DetectionEngine` owns what individual detectors must not:

1. **Filtering** to the categories the user enabled.
2. **Validation.** A detector whose offsets do not slice back to its own
   reported value throws. That bug would cut the wrong characters out of the
   document and leave the sensitive ones in — the single worst failure mode a
   sanitizer has, so it is a hard error rather than a warning.
3. **Overlap resolution.** Detectors routinely claim overlapping spans. Exactly
   one must win, ranked by: longer span → higher confidence → type specificity →
   stable tiebreak on position and detector name.
4. **Identity.** Index-based, not random, so identical input always yields
   identical placeholders.
5. **Honest warnings.** Enabling a stub category produces a warning that says so.

The longer-span rule does real work. compromise returns both `"John"` and
`"John Doe"` for the same text; the longer reading wins, which is why
`John Doe's` becomes `[PERSON_001]'s` rather than `[PERSON_001] Doe's`.

---

## 6. Anonymization architecture

### Consistent mapping without a database

The requirement is that one value gets one placeholder throughout a document.
The obvious implementation — a table of value → placeholder — would be a
permanent store of exactly the data this product exists to remove, and would
turn a breach of our infrastructure into a disclosure of every document ever
processed.

Instead, `PlaceholderAllocator` holds an in-memory map for the lifetime of one
document, keyed by a **canonical form** of the value:

```
  "John Doe"  ─┐
  "JOHN DOE"  ─┼─► canonical "person:john doe" ─► [PERSON_001]
  "John  Doe" ─┘
```

Canonicalisation is per-type, because the right rule differs: digits only for
cards and SSNs; lowercase for emails; NFKC + case-fold + whitespace-collapse for
names. Being too lax merges two different people; being too strict scatters one
person across several placeholders.

### Replacement is right-to-left

Placeholders are usually longer than the values they replace, so replacing
forwards invalidates every later offset. Walking backwards from the end of the
document keeps every not-yet-applied offset valid. Overlapping spans are
rejected outright rather than being merged, because silently guessing here
corrupts documents.

### The group is the unit of review

All occurrences of one value collapse into a `PlaceholderGroup`: a placeholder,
a count, a confidence and a masked preview. This is the only representation that
crosses the network. It carries **no original value and no offsets**, so the
review UI cannot leak either.

---

## 7. Document processing architecture

```
bytes ──► DocumentExtractor ──► ExtractedDocument { text, segments, capabilities }
                                        │
                                sanitized text
                                        │
          DocumentTransformer ──► (map flat offsets onto document structure)
                                        │
                                DocumentGenerator ──► new bytes
```

### Capabilities are how the system stays honest

Every format handler declares what it can actually promise:

```ts
interface FormatCapabilities {
  trueTextReplacement: boolean; // originals genuinely absent from output
  preservesLayout: boolean;
  supportsVerification: boolean; // output can be read back
  mayContainHiddenText: boolean; // annotations, XMP, OCR layers
  mayContainEmbeddedFiles: boolean;
  supportedModes: readonly SanitizationMode[];
}
```

This is what lets the pipeline refuse to describe a document as sanitized when
the format handler cannot support that claim. `mayContainHiddenText: true` on
PDF is an admission encoded in the type system.

### Implemented: TXT, CSV, JSON

Handled by `PlainTextExtractor` / `PlainTextGenerator`. For these formats the
text view **is** the document, so replacement is lossless and verification is
exact.

Each generator validates its own syntax after rewriting: JSON must still parse,
CSV must keep its column shape. That caught a real bug during development — the
NLP detector was including the quotation mark in `"John Doe"`, which produced
invalid JSON. Structure-aware handling (per-cell CSV, per-value JSON via JSON
pointers) is Phase 2; today CSV and JSON are treated as text, which means keys
are also scanned.

### Not implemented: PDF, DOCX

Both are **registered** with full capability declarations and detailed design
notes, and both throw `NotImplementedError`. Registering them is deliberate:
an unsupported upload gets a specific, actionable error, and the capabilities
endpoint can describe the intended behaviour of a format that does not work yet.

`packages/document-processing/src/formats/pdf/pdf-extractor.ts` contains the
full inventory of channels through which a value can survive a naive PDF
implementation — content streams, form fields, annotations, XMP metadata,
embedded files, invisible OCR layers, incremental update history. Read it before
starting that work.

The DOCX container guard (`security/zip-guard.ts`) **is** implemented and runs
today, even though extraction does not. Rejecting a decompression bomb is
useful on its own, and keeping the guard on a live path stops it rotting.

---

## 8. Verification as a first-class concept

```
  generated bytes ──► extract text ──► search for each replaced value
                                    └─► PASS only if none are found
```

`@sds/verification` is its own package because it is the product's core safety
claim, and because it must be able to fail the rest of the system.

**It re-extracts rather than reusing the sanitized string.** Reusing that string
would only prove our replacement function agrees with itself. Re-extraction
tests the artefact the user actually receives, after whatever the generator did
to it.

**It searches normalised variants.** The document round trip can change
formatting, so `4111 1111 1111 1111` is also searched for as
`4111111111111111`. Being generous costs a little search time; being strict
would mean shipping a document we called clean.

**It excludes values the user chose to keep.** Otherwise one kept value frames
another as a leak: keeping `john.doe@example.com` while replacing "John Doe"
would find `johndoe` inside the surviving email and report a leak that is not
one.

**Three outcomes, not two.** `inconclusive` means we could not read the output
back. Under strict verification (the default) the pipeline refuses to release
the file, and the UI presents it as a warning rather than success.

**It reports placeholders, never residual values**, so a verification report is
safe to return to the client and safe to write to a log.

---

## 9. The privacy boundary

The single most important line in the system is the one between the server's
working memory and the browser.

```
  ┌─────────────── SERVER ────────────────┐      ┌──── BROWSER ─────┐
  │ Detection.value      "4111111111..."  │      │                  │
  │ canonical key        "credit_card:4…" │  ✗   │                  │
  │ original bytes                        │      │                  │
  │                                       │      │                  │
  │ PlaceholderGroup {                    │      │ [CREDIT_CARD_001]│
  │   placeholder, preview, occurrences } │  ──► │ Visa •••• 1111   │
  └───────────────────────────────────────┘      └──────────────────┘
```

Three mechanisms enforce it:

1. **The wire format has no field for an original value.** The Zod schemas in
   `packages/shared/src/wire/schemas.ts` are structurally incapable of carrying
   one. This is a type-level guarantee, not a discipline.
2. **`buildPreview` is the only sanctioned path** from an original value to
   client-visible text, and it is driven by an exhaustive `PREVIEW_POLICY`
   record — adding a `PIIType` without assigning a policy is a compile error.
   Credentials and government identifiers are `type-only`: nothing derived from
   the value is shown at all.
3. **Group ids are opaque.** They are derived from the placeholder, not from
   the canonical key. (The canonical key is literally
   `CREDIT_CARD:4111111111111111` — an early version exposed it as the group id,
   and the unit test in `anonymizer.test.ts` caught it.)

---

## 10. Error handling

A single `AppError` base class with a closed `ErrorCode` union. The API maps
codes to HTTP statuses in one table.

**Only errors this codebase raised deliberately reach the client.** Anything
else is reported as a generic `INTERNAL_ERROR`, because messages from document
parsers routinely quote the bytes that failed to parse — and here those bytes
are the user's sensitive document. The same rule governs logging: `AppError`
messages are logged; everything else is redacted, and the stack is logged with
its first line stripped (that line repeats the message).

`NotImplementedError` deserves a note. Unimplemented capabilities **throw**;
they never return unsanitized content. The one exception is a stub _detector_,
which returns `[]` and raises a warning — an unimplemented category should
degrade loudly but gracefully, whereas an unimplemented _format_ must hard fail,
because there the output file itself would be wrong.

---

## 11. No external AI in the core pipeline

There is no LLM SDK in `package.json`, no API key in `.env.example`, and no
outbound HTTP anywhere in the pipeline.

This is enforced structurally, not just documented. `eslint.config.js` bans
`fetch`, `http`, `https`, `axios`, `undici`, `openai`, `@anthropic-ai/sdk` and
`@google/generative-ai` inside `packages/`, so a well-meaning contributor cannot
add an "AI-assisted detector" that posts the document to a third party without
the build failing and someone consciously removing the rule.

If AI-assisted detection is ever added it must be an isolated, opt-in
`Detector` implementation living outside `packages/`, with its own consent flow.
The core pipeline must remain fully functional without it.

---

## 12. Extension points

### Add a detector

1. Create `packages/detection/src/detectors/<name>-detector.ts` implementing
   `Detector`.
2. Add it to `createDefaultRegistry()` in `default-registry.ts`.
3. Write unit tests next to it.

No other file changes. If it covers a new `PIIType`, add that to
`packages/shared/src/types/pii.ts` — the compiler will then tell you every place
that needs a decision, including the preview policy.

### Add a document format

1. Add the format to `DOCUMENT_FORMATS` and the media-type maps in
   `@sds/shared`.
2. Implement `DocumentExtractor` and `DocumentGenerator`, declaring honest
   `FormatCapabilities`.
3. Add a `DocumentTransformer` if flat-text offsets need mapping onto document
   structure (PDF and DOCX will).
4. Register both in `createDefaultDocumentRegistry()`.
5. Teach `detectFormat` the signature.
6. Add the format to the round-trip test in
   `tests/integration/sanitization-round-trip.test.ts` — the guarantee is
   format-independent and the test should read that way.

### Change the placeholder format

Implement `PlaceholderFormatter` and pass it to `Anonymizer`. Nothing else
depends on the token's shape.
