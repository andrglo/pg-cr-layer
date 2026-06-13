# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A thin Promise-based wrapper around [`pg`](https://github.com/brianc/node-postgres) that normalizes Postgres access to a "common requests" interface shared with [`mssql-cr-layer`](https://github.com/andrglo/mssql-cr-layer). The contract between these layers must stay compatible — method names (`execute`, `query`, `batch`, `transaction`, `beginTransaction`/`commit`/`rollback`, `wrap`), their signatures, and `dialect`/`delimiters` properties are the public API that downstream consumers (e.g. via a dialect-agnostic builder) depend on. Don't rename or change the shape of these without considering the mssql sibling.

The entire implementation is `src/index.js` (one prototype-based constructor, ~290 lines). There is no build step.

## Commands

- `npm test` — runs the full mocha suite (`test/index.js`). Requires a reachable Postgres (see below). There is no lint script in package.json; lint manually with `npx eslint .` (flat config in `eslint.config.js`).
- Run a single test: `npx mocha --exit --timeout 15000 test/index.js --grep "<pattern>"` (matches `describe`/`it` text).
- `npm run ssh` — opens a fish shell inside the running `dms` dev container.

### Running tests against Postgres

Tests connect using env vars `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_HOST`/`POSTGRES_PORT` (defaults: `postgres`/`postgres`/`localhost`/`5432`). The suite **creates and drops databases** `tests-pg-cr-layer-1..3` on the target server, so point it at a throwaway Postgres.

Bring one up with `docker compose up -d` (defines a `postgres:15.2-alpine` and a `dms` tooling container). CI (`.circleci/config.yml`) does the same against Node 22 + postgres 15.2, then publishes to npm on `master` when `package.json` version differs from the published one.

## Behaviors that are easy to break

- **Type parsers are set globally at module load** (`src/index.js:7-8`): OID 1082 (`date`) is returned as the raw string (no JS `Date` coercion), and OID 1700 (`numeric`) is parsed to a JS `Number`. Changing these affects every consumer process that requires this module.
- **Named-parameter conversion** (`query`): when `params` is a plain object, `@name` tokens in the SQL are rewritten to positional `$1,$2…` in order of appearance. A param value may be either a raw value or `{value, type}` (only `value` is used; `type` is accepted for mssql-layer parity and ignored here). A missing key throws via `assert`. Array params map directly to `$1,$2…` and `undefined` becomes `null`.
- **Multiple-statement results**: when `pg` returns an array (multi-statement query), `query` returns an array of `rows` arrays; otherwise it returns a single `rows` array. `batch` and `execute` are both just `query` aliases.
- **Two transaction styles**: `transaction(fn)` auto-commits/rolls back around the returned promise; `beginTransaction()`+`commit`/`rollback` is manual. The manual style stashes the pool's `done` callback in a module-level `WeakMap` keyed by the client — releasing the connection depends on that, so the same transaction object must be passed back to `commit`/`rollback`.
- **Pool error handling calls `process.exit(-1)`** on idle client errors (`src/index.js:37-40`) — intentional fail-fast, not a bug to "fix."
- `native: true` in config switches to `pg.native` (libpq bindings) at construction.
