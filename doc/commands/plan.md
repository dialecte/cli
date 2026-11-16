# dialecte plan

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

What can start now in a plan's lot block, whether the block is valid, a mark on an entry

````text
plan - What can start now in a plan's lot block, whether the block is valid, a mark on an entry

  dialecte plan next <plan.md> [--json] [--all]
  dialecte plan check <plan.md> [--json]
  dialecte plan mark <plan.md> <id> done --by <who> [--reason <text>]
  dialecte plan mark <plan.md> <id> done --landed <sha> --by <who> --reason <text>

  the block - one fenced ```json dialecte-lots block in the plan, or the file <plan without
    .md>.lots.json beside it (both or neither: refused); each entry's id, kind (lot, fix, spec,
    person), dependsOn, scope per repository, heavy steps, brief and match (branch, handover,
    feature); unknown keys refused, every fault at once
  next - proposes only, starts and writes nothing: the state of each entry read from the stores, the
         hand-over registries and the worktrees of its repositories (files only, no git process
         except one probe per lot whose hand-over was committed outside its folder: once its branch
         is past the base commit of the lot and on the base branch it reads committed; once lot
         close closed that hand-over every reader reads it committed, files only; a live run or a
         transition later than that hand-over reads from its own records), the open lots, the lots
         that can start in critical-path order (merge:, after, unverified, stacks, next command),
         the held ones with each scope pair met, the landed lots (lot <name> committed: hand-over
         committed in <folder>, branch on <target>; until lot close closes that hand-over), person
         entries without a mark, the spec work, what each entry waits for, the parked ones, the live
         heavy steps with the load against twice the cores and the available memory against 2 GB
         (advice only); --all lists the done entries; --json { plan, repositories, counts, entries,
         proposals, held, landed, specWork, heavy, unknown }
  check - the block parses and every repository is a git main checkout (two names for one common
          folder refused); one line when valid; --json { plan, valid, faults }
  mark - a person entry only: appends { plan, id, state: done, by, reason, at } to
         <state>/dialecte/plans/<sha256 of the plan's real path, 16 hex>.jsonl, once (again:
         already); per machine; --landed <sha> for a lot or fix entry landed outside the lot store
         (a lot landed by hand, or stopped after its work landed in another lot): one --landed per
         repository of the entry (<repository>:<sha>; a bare <sha> for an entry of one repository);
         origin fetched, each commit must be on origin's base branch of its repository and change a
         path of the entry's scope there; the mark records { landed: [{ commit, repository }] } and
         the entry reads done by them (realizedBy kind landed); an entry its records already say
         done takes none (answered, nothing recorded); a lot or fix entry takes no plain mark, a
         person entry no --landed

exit codes:
  1  next: no lot or fix can start now (spec work may still be listed)
  2  usage; no block or an invalid one (every fault listed); a repository that is not a git checkout; mark: a lot or fix entry without --landed (or without --reason), a person entry with it, a commit not on the base branch of origin, an unknown id
e.g. dialecte plan next 33-LOT-ENGINE.md
````

Verbs: `next`, `check`, `mark`

Flags: `--json`, `--all`, `--by`, `--reason`, `--landed`
<!-- /dialecte-reference -->

- `dialecte plan next <plan.md> [--json] [--all]` reads a plan's lot block (one fenced block with the info string
  `json dialecte-lots` in the plan, or `<plan without .md>.lots.json` beside it; both or neither is refused) and proposes what can
  start now; it starts, claims and writes nothing. Each entry declares an `id`, a `kind` (`lot`, `fix`, `spec`,
  `person`), `dependsOn`, a `scope` per repository (`"."` is the whole repository), extra `heavy` steps
  (`mutation`, `browser`, `release`), a `brief`, and a `match` (`branch`, `handover`, `feature`) by which its
  records are found; the block's `shared` files (the changelog, the README, the command map) never hold a lot back.
  An entry's state is read, never declared: done by a committed hand-over or store lot, open by a store lot, a
  pending hand-over or a worktree on its branch, else ready, waiting, parked, or unknown with the reason when its
  repository cannot be read (files only: the stores, the registries, `worktrees/*/HEAD`; no git process, except
  one probe per lot whose hand-over was committed outside its folder and not closed yet: once its branch is past
  the lot's base commit and on the base branch that lot reads `committed`, is no longer open nor holds anything,
  and is listed under `landed` as `lot <full name> committed: hand-over committed in <folder>, branch on
  <target>`; once `lot close` closes that hand-over every reader reads it `committed`, files only, with no
  `landed` line; a lot with a live run or a transition later than that hand-over reads from its own records). The
  text says the counts, the open lots (and open work no entry accounts for: its repository's proposals are
  `unverified`), the lots that can start in critical-path order (`unblocks 7 (chain 4)`, `after <id>`, `merge:
  <open lots>`, `next: dialecte lot start <brief>` or the brief to write), the ready lots held by an open one with
  each scope pair met, person entries without a mark, the spec work (a spec missing or `DRAFT`), what each entry
  waits for, the parked ones, then the machine: the live heavy steps with their worktree and age, the load against
  twice the cores, the free and inactive memory against 2 GB (`vm_stat` on macOS, `/proc/meminfo` on Linux); a
  proposal whose heavy steps would run beside a live one says `stacks:`, and on a short machine its heavy steps
  would wait (advice only). `--all` lists the done entries; `--json` answers `{ plan, repositories, counts,
  entries, proposals, held, landed, specWork, heavy, unknown }`, `landed` always a list (`[{ repository, lot,
  folder, target }]`, `[]` when none). Exit 0 when a lot or fix can start, 1 when none can, 2
  for a usage error, no block or an invalid one (every fault listed), or a repository that is not a git checkout.
  `dialecte plan check <plan.md> [--json]` checks the block alone: one line when valid, else every fault (exit
  2). `dialecte plan mark <plan.md> <id> done --by <who> [--reason <text>]` records a person entry's mark once in
  the machine's state folder (`<state>/dialecte/plans/`); a `lot` entry's state comes from its records and is
  refused.
- `.dialecte/lot` reaches the lot folder, whose `round-<n>/` snapshots hold copies of the lot's files, tests
  included. Leave `.dialecte/` out of every tool that walks the worktree: a test runner whose globs include dot
  folders, a formatter, a linter. Git already leaves it out (`worktree add` excludes it).
