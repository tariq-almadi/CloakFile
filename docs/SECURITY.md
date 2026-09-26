# Security

> **This project has not had a security review and is not production-ready.**
> This document describes the controls that exist, what they do and do not
> cover, and what must be resolved before this handles real sensitive data. The
> [threat model](THREAT-MODEL.md) enumerates the risks themselves.

---

## Security posture

This is a privacy product, so security is a correctness requirement rather than
a hardening layer added later. Three properties matter most:

1. A document must not leave our infrastructure.
2. A document must not persist after the user is done.
3. A document we describe as sanitized must actually be sanitized.

Everything below serves one of those.

---

## Upload handling

### Order of checks

Validation happens cheapest-first, so an attacker cannot make us do expensive
work before we reject them.

```
1. size        enforced by the multipart parser as bytes arrive
2. content     signature sniffing and structural parsing
3. filename    normalised last, for display only
```

### Never trust the extension or the Content-Type

Both are fully attacker-controlled. `detectFormat` decides what a file is from
its **bytes**:

- **PDF** — `%PDF-` signature.
- **DOCX** — ZIP signature plus the `word/document.xml` part name (OOXML stores
  part names uncompressed in local headers, so this is findable without
  inflating anything).
- **JSON** — must actually parse.
- **CSV / TXT** — must decode as strict UTF-8 with no null bytes.

A non-Word ZIP is rejected outright: accepting arbitrary archives would mean
accepting an arbitrary number of nested files.

A disagreement between the client's claim and the bytes is recorded as a note
on the response. It does not necessarily mean an attack — people rename files —
but it is exactly what an attack looks like, so it is surfaced rather than
silently resolved.

### Strict UTF-8 decoding

`new TextDecoder('utf-8', { fatal: true })`. The `fatal` flag is the control:
without it, a binary file with a `.txt` extension decodes into a string full of
replacement characters, which we would then scan, rewrite and hand back as a
"sanitized document".

### Size limits

| Layer            | Control                                                          |
| ---------------- | ---------------------------------------------------------------- |
| Multipart parser | `fileSize`, `files: 1`, `fields: 10`, `fieldSize`, `headerPairs` |
| Application      | `validateUpload` re-checks the byte length                       |
| Extraction       | `MAX_EXTRACTED_TEXT_LENGTH` (5 M characters)                     |
| JSON bodies      | Fastify `bodyLimit` of 1 MiB                                     |

The parser limit is the real defence — it stops the stream before a buffer is
allocated. The application check is a second layer for callers that bypass HTTP.

### Decompression bombs

