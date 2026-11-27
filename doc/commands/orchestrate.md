# dialecte orchestrate

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The read-only orchestrator state of a workspace

```text
orchestrate - The read-only orchestrator state of a workspace

  dialecte orchestrate status [--workspace <path>] [--json]

  status - reads state.json and log.jsonl below the state home for the selected workspace and prints
           the render of state.json; a missing, stale or unreadable STATE.md and skipped log lines
           are notes; nothing is written
  --workspace - selects a workspace path (relative to the current folder); the current folder is
                selected by default
  --json - the versioned whole status document { schema, workspace, outcome, state, statusLine,
           damage, notes }, each damage and note with its code; described by
           orchestrator-status.schema.json (schema 1)
  the state home is $XDG_STATE_HOME when it is absolute, else ~/.local/state; it must be outside the
    workspace

exit codes:
  1  orchestrator state is missing or damaged (state.json, or a damaged or unreadable log)
  2  unknown arguments or options, the selected workspace is not a directory, or the state home is inside it or cannot be read
e.g. dialecte orchestrate status --workspace . --json
```

Verbs: `status`

Flags: `--workspace`, `--json`
<!-- /dialecte-reference -->

`dialecte orchestrate status` reads the orchestrator state for the current working directory. Use
`--workspace <path>` to select another directory; relative paths start at the current working directory. The
workspace is identified by its real path, so a symlink selects the same state.

## The state home

The state lives in `<state home>/dialecte/orchestrator/<workspace key>/`: `state.json` (the source),
`STATE.md` (a render of it) and `log.jsonl` (one event per line). The state home is `$XDG_STATE_HOME` when it
is an absolute path, else `~/.local/state`: an empty or relative `XDG_STATE_HOME` is ignored, as the XDG
base-directory rule asks, by every reader of the state home alike (the lot-store list, the heavy markers, the
plan marks, the asks folder and the orchestrator). The state home must be outside the selected workspace; one
inside it is refused (exit 2) naming the state home and where it came from, for example
`state home /work/app/.state (from XDG_STATE_HOME) must be outside the workspace /work/app`. A state home whose
path cannot be read (a parent that is a file, a folder without permission) is refused the same way, with the
error code: `state home <path> (from XDG_STATE_HOME) cannot be read: ENOTDIR`.

## What it prints

The command is read-only: it creates no folder, repairs no file and appends no event. It always renders from
`state.json`; `STATE.md` is only a view of it, so a missing, stale or unreadable `STATE.md` is a note, never
damage, and the next write repairs it.

In text mode, a parsed state prints its render, then one `damage: <message>` line per damage row, then one
`note: <message>` line per note. Without a parsed state it prints the status line when there is no `state.json`,
else the damage lines (an invalid or unreadable state, or a state of another workspace).

Without a parsed state, the JSON `statusLine` follows the damage code: `no orchestrator state for <key>`
(`state-missing`), `invalid orchestrator state for <key>` (`state-invalid`), `unreadable orchestrator state for
<key>` (`state-unreadable`) or `orchestrator state of another workspace for <key>` (`workspace-mismatch`). With a
parsed state it is the first line of the render.

`--json` prints one versioned document, `{ schema, workspace, outcome, state, statusLine, damage, notes }`,
described by `orchestrator-status.schema.json`; its `state` follows `orchestrator-state.schema.json` and a log
line follows `orchestrator-event.schema.json` (all three ship in `dist/schemas`). Each damage row and note is
`{ source, code, message }`; the outcome is decided on the codes alone:

| Outcome   | Exit | When                                 |
| --------- | ---- | ------------------------------------ |
| `present` | 0    | a valid state, with or without notes |
| `missing` | 1    | the only damage is `state-missing`   |
| `damaged` | 1    | any other damage                     |

Damage codes: `state-missing`, `state-invalid` (the first broken field, in schema order), `state-unreadable`,
`workspace-mismatch` (a state of another workspace), `log-damaged`, `log-unreadable`.

Note codes: `render-missing`, `render-stale`, `render-unreadable`, `log-skipped`. `notes` is empty when no
state was read.

## The log

A last line without its newline (an append in flight, or one that crashed) is one damaged record while it is
the tail. The next append seals it with a newline; a complete line that is not JSON, or an empty line, is then
skipped and counted in a `log-skipped` note (`log.jsonl: <n> unreadable line(s) skipped`). A complete JSON line
that is not a valid event is a damaged record. The same event written twice is kept twice.

Usage errors, a workspace that is not a directory and a state home inside the workspace or that cannot be
read exit 2.
