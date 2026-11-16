# dialecte worktree

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

A worktree ready to work in; prune what a merge left

```text
worktree - A worktree ready to work in; prune what a merge left

  dialecte worktree add <repository> <branch> [--from <ref>] [--json]
  dialecte worktree prune [--root <workspace>] [--yes] [--json]
  dialecte worktree prune [--root <workspace>] --reclaim [--dry-run] [--older-than <days>]

  add - under the workspace's .worktrees/: hooks folder, the links its file: and link: dependencies
        need to sibling checkouts, node_modules taken from the pool when an entry matches
        package-lock.json's lock key, else a near entry (at most 5 packages off) completed by npm
        install --prefer-offline --no-save, else npm ci, a copy-on-write copy only when npm ci fails
        (the reason on the card), read against package-lock.json (the npm ci to run when it
        differs), hygiene baseline
  prune - merged worktrees and branches, committed hand-overs, rehearsal clones: the commands with
          their cd; a worktree an open lot names (working, input-required, ready, failed) is kept
          first, reason lot <name> <state>; --yes runs them after a confirmation on a terminal; the
          pool (.worktrees/_pool-<repository>-<n>) and the trash (.worktrees/_trash/) are counted,
          never touched
  prune --reclaim - every worktree idle for --older-than days (default 2: no write to its index,
    HEAD or reflog since), not the main checkout, not locked, named by no open lot (a failed lot
    keeps) nor open hand-over, worked in by no process, reached by no link: its node_modules parked
    in the pool when its lock key is the main checkout's and it installs that lock, else sent to
    .worktrees/_trash/, its code never touched; a node_modules that is a link is never moved; a
    -round-<n> throwaway of a closed lot trashed whole and forgotten by git; every rule checked
    again just before each move; one line per worktree, the total (worktrees, files, size) last;
    --dry-run moves nothing; --dry-run or --older-than without --reclaim, or an --older-than that is
    no positive whole number, exit 2

exit codes:
  0  add: the worktree exists, whatever the links and the lockfile say
  1  add: a new branch without --from, and the base branch refused (a dialecte.baseBranch set to a branch that exists nowhere, local or on origin, or no base branch found); no worktree made
e.g. dialecte worktree add cli feat/my-change
```

Verbs: `add`, `prune`

Flags: `--from`, `--json`, `--root`, `--yes`, `--reclaim`, `--dry-run`, `--older-than`
<!-- /dialecte-reference -->

- `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` makes a worktree under the
  workspace's `.worktrees/<index>-<repository>-<branch tail>` (the last segment of the branch:
  `0171-core-depth` for `feat/depth`; a new branch starts from `--from`, else the base
  branch; a `<repository>` that is no folder, or a folder in no git repository, is refused in one line, exit
  2): it copies the hooks folder `core.hooksPath` names (husky's `.husky/_` is ignored by git, so a
  plain worktree misses it), takes a `node_modules` from the workspace's pool when one matches (below), else
  copies the main checkout's `node_modules` copy-on-write where the file system
  can (links kept, a relative link to a sibling re-pointed so it still reaches it) - from the worktree that
  has the `--from` branch checked out when it has one, else from the main checkout - lists `.dialecte/`
  once in the exclude file of the repository's common git folder (so for the main checkout and every
  worktree of it), and writes the hygiene baseline `gate --fast` compares with; it prints a card.
  The index is 4 digits at least (`0001`, past `9999` it grows), one counter per workspace so the latest
  worktree sorts last: 1 + the highest of the claims in `.worktrees/.index/` (one empty file per index ever
  taken) and the numbered folders and links of `.worktrees/`. A claim is created only where none exists,
  so two runs at the same moment, of any repositories, never take the same index (the other takes the
  next), and a number stays taken after its worktree is removed. Unnumbered folders and the sibling links
  (`.worktrees/core`) count for nothing and are never renamed. `--json` carries `index`.
  The pool: a finished checkout's `node_modules` waits in `.worktrees/_pool-<repository>-<n>/node_modules`,
  with a `pool.json` beside it (`{ repository, lockHash, parkedAt }`, `lockHash` the sha256 of the
  `package-lock.json` it was checked against), at most two entries per repository (parking a third sends
  the oldest to the trash). A park (`lot close`, the end of a rehearsal) takes only a `node_modules` that
  matches its `package-lock.json` (as `worktree add` reads it), rewrites absolute, in place, every link inside
  it whose relative target leaves its checkout (a sibling repository; a link into the checkout itself, an npm
  workspace package, stays relative and reaches the taker's own package), renames the folder into a new entry (no file is copied),
  sends `node_modules/.vite` and `node_modules/.cache` to the trash (or leaves them in the folder already
  going there), then writes `pool.json`; a `_pool-*` folder without one is a park that never finished,
  never taken, and `worktree prune` names it as left over. `worktree add` takes the newest entry of the
  repository whose `lockHash` is the new worktree's `package-lock.json` hash (a rename: two takers never
  share one, the second goes on to the next entry), then reads it against the lockfile as it reads a copy.
  No match, an empty pool or a rename across file systems: the copy. The card's `node_modules` row says
  which and how long (`pooled  _pool-cli-1  0.1 s`, `copy-on-write  46.2 s`); `--json` carries
  `nodeModules: { method, from?, seconds }`. The trash: `.worktrees/_trash/` - a worktree goes there by
  `git worktree move` (git keeps it registered) then a background `git worktree remove --force`, a folder
  by a rename then a background `rm -rf` of that one path; nobody waits for either. A folder left there (a
  sleep, a crash) stays for you to look at. The pool and the trash are used only where the repository's
  parent holds `.worktrees/`.
  Before the copy it makes the links the worktree's `file:` and `link:` dependencies need (`dependencies`,
  `devDependencies`, `optionalDependencies`, `peerDependencies`): a relative path that leaves the worktree
  into the workspace's `.worktrees/` (`file:../core` from `.worktrees/cli-x` reaches `.worktrees/core`)
  gets a relative link there to the folder the same path reaches from the main checkout
  (`.worktrees/core -> ../core`). Each dependency gets one outcome, in the card's `links` row and the
  JSON's `siblingLinks` (`dependency`, `link`, `target`, `outcome`): `created`; `present` (a link that
  already reaches it: a second worktree changes nothing); `skipped: <target> missing`;
  `skipped: <folder> missing` for a path into a sibling whose own folder is not under `.worktrees/` yet
  (`file:../core/sub/pkg` without `.worktrees/core`); `skipped: outside .worktrees/`;
  `skipped: cannot make the link (<code>)` when the file system refuses it (`EACCES`, ...);
  `kept: points to <its text>, not <target>` or `kept: a real folder` (or file): what is there is never
  replaced. A path inside the repository needs no link and is not listed. After the copy it reads
  `node_modules` against the worktree's `package-lock.json` (its `packages` map, lockfileVersion 2 or 3,
  nested packages included, bundled ones left out): each package installed at its locked version
  (`missing`, `<installed> installed, lock <locked>`, `package.json unreadable`), each link reaching what
  the lockfile resolves it to (`link to <path> missing`, `… points elsewhere`). A package npm may leave
  out of this machine's install is not missing when absent: `optional`, or an `os` / `cpu` list this
  platform does not match (`!x` excluding x); a `devOptional` one is, since a development install puts it
  in. The card's `lockfile` row says
  `✓ node_modules matches package-lock.json (<n> packages)`, or the count of packages that differ with the
  first five, and a `next` row holds the command that puts it right, `cd '<worktree>' && npm ci`. Without
  a lockfile it says `no package-lock.json: not checked`; a lockfile that is not JSON, or has no `packages`
  map (lockfileVersion 1), is not checked either (`package-lock.json unreadable: not checked`,
  `package-lock.json has no packages map: not checked`). The JSON carries it as `nodeModulesCheck`
  (`lockfile`, `notChecked`, `problems`: `package`, `problem`; `command` when there are problems). The
  exit code stays 0 whatever the links and the lockfile say: the worktree exists, and its card says what
  to run.

