# dialecte health

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

What went wrong lately across every lot store: duplicate work, slow landings, stalled runs, idle worktrees and leaked scratch folders

```text
health - What went wrong lately across every lot store: duplicate work, slow landings, stalled runs, idle worktrees and leaked scratch folders

  dialecte health [--since <date|duration>] [--repository <name>] [--json]

  reads every store of the store list and the store of the current folder (each once), and the cli
    scratch folders of the temporary folder, files only: a header with the red and amber counts,
    then one block per finding (red first, newest first, idle worktrees and leaked scratch after the
    runs) with its detail lines and its next command; with no finding, one ok line naming the rules
  --since - the window of the duplicate work, landing time and worktree add rules: <n>h, <n>d, a
            date (its midnight UTC) or a date and time with its zone; default 7d
  --repository - the findings of the repository folder of that name only (the basename, exactly);
                 the scratch folders, which belong to no repository, are left out
  --json - { since, findings, counts: { red, amber } }

exit codes:
  1  a red finding
e.g. dialecte health --since 24h
```

Flags: `--since`, `--repository`, `--json`
<!-- /dialecte-reference -->

- `dialecte health [--since <date|duration>] [--repository <name>] [--json]` reads the stores the inbox
  reads, the repositories' check stores and the temporary folder, and reports what wastes time, red first:
  duplicate work (a gate, contrib, hook or rehearsal that ran again on a tree a green record already answered,
  naming both keys and the parts that differed: install, linked or command; a run given `--no-reuse` re-checks on
  purpose and is never duplicate work), slow landings (a `handover run` over
  5 minutes broken down into guards, each commit hook reused or ran and why, and the rehearsals before it),
  stalled runs (an open lot whose last step started under a process that is gone, ran over 2 hours (heavy:
  3 hours), was interrupted, or a station open over 4 hours; with the command that resumes it), idle worktrees
  (registered worktrees no open lot holds, untouched for 24 hours; amber), slow worktree adds (over 60 s)
  and leaked scratch folders (over 6 hours; amber: the folders of the cli's scratch root - `DIALECTE_SCRATCH`, else
  the workspace's `.worktrees/_scratch`, else `dialecte-scratch` in the system's temporary folder - and, for one
  release, the `dialecte-*` folders earlier versions left in the system's temporary folder). Idle worktrees and leaked scratch folders sort after the
  findings of runs of the same severity. `--since` takes `<n>h`, `<n>d`, a date (UTC midnight) or a zoned
  time; 7 days by default; it bounds the windowed rules, the others read now. `--repository` keeps that
  repository's findings (the scratch finding is no repository's). Reads files only, writes nothing. The step
  events carry the key of the record their run stored (`key`), a rehearsal's lots (`lots`: lot, tree,
  decision) and `noReuse: true` on a gate or contrib run given `--no-reuse`, so an identical-key run is found from
  the events. `--json`: `{ since, findings, counts: { red, amber } }`. Exit 1 when a red finding exists, 0 otherwise, 2 for a usage error.
