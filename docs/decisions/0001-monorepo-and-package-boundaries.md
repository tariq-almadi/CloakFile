# 0001 · Monorepo with npm workspaces, split by responsibility

**Status:** Accepted · Phase 1

## Context

Several developers need to work in parallel on a React UI, an HTTP boundary,
PII detection, and binary document formats — while sharing one definition of the
domain. The shared definitions (`PIIType`, `Detection`, the HTTP payload shapes)
are used on both sides of the network boundary.

## Decision

A single repository with npm workspaces: two apps and six packages, with
TypeScript project references driving the build.

## Why a monorepo

- **The contract cannot drift.** In separate repositories, the domain types
  would be duplicated or versioned. A mismatch between what the server sends and
  what the client renders, in a privacy product, means showing the user the
  wrong thing about their own data.
- **The central test spans four packages.** Detect → anonymize → generate →
  re-extract → verify must be runnable in one command against one consistent set
  of sources.
- **Interfaces will change.** The detector interface will evolve as detectors
  are added. In a monorepo that is one atomic commit.

## Why npm workspaces and not Turborepo, Nx or pnpm

Eight workspaces and a build measured in seconds. TypeScript project references
already give correct, incremental, dependency-ordered builds via `tsc -b`. A
build orchestrator would be a dependency and a concept to learn without a
problem to solve. Revisit if build times become painful.

npm specifically because the brief called for it and it ships with Node.

## Why six packages rather than folders inside the API

The boundary is enforced by the module system rather than by convention.
`packages/detection` cannot import from `apps/api`, so detection logic cannot
grow a dependency on an HTTP request object. This is what makes "keep file
processing out of controllers" and "keep detectors independent of the frontend"
structural rather than aspirational.

Two packages deserve specific justification:

- **`verification` is separate** from `pipeline` because it is the product's
  core safety claim and must be able to fail the rest of the system. Giving it
  its own package, owner and test suite reflects that status.
- **`pipeline` is separate** from `apps/api` so the orchestration can be tested
  without HTTP, and so the API stays a thin adapter.

## Consequences

**Good.** One toolchain to learn. Clear ownership per directory. Compiler-
enforced boundaries. Atomic cross-cutting changes.

**Costs.** Packages must be built before the API runs, which surprises new
contributors (documented in DEVELOPMENT.md). Six `package.json` and `tsconfig`
files to keep consistent. A change to `@sds/shared` can break four packages —
mitigated by CODEOWNERS requiring a second reviewer there.
