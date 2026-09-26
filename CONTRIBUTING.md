# Contributing

Thanks for working on this. Start with [README.md](README.md) for setup and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Workflow

```bash
git checkout -b feat/pdf-extraction
# ... make changes ...
npm run verify        # typecheck + lint + format + tests
git commit -m "feat(document-processing): extract text from single-page PDFs"
git push -u origin feat/pdf-extraction
```

Branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `test/…`, `refactor/…`
Commits: [Conventional Commits](https://www.conventionalcommits.org/), scoped to
a package — `feat(detection): add IBAN detector`.

Keep a PR inside one area where you can. If you must change `packages/shared`,
say why in the description; it affects everyone.

---

## Rules specific to this product

This is a privacy tool. These are not style preferences — breaking one is a
security defect, not a nit.

### Never commit real personal data

Not in a test fixture, not in a sample document, not in an issue, not in a
screenshot. A commit is forever. Use documented test values:
`4111 1111 1111 1111`, `123-45-6789`, the `555` phone block, `example.com`.

### Never send an original value to the client

The wire schemas in `packages/shared/src/wire/schemas.ts` have no field for one,
and it must stay that way. If you need to show the user something about a
detected value, use `buildPreview`. If `buildPreview` cannot express what you
need, change the preview policy deliberately and explain why in the PR — do not
route around it.

### Never log document contents

Not the document, not a detected value, not the user's filename, not a
placeholder mapping. If you are debugging, log counts and types. `console` is an
ESLint error inside `packages/` for this reason.

### Never add an external network call to the core pipeline

No LLM, no OCR service, no analytics, no error reporter that captures request
bodies. ESLint blocks the imports inside `packages/`. If you genuinely need
egress, that is a product decision, not a code change.

### Never claim sanitization you cannot verify

If a format handler cannot guarantee the original characters are absent from its
output, it must declare `trueTextReplacement: false` and let the pipeline refuse
it. Drawing a rectangle over text is `visual-redaction` and is not acceptable as
a sanitization path.

### Fail loudly, not silently

An unimplemented capability throws. A detector returning offsets that do not
match its own value throws. Both would otherwise corrupt a document or leave
sensitive data in it. Do not soften them into warnings.

---

## Code expectations

- `npm run verify` passes.
- No `any`. Validate at boundaries instead — see `toStringArray` in
  `nlp-entity-detector.ts`.
- Typed errors from `@sds/shared`. No swallowed exceptions; if you deliberately
  discard one, say why in a comment.
- New behaviour comes with a test. New detectors come with false-positive tests.
- Comment the _why_, not the _what_.

## Review checklist

Before requesting review, and when reviewing:

- [ ] Could any original value reach the client or a log?
- [ ] Are new regular expressions bounded?
- [ ] Does new parsing handle malformed and malicious input?
- [ ] Are limits enforced on anything unbounded?
- [ ] If a format handler changed, are its `FormatCapabilities` still honest?
- [ ] Is the round-trip test still meaningful for what changed?
- [ ] Does the documentation still match the behaviour?

## Questions

Open a draft PR or a discussion. If it concerns a security property, say so
explicitly — those get reviewed differently.
