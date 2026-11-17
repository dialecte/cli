### Fixed

- `dialecte rules`: the `bare-tmpdir` and `raw-git-repository` messages name the cli's own helpers (`makeScratchFolder`, `cloneRepository` / `initializeRepository` of `test/scratch-repository.ts`) only when the checked package is the cli. In core or a dialecte, where those helpers are not there, the message states the rule and why: every temporary folder under one scratch root; a test repository made through a helper that gives it an identity. The `rules` help says so.
