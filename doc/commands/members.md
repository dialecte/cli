# dialecte members

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The members of an expression of the live types (doc.query, tx.lifecycle)

```text
members - The members of an expression of the live types (doc.query, tx.lifecycle)

  dialecte members <expression> [--package <name>] [--version <v>] [--json]

  one line per member of doc.query, doc.query.reference, tx.lifecycle.extract...; in an app, of the
    installed dialecte (--package / --version when several)

e.g. dialecte members doc.query
```

Flags: `--package`, `--version`, `--json`
<!-- /dialecte-reference -->

- `dialecte members <expression>` (`doc.query`, `doc.query.reference`, `tx.lifecycle.extract`): the
  IntelliSense walk on demand, from the live types of the package where it runs. In an app it reads the
  installed dialecte (a dependency built on `@dialecte/core` exporting `./<version>` with its `./<version>/test`
  entry: its namespace is its name capitalized, `Scl` from `@dialecte/scl/v2019C1`); with several, it lists them and
  `--package <name>` / `--version <v>` picks one. `--namespace <Name> --entry <module>` override.
