# dialecte bench

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI

```text
bench - Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI

  dialecte bench [--check] [zero-config flags]

  writes benchmarks/types/baseline.json; --check fails on a >5% instantiation regression
  tsgo (TypeScript 7+) runs with one checker (--checkers 1), so a file set always gives the same
    count; the baseline records the compiler and its exact version
  --check gives no verdict against a baseline from another compiler or version, or one that records
    none: re-baseline in its own commit

exit codes:
  1  --check: an instantiation regression past 5%
  2  --check: no baseline.json to compare with (run dialecte bench to write it)
  3  --check: a baseline from another compiler or version, or one that records no compiler
e.g. dialecte bench --check
```

Flags: `--check`, `--namespace`, `--entry`, `--constants-dir`, `--out`, `--version`, `--tsconfig`, `--format-config`, `--no-format`
<!-- /dialecte-reference -->
