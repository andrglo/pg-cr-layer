# Literal-aware parameter scan (pg side)

`PgCrLayer.prototype.query` used to find `@name` parameter markers with `/(@\w*\b)/g` over the whole
statement, so a marker-looking token inside a string literal, a quoted identifier, a dollar-quoted
string or a comment was rewritten as if it were a parameter. `src/scan-markers.js` replaces that
with a single forward scan that only reports markers in code context.

The corrupting sigil on this side is **`@`, not `$`**: when `params` is an Array the statement goes
to the driver untouched and postgres' own parser correctly ignores `$100` inside a literal. The `$`
cases in the test suite are regression guards.

## How it actually fails (corrected after measurement)

An earlier draft of this note claimed the pg failure was silent whenever the fake token's name
happened to be a real key in the params object. **That was wrong, and measurement corrected it.**

- **Pure object params → LOUD.** The fake `@key` inside the literal is rewritten to `$n`, but
  postgres never substitutes inside a string literal, so `$n` becomes a *positional hole*: the layer
  supplies N values for a statement the server thinks needs fewer. Postgres rejects it with
  `bind message supplies 2 parameters, but prepared statement "" requires 1` (or
  `could not determine data type of parameter $n`). Verified across every ordering — buried marker
  first, buried marker last, duplicate names, extra markers.
- **Object params mixed with an explicit positional `$n` → SILENT.** The pre-existing `$n` fills the
  hole, the bind succeeds, and the corrupted literal is simply returned or stored. Measured against
  the pre-fix code:

  ```
  layer.query("SELECT $1::text AS a, 'vendas@name.com.br' AS b", {name: 'Cadeira'})
  -> [{a: 'Cadeira', b: 'vendas$1.com.br'}]      // wrong bytes, no error
  ```

So on pg the dominant manifestation is a hard 500 on every affected statement rather than quiet data
corruption. The severity is real either way — it is just a different failure mode from the mssql
sibling, and the review should not be told it is the same one.

There is also **no marker-count assert** on this side (unlike mssql), which is why the failure
surfaces at the server rather than inside the layer.

Full plan, defect analysis, decisions, non-vacuity break log and release notes live with the sibling
repo, which ships in the same release:

- `/Users/andre/repos/src/github.com/andrglo/mssql-cr-layer/docs/rs-literal-tokenizer/plan.md`
- `/Users/andre/repos/src/github.com/andrglo/mssql-cr-layer/docs/rs-literal-tokenizer/spec.md`
- `/Users/andre/repos/src/github.com/andrglo/mssql-cr-layer/docs/rs-literal-tokenizer/decisions.md`
- `/Users/andre/repos/src/github.com/andrglo/mssql-cr-layer/docs/rs-literal-tokenizer/progress.md`
