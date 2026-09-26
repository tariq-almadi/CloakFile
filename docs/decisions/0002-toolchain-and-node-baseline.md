# 0002 · Toolchain versions and the Node baseline

**Status:** Accepted · Phase 1 · **Revisit when the team is on Node ≥ 22.12**

## Context

Three toolchain choices turned out to be coupled to the Node version available
during setup (22.11.0). Each was verified against the registry rather than
assumed.

## Decisions

### TypeScript 6.0.3, not 7.x

TypeScript 7 is current, but `typescript-eslint` declares
`typescript >=4.8.4 <6.1.0`. Adopting TypeScript 7 would silently disable
type-aware linting — which is where the `no-unsafe-*`, `no-floating-promises`
and `only-throw-error` rules live, and those rules are load-bearing for a
security-sensitive codebase.

TypeScript 6.0.3 is the newest release inside the supported range.

**Revisit** when `typescript-eslint` supports TypeScript 7.

### Vite 7, not Vite 8

Vite 8 bundles with rolldown, whose platform binary is an **optional**
dependency carrying `engines: node >= 22.12.0`. npm silently skips optional
dependencies that fail an engine check, so on Node 22.11 the install appears to
succeed and then every Vite and Vitest invocation fails with
`Cannot find native binding`.

Vite 7 uses Rollup and esbuild and works on 22.11. Its plugin, `@vitejs/plugin-react`,
is pinned to `^5.2.0` — version 6 requires Vite 8.

**Revisit** once the team is on Node ≥ 22.12: move to Vite 8 and
`@vitejs/plugin-react` 6.

### Frontend tests run in Node, not jsdom

`jsdom` transitively requires `require(esm)`, which arrived in Node 22.12. On
22.11 the Vitest worker fails to start.

The only frontend tests today cover the pure workflow reducer and need no DOM,
so the web project uses `environment: 'node'` and `jsdom` is not installed.
Instructions for adding it are in DEVELOPMENT.md.

### Declared `engines: node >= 22.12.0`

The `engines` field states what the toolchain genuinely needs, even though the
project currently runs on 22.11. Understating the requirement would leave the
next contributor to rediscover the rolldown failure themselves.

## Consequences

Everything installs, builds, lints, type-checks and tests on Node 22.11
**today**, while the documentation points at 22.12+. Three version pins carry a
"revisit when" condition rather than being silently frozen.
