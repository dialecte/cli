# dialecte bench

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI

```text
bench - Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI

  dialecte bench [--check] [zero-config flags]

  writes benchmarks/types/baseline.json; --check fails on a >5% instantiation regression

e.g. dialecte bench --check
```

Flags: `--check`, `--namespace`, `--entry`, `--constants-dir`, `--out`, `--version`, `--tsconfig`, `--format-config`, `--no-format`
<!-- /dialecte-reference -->
