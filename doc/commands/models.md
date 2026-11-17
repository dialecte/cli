# dialecte models

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Which model each tier (fast, standard, strong, frontier) means for the project's vendor

```text
models - Which model each tier (fast, standard, strong, frontier) means for the project's vendor

  dialecte models [--vendor <anthropic|openai|google>] [--json]

exit codes:
  1  an unknown vendor
  2  no vendor known
e.g. dialecte models --vendor openai
```

Flags: `--vendor`, `--json`
<!-- /dialecte-reference -->

- `dialecte models [--vendor <id>] [--json]`: the model each tier means for the vendor the project uses
  (`anthropic`, `openai`, `google`), one line per tier, the date the rows were checked and what each tier
  is for. Agents name a tier (`standard`) and ask this command which model that is. The vendor is the one
  `dialecte skills sync` remembered as `vendor` in `.dialecte-skills.json`, in every skill folder of the
  project. Sync detects it from the project (`.claude/`, `AGENTS.md` + `.codex/`, `.gemini/`; a folder holding
  only the skills a sync wrote is no evidence) and asks on a terminal when several agents, a multi-vendor host
  (Copilot, Cursor) or none are found. Without a terminal, a sync that cannot tell installs the skills without a vendor (`models` stays
  unset: the skills need none) and says how to set it: `--vendor <id>`, which also sets it without asking. When manifests disagree, `models` warns on stderr, naming them, and uses the
  most recently written; an unknown vendor id in a manifest is ignored with a warning. Exit 1 for an unknown
  `--vendor`, 2 when no vendor is known.
