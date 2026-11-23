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
          their cd; a worktree whose folder is gone is kept while its HEAD reflog holds work nothing
          else does (git worktree prune would delete that reflog), and git worktree prune waits
          while one is kept; a store lot's items (its worktree, its review throwaways <lot
          worktree>-round-<n> and -verify, its branch and theirs) are never removed here and no
          landing is read: an open lot's are kept, reason lot <name> <state>, a damaged lot's are
          held, reason its keep or lot <name> damaged, a lot whose identity.json does not read
          included: found by its worktree's root .dialecte/lot link and by the registry entry naming
          its folder (a lot folder gone or moved aside holds nothing); the root link names the lot
          holding a worktree too, held first, a link alone counting only when its lot holds; a
          committed or canceled lot kept on purpose holds them as an open lot does, reason kept by
          decision: <why> (by <who>, <date>); any other committed or canceled lot's are listed lot
          <name> <state>: its own item, removed by dialecte lot prune <name>; a worktree whose
          branch's work is not in the base is kept (not landed: its work is not in <base>); a
          worktree or a branch whose removal would lose a commit is kept with its commits (<n>
          commit(s) its removal would lose: <commits>; a surviving branch, branch reflog, tag,
          landed tip or remote-tracking ref holds a commit, or the same change at the same place (a
          commit with the same diff, its hunk line numbers included); deleting a branch takes its
          reflog); a worktree a process works in is kept (a process works in it: pid <pid>;
          processes not known: kept with why); ignored entries are read as lot close reads them:
          rebuilt folders, .dialecte/ views and copies of the main checkout's files go, anything
          else keeps the worktree (ignored files git worktree remove would delete: <paths>); a
          rehearsal clone is decided as lot close --feature decides it: kept while it is a link, it
          cannot be read (it could not be read (<why>)), its lot (the lot folder its marker names,
          present in the store, or the lot a committed or abandoned entry of its hand-over names by
          worktree and branch; owner not single: <lots> when two) is kept on purpose or damaged (its
          kept text), its run is alive or its pid runs with a start time that cannot be compared
          (its rehearsal still runs: pid <pid>), its marker cannot tell (no rehearsal marker, or
          why), the processes are not known, a process works in it (a process works in it: pid
          <pid>), or a link reaches it; a pid running with another start time is dead; a lot folder
          gone or moved aside releases its clones; a committed hand-over folder, a scratch folder or
          a rehearsal hook folder a process works in is kept (a process works in it: pid <pid>;
          processes not known: kept with why), the processes asked last; --json prints the plan, a
          worktree on a branch naming branch (kept or not), a clone let go naming owner (the folder
          of the lot that owned it at the plan, whose keep --yes reads again); --yes runs them after
          a confirmation on a terminal, and decides every item again first - worktree, branch,
          hand-over folder, rehearsal clone, scratch and hook folder, pool left-over - by the same
          rules, on a plan taken again right after the confirmation (processes, links, lots,
          hand-overs and markers read then, once, before the first move: a change between two moves
          of one run is not seen, and pool left-overs and clones, read right before their own move
          until now, are read earlier): an item goes only when that plan removes it with the same
          command, else, nothing moved, ✗ <name> kept: <why>, ✗ <name>: gone since the plan (its
          folder or refs/heads/<branch> missing), ✗ <name> kept: not offered now, ✗ <name> kept:
          removed another way now: <command>, ✗ <branch> kept: its worktree stays (its worktree did
          not go), ✗ <worktree> kept: git worktree prune would now also unregister <worktrees>, or ✗
          <name>: not decided again: <reason> (the hand-overs or the plan could not be read again);
          an item only that plan offers is never removed nor printed; committed hand-over folders,
          finished rehearsal clones, scratch folders and pool left-overs
          (.worktrees/_pool-<repository>-<n> with no pool.json: a park that never finished,
          unwritten for a while, no process in it) go to the trash like the other items (the
          workspace's .worktrees/_trash for a clone or a folder in its own .worktrees/_scratch, else
          the scratch root's dialecte-trash): the plan shows the move (mkdir -p <trash> && mv
          <folder> <trash>/), --yes makes it; a move that cannot be made is a ✗ line, nothing
          deleted; the pool entries (with their pool.json) and the trash (.worktrees/_trash/) are
          counted, never touched
  prune --reclaim - every worktree idle for --older-than days (default 2: no write to its index,
    HEAD or reflog since), not the main checkout, not locked, held by no lot (an open, failed,
    damaged or kept on purpose lot naming it, or the lot its root .dialecte/lot link names, a lot
    whose identity does not read included; a lot's review throwaways are reclaimed like any idle
    worktree), named by no open hand-over, worked in by no process, reached by no link: its
    node_modules parked in the pool when its lock key is the main checkout's and it installs that
    lock, else sent to .worktrees/_trash/, its code never touched, a -round-<n> review throwaway's
    too; a node_modules that is a link is never moved; every rule checked again just before each
    move; one line per worktree, the total (worktrees, files, size) last; --dry-run moves nothing;
    --dry-run or --older-than without --reclaim, or an --older-than that is no positive whole
    number, exit 2

