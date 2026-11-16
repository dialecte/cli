### Added

- `dialecte rules`: `raw-git-repository` (an error, allowable) - a test or test support file that runs `git clone` or `git init` itself (an argument list whose subcommand, after `-C`/`-c` options, is `clone` or `init`, in a `git` call or one of the cli's git readers, `--bare` aside) makes a repository with no identity, green where git falls back to user@host and red on a CI machine; make it with the scratch helpers (`cloneRepository` / `initializeRepository`).

### Fixed

- `dialecte gate`: the scoped steps' temporary folder (`dialecte-gate-scope-*`) is removed when the gate ends by SIGINT, SIGTERM or SIGHUP, not only on a normal end.
- `dialecte gate`: a local base branch holding commits origin's lacks prints a note (`local main holds N commit(s) origin/main does not: the base is read from origin/main`) instead of reading origin's silently.