- `dialecte worktree prune [--root <workspace>] [--yes] [--json]` lists, per repository of the workspace,
  the worktrees and local branches whose commits are all in the base branch, the hand-over folders whose
  lots are all committed (never `_commit-plan` itself, nor a folder holding other folders) and the
  rehearsals whose process is gone - the rehearsal folders under `/tmp` (each goes whole) and the clones
  earlier cli versions made in the system's temporary folder, each judged by its marker - with the
  command that removes each (its absolute `cd` first).
  `--yes` runs them after a confirmation on a terminal; without a terminal it refuses, so hand the
  commands (or the `--yes` command) to a person. Kept, each with why: first, a worktree a lot of the
  repository's store names (by real path) while the lot is not `committed` nor `canceled`
  (`<branch>: lot <full name> <state>`; the store read once per repository, no git process per lot); an unmerged branch; the branch the
  main checkout is on; a worktree a mutation run was started from while that run still runs
  (`mutation run <id> still running (pid <pid>)`) or after it died before reporting
  (`mutation run <id> died before reporting: rerun or dialecte mutants abandon <id>`; a reported or
  abandoned run keeps nothing); a worktree a hand-over is pending in, or with uncommitted changes; a branch whose
  reflog still reaches commits the base does not hold (reset onto a newer base after commits of its own:
  its reflog is the only way back to them); a worktree or branch with no commit of its own in its reflog
  (just made); a worktree holding ignored files that removing it would delete (anything but
  `node_modules`, `dist`, `.vitepress/cache`, `.vitepress/dist`, `.DS_Store` and the hooks folder; a long
  list is counted, the first three named); a rehearsal clone whose process still runs, or without a
  marker. It never removes, nor offers to remove, a symbolic link or what a link reaches. A worktree
  path, a hand-over folder or a rehearsal clone that is a link, or a hand-over folder reached through a
  linked folder under the workspace at any depth, is kept with
  `a link: prune never removes a link nor what it points to` (a dangling link included). A worktree,
  hand-over folder or rehearsal clone that a link reaches (links looked for one level under the
  workspace, its `.worktrees/`, its `_commit-plan/` and the scratch folder) is kept with
  `the link <link> points to it`. `git worktree prune` unregisters every worktree whose folder holds no
  checkout, a link's too: while a registered worktree of the repository is a link, a worktree deleted
  from disk is kept, naming that link, and no `git worktree prune` is offered. The sibling links
  `worktree add` makes (`.worktrees/core -> ../core`) are in no item. It reads each worktree with
  `git --no-optional-locks`, so it never rewrites an index. Each hand-over's repository is read once for
  the whole workspace, and its state once, never once per repository. `handover list` follows a link to a
  hand-over folder and lists a folder reached by its path and through a link once. The pool entries and the
  trash (a worktree in `_trash/` included) are never listed nor touched: one line each,
  `pool: 2 entries (cli 1, core 1)` and `trash: 3 folders, being deleted or left over`.