exit codes:
  0  add: the worktree exists, whatever the links and the lockfile say
  1  add: a new branch without --from, and the base branch refused (a dialecte.baseBranch set to a branch that exists nowhere, local or on origin, or no base branch found); no worktree made
  0  prune: a plan, --json, a --reclaim run, every item moved, nothing to remove, or the confirmation declined
  1  prune --yes: an item not moved (kept, gone since the plan, not decided again, or its command or move failed)
  2  prune: --yes without a terminal, --dry-run or --older-than without --reclaim, or an --older-than that is not a positive whole number
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
  plain worktree misses it), takes a `node_modules` from the workspace's pool (below); on a miss it completes the
  nearest pool entry with `npm install --prefer-offline --no-save`, else runs `npm ci --prefer-offline`, and copies
  the main checkout's `node_modules` copy-on-write only when `npm ci` fails (offline, registry down), its first line
  recorded (links kept, a relative link to a sibling re-pointed so it still reaches it) - from the worktree that
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
  with a `pool.json` beside it (`{ repository, lockKey, parkedAt, owner?, packages }`). `lockKey` is the lock
  key of the `package-lock.json` it was checked against - what the lock installs, blind to the package's own
  name and version, so an entry parked before a release bump still matches; `packages` lists the installed
  entries the lock names (optional and platform packages left out, read from the lock alone). A repository keeps
  up to the most of its lots open at once (from its lot store: at least 2, at most 8) and at most 2 entries of
  one lock key; parking past either sends the oldest to the trash. An entry written by an older cli (no
  `lockKey`) is never taken; the next park of its repository trashes it. A park (`lot close`, the end of a
  rehearsal, `worktree prune --reclaim`) takes only a `node_modules` that matches its lockfile, rewrites absolute
  every link inside it whose relative target leaves its checkout, holds `.vite` and `.cache` aside, renames the
  folder into a new entry (no file is copied), writes `pool.json`, then sends the caches to the trash; any failure
  puts back what moved, so a `_pool-*` folder without `pool.json` is never taken and never left by a park.
  `worktree add` asks the pool in this order, the same in every repository: an entry with its lock key (the
  owner's newest first, else the newest; a rename: two takers never share one); else the nearest entry, at
  most 5 packages off, completed by `npm install --prefer-offline --no-save` and checked against the lock (a
  failed install or check sends it to the trash); else `npm ci --prefer-offline`, checked; else, when `npm ci`
  fails, the copy. A failed install's partial `node_modules` is moved aside, never deleted. The card's
  `node_modules` row says which and how long (`pooled  _pool-cli-1  0.1 s`, `near  _pool-cli-1, 1 package(s)
  differ  4.2 s`, `installed  npm ci (pool empty)  31.0 s`, `copy-on-write  npm ci failed: <first line>  46.2 s`);
  `--json` carries `nodeModules: { method, from?, drift?, miss?, reason?, near?, seconds }`, `miss` saying why the
  pool gave nothing (`pool empty`, `no entry for install <key>`, `entry busy`, `cross-device`).
  `DIALECTE_NPM_INSTALL=off` (a machine that must stay offline, a test suite): the cli never runs npm; a worktree
  the pool cannot serve gets the copy, the reason recorded. The trash: `.worktrees/_trash/` - a worktree goes there by
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
  earlier cli versions made in the system's temporary folder, each judged by its marker - and the scratch
  folders of the cli's scratch root (`DIALECTE_SCRATCH`, else the workspace's `.worktrees/_scratch`, else
  `dialecte-scratch` in the system's temporary folder), each judged by its `scratch.json`: one whose process is gone
  and that was made over a day ago goes to the workspace's trash (`.worktrees/_trash`; a root elsewhere, its own
  `dialecte-trash`), one whose process runs, a younger one, one without `scratch.json`, one a link reaches or one a
  process works in (asked last; the processes not known keep it too) is kept with why; a rehearsal
  hook's temporary folder (`dlt-hook-<random>`) left in the short root is judged the same way - with the
  command that removes each (its absolute `cd` first).
  `--yes` runs them after a confirmation on a terminal; without a terminal it refuses, so hand the
  commands (or the `--yes` command) to a person. Right after the confirmation, before the first move, `--yes` takes
  the plan again (the hand-overs found again, the processes, links, lots and markers read again, once) and moves an
  item of any kind only when that plan removes it with the same command; any other item prints its `✗` line (kept
  now with why, gone since the plan, not offered now, removed another way now, its worktree stays, a
  `git worktree prune` that would now also unregister another worktree, or not decided again when the plan cannot be
  taken again), nothing moved, exit 1. A change made between two moves of the same run is not seen, and an item
  only the second plan offers is never removed. Kept, each with why: first, a store lot's items, never removed
  here and no landing read: a worktree a lot of the repository's store names (by real path) while the lot is not
  `committed` nor `canceled` (`<branch>: lot <full name> <state>`), and a committed or canceled lot's worktree, its
  review throwaways (`<lot worktree>-round-<n>`, `-verify`, or on `<lot branch>-round-<n>`) and its branch, listed as
  its own (`lot <full name> <state>: its own item, removed by dialecte lot prune <full name>`); a worktree whose
  branch's work is not in the base (`not landed: its work is not in <base>`); a worktree or branch whose removal
  would lose a commit (`<n> commit(s) its removal would lose: <commits>`): a worktree removal takes its HEAD and HEAD
  reflog, a branch deletion its tip and reflog, and a commit only they reach is lost unless a surviving branch tip or
  branch reflog, a tag, a landed tip or a remote-tracking ref (not origin's copy of a deleted branch) holds it or
  the same place (the same `diff-tree -p` text, hunk line numbers included, its `index` lines left out); a worktree
  whose folder is gone is checked the same way from its HEAD and HEAD reflog in the git folder, and while one is kept
  no `git worktree prune` is offered (it would delete that reflog); so a branch reset or rebased away from its own commits keeps them until git's
  reflog expiry (gc.reflogExpireUnreachable), and deleting it would lose them; prune reads git only, never the
  host; the branch the
  main checkout is on; a worktree a mutation run was started from while that run still runs
  (`mutation run <id> still running (pid <pid>)`) or after it died before reporting
  (`mutation run <id> died before reporting: rerun or dialecte mutants abandon <id>`; a reported or
  abandoned run keeps nothing); a worktree a hand-over is pending in, or with uncommitted changes; a worktree or branch with no commit of its own in its reflog
  (just made); a worktree holding ignored files that removing it would delete, read as `lot close` reads
  them (rebuilt folders such as `node_modules` and `dist`, the hooks folder, folders the package declares in
  `dialecte.rebuiltIgnored`, `.dialecte/` views, empty or archived declarations and byte-equal copies of the
  main checkout's files go; anything else keeps it; a long list is counted, the first three named); a
  worktree a process works in (`a process works in it: pid <pid>`; when the processes cannot be listed, every
  worktree it would remove is kept with why); a rehearsal clone whose process still runs, or without a
  marker. It never removes, nor offers to remove, a symbolic link or what a link reaches. A worktree
  path, a hand-over folder or a rehearsal clone that is a link, or a hand-over folder reached through a
  linked folder under the workspace at any depth, is kept with
  `a link: prune never removes a link nor what it points to` (a dangling link included). A worktree,
  hand-over folder or rehearsal clone that a link reaches (links looked for one level under the
  workspace, its `.worktrees/`, its `_commit-plan/` and the scratch folder) is kept with
  `the link <link> points to it`. A committed hand-over folder a process works in is kept
  (`a process works in it: pid <pid>`, the processes not known kept with why), asked after the link rules.
  `git worktree prune` unregisters every worktree whose folder holds no
  checkout, a link's too: while a registered worktree of the repository is a link, a worktree deleted
  from disk is kept, naming that link, and no `git worktree prune` is offered. The sibling links
  `worktree add` makes (`.worktrees/core -> ../core`) are in no item. It reads each worktree with
  `git --no-optional-locks`, so it never rewrites an index. Each hand-over's repository is read once for
  the whole workspace, and its state once, never once per repository. `handover list` follows a link to a
  hand-over folder and lists a folder reached by its path and through a link once. The pool entries and the
  trash (a worktree in `_trash/` included) are never listed nor touched: one line each,
  `pool: 2 entries (cli 1, core 1)` and `trash: 3 folders, being deleted or left over`.

- `dialecte worktree prune [--root <workspace>] --reclaim [--dry-run] [--older-than <days>]` gives back the
  `node_modules` of idle worktrees and moves no code. A worktree is idle when no lot of its repository's store
  names it unless committed or canceled (a failed lot keeps it), no hand-over is pending in it, no process works
  in it (processes not known: kept), it is not the main checkout, not locked, reached by no link, and its git
  folder's index, HEAD and reflog are older than `<days>` (default 2, a positive whole number). An idle worktree
  whose lock key is the main checkout's has its `node_modules` parked in the pool; any other, or one that fails
  its check, has it sent to `.worktrees/_trash/`. A `node_modules` that is a link is never moved nor followed. A
  `-round-<n>` review throwaway is reclaimed the same way: its code, a reviewer's uncommitted edit included, stays. Every rule is read again just
  before each move; a worktree gone, locked or active since the plan keeps its line and moves nothing. One line
  per worktree (`park`, `trash`, `keep` with why); `--dry-run` prints them with a total (worktrees, files, size)
  and moves nothing. No `--yes`: `--dry-run` is the preview.
