### Added

- `dialecte rules`: `raw-git-repository` (an error, allowable) - a test or test support file that runs `git clone` or `git init` itself (an argument list whose subcommand, after git's options (`-C`, `-c`, `--git-dir`, `--work-tree`), is `clone` or `init`, `--bare` aside: given to a `git` call or one of the cli's git readers, after a `'git'` program (`spawnSync('git', [...])`), or a shell string or template starting with `git` (`execSync('git init ...')`); a same-file `const` naming the program or the list is read through) makes a repository with no identity, green where git falls back to user@host and red on a CI machine; make it with the scratch helpers (`cloneRepository` / `initializeRepository`).

### Fixed

- `dialecte gate`: the scoped steps' temporary folder (`dialecte-gate-scope-*`) is removed when the gate ends by SIGINT, SIGTERM or SIGHUP, also between two steps, and when the run cannot start, not only on a normal end.
- Ending by a forwarded signal: every exit hook runs (the step's `interrupted` end, the live region, the folder removal) also when the signal lands while no step child runs, and one that throws no longer skips the later ones nor the exit by the signal.
- `dialecte gate`: a local base branch holding commits origin's lacks prints a note (`local main holds N commit(s) origin/main does not: the base is read from origin/main`) instead of reading origin's silently.