`packages/document-processing/src/security/zip-guard.ts` reads a ZIP central
directory **without inflating anything** and rejects archives that declare too
many entries, too much total uncompressed data, or an implausible compression
ratio. It also rejects entry names that are absolute or contain `..` ("zip
slip") — we never write entries to disk, but the check belongs with the parser
so whoever implements DOCX extraction cannot forget it.

Declared sizes are attacker-controlled and may lie. This is a cheap pre-filter,
**not** a guarantee. A real DOCX extractor must additionally cap bytes actually
read out of the stream.

### Uploaded files are never executed, and never written to disk

Phase 1 holds uploads in memory only. That single decision eliminates insecure
temp-file permissions, temp files surviving a crash, path traversal via
filenames, and leftover files on a shared host. The cost is a small maximum
file size and an inability to scale horizontally.

### Filenames

Normalised through an allowlist (`[A-Za-z0-9._-]`), path components stripped,
leading dots removed, length bounded, and the extension replaced with the one
for the format **we** detected. The uploaded name is never used to build a
filesystem path; storage is keyed by a generated UUID.

The normalised name still reaches a `Content-Disposition` header and the DOM,
which is why CR/LF and quotes are stripped.

---

## HTTP layer

| Control          | Implementation                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Security headers | `@fastify/helmet`, CSP `default-src 'none'` — the API serves JSON and downloads, never HTML                      |
| CORS             | `@fastify/cors` with an explicit origin allowlist; `*` is rejected at startup in production                      |
| Rate limiting    | `@fastify/rate-limit`, configurable                                                                              |
| Download headers | `Content-Disposition: attachment`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`                  |
| Request ids      | Server-generated; a client-supplied id header is not trusted                                                     |
| Proxy headers    | `trustProxy: false` — enabling it without a known proxy lets a client spoof its address and defeat rate limiting |

### CSRF

The API is **not** exposed to CSRF, because it uses no ambient credentials.
There are no cookies and no session authentication; a session id is an
unguessable UUID returned in a response body and held only by the client that
created it. A cross-site request has nothing to ride.

**This changes the moment cookie-based authentication is introduced.** Adding
auth means adding CSRF protection in the same change.

### SSRF

Not applicable: no code path makes an outbound request. This is enforced by the
ESLint rule that bans network imports inside `packages/`, so it stays true.

### XSS

The API returns JSON and file downloads, never HTML. The React client escapes
by default and renders no user-controlled HTML — there is no
`dangerouslySetInnerHTML` in the codebase. Downloads are fetched as a blob and
saved, never opened in a tab.

---

## Injection and language-level risks

| Risk                    | Status                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Command injection**   | No `child_process` use anywhere. `no-eval`, `no-implied-eval` and `no-new-func` are ESLint errors                                                                  |
| **Prototype pollution** | No recursive merge of user input. Parsing is via Zod schemas, which produce known-shape objects. `no-proto` and `no-extend-native` are errors                      |
| **ReDoS**               | See below                                                                                                                                                          |
| **XXE**                 | Not yet applicable — no XML parsing exists. When DOCX lands, the parser must disable external entities and DTD processing                                          |
| **`any`**               | `@typescript-eslint/no-explicit-any` and the `no-unsafe-*` family are errors, and `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on |

### ReDoS

Two sources of risk, handled differently.

**Our own patterns.** Every regex in the detectors uses bounded quantifiers.
The email pattern is deliberately stricter than RFC 5322 — a fully compliant
grammar is a well-known backtracking hazard and matches addresses no real mail
system uses.

**User-supplied patterns**, which are the larger risk. `compileSafePattern`
rejects nested quantifiers (`(a+)+`), quantified alternations (`(a|a)*`),
backreferences and lookbehind, and caps pattern length.

**This is a heuristic, not a proof**, and it is honest to say so. A synchronous
regex cannot be interrupted once it starts, so prevention is the only in-process
defence available. Running user patterns in a worker thread with a hard timeout
is the correct fix and is on the Phase 2 list.

---

## Logging

**Rule: log shape, never content.** A log line may say "a 42 KiB document
produced 7 detections across 3 categories". It may never contain the document,
a detected value, the user's filename, or a placeholder mapping.

Four mechanisms:

1. **Serialisers construct their output explicitly.** Nothing is spread. Only
   the matched route is logged, never the raw URL, because a query string can
   carry user input.
2. **Error messages are filtered.** Only `AppError` messages — written by us,
   for a user audience — are logged. Everything else is replaced with
   `[redacted: may contain document content]`, because a parser error routinely
   quotes the bytes that failed to parse. Stacks are logged with their first
   line stripped, since that line repeats the message.
3. **Pino redaction** removes known-sensitive paths (`*.value`, `*.text`,
   `*.detections`, `*.filename`, auth headers) if anything ever does try to log
   them.
4. **`no-console` is an ESLint error inside `packages/`**, so library code has
   no way to print at all.

### Never log

- Document contents, in whole or in part
- Any detected value: card numbers, government IDs, names, addresses
- Placeholder → original mappings
- Uploaded filenames
- Authentication tokens or passwords

### No third-party telemetry

There is no analytics, error-reporting or session-replay integration, and
`apps/web/index.html` carries a comment saying not to add one. An error
reporter that captures request bodies would ship sensitive documents to a
vendor.

---

## Data retention

```
UPLOAD → PROCESS → SANITIZE → DOWNLOAD → DELETE
```

- **In memory only.** Nothing is written to disk. Nothing is written to a
  database.
- **TTL-bounded.** Sessions expire (`SESSION_TTL_SECONDS`, default 15 minutes),
  swept on write and by a background timer.
- **User-initiated deletion.** The client calls `DELETE` immediately after a
  successful download.
- **Capacity refusal, not eviction.** At `SESSION_MAX_ENTRIES` new uploads are
  refused rather than evicting someone else's in-flight document.
- **Clean shutdown.** `onClose` clears the store, so a redeploy or SIGTERM does
  not leave documents in a process on its way out.

### Honest limit

Clearing a JavaScript `Map` drops references; it does not guarantee the strings
leave the heap. Garbage collection timing is not controllable, and a process
core dump or a swapped memory page could still contain document text.
Mitigations — short TTLs, disabled core dumps, encrypted swap, memory limits —
belong to deployment, and none of them are configured in this repository yet.

---

## Verification as a security control

The download is gated on verification. Under `SANITIZATION_STRICT_VERIFICATION`
(default `true`), a document is released only if re-extracting its generated
bytes finds none of the values we replaced.

Two properties matter for security:

- **Fail closed.** `fail` and `inconclusive` both block the download.
- **`visual-redaction` output is rejected outright.** A generator that covers
  text rather than removing it produces a document this system will not release.

**What verification does not prove:** it proves the values are absent from the
text we can _extract_. For TXT, CSV and JSON, extraction is exhaustive, so that
is equivalent to absence from the file. For PDF and DOCX it will not be — text
can hide in metadata, annotations, tracked changes and image pixels — which is
one of the reasons those formats are not enabled.

---

## Dependency management

Kept deliberately small. Every runtime dependency is either load-bearing for
correctness (`libphonenumber-js`, `compromise`, `zod`) or the framework itself
(`fastify`, `react`, `vite`). Several things were implemented in-repo rather
than pulled in — format sniffing, the ZIP guard, the multipart test helper —
because for a security product a dependency is attack surface, and these are
small, auditable and unlikely to change.

- `npm audit` runs in CI and currently reports **0 vulnerabilities**.
- `package-lock.json` is committed; CI uses `npm ci`.
- Dependency choices with a security dimension are recorded in
  [docs/decisions/](decisions/).

**Not yet configured:** automated dependency updates (Dependabot or Renovate),
and any supply-chain integrity check beyond the lockfile. Both should be added
before this is deployed.

---

## What still requires security review

This list is the honest answer to "is this safe to use yet?".

| Area                          | Why it needs review                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **PDF and DOCX handling**     | Not written. The highest-risk part of the product                                                                        |
| **ReDoS on custom patterns**  | Heuristic only; needs worker-thread isolation with a timeout                                                             |
| **In-memory erasure**         | Best-effort; needs a deployment-level answer (core dumps, swap, memory limits)                                           |
| **No authentication**         | Anyone who can reach the API can submit a document and consume capacity                                                  |
| **Rate limiting**             | Per-instance and in-memory; ineffective across multiple instances                                                        |
| **Detection completeness**    | Missing a value means shipping a document the user believes is clean. Needs adversarial testing with realistic documents |
| **Name detection quality**    | compromise is lexicon-based and marked `experimental`. It will miss names                                                |
| **Multi-instance deployment** | Session state is in-process. A shared store would reintroduce the retention risk this design avoids                      |
| **Transport**                 | No TLS configuration here. A deployment must terminate TLS and reject plaintext                                          |
| **Dependency monitoring**     | No automated update or advisory pipeline                                                                                 |

---

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers privately and allow time for
a fix before disclosure. Never attach a real sensitive document to a report —
reproduce with synthetic data, as the fixtures in `tests/fixtures/` do.
