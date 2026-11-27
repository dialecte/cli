### Added

- An orchestrator state for each workspace, below the state home in `dialecte/orchestrator/<workspace key>/`: `state.json` (the source, versioned, checked field by field in schema order, unknown fields refused), `STATE.md` (its render) and `log.jsonl` (one event per line, appended in one bounded write). Their shapes ship as `orchestrator-state.schema.json`, `orchestrator-status.schema.json` and `orchestrator-event.schema.json` in `dist/schemas`.
- `dialecte orchestrate status [--workspace <path>] [--json]` reads a workspace's orchestrator state without writing anything and reports it as `present` (exit 0), `missing` or `damaged` (exit 1), as text (the render, then `damage:` and `note:` lines) or versioned JSON whose damage rows and notes carry a code. A missing, stale or unreadable `STATE.md` and skipped log lines are notes; a state home inside the workspace, or one whose path cannot be read, is refused (exit 2), naming the state home and where it came from (and the error code when it cannot be read).

### Changed

- **Breaking:** a relative `XDG_STATE_HOME` is now ignored, as the XDG base-directory rule asks, by every reader of the state home: the lot-store list, the heavy markers, the plan marks and the asks folder then use the `.local/state` folder of the home, where they used to resolve the relative path from the current folder.
