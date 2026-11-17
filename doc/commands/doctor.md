# dialecte doctor

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Installed versions, core API generation, skills in sync, local checkouts

```text
doctor - Installed versions, core API generation, skills in sync, local checkouts

  dialecte doctor [--json]
  dialecte doctor --brief

  what to fix before trusting what you read
  --brief - the session-start form, nothing when in sync, one line per problem

exit codes:
  1  a warning
  0  --brief, always
e.g. dialecte doctor --brief
```

Flags: `--json`, `--brief`
<!-- /dialecte-reference -->

- `dialecte doctor`: installed `@dialecte/*` versions, the core API generation of each dialecte (read from
  the core it resolves; a dialecte on another core than your app's is a warning), whether the synced skills match node_modules (a skill missing; a copied skill of
  another version than the one installed - linked skills follow node_modules), local checkouts (siblings,
  `$DIALECTE_ROOT`); each warning with the one command that fixes it.
