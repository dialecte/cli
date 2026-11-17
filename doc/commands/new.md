# dialecte new

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Scaffold in the house style

```text
new - Scaffold in the house style

  dialecte new verb <namespace> <query|transaction> <name> [--version <v>]

  verb, types, red test (only: true), barrel export, namespace registration

e.g. dialecte new verb parts query findPart
```

Verbs: `verb`

Flags: `--version`
<!-- /dialecte-reference -->

- `dialecte new verb <namespace> <query|transaction> <name> [--version <v>]` writes a verb of a dialecte
  package in the house style: the function (query or transaction first, one params object), its
  `.types.ts`, a table-driven test with one red case (no `only`: `tdd red` refuses a focus marker; while
  iterating, run the case with `npx vitest run <file> -t "<case>"`), its barrel export and, for a new
  namespace, the namespace module and its registration. Its JSDoc summary and `@intent` start with
  `FILL:`, which `skills check` refuses until written; the command prints every placeholder left.
