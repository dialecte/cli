### Added

- `dialecte tdd red` / `tdd green` and the gate's tdd step run and judge `node --test` test files like vitest ones, with the same receipts, ledger entries and red/green proof. The runner of each test file is inferred from the file, no setting: a JS/TS test file importing `node:test` runs under node (even inside a vitest package), a file a vitest config holds under vitest. Node's cases are read through the cli's own node reporter: their names join the describe titles with `>`, `tdd red <file>::<case>` runs that case alone (`--test-name-pattern`), an error inside a `node:assert` call (`assert.equal(...)`, `t.assert.equal(...)`, named imports from `node:assert/strict`) counts as inside an assertion, an import failure or a throwing `describe` refuses the file with its error, and a node timeout is a timeout. Node has no collect-only mode: the gate's tdd step runs a listed node test file in full.

### Changed

- The `outside` line of `tdd` and the gate names every runner: `not a test file of a known runner (no vitest config includes it, no node:test import)`.
- `tdd red` given only `<file>::<case>` targets runs only those cases, vitest included (the other cases of the file are not judged).
- The gate's tdd step no longer skips a package without vitest when the change touches a test file of another runner.
