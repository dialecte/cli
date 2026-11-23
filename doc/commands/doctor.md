# dialecte doctor

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Installed versions, core API generation, skills in sync, local checkouts

```text
doctor - Installed versions, core API generation, skills in sync, local checkouts

  dialecte doctor [--json]
  dialecte doctor --brief
  dialecte doctor --host [--vendor <name>]

  what to fix before trusting what you read
  --brief - the session-start form, nothing when in sync, one line per problem
  --host - runs every read of the repository's host once, for real, through the cli's own code (the
           newest merged pull request, its checks, its queued state and the queue its base offers, a
           reference pull request's line comments, the stack extension), then the tool versions
           against the recorded ones and git against its floor; only those lines; network by name;
           --vendor <name> probes that vendor whatever the origin

exit codes:
  1  a warning
  0  --brief, always
  1  --host: an error (a read refused, a changed answer, git below its floor, no vendor); a warning (nothing to probe, a part not installed, an older tool) never fails
  2  --host: usage (--vendor given without a vendor name)
e.g. dialecte doctor --brief
```

Flags: `--json`, `--brief`, `--host`, `--vendor`
<!-- /dialecte-reference -->

- `dialecte doctor`: installed `@dialecte/*` versions, the core API generation of each dialecte (read from
  the core it resolves; a dialecte on another core than your app's is a warning), whether the synced skills match node_modules (a skill missing; a copied skill of
  another version than the one installed - linked skills follow node_modules), local checkouts (siblings,
  `$DIALECTE_ROOT`); each warning with the one command that fixes it.
- `dialecte doctor --host`: every read the lot verbs make of the repository's host, run once for real through
  the same code they use: the newest merged pull request (its view, a branch that has none, its checks, its
  queued state), the line comments of a reference pull request, the stack extension; then the host tool's
  versions against those the cli was checked with, and git against its floor (2.38). It prints only those
  lines and needs no installed `@dialecte` package. An error (a read refused, an answer whose shape changed,
  git too old, no host vendor for the origin) exits 1; a warning (nothing merged yet to probe, the stack
  extension not installed, a tool older than recorded) never fails. `--vendor github` probes that vendor
  whatever the origin says.
