# Development Guide

## Getting started

```bash
node --version      # 22.12.0 or newer recommended; see README
npm install
npm run verify      # typecheck + lint + format + tests. Should pass on a clean clone
npm run dev         # API on :3001, web on :5173
```

`npm run dev` builds the packages first. The workspaces are consumed from their
compiled `dist` output, so the API cannot start against unbuilt sources.

---

## How the build fits together

TypeScript **project references** drive everything. Each package is a composite
project that emits `dist/`; `tsc -b` builds them in dependency order and
rebuilds only what changed.

```
tsconfig.base.json     strict compiler options, shared by all
tsconfig.json          root: references every buildable project
tsconfig.check.json    whole-repo project for ESLint and for type-checking
                       files that are not part of a build (tests, configs)
packages/*/tsconfig.json   composite, emits dist/, excludes *.test.ts
apps/api/tsconfig.json     composite, emits dist/
apps/web/tsconfig.json     noEmit; Vite does the bundling
```

`tsconfig.check.json` exists because the per-package configs exclude test files
(so tests are not emitted into `dist`), which would otherwise leave them with no
project for type-aware linting. Both ESLint and `npm run typecheck` use it, so
test files are genuinely type-checked.

### Why relative imports end in `.js`

The packages compile to ESM with `moduleResolution: nodenext`, where Node
requires a real file extension. You write `./foo.js` and TypeScript resolves it
to `./foo.ts`. It looks odd; it is correct.

---

## Where to work

| Task                              | Directory                           |
| --------------------------------- | ----------------------------------- |
| UI, upload flow, review screen    | `apps/web/src/`                     |
| HTTP routes, uploads, sessions    | `apps/api/src/`                     |
| Finding PII                       | `packages/detection/src/`           |
| Placeholders and replacement      | `packages/anonymization/src/`       |
| PDF, DOCX, format handling        | `packages/document-processing/src/` |
| Proving the output is clean       | `packages/verification/src/`        |
| Orchestration                     | `packages/pipeline/src/`            |
| Shared types and the API contract | `packages/shared/src/`              |

`packages/shared` is the one area everyone depends on. Changing it can break
four other packages, so it needs a second reviewer.

---

## Common tasks

### Add a detector

```bash
touch packages/detection/src/detectors/iban-detector.ts
touch packages/detection/src/detectors/iban-detector.test.ts
```

```ts
import type { RawDetection } from '@sds/shared';
import type { DetectionInput, Detector } from '../types.js';

export class IbanDetector implements Detector {
  readonly name = 'iban';
  readonly types = ['BANK_ACCOUNT'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    // Bounded quantifiers only. Validate with the mod-97 checksum before
    // reporting — shape alone is not evidence.
    return [];
  }
}
```

Register it in `packages/detection/src/default-registry.ts`. That is the only
other file to touch.

**Rules for a detector**

- Offsets must satisfy `text.slice(start, end) === value`. The engine throws
  otherwise, because mismatched offsets cut the wrong characters out of the
  document and leave the sensitive ones in.
- Bounded quantifiers only.
- Validate, do not just pattern-match. A checksum or structural rule removes
  most false positives — compare `credit-card-detector.ts`.
- Confidence should reflect reality: ~0.95+ for checksum-validated, ~0.6 for
  probabilistic.
- `metadata` must be safe to send to a browser. `{ cardBrand, last4 }` is fine;
  the full value is not.
- Overlaps are fine. The engine resolves them.

### Add a PII category

1. Add it to `PII_TYPES` in `packages/shared/src/types/pii.ts`.
2. Compile. TypeScript will list every place that now needs a decision —
   including `PREVIEW_POLICY`, which is an exhaustive record on purpose.
3. Add a label and a priority.
4. Register a detector, or a `StubDetector` with a written rationale.

### Add a document format

See ARCHITECTURE §12. In short: implement `DocumentExtractor` and
`DocumentGenerator` with honest `FormatCapabilities`, register them, teach
`detectFormat` the signature, and add the format to the round-trip test.

### Adding component tests

Frontend tests currently run in a Node environment, because the only ones that
exist cover the pure workflow reducer. For rendering tests:

```bash
npm install -D jsdom @testing-library/react --workspace @sds/web
```

then set `environment: 'jsdom'` in the `test` block of
`apps/web/vite.config.ts`. Note that `jsdom` needs Node ≥ 22.12 (it depends on
`require(esm)`); on 22.11 the test worker fails to start. The dependencies are
deliberately not installed until there is a test that uses them.

---

## Testing

```bash
npm test                              # everything
npm run test:watch                    # watch mode
npm run test:coverage                 # with coverage
npx vitest run packages/detection     # one package
```

Two Vitest projects: `node` (packages, API, integration) and `web`.

### Layout

| Kind        | Location                        | Purpose                                |
| ----------- | ------------------------------- | -------------------------------------- |
| Unit        | Next to the source, `*.test.ts` | One module's behaviour                 |
| Integration | `tests/integration/`            | Cross-package flows and HTTP endpoints |
| Fixtures    | `tests/fixtures/`               | Shared synthetic documents             |

Unit tests are colocated rather than mirrored under `tests/unit/`. The reason is
ownership: a detection developer's tests sit in the detection package, so their
work stays in one directory and a change never spans two trees. `tests/` is
reserved for things that genuinely cross package boundaries.

### The test that matters most

`tests/integration/sanitization-round-trip.test.ts` asserts the property the
whole product rests on:

```
INPUT → DETECT → ANONYMIZE → GENERATE → RE-EXTRACT → NO ORIGINAL PII REMAINS
```

