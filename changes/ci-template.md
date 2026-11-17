### Added

- `dialecte ci sync [--dry-run]` and `dialecte ci check`: the CI-first file set (the workflows, the PR template, `.nvmrc`, `changes/.gitkeep`) ships with the cli as a template; sync writes it into a package and deletes the retired `pr.yml` and `_lint.yml`, check reports drift with a diff. `ci.yml`'s jobs follow the package's scripts (type-perf with `type-bench:check`, docs with `doc:build`), the Playwright install its dependencies, and the tests' `mode` input the package's own `_test.yml`, which sync never writes. The workflows run the installed cli only (`npx --no-install dialecte`, never a registry fetch), and every node_modules restore fails on a cache miss.
- `dialecte ci publish-decision`: the publish guard of the push to main, run by the template's `_check-npm-version.yml`; the decision is unchanged, each line printed on its own stream.

### Changed

- The cli's own CI is written by `dialecte ci sync`: its check job runs `npm run check` (type-check, lint, format, docs) and `ci check`, where it ran lint and format only; `ci-ok` fails on any job that did not succeed. The unused `_type-perf.yml` is gone.

### Removed

- `src/publish-decision.ts`: `dialecte ci publish-decision` runs the guard.
