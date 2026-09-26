## What changed

<!-- One or two sentences. What does this do, and why? -->

## Area

<!-- Tick what you touched. Changes to packages/shared affect everyone. -->

- [ ] `apps/web` — frontend
- [ ] `apps/api` — HTTP layer
- [ ] `packages/detection`
- [ ] `packages/anonymization`
- [ ] `packages/document-processing`
- [ ] `packages/verification`
- [ ] `packages/pipeline`
- [ ] `packages/shared` — **cross-cutting, needs a second reviewer**
- [ ] Docs / tooling

## Privacy and security

<!-- This is a privacy product. Answer these honestly; "n/a" is a fine answer. -->

- [ ] No original sensitive value can reach the client or a log
- [ ] No real personal data is committed, including in fixtures
- [ ] No new outbound network call in the core pipeline
- [ ] New regular expressions use bounded quantifiers
- [ ] New parsing handles malformed and malicious input
- [ ] If format handling changed, `FormatCapabilities` are still honest
- [ ] Nothing claims sanitization that verification cannot prove

## Testing

<!-- What did you add, and what did you verify by hand? -->

- [ ] `npm run verify` passes
- [ ] New behaviour has tests
- [ ] New detectors have false-positive tests
- [ ] The round-trip test still covers what changed

## Notes for the reviewer

<!-- Anything that needs a closer look, or that you are unsure about. -->