It asserts on the **generated bytes**, not on any intermediate string. Anything
less tests our intentions rather than the artefact the user receives. When you
add a format, extend this suite rather than writing a parallel one — the
guarantee is format-independent and the test should read that way.

### Fixture rule

**Never commit real personal data, not even in a test fixture.** A fixture is
committed forever and is exactly the kind of accidental disclosure this product
exists to prevent. Use documented test values: `4111 1111 1111 1111` (Visa test
number), `123-45-6789` (placeholder SSN), the `555` phone block,
`example.com` domains.

### Coverage worth adding

Already covered: Luhn, card detection and false positives, overlap resolution,
repeated values, unicode values, placeholder consistency, exclusions, format
sniffing, filename safety, session lifecycle, preview policy, the full HTTP
flow, and the round trip for TXT/CSV/JSON.

Still needed: international phone numbers across many regions, adversarial
false-positive corpora, large-document performance, malformed-file fuzzing, and
— once implemented — PDF extraction and reconstruction, DOCX tables, headers,
footers and tracked changes.

---

## Code style

Enforced by ESLint and Prettier; `npm run verify` is the gate.

Rules that are about this product rather than about taste:

- **No `any`.** The `no-unsafe-*` family are errors. Validate at boundaries
  instead — see `toStringArray` in `nlp-entity-detector.ts`, which turns an
  untyped library result into a checked one.
- **No swallowed errors.** Use the typed errors in `@sds/shared`. Where an error
  is deliberately not propagated, say why — see the `catch` in the verifier,
  which discards the cause because it could carry document text.
- **No `console` in `packages/`.** ESLint error.
- **No network or LLM imports in `packages/`.** ESLint error. This enforces a
  product principle, not a style preference.
- **Business logic out of components**; **file processing out of controllers**.
  Both are enforced by the package graph: `apps/web` and `apps/api` cannot
  reach into each other, and neither can be imported by a package.

### Comments

Comment the **why**, not the what. Most comments in this codebase explain a
constraint that is not visible in the code: why replacement runs backwards, why
declared ZIP sizes cannot be trusted, why the canonical key must not be exposed.
Those are worth writing. `// increment the counter` is not.

---

## Phase 2 roadmap

Ordered by value, with the riskiest work deliberately not first.

### 1 · DOCX support

Lower risk than PDF and covers a large share of real documents. In-place text
node rewriting preserves styling.

- Parse the OOXML container with a maintained ZIP library; **verify the XML
  parser disables external entities and DTDs** (T-13).
- Extract from `document.xml`, `header*.xml`, `footer*.xml`, `footnotes.xml`
  and `comments.xml` — not just the body.
- Implement `DocumentTransformer` to map flat-text offsets across `w:r` run
  boundaries. Word splits a single visible word across runs whenever formatting
  changes, so "John Doe" may be four runs.
- Strip `docProps/core.xml` (author, last-modified-by) and `w:del` tracked
  changes outright — `content-removal`, not replacement.
- Extend the round-trip test with tables, headers, footers and tracked changes.

### 2 · PDF support

The highest-risk item. Read `pdf-extractor.ts` in full first.

- **Select a library deliberately.** `pdf-lib` has had no release since 2022.
  `@cantoo/pdf-lib` is a maintained fork; `pdfjs-dist` handles extraction well
  but is not a writer. Record the decision in `docs/decisions/`.
- Extract per-page text with positions and provenance.
- Rebuild page content streams from sanitized runs. **Do not draw rectangles.**
- Strip `/Info`, XMP, annotations and embedded files.
- Report `inconclusive` for pages with no extractable text. Never claim a
  scanned page was sanitized.

### 3 · Structure-aware CSV and JSON

Today both are treated as flat text, so keys are scanned alongside values.
Proper handling means a real CSV parser with per-cell locators and a JSON walker
with JSON-pointer locators, which also allows per-column and per-field policy.

### 4 · Detector completeness

- IBAN (mod-97), then domestic account formats.
- Government IDs as per-country validators behind one detector.
- Addresses — needs locale-aware parsing; a regex approach has an unacceptable
  false-positive rate.
- Dates of birth — a contextual problem, not a formatting one.
- Improve name recall. Evaluate a local NER model as an **additional**
  detector; it must stay offline.

### 5 · Security hardening

- Custom regex execution in a worker thread with a hard timeout (T-07).
- Dependabot or Renovate, plus advisory monitoring (T-10).
- Authentication and an ownership model (T-09).
- Deployment hardening: TLS, disabled core dumps, memory limits (T-05, T-11).
- Independent security review.

### 6 · Product and operations

- Custom pattern management in the UI.
- Per-category confidence thresholds.
- A diff view showing what changed, without revealing originals.
- Structured metrics that count detections **without recording values**.
- Decide deliberately whether to move to disk-backed or shared session storage;
  it lifts the file-size and scaling limits but reintroduces T-05.

---

## Troubleshooting

**`Cannot find module '@sds/...'`** — the packages are not built. Run
`npm run build:packages`.

**Editor shows errors that `npm run typecheck` does not** — stale project
references. Run `npm run clean && npm run build:packages` and restart the TS
server.

**`Cannot find native binding` from rolldown** — Node is below 22.12 and npm
skipped an optional dependency on an engine mismatch. Upgrade Node. See
`docs/decisions/0002-toolchain-and-node-baseline.md`.

**Tests fail after changing a package** — `npm test` builds first, but
`npm run test:watch` does not. Run `npm run build:packages` in a second terminal
or use `tsc -b --watch`.
