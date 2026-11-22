### Changed

- **Breaking:** `dialecte lot pr <id>` is now `dialecte lot describe <id>`, with the same `--print` and `--json`; `lot pr` is an unknown verb (exit 2, the lot usage). The pull request template's header comment names the new verb.
- **Breaking:** `dialecte lot review <id> --pull --round <n>` is now `dialecte lot review <id> --comments --round <n>`; `--pull` is an unknown flag (exit 2). The `pulled-comments.jsonl` record keeps its name, so comments already taken are not taken again.
- **Breaking:** `dialecte text check --kind pr` is now `--kind change-request`, still the default kind; `--kind pr` is refused with the usage naming the four kinds.
- `lot describe`, `lot review` and `lot approve` name the change request in the host's own word: a repository whose origin is GitHub reads "pull request" as before; a repository no host serves (a local-path origin, no origin) reads "change request".
- The change-request template is the host's own: GitHub's `.github/pull_request_template.md`. A repository no host serves is read for the first host template its tree holds, and a refusal for a missing template names every path it looked for.

### Added

- `dialecte lot approve` names the queue the host merges the change request through, as the host answers it for the change request's base: `queued (merge queue)` or `queued (auto-merge)`; nothing is added when the host offers neither or the read is refused, and a stacked lot's line names none. `dialecte doctor --host` probes this read.
