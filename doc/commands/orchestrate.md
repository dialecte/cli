# dialecte orchestrate

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The read-only orchestrator state of a workspace

```text
orchestrate - The read-only orchestrator state of a workspace

  dialecte orchestrate status [--workspace <path>] [--json]

  status - reads state.json, log.jsonl and STATE.md below the state home for the selected workspace;
           the exact stored STATE.md is printed when state and render agree, and nothing is written
  --workspace - selects a workspace path (relative to the current folder); the current folder is
                selected by default
  --json - the versioned whole status document { schema, workspace, outcome, state, statusLine,
           damage }

exit codes:
  1  orchestrator state is missing or damaged
  2  unknown arguments or options, or the selected workspace is not a directory
e.g. dialecte orchestrate status --workspace . --json
```

Verbs: `status`

Flags: `--workspace`, `--json`
<!-- /dialecte-reference -->

`dialecte orchestrate status` reads the orchestrator state for the current working directory. Use
`--workspace <path>` to select another directory; relative paths start at the current working directory.

The command derives the storage folder from `XDG_STATE_HOME/dialecte/orchestrator/`, or from the process
home's `.local/state/dialecte/orchestrator/` when `XDG_STATE_HOME` is unset. It reads `state.json`,
`log.jsonl` and `STATE.md` from the selected workspace's state folder. It is read-only: it does not create the
folder, repair stale files or append an event.

With a present, undamaged state, text output is the freshly rendered `STATE.md` content. With
`--json`, the command prints one versioned document containing the selected workspace, outcome, parsed
state, status line and damage list. Missing state exits 1 with outcome `missing`; malformed state, damaged log
records or a stale render exits 1 with outcome `damaged`. Usage errors and a workspace that is not a
directory exit 2.
